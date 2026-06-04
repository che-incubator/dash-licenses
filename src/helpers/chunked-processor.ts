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

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import type { LicenseBackend } from '../backends/types';
import { ClearlyDefinedBackend } from '../backends/clearlydefined-backend';
import { JarBackend } from '../backends/jar-backend';
import { sleep, parseNonEmptyLines, getErrorMessage, coordinateToIdentifier, identifierToCoordinate, type CacheEntry } from './utils';
import { logger } from './logger';

/** Default maximum number of retry attempts for chunk processing */
const DEFAULT_MAX_RETRIES = 9;

/** Default delay between retries in milliseconds */
const DEFAULT_RETRY_DELAY_MS = 3000;

export interface ChunkedProcessorOptions {
  parserScript: string;
  parserInput: string;
  /** Env for parser child process (TMP_DIR, PROJECT_COPY_DIR, etc.) */
  parserEnv?: NodeJS.ProcessEnv;
  /** Path to dash-licenses JAR (legacy). If not set, ClearlyDefined HTTP backend is used. */
  dashLicensesJar?: string;
  batchSize: number;
  outputFile: string;
  debug?: boolean;
  maxRetries?: number;
  retryDelayMs?: number;
  /**
   * Timeout for ClearlyDefined batch POST /definitions requests (ms).
   * Default: 10 000 ms.
   */
  postTimeoutMs?: number;
  /**
   * Timeout for ClearlyDefined individual GET /definitions/{id} requests (ms).
   * Default: 5 000 ms.
   */
  getTimeoutMs?: number;
  /** Custom license backend. If not set, uses ClearlyDefinedBackend when dashLicensesJar is absent. */
  backend?: LicenseBackend;
  /**
   * Pre-resolved cache from existing .deps/prod.md + .deps/dev.md.
   * Keys are package identifiers (e.g. "express@4.18.0"); values carry the
   * SPDX license and resolved CQ string.
   * Coordinates present in the cache are written directly to the output file
   * without calling the API.  Omit or leave empty to query everything.
   */
  cachedResolutions?: Map<string, CacheEntry>;
  /**
   * Set of production dependency identifiers (e.g. "express@4.18.0").
   * Used to classify cache misses as prod vs dev in log output.
   */
  prodIdentifiers?: Set<string>;
  /**
   * Set of development dependency identifiers.
   * Used to classify cache misses as prod vs dev in log output.
   */
  devIdentifiers?: Set<string>;
}

export class ChunkedDashLicensesProcessor {
  private readonly options: ChunkedProcessorOptions;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly backend: LicenseBackend;

  constructor(options: ChunkedProcessorOptions) {
    this.options = options;
    this.maxRetries = options.maxRetries || DEFAULT_MAX_RETRIES;
    this.retryDelayMs = options.retryDelayMs || DEFAULT_RETRY_DELAY_MS;
    this.backend =
      options.backend ??
      (options.dashLicensesJar
        ? new JarBackend(
            options.dashLicensesJar,
            options.batchSize,
            options.debug
          )
        : new ClearlyDefinedBackend({
            ...(options.postTimeoutMs !== undefined ? { postTimeoutMs: options.postTimeoutMs } : {}),
            ...(options.getTimeoutMs !== undefined ? { getTimeoutMs: options.getTimeoutMs } : {}),
          }));
  }

  /**
   * Process dependencies in chunks to avoid timeouts and API limits.
   * If cachedResolutions is provided, coordinates that already appear in the
   * cache are written directly to the output file without calling the API.
   */
  public async process(): Promise<void> {
    const startTime = Date.now();

    logger.info('Starting chunked processing of dependencies...');

    // Step 1: Get all dependencies from parser
    const allDependencies = this.getAllDependencies();

    if (allDependencies.length === 0) {
      logger.warn('No dependencies found from parser');
      return;
    }

    logger.info(`Total dependencies to process: ${allDependencies.length}`);

    // Step 1b: Apply cache — split into cached vs. new
    const cache = this.options.cachedResolutions;
    let depsToQuery = allDependencies;
    const cachedLines: string[] = [];

    if (cache && cache.size > 0) {
      depsToQuery = [];
      for (const coord of allDependencies) {
        const id = coordinateToIdentifier(coord);
        if (id && cache.has(id)) {
          // Reconstruct a DEPENDENCIES-format line from the cached entry.
          // parseDependenciesFile expects ClearlyDefined coordinate format:
          //   npm/npmjs/@scope/name/version, MIT, approved, clearlydefined
          // so we convert the identifier back to a coordinate.
          const entry = cache.get(id)!;
          const cdCoord = identifierToCoordinate(id) || coord;
          cachedLines.push(`${cdCoord}, ${entry.license}, approved, clearlydefined`);
        } else {
          depsToQuery.push(coord);
        }
      }
      if (cachedLines.length > 0) {
        logger.info(`Cache hit: ${cachedLines.length} dependencies skipped (already resolved).`);
      }
      if (depsToQuery.length > 0) {
        // Build a detailed breakdown so the log is actionable.
        const prodSet = this.options.prodIdentifiers;
        const devSet = this.options.devIdentifiers;
        const cacheNameSet = new Set(
          [...(cache?.keys() ?? [])].map(id => id.substring(0, id.lastIndexOf('@')))
        );

        let prod = 0, dev = 0, both = 0, versionBump = 0, brandNew = 0;
        for (const id of depsToQuery) {
          const isProd = prodSet?.has(id) ?? false;
          const isDev  = devSet?.has(id) ?? false;
          if (isProd && isDev) both++;
          else if (isProd) prod++;
          else if (isDev) dev++;

          const pkgName = id.substring(0, id.lastIndexOf('@'));
          if (cacheNameSet.has(pkgName)) versionBump++;
          else brandNew++;
        }

        const parts: string[] = [];
        if (prodSet && devSet) {
          if (prod > 0)  parts.push(`${prod} prod`);
          if (dev > 0)   parts.push(`${dev} dev`);
          if (both > 0)  parts.push(`${both} prod+dev`);
        }
        if (versionBump > 0) parts.push(`${versionBump} version bump${versionBump > 1 ? 's' : ''}`);
        if (brandNew > 0)    parts.push(`${brandNew} new package${brandNew > 1 ? 's' : ''}`);

        const detail = parts.length > 0 ? ` (${parts.join(', ')})` : '';
        logger.info(`Cache miss: ${depsToQuery.length} dependencies to query${detail}.`);
      }
    }

    // If all deps are cached, write the cached lines and we're done.
    if (depsToQuery.length === 0) {
      writeFileSync(this.options.outputFile, cachedLines.join('\n') + (cachedLines.length ? '\n' : ''));
      logger.success(`Merged ${cachedLines.length} unique dependencies into ${this.options.outputFile}`);
      logger.success(`Successfully processed all ${allDependencies.length} dependencies (all from cache)`);
      logger.duration('Total processing time', Date.now() - startTime);
      return;
    }

    // Step 2: Split into chunks
    // Use batch size directly to ensure ClearlyDefined queries stay small
    const chunkSize = this.options.batchSize;
    const chunks = this.splitIntoChunks(depsToQuery, chunkSize);

    logger.info(`Split into ${chunks.length} chunks (max ${chunkSize} dependencies per chunk)`);

    // Step 3: Process each chunk with retry logic
    // Abort immediately if any chunk fails after all retries
    const tempFiles: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkNum = i + 1;
      logger.progress(chunkNum, chunks.length, `Processing chunk with ${chunks[i].length} dependencies`);

      const tempFile = `${this.options.outputFile}.chunk${chunkNum}.tmp`;
      tempFiles.push(tempFile);

      const success = await this.processChunkWithRetry(chunks[i], tempFile, chunkNum);

      if (!success) {
        logger.error(`Failed chunk ${chunkNum}/${chunks.length} after ${this.maxRetries} attempts`);
        logger.error(`Aborting: Cannot continue with remaining ${chunks.length - chunkNum} chunks.`);

        // Clean up temporary files before aborting
        if (!this.options.debug) {
          this.cleanupTempFiles(tempFiles);
        } else {
          logger.debug(`Kept ${tempFiles.length} temporary chunk files`);
        }

        throw new Error(`Chunk ${chunkNum} of ${chunks.length} failed after ${this.maxRetries} retries. Aborted processing.`);
      }
    }

    // Step 4: Merge all chunk results into final DEPENDENCIES file
    // Include cached lines so the full set of dependencies is in the output.
    logger.info('Merging chunk results...');
    const totalEntries = this.mergeChunkResults(tempFiles, cachedLines);
    logger.success(`Merged ${totalEntries} unique dependencies into ${this.options.outputFile}`);

    // Step 5: Clean up temporary files
    if (!this.options.debug) {
      this.cleanupTempFiles(tempFiles);
    } else {
      logger.debug(`Kept ${tempFiles.length} temporary chunk files`);
    }

    const duration = Date.now() - startTime;
    logger.success(`Successfully processed all ${allDependencies.length} dependencies`);
    logger.duration('Total processing time', duration);
  }

  /**
   * Get all dependencies from the parser script or file
   */
  private getAllDependencies(): string[] {
    try {
      let output: string;

      // Special case: if parserScript is 'cat' or ends with a file extension, read the file directly
      if (this.options.parserScript === 'cat' || this.options.parserScript.match(/\.(txt|deps)$/)) {
        logger.debug(`Reading dependencies from file: ${this.options.parserInput}`);
        output = readFileSync(this.options.parserInput, 'utf8');
      } else {
        // Run parser script
        const command = this.options.parserInput
          ? `node ${this.options.parserScript} "${this.options.parserInput}"`
          : `node ${this.options.parserScript}`;

        logger.debug(`Running parser: ${command}`);

        const parserEnv = this.options.parserEnv
          ? { ...process.env, ...this.options.parserEnv }
          : undefined;
        output = execSync(command, {
          encoding: 'utf8',
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
          ...(parserEnv && { env: parserEnv })
        });
      }

      return parseNonEmptyLines(output);
    } catch (error: unknown) {
      logger.error(`Error getting dependencies: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Split dependencies into chunks
   */
  private splitIntoChunks(dependencies: string[], chunkSize: number): string[][] {
    const chunks: string[][] = [];
    
    for (let i = 0; i < dependencies.length; i += chunkSize) {
      chunks.push(dependencies.slice(i, i + chunkSize));
    }
    
    return chunks;
  }

  /**
   * Process a chunk with retry logic
   */
  private async processChunkWithRetry(
    chunk: string[],
    outputFile: string,
    _chunkNum: number
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          logger.info(`  → Retry attempt ${attempt}/${this.maxRetries}...`);
        }

        await this.processChunk(chunk, outputFile);

        // Verify output was created and has content
        if (existsSync(outputFile)) {
          const content = readFileSync(outputFile, 'utf8');
          if (content.length > 0) {
            const lineCount = parseNonEmptyLines(content).length;
            if (attempt > 1) {
              logger.success(`  ✓ Succeeded on attempt ${attempt} (${lineCount} entries)`);
            } else {
              logger.debug(`  ✓ Completed (${lineCount} entries)`);
            }
            return true;
          }
        }

        throw new Error('Output file not created or empty');

      } catch (error: unknown) {
        const isLastAttempt = attempt === this.maxRetries;

        // dash-licenses uses various non-zero exit codes to indicate issues
        // (1, 2, 3, 9, etc. for unresolved/restricted/unmapped dependencies)
        // As long as the output file was created with content, treat it as success
        const errorStatus = (error && typeof error === 'object' && 'status' in error) ? (error as { status: number }).status : undefined;
        if (errorStatus && errorStatus > 0 && errorStatus < 128) {
          logger.debug(`  ⚠ dash-licenses exit code ${errorStatus}`);
          // Check if we got results (output file exists with content)
          if (existsSync(outputFile)) {
            const content = readFileSync(outputFile, 'utf8');
            if (content.length > 0) {
              const lineCount = parseNonEmptyLines(content).length;
              logger.debug(`  ✓ Completed with ${lineCount} entries (exit ${errorStatus}: some items need review)`);
              return true;
            }
          }
        }

        // Check for specific error codes
        const errorMsg = error instanceof Error ? error.message : String(error);
        const isTimeoutError = errorMsg.includes('524') || errorMsg.includes('timeout');
        const isRateLimitError = errorMsg.includes('429');
        const isGatewayError = errorMsg.includes('502') || errorMsg.includes('bad gateway');

        // Only show error details on last attempt or in debug mode
        if (this.options.debug || isLastAttempt) {
          let errorType = 'Error';
          if (isTimeoutError) errorType = 'Timeout (HTTP 524)';
          else if (isRateLimitError) errorType = 'Rate limit (HTTP 429)';
          else if (isGatewayError) errorType = 'Bad gateway (HTTP 502)';

          logger.error(`  ✗ ${errorType}: ${errorMsg.substring(0, 200)}`);
        }

        if (isLastAttempt) {
          return false;
        }

        // Show brief retry message (not the full error)
        const delaySec = this.retryDelayMs / 1000;
        logger.warn(`  ⏳ Retrying in ${delaySec}s... (attempt ${attempt}/${this.maxRetries} failed)`);
        await sleep(this.retryDelayMs);
      }
    }

    return false;
  }

  /**
   * Process a single chunk using the configured backend (JAR or ClearlyDefined HTTP).
   */
  private async processChunk(chunk: string[], outputFile: string): Promise<void> {
    const lines = await this.backend.processBatch(chunk);
    writeFileSync(outputFile, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
  }

  /**
   * Merge all chunk results (and any pre-cached lines) into the final
   * DEPENDENCIES file, deduplicating and sorting entries.
   */
  private mergeChunkResults(tempFiles: string[], cachedLines: string[] = []): number {
    const allEntries = new Set<string>(cachedLines);

    for (const tempFile of tempFiles) {
      if (existsSync(tempFile)) {
        try {
          const content = readFileSync(tempFile, 'utf8');
          const lines = parseNonEmptyLines(content);
          lines.forEach(line => allEntries.add(line));
          logger.debug(`  Merged ${lines.length} entries from ${tempFile}`);
        } catch (error: unknown) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          logger.warn(`  Could not read ${tempFile}: ${errorMsg}`);
        }
      }
    }

    if (allEntries.size === 0) {
      throw new Error('No entries found in any chunk output files');
    }

    const sortedEntries = Array.from(allEntries).sort();
    writeFileSync(this.options.outputFile, sortedEntries.join('\n') + '\n', 'utf8');
    return sortedEntries.length;
  }

  /**
   * Clean up temporary chunk files
   */
  private cleanupTempFiles(tempFiles: string[]): void {
    let deleted = 0;
    for (const tempFile of tempFiles) {
      if (existsSync(tempFile)) {
        try {
          unlinkSync(tempFile);
          deleted++;
        } catch (error: unknown) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          logger.warn(`Could not delete temp file ${tempFile}: ${errorMsg}`);
        }
      }
    }

    if (deleted > 0) {
      logger.debug(`Cleaned up ${deleted} temporary files`);
    }
  }

}

