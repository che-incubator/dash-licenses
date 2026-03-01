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

import * as path from 'path';
import { writeFileSync, existsSync, readFileSync, unlinkSync } from 'fs';
import {
  getLogs,
  getUnresolvedNumber,
  parseExcludedFileData,
  parseDependenciesFile,
  arrayToDocument,
  type DependencyMap,
  type LicenseMap
} from '../document';
import { runJarFallback } from './jar-fallback';
import { logger } from './logger';

/**
 * Interface for file paths configuration
 */
export interface FilePaths {
  ENCODING: string;
  DEPS_DIR: string;
  TMP_DIR: string;
  EXCLUSIONS_DIR: string;
  PROD_MD: string;
  DEV_MD: string;
  PROBLEMS_MD: string;
  DEPENDENCIES: string;
  EXCLUDED_PROD_MD: string;
  EXCLUDED_DEV_MD: string;
}

/**
 * Interface for package identifier components
 */
export interface PackageIdentifier {
  name: string;
  version: string;
}

/**
 * File name constants
 */
export const FILE_NAMES = {
  PROD_MD: 'prod.md',
  DEV_MD: 'dev.md',
  PROBLEMS_MD: 'problems.md',
  DEPENDENCIES: 'DEPENDENCIES'
} as const;

/**
 * Regex patterns
 */
export const PATTERNS = {
  EXCLUDED_TABLE: /^\| `([^|^ ]+)` \| ([^|]+) \|$/gm
} as const;

/**
 * Utility functions
 */

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse non-empty lines from content
 */
export function parseNonEmptyLines(content: string): string[] {
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

/**
 * Get error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Shared utilities for package manager implementations
 */
export class PackageManagerUtils {
  /**
   * Get standard file paths for dependency processing
   * @returns Object containing all standard file paths
   */
  public static getFilePaths(): FilePaths {
    const ENCODING = process.env.ENCODING ?? 'utf8';
    const DEPS_DIR = process.env.DEPS_COPY_DIR;
    
    if (!DEPS_DIR) {
      throw new Error('DEPS_COPY_DIR environment variable is required');
    }
    
    const TMP_DIR = path.join(DEPS_DIR, 'tmp');
    const EXCLUSIONS_DIR = path.join(DEPS_DIR, 'EXCLUDED');

    return {
      ENCODING,
      DEPS_DIR,
      TMP_DIR,
      EXCLUSIONS_DIR,
      // Write generated files to TMP_DIR so they can be compared in --check mode
      // and then copied to final destination by entrypoint.sh in generate mode
      PROD_MD: path.join(TMP_DIR, FILE_NAMES.PROD_MD),
      DEV_MD: path.join(TMP_DIR, FILE_NAMES.DEV_MD),
      PROBLEMS_MD: path.join(TMP_DIR, FILE_NAMES.PROBLEMS_MD),
      DEPENDENCIES: path.join(TMP_DIR, FILE_NAMES.DEPENDENCIES),
      EXCLUDED_PROD_MD: path.join(EXCLUSIONS_DIR, FILE_NAMES.PROD_MD),
      EXCLUDED_DEV_MD: path.join(EXCLUSIONS_DIR, FILE_NAMES.DEV_MD)
    };
  }

  /**
   * Check if we should write to disk based on command line arguments
   * @returns True if should write to disk, false otherwise
   */
  public static shouldWriteToDisk(): boolean {
    const args = process.argv.slice(2);
    return args[0] !== '--check';
  }

  /**
   * Process excluded dependencies from markdown files
   * @param depsToCQ - Map to store dependency to CQ mappings
   * @param excludedProdPath - Path to excluded production dependencies file
   * @param excludedDevPath - Path to excluded development dependencies file
   * @param encoding - File encoding
   * @param excludedProdIds - Optional set to collect identifiers from prod file
   * @param excludedDevIds - Optional set to collect identifiers from dev file
   */
  public static processExcludedDependencies(
    depsToCQ: DependencyMap,
    excludedProdPath: string,
    excludedDevPath: string,
    encoding: string,
    excludedProdIds?: Set<string>,
    excludedDevIds?: Set<string>
  ): void {
    if (existsSync(excludedProdPath)) {
      const content = readFileSync(excludedProdPath, { encoding: encoding as BufferEncoding });
      parseExcludedFileData(content, depsToCQ);
      if (excludedProdIds) {
        let m: RegExpExecArray | null;
        while ((m = PATTERNS.EXCLUDED_TABLE.exec(content)) !== null) excludedProdIds.add(m[1]);
      }
    }
    if (existsSync(excludedDevPath)) {
      const content = readFileSync(excludedDevPath, { encoding: encoding as BufferEncoding });
      parseExcludedFileData(content, depsToCQ);
      if (excludedDevIds) {
        let m: RegExpExecArray | null;
        while ((m = PATTERNS.EXCLUDED_TABLE.exec(content)) !== null) excludedDevIds.add(m[1]);
      }
    }
  }

  /**
   * Remove given identifiers from an EXCLUDED markdown file (table rows only).
   * Preserves header and comment lines.
   */
  public static removeUnusedExcludes(
    excludedPath: string,
    identifiersToRemove: Set<string>,
    encoding: string
  ): void {
    if (!existsSync(excludedPath) || identifiersToRemove.size === 0) return;
    const content = readFileSync(excludedPath, { encoding: encoding as BufferEncoding });
    const lines = content.split(/\r?\n/);
    const tablePattern = /^\| `([^|^ ]+)` \| ([^|]+) \|$/;
    const kept: string[] = [];
    for (const line of lines) {
      const m = line.match(tablePattern);
      if (m && identifiersToRemove.has(m[1])) continue;
      kept.push(line);
    }
    writeFileSync(excludedPath, kept.join('\n') + (kept.length ? '\n' : ''), { encoding: encoding as BufferEncoding });
  }

  /**
   * Process dependencies file and generate documents
   * Files are always written to TMP_DIR for comparison in --check mode.
   * In generate mode, entrypoint.sh handles copying files to the final destination.
   * @param prodDeps - Array of production dependencies
   * @param devDeps - Array of development dependencies
   * @param allDependencies - Map of all dependency information
   * @param paths - File paths object
   */
  public static processAndGenerateDocuments(
    prodDeps: string[],
    devDeps: string[],
    allDependencies: LicenseMap,
    paths: FilePaths
  ): void {
    try {
      const depsToCQ: DependencyMap = new Map();
      const excludedProdIds = new Set<string>();
      const excludedDevIds = new Set<string>();

      // Process excluded dependencies
      this.processExcludedDependencies(
        depsToCQ,
        paths.EXCLUDED_PROD_MD,
        paths.EXCLUDED_DEV_MD,
        paths.ENCODING,
        excludedProdIds,
        excludedDevIds
      );

      // Parse main dependencies file
      if (!existsSync(paths.DEPENDENCIES)) {
        const errorMsg = `Error: DEPENDENCIES file not found at ${paths.DEPENDENCIES}`;
        console.error(errorMsg);
        writeFileSync(paths.PROBLEMS_MD, `# Dependency analysis\n\n${errorMsg}\n`, { encoding: paths.ENCODING as BufferEncoding });
        throw new Error(errorMsg);
      }

      const dependenciesStr = readFileSync(paths.DEPENDENCIES, { encoding: paths.ENCODING as BufferEncoding });
      if (!dependenciesStr || dependenciesStr.trim().length === 0) {
        const errorMsg = `Error: DEPENDENCIES file is empty at ${paths.DEPENDENCIES}`;
        console.error(errorMsg);
        writeFileSync(paths.PROBLEMS_MD, `# Dependency analysis\n\n${errorMsg}\n`, { encoding: paths.ENCODING as BufferEncoding });
        throw new Error(errorMsg);
      }

      const unusedExcludes: string[] = [];
      parseDependenciesFile(dependenciesStr, depsToCQ, allDependencies, unusedExcludes);

      // Auto-remove UNUSED Excludes from EXCLUDED files
      if (unusedExcludes.length > 0) {
        const toRemoveFromProd = unusedExcludes.filter(id => excludedProdIds.has(id));
        const toRemoveFromDev = unusedExcludes.filter(id => excludedDevIds.has(id));
        if (toRemoveFromProd.length > 0) {
          this.removeUnusedExcludes(paths.EXCLUDED_PROD_MD, new Set(toRemoveFromProd), paths.ENCODING);
          logger.info(`Removed ${toRemoveFromProd.length} unused exclude(s) from EXCLUDED/prod.md`);
        }
        if (toRemoveFromDev.length > 0) {
          this.removeUnusedExcludes(paths.EXCLUDED_DEV_MD, new Set(toRemoveFromDev), paths.ENCODING);
          logger.info(`Removed ${toRemoveFromDev.length} unused exclude(s) from EXCLUDED/dev.md`);
        }
      }

      // JAR fallback: if jarPath is set and we have unresolved deps, run Eclipse JAR and add approved to EXCLUDED
      const jarPath = process.env.JAR_PATH;
      const projectPath = process.env.PROJECT_COPY_DIR || path.dirname(paths.DEPS_DIR);

      // Process unresolved production dependencies with JAR
      const unresolvedProdDeps = prodDeps.filter(d => !depsToCQ.has(d));
      if (jarPath && unresolvedProdDeps.length > 0) {
        const approvedFromJar = runJarFallback(
          jarPath,
          projectPath,
          unresolvedProdDeps,
          paths.EXCLUDED_PROD_MD,
          paths.ENCODING
        );
        approvedFromJar.forEach((cq, id) => depsToCQ.set(id, cq));
      }

      // Process unresolved development dependencies with JAR
      const unresolvedDevDeps = devDeps.filter(d => !depsToCQ.has(d));
      if (jarPath && unresolvedDevDeps.length > 0) {
        const approvedFromJar = runJarFallback(
          jarPath,
          projectPath,
          unresolvedDevDeps,
          paths.EXCLUDED_DEV_MD,
          paths.ENCODING
        );
        approvedFromJar.forEach((cq, id) => depsToCQ.set(id, cq));
      }

      // Generate production dependencies document
      // Always write to TMP_DIR for comparison (entrypoint.sh handles copying to final destination)
      const prodDepsData = arrayToDocument('Production dependencies', prodDeps, depsToCQ, allDependencies);
      try {
        writeFileSync(paths.PROD_MD, prodDepsData, { encoding: paths.ENCODING as BufferEncoding });
        logger.success(`Generated ${paths.PROD_MD} (${prodDeps.length} dependencies)`);
      } catch (error) {
        const errorMsg = `Error writing prod.md to ${paths.PROD_MD}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger.error(errorMsg);
        writeFileSync(paths.PROBLEMS_MD, `# Dependency analysis\n\n${errorMsg}\n`, { encoding: paths.ENCODING as BufferEncoding });
        throw new Error(errorMsg);
      }

      // Generate development dependencies document
      // Always write to TMP_DIR for comparison (entrypoint.sh handles copying to final destination)
      const devDepsData = arrayToDocument('Development dependencies', devDeps, depsToCQ, allDependencies);
      try {
        writeFileSync(paths.DEV_MD, devDepsData, { encoding: paths.ENCODING as BufferEncoding });
        logger.success(`Generated ${paths.DEV_MD} (${devDeps.length} dependencies)`);
      } catch (error) {
        const errorMsg = `Error writing dev.md to ${paths.DEV_MD}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger.error(errorMsg);
        writeFileSync(paths.PROBLEMS_MD, `# Dependency analysis\n\n${errorMsg}\n`, { encoding: paths.ENCODING as BufferEncoding });
        throw new Error(errorMsg);
      }

      // Handle logs and problems
      // Always write to TMP_DIR (entrypoint.sh handles copying to final destination)
      const logs = getLogs();
      if (logs) {
        writeFileSync(paths.PROBLEMS_MD, `# Dependency analysis\n${logs}`, { encoding: paths.ENCODING as BufferEncoding });
        logger.warn('Dependency analysis found issues:');
        console.log(logs);
      } else if (existsSync(paths.PROBLEMS_MD)) {
        // Delete old problems.md in TMP_DIR if all checks passed and no issues found
        unlinkSync(paths.PROBLEMS_MD);
        logger.success('All checks passed. Removed old problems.md file.');
      }

      // Check for unresolved dependencies
      const unresolvedCount = getUnresolvedNumber();
      if (unresolvedCount > 0) {
        const errorMsg = `Found ${unresolvedCount} unresolved dependencies. See problems.md for details.`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error) {
      const errorMsg = `Error processing dependencies: ${error instanceof Error ? error.message : 'Unknown error'}`;
      logger.error(errorMsg);
      if (error instanceof Error && error.stack) {
        logger.debug(error.stack);
      }

      // Don't overwrite problems.md if this is the expected "unresolved dependencies" error
      // In that case, problems.md was already written correctly by getLogs()
      const isUnresolvedDepsError = error instanceof Error && error.message.startsWith('Found ') && error.message.includes('unresolved dependencies');

      if (!isUnresolvedDepsError) {
        try {
          writeFileSync(paths.PROBLEMS_MD, `# Dependency analysis\n\n${errorMsg}\n${error instanceof Error && error.stack ? error.stack : ''}\n`, { encoding: paths.ENCODING as BufferEncoding });
        } catch {
          // Ignore errors writing problems.md if we're already in error state
        }
      }
      throw error;
    }
  }

  /**
   * Validate required environment variables
   * @throws {Error} If required environment variables are missing
   */
  public static validateEnvironment(): void {
    const required = ['DEPS_COPY_DIR', 'ENCODING'];
    const missing = required.filter(env => !process.env[env]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  /**
   * Parse package identifier to extract name and version
   * @param identifier - Package identifier (e.g., 'package@1.0.0' or '@scope/package@1.0.0')
   * @returns Object with name and version properties
   */
  public static parsePackageIdentifier(identifier: string): PackageIdentifier {
    if (!identifier || typeof identifier !== 'string') {
      throw new Error('Package identifier must be a non-empty string');
    }

    const atIndex = identifier.lastIndexOf('@');
    if (atIndex === -1 || atIndex === 0) {
      throw new Error(`Invalid package identifier format: ${identifier}`);
    }

    return {
      name: identifier.substring(0, atIndex),
      version: identifier.substring(atIndex + 1)
    };
  }

  /**
   * Create package identifier from name and version
   * @param name - Package name
   * @param version - Package version
   * @returns Package identifier
   */
  public static createPackageIdentifier(name: string, version: string): string {
    if (!name || !version) {
      throw new Error('Both name and version must be provided');
    }
    return `${name}@${version}`;
  }
}

