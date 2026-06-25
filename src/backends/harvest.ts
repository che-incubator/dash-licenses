/**
 * Copyright (c) 2018-2025 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import { checkHarvested, requestHarvest } from './clearlydefined-client';
import { identifierToCoordinate } from '../helpers/utils';
import { logger } from '../helpers/logger';
import { sleep } from '../helpers/utils';

const CHECK_CONCURRENCY = 8;
const CHECK_DELAY_MS = 200;

/**
 * Check which of the given package identifiers still need a harvest request,
 * then fire POST /harvest for each one (fire-and-forget).
 *
 * Only identifiers that can be converted to a ClearlyDefined coordinate
 * (npm/npmjs/…) are processed.  Others are silently skipped.
 *
 * This function returns immediately after dispatching the POST requests —
 * it does not wait for the server to finish harvesting.
 *
 * @param identifiers  Package identifiers in the form "pkg@version" or
 *                     "@scope/pkg@version".  These are the direct-unresolved
 *                     deps from problems.md.
 * @param getTimeoutMs Timeout for the GET /harvest check requests (ms).
 */
export async function triggerHarvestAsync(
  identifiers: string[],
  getTimeoutMs: number,
): Promise<void> {
  // Convert identifiers to ClearlyDefined coordinates; skip any that don't map.
  const coordEntries = identifiers
    .map(id => ({ id, coord: identifierToCoordinate(id) }))
    .filter(e => Boolean(e.coord));

  if (coordEntries.length === 0) return;

  logger.info(`Checking harvest status for ${coordEntries.length} unresolved dependencies...`);

  // ── Phase 1: check (await GET /harvest/{coord} in parallel batches) ────────
  let alreadyHarvested = 0;
  const toRequest: string[] = [];

  for (let i = 0; i < coordEntries.length; i += CHECK_CONCURRENCY) {
    const batch = coordEntries.slice(i, i + CHECK_CONCURRENCY);

    const checkResults = await Promise.all(
      batch.map(async ({ id, coord }) => {
        try {
          const harvested = await checkHarvested(coord, getTimeoutMs);
          if (harvested.length > 0) {
            logger.debug(`${id}: already harvested (${harvested.length} tools)`);
            return { id, coord, needsRequest: false };
          }
          return { id, coord, needsRequest: true };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          logger.debug(`${id}: harvest check failed - ${msg}`);
          return { id, coord, needsRequest: true };
        }
      })
    );

    for (const { id, coord, needsRequest } of checkResults) {
      if (needsRequest) {
        toRequest.push(coord);
        logger.info(`${id}: requesting harvest...`);
      } else {
        alreadyHarvested++;
      }
    }

    if (i + CHECK_CONCURRENCY < coordEntries.length) {
      await sleep(CHECK_DELAY_MS);
    }
  }

  // ── Phase 2: request (fire-and-forget POST /harvest) ─────────────────────
  for (const coord of toRequest) {
    requestHarvest(coord, getTimeoutMs).catch((error) => {
      const msg = error instanceof Error ? error.message : String(error);
      logger.debug(`harvest POST failed for ${coord} - ${msg}`);
    });
  }

  if (toRequest.length > 0) {
    logger.info(
      `Harvest requested for ${toRequest.length} dependencies` +
      (alreadyHarvested > 0 ? ` (${alreadyHarvested} already harvested)` : ''),
    );
    logger.info('Note: Harvested data may take several minutes to process. Re-run the tool later to check for updates.');
  } else if (alreadyHarvested > 0) {
    logger.info(`All ${alreadyHarvested} unresolved dependencies are already being harvested`);
  }
}
