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

export interface ChunkedProcessorOptions {
  parserScript: string;
  parserInput: string;
  dashLicensesJar: string;
  batchSize: number;
  outputFile: string;
  debug?: boolean;
  maxRetries?: number;
  retryDelayMs?: number;
}

export class ChunkedDashLicensesProcessor {
  private readonly options: ChunkedProcessorOptions;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(options: ChunkedProcessorOptions) {
    this.options = options;
    this.maxRetries = options.maxRetries || 9; // 3x more attempts for reliability
    this.retryDelayMs = options.retryDelayMs || 3000; // 3 seconds between retries
  }

  /**
   * Process dependencies in chunks to avoid timeouts and API limits
   */
  public async process(): Promise<void> {
    if (this.options.debug) {
      console.log('Starting chunked processing of dependencies...');
    }

    // Step 1: Get all dependencies from parser
    const allDependencies = this.getAllDependencies();
    
    if (allDependencies.length === 0) {
      console.warn('No dependencies found from parser');
      return;
    }

    console.log(`Total dependencies to process: ${allDependencies.length}`);

    // Step 2: Split into chunks
    // Use batch size directly to ensure ClearlyDefined queries stay small
    // (Eclipse Foundation resolves ~30-50%, leaving remaining for ClearlyDefined)
    // With chunk = batch, ClearlyDefined gets ~70-150 items max, which is reliable
    const chunkSize = this.options.batchSize;
    const chunks = this.splitIntoChunks(allDependencies, chunkSize);
    
    console.log(`Split into ${chunks.length} chunks (max ${chunkSize} dependencies per chunk)`);

    // Step 3: Process each chunk with retry logic
    // Abort immediately if any chunk fails after all retries
    const tempFiles: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkNum = i + 1;
      console.log(`\n[${chunkNum}/${chunks.length}] Processing chunk with ${chunks[i].length} dependencies...`);
      
      const tempFile = `${this.options.outputFile}.chunk${chunkNum}.tmp`;
      tempFiles.push(tempFile);

      const success = await this.processChunkWithRetry(chunks[i], tempFile, chunkNum);
      
      if (!success) {
        console.error(`\n[${chunkNum}/${chunks.length}] ✗ Failed after ${this.maxRetries} attempts`);
        console.error(`Aborting: Cannot continue with remaining ${chunks.length - chunkNum} chunks.`);
        
        // Clean up temporary files before aborting
        if (!this.options.debug) {
          this.cleanupTempFiles(tempFiles);
        } else {
          console.log(`Debug mode: Kept ${tempFiles.length} temporary chunk files`);
        }
        
        throw new Error(`Chunk ${chunkNum} of ${chunks.length} failed after ${this.maxRetries} retries. Aborted processing.`);
      }
    }

    // Step 4: Merge all chunk results into final DEPENDENCIES file
    console.log('\nMerging chunk results...');
    const totalEntries = this.mergeChunkResults(tempFiles);
    console.log(`Merged ${totalEntries} unique dependencies into ${this.options.outputFile}`);

    // Step 5: Clean up temporary files
    if (!this.options.debug) {
      this.cleanupTempFiles(tempFiles);
    } else {
      console.log(`Debug mode: Kept ${tempFiles.length} temporary chunk files`);
    }

    console.log(`✓ Successfully processed all ${allDependencies.length} dependencies\n`);
  }

  /**
   * Get all dependencies from the parser script or file
   */
  private getAllDependencies(): string[] {
    try {
      let output: string;

      // Special case: if parserScript is 'cat' or ends with a file extension, read the file directly
      if (this.options.parserScript === 'cat' || this.options.parserScript.match(/\.(txt|deps)$/)) {
        if (this.options.debug) {
          console.log(`Reading dependencies from file: ${this.options.parserInput}`);
        }
        output = readFileSync(this.options.parserInput, 'utf8');
      } else {
        // Run parser script
        const command = this.options.parserInput 
          ? `node ${this.options.parserScript} "${this.options.parserInput}"`
          : `node ${this.options.parserScript}`;
        
        if (this.options.debug) {
          console.log(`Running parser: ${command}`);
        }

        output = execSync(command, { 
          encoding: 'utf8',
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large outputs
        });
      }
      
      return output
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    } catch (error: any) {
      console.error('Error getting dependencies:', error.message);
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
          console.log(`  → Retry attempt ${attempt}/${this.maxRetries}...`);
        }

        this.processChunk(chunk, outputFile);
        
        // Verify output was created and has content
        if (existsSync(outputFile)) {
          const content = readFileSync(outputFile, 'utf8');
          if (content.length > 0) {
            const lineCount = content.split('\n').filter(l => l.trim()).length;
            if (attempt > 1) {
              console.log(`  ✓ Succeeded on attempt ${attempt} (${lineCount} entries)`);
            } else if (this.options.debug) {
              console.log(`  ✓ Completed (${lineCount} entries)`);
            }
            return true;
          }
        }
        
        throw new Error('Output file not created or empty');
        
      } catch (error: any) {
        const isLastAttempt = attempt === this.maxRetries;
        
        // dash-licenses uses various non-zero exit codes to indicate issues
        // (1, 2, 3, 9, etc. for unresolved/restricted/unmapped dependencies)
        // As long as the output file was created with content, treat it as success
        if (error.status && error.status > 0 && error.status < 128) {
          if (this.options.debug) {
            console.log(`  ⚠ dash-licenses exit code ${error.status}`);
          }
          // Check if we got results (output file exists with content)
          if (existsSync(outputFile)) {
            const content = readFileSync(outputFile, 'utf8');
            if (content.length > 0) {
              const lineCount = content.split('\n').filter(l => l.trim()).length;
              if (this.options.debug) {
                console.log(`  ✓ Completed with ${lineCount} entries (exit ${error.status}: some items need review)`);
              } else {
                console.log(`  ✓ Completed with ${lineCount} entries (some unresolved)`);
              }
              return true;
            }
          }
        }

        // Check for specific error codes
        const errorMsg = error.message || '';
        const isTimeoutError = errorMsg.includes('524') || errorMsg.includes('timeout');
        const isRateLimitError = errorMsg.includes('429');
        const isGatewayError = errorMsg.includes('502') || errorMsg.includes('bad gateway');

        // Only show error details on last attempt or in debug mode
        if (this.options.debug || isLastAttempt) {
          let errorType = 'Error';
          if (isTimeoutError) errorType = 'Timeout (HTTP 524)';
          else if (isRateLimitError) errorType = 'Rate limit (HTTP 429)';
          else if (isGatewayError) errorType = 'Bad gateway (HTTP 502)';
          
          console.error(`  ✗ ${errorType}: ${errorMsg.substring(0, 200)}`);
        }

        if (isLastAttempt) {
          return false;
        }

        // Show brief retry message (not the full error)
        const delaySec = this.retryDelayMs / 1000;
        console.log(`  ⏳ Retrying in ${delaySec}s... (attempt ${attempt}/${this.maxRetries} failed)`);
        await this.sleep(this.retryDelayMs);
      }
    }

    return false;
  }

  /**
   * Process a single chunk by piping it to dash-licenses
   */
  private processChunk(chunk: string[], outputFile: string): void {
    // Write chunk to a temporary file to avoid shell argument length limits
    // (printf with 600+ quoted arguments exceeds shell limits)
    const tempInputFile = `${outputFile}.input.tmp`;
    
    try {
      // Write all dependencies to temp file
      writeFileSync(tempInputFile, chunk.join('\n') + '\n', 'utf8');
      
      // Pipe the file to dash-licenses
      const command = `cat "${tempInputFile}" | java -jar ${this.options.dashLicensesJar} -batch "${this.options.batchSize}" -summary "${outputFile}" -`;
      
      execSync(command, { 
        stdio: this.options.debug ? 'inherit' : 'pipe',
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });
    } finally {
      // Clean up temp input file
      if (existsSync(tempInputFile)) {
        try {
          unlinkSync(tempInputFile);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    }
  }

  /**
   * Merge all chunk results into final DEPENDENCIES file
   */
  private mergeChunkResults(tempFiles: string[]): number {
    // Use a Set to deduplicate entries
    const allEntries = new Set<string>();

    for (const tempFile of tempFiles) {
      if (existsSync(tempFile)) {
        try {
          const content = readFileSync(tempFile, 'utf8');
          const lines = content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
          
          lines.forEach(line => allEntries.add(line));
          
          if (this.options.debug) {
            console.log(`  Merged ${lines.length} entries from ${tempFile}`);
          }
        } catch (error: any) {
          console.warn(`  Warning: Could not read ${tempFile}: ${error.message}`);
        }
      }
    }

    if (allEntries.size === 0) {
      throw new Error('No entries found in any chunk output files');
    }

    // Sort entries for consistent output (important for git diffs)
    const sortedEntries = Array.from(allEntries).sort();
    
    // Write to final file
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
        } catch (error: any) {
          console.warn(`Warning: Could not delete temp file ${tempFile}: ${error.message}`);
        }
      }
    }
    
    if (this.options.debug && deleted > 0) {
      console.log(`Cleaned up ${deleted} temporary files`);
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

