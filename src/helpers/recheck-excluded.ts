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

import { existsSync, readFileSync } from 'fs';
import { ClearlyDefinedBackend } from '../backends/clearlydefined-backend';
import {
  PackageManagerUtils,
  coordinateToIdentifier,
  identifierToCoordinate,
  getErrorMessage,
} from './utils';
import { logger } from './logger';

/**
 * Re-query every entry in the EXCLUDED prod/dev markdown files against
 * ClearlyDefined.  Any entry that comes back as approved is removed from the
 * EXCLUDED file — it belongs in prod.md / dev.md instead.
 *
 * Entries with an `ecd.che` CQ are skipped: they are approved by the Eclipse
 * Foundation, not by ClearlyDefined, and must remain in EXCLUDED.
 *
 * Called with --harvest to keep EXCLUDED files lean over time.
 */
export async function recheckAndCleanExcluded(
  excludedProdPath: string,
  excludedDevPath: string,
  options?: { getTimeoutMs?: number; postTimeoutMs?: number }
): Promise<void> {
  const backend = new ClearlyDefinedBackend({
    ...(options?.getTimeoutMs !== undefined ? { getTimeoutMs: options.getTimeoutMs } : {}),
    ...(options?.postTimeoutMs !== undefined ? { postTimeoutMs: options.postTimeoutMs } : {}),
  });

  for (const [filePath, label] of [
    [excludedProdPath, 'prod'],
    [excludedDevPath, 'dev'],
  ] as const) {
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, 'utf8');
    const toVerify: Array<{ id: string; coord: string }> = [];
    const tablePattern = /^\| `([^`]+)` \| ([^|]+) \|$/gm;
    let m: RegExpExecArray | null;
    while ((m = tablePattern.exec(content)) !== null) {
      const id = m[1].trim();
      const cq = m[2].trim();
      // ecd.che = Eclipse Foundation approval — not managed by ClearlyDefined.
      if (cq === 'ecd.che') continue;
      const coord = identifierToCoordinate(id);
      if (coord) toVerify.push({ id, coord });
    }

    if (toVerify.length === 0) continue;

    logger.info(
      `Rechecking ${toVerify.length} EXCLUDED/${label}.md entr${toVerify.length !== 1 ? 'ies' : 'y'} via ClearlyDefined...`
    );

    try {
      const verifiedLines = await backend.processBatch(toVerify.map(e => e.coord));
      const approvedIds = new Set<string>();
      for (const line of verifiedLines) {
        if (line.includes(', approved,')) {
          const coord = line.split(',')[0].trim();
          const id = coordinateToIdentifier(coord);
          if (id) approvedIds.add(id);
        }
      }

      if (approvedIds.size > 0) {
        PackageManagerUtils.removeUnusedExcludes(filePath, approvedIds, 'utf8');
        logger.info(
          `Removed ${approvedIds.size} approved entr${approvedIds.size !== 1 ? 'ies' : 'y'} from EXCLUDED/${label}.md.`
        );
      } else {
        logger.debug(`EXCLUDED/${label}.md: all remaining entries still require manual exclusion.`);
      }
    } catch (err) {
      logger.warn(`Could not recheck EXCLUDED/${label}.md: ${getErrorMessage(err)}`);
    }
  }
}
