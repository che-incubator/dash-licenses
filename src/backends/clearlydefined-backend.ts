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

import { fetchDefinition, fetchDefinitionsBatch, extractLicense, checkHarvested, requestHarvest } from './clearlydefined-client';
import { isLicenseApproved } from './license-policy';
import { toClearlyDefinedId } from './coordinate-utils';
import { sleep } from '../helpers/utils';
import { logger } from '../helpers/logger';
import type { DepResult, LicenseBackend } from './types';

/** Batch size for POST /definitions (how many coordinates per POST request) */
const POST_BATCH_SIZE = 100;
/** Concurrency for POST requests (how many POST requests in parallel) */
const POST_CONCURRENCY = 2;
/** Delay between POST batches (ms) */
const POST_BATCH_DELAY_MS = 500;
/** Timeout for batch POST requests (ms) - longer than individual GETs */
const POST_TIMEOUT_MS = 60000;

/** Legacy: Concurrency limit for individual GET requests */
const GET_CONCURRENCY = 8;
/** Legacy: Delay between GET batches (ms) */
const GET_BATCH_DELAY_MS = 200;

/**
 * ClearlyDefined HTTP backend - pure Node.js, no Java/JAR.
 * Fetches license data from api.clearlydefined.io and applies approval policy.
 */
export class ClearlyDefinedBackend implements LicenseBackend {
  private readonly timeoutMs: number;
  private readonly useBatchAPI: boolean;
  private readonly enableHarvest: boolean;

  constructor(options?: { timeoutMs?: number; useBatchAPI?: boolean; enableHarvest?: boolean }) {
    this.timeoutMs = options?.timeoutMs ?? 30000;
    this.useBatchAPI = options?.useBatchAPI ?? true; // Default to batch POST API
    this.enableHarvest = options?.enableHarvest ?? false; // Default: harvest disabled
  }

  async processBatch(deps: string[], _outputFile?: string): Promise<string[]> {
    const startTime = Date.now();
    const results: DepResult[] = [];
    const idMap = new Map<string, string>(); // clearlyDefinedId -> original input (for dedup)

    const ids: string[] = [];
    for (const dep of deps) {
      try {
        const id = toClearlyDefinedId(dep);
        if (!idMap.has(id)) {
          idMap.set(id, dep);
          ids.push(id);
        }
      } catch {
        results.push({
          id: dep,
          license: '',
          status: 'restricted',
          source: 'unparseable'
        });
      }
    }

    // Route to batch POST or individual GET based on configuration
    const fetchedResults = this.useBatchAPI
      ? await this.processBatchPOST(ids)
      : await this.processBatchGET(ids);

    results.push(...fetchedResults);

    // If harvest is enabled, check and request harvest for notfound dependencies
    if (this.enableHarvest) {
      await this.processHarvest(results);
    }

    const duration = Date.now() - startTime;
    const approved = results.filter(r => r.status === 'approved').length;
    const restricted = results.filter(r => r.status === 'restricted').length;

    logger.success(`Completed ClearlyDefined API processing: ${approved} approved, ${restricted} restricted`);
    logger.duration('Total API processing time', duration);

    return results.map(r => this.toDependenciesLine(r));
  }

  /**
   * Process dependencies using batch POST API (recommended).
   * Rate limit: 250 POST requests/minute, but each can fetch many coordinates.
   */
  private async processBatchPOST(ids: string[]): Promise<DepResult[]> {
    logger.info(`Processing ${ids.length} dependencies via ClearlyDefined batch POST API (${POST_BATCH_SIZE} coords/request)`);

    const results: DepResult[] = [];

    // Split into chunks of POST_BATCH_SIZE
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += POST_BATCH_SIZE) {
      chunks.push(ids.slice(i, i + POST_BATCH_SIZE));
    }

    // Process chunks with POST_CONCURRENCY in parallel
    for (let i = 0; i < chunks.length; i += POST_CONCURRENCY) {
      const batchOfChunks = chunks.slice(i, i + POST_CONCURRENCY);
      const batchNum = Math.floor(i / POST_CONCURRENCY) + 1;
      const totalBatches = Math.ceil(chunks.length / POST_CONCURRENCY);

      const totalCoordsInBatch = batchOfChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      logger.progress(
        batchNum,
        totalBatches,
        `Fetching batch ${batchNum}/${totalBatches} (${batchOfChunks.length} POST requests, ${totalCoordsInBatch} coords)`
      );

      const batchResults = await Promise.all(
        batchOfChunks.map(chunk => this.fetchBatch(chunk))
      );

      batchResults.forEach(chunkResults => results.push(...chunkResults));

      if (i + POST_CONCURRENCY < chunks.length) {
        await sleep(POST_BATCH_DELAY_MS);
      }
    }

    return results;
  }

  /**
   * Process dependencies using individual GET requests (legacy).
   * Rate limit: 2,000 GET requests/minute.
   */
  private async processBatchGET(ids: string[]): Promise<DepResult[]> {
    logger.info(`Processing ${ids.length} dependencies via ClearlyDefined GET API (${GET_CONCURRENCY} concurrent requests)`);

    const results: DepResult[] = [];

    for (let i = 0; i < ids.length; i += GET_CONCURRENCY) {
      const batch = ids.slice(i, i + GET_CONCURRENCY);
      const batchNum = Math.floor(i / GET_CONCURRENCY) + 1;
      const totalBatches = Math.ceil(ids.length / GET_CONCURRENCY);

      logger.progress(batchNum, totalBatches, `Fetching batch ${batchNum}/${totalBatches} (${batch.length} deps)`);

      const batchResults = await Promise.all(
        batch.map(id => this.fetchOne(id))
      );
      results.push(...batchResults);

      if (i + GET_CONCURRENCY < ids.length) {
        await sleep(GET_BATCH_DELAY_MS);
      }
    }

    return results;
  }

  /**
   * Fetch multiple definitions using POST /definitions
   */
  private async fetchBatch(coordinates: string[]): Promise<DepResult[]> {
    const startTime = Date.now();
    const url = 'https://api.clearlydefined.io/definitions';

    try {
      logger.request('POST', `${url} (${coordinates.length} coordinates)`);

      const batchResponse = await fetchDefinitionsBatch(coordinates, POST_TIMEOUT_MS);
      const duration = Date.now() - startTime;

      logger.response(200, url, duration);

      const results: DepResult[] = [];
      for (const coordinate of coordinates) {
        const def = batchResponse[coordinate];

        // Handle missing or empty definitions
        if (!def || !def.licensed) {
          logger.debug(`${coordinate}: not found or no license data`);
          results.push({
            id: coordinate,
            license: '',
            status: 'restricted',
            source: 'notfound'
          });
          continue;
        }

        const license = extractLicense(def);
        if (!license) {
          results.push({
            id: coordinate,
            license: '',
            status: 'restricted',
            source: 'notfound'
          });
          continue;
        }

        const approved = isLicenseApproved(license);
        logger.debug(`${coordinate}: ${license} → ${approved ? 'approved' : 'restricted'}`);

        results.push({
          id: coordinate,
          license,
          status: approved ? 'approved' : 'restricted',
          source: 'clearlydefined'
        });
      }

      return results;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.response(500, url, duration);
      logger.warn(`Batch POST failed: ${error}`);
      logger.info(`Falling back to individual GET requests for ${coordinates.length} coordinates`);

      // Fallback: retry each coordinate individually using GET
      const fallbackResults = await Promise.all(
        coordinates.map(id => this.fetchOne(id))
      );

      return fallbackResults;
    }
  }

  private async fetchOne(clearlyDefinedId: string, maxRetries = 3): Promise<DepResult> {
    const url = `https://api.clearlydefined.io/definitions/${clearlyDefinedId}`;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();

      try {
        if (attempt === 1) {
          logger.request('GET', url);
        } else {
          logger.debug(`Retry ${attempt}/${maxRetries} for ${clearlyDefinedId}`);
        }

        const def = await fetchDefinition(clearlyDefinedId, this.timeoutMs);
        const duration = Date.now() - startTime;

        const license = def ? extractLicense(def) : '';
        if (!license) {
          logger.response(404, url, duration);
          return {
            id: clearlyDefinedId,
            license: '',
            status: 'restricted',
            source: 'notfound'
          };
        }

        logger.response(200, url, duration);

        const approved = isLicenseApproved(license);
        logger.debug(`${clearlyDefinedId}: ${license} → ${approved ? 'approved' : 'restricted'}`);

        return {
          id: clearlyDefinedId,
          license,
          status: approved ? 'approved' : 'restricted',
          source: 'clearlydefined'
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Determine error type for better logging
        const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('ECONNABORTED');
        const isNetworkError = errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND') || errorMessage.includes('ETIMEDOUT');

        if (attempt < maxRetries && (isTimeout || isNetworkError)) {
          // Retry on transient errors (timeout, network issues)
          const backoffMs = 1000 * attempt; // Linear backoff: 1s, 2s, 3s
          logger.debug(`${isTimeout ? 'Timeout' : 'Network error'} for ${clearlyDefinedId}, retrying in ${backoffMs}ms...`);
          await sleep(backoffMs);
          continue;
        }

        // Final failure or non-retryable error
        logger.response(500, url, duration);
        if (isTimeout) {
          logger.debug(`Request timed out after ${duration}ms: ${clearlyDefinedId}`);
        } else if (isNetworkError) {
          logger.debug(`Network error fetching ${clearlyDefinedId}: ${errorMessage}`);
        } else {
          logger.debug(`Error fetching ${clearlyDefinedId}: ${errorMessage}`);
        }

        return {
          id: clearlyDefinedId,
          license: '',
          status: 'restricted',
          source: 'error'
        };
      }
    }

    // Should never reach here, but TypeScript needs this
    return {
      id: clearlyDefinedId,
      license: '',
      status: 'restricted',
      source: 'error'
    };
  }

  /**
   * Check and request harvest for dependencies that were not found.
   * Only processes dependencies with source 'notfound' or 'error'.
   */
  private async processHarvest(results: DepResult[]): Promise<void> {
    const notfound = results.filter(r => r.source === 'notfound' || r.source === 'error');
    if (notfound.length === 0) {
      return;
    }

    logger.info(`Checking harvest status for ${notfound.length} unresolved dependencies...`);

    let alreadyHarvested = 0;
    let harvestRequested = 0;
    let harvestFailed = 0;

    for (const dep of notfound) {
      try {
        // Check if already harvested
        const harvested = await checkHarvested(dep.id, this.timeoutMs);

        if (harvested.length > 0) {
          alreadyHarvested++;
          logger.debug(`${dep.id}: already harvested (${harvested.length} tools)`);
          continue;
        }

        // Request harvest
        logger.info(`${dep.id}: requesting harvest...`);
        await requestHarvest(dep.id, this.timeoutMs);
        harvestRequested++;

        // Small delay to avoid overwhelming the API
        await sleep(100);
      } catch (error) {
        harvestFailed++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.debug(`${dep.id}: harvest request failed - ${errorMessage}`);
      }
    }

    if (harvestRequested > 0) {
      logger.info(`Harvest requested for ${harvestRequested} dependencies (${alreadyHarvested} already harvested, ${harvestFailed} failed)`);
      logger.info('Note: Harvested data may take several minutes to process. Re-run the tool later to check for updates.');
    } else if (alreadyHarvested > 0) {
      logger.info(`All ${alreadyHarvested} unresolved dependencies are already being harvested`);
    }
  }

  private toDependenciesLine(r: DepResult): string {
    return `${r.id}, ${r.license}, ${r.status}, ${r.source}`;
  }
}
