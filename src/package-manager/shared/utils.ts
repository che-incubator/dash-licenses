/*
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
import { writeFileSync, existsSync, readFileSync } from 'fs';
import {
  getLogs,
  getUnresolvedNumber,
  parseExcludedFileData,
  parseDependenciesFile,
  arrayToDocument,
  type DependencyMap,
  type LicenseMap
} from '../../document';

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
      PROD_MD: path.join(DEPS_DIR, 'prod.md'),
      DEV_MD: path.join(DEPS_DIR, 'dev.md'),
      PROBLEMS_MD: path.join(DEPS_DIR, 'problems.md'),
      DEPENDENCIES: path.join(TMP_DIR, 'DEPENDENCIES'),
      EXCLUDED_PROD_MD: path.join(EXCLUSIONS_DIR, 'prod.md'),
      EXCLUDED_DEV_MD: path.join(EXCLUSIONS_DIR, 'dev.md')
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
   */
  public static processExcludedDependencies(
    depsToCQ: DependencyMap,
    excludedProdPath: string,
    excludedDevPath: string,
    encoding: string
  ): void {
    if (existsSync(excludedProdPath)) {
      parseExcludedFileData(readFileSync(excludedProdPath, { encoding: encoding as BufferEncoding }), depsToCQ);
    }
    
    if (existsSync(excludedDevPath)) {
      parseExcludedFileData(readFileSync(excludedDevPath, { encoding: encoding as BufferEncoding }), depsToCQ);
    }
  }

  /**
   * Process dependencies file and generate documents
   * @param prodDeps - Array of production dependencies
   * @param devDeps - Array of development dependencies
   * @param allDependencies - Map of all dependency information
   * @param paths - File paths object
   * @param writeToDisk - Whether to write files to disk
   */
  public static processAndGenerateDocuments(
    prodDeps: string[],
    devDeps: string[],
    allDependencies: LicenseMap,
    paths: FilePaths,
    writeToDisk: boolean
  ): void {
    const depsToCQ: DependencyMap = new Map();
    
    // Process excluded dependencies
    this.processExcludedDependencies(
      depsToCQ, 
      paths.EXCLUDED_PROD_MD, 
      paths.EXCLUDED_DEV_MD, 
      paths.ENCODING
    );

    // Parse main dependencies file
    const dependenciesStr = readFileSync(paths.DEPENDENCIES, { encoding: paths.ENCODING as BufferEncoding });
    parseDependenciesFile(dependenciesStr, depsToCQ, allDependencies);

    // Generate production dependencies document
    const prodDepsData = arrayToDocument('Production dependencies', prodDeps, depsToCQ, allDependencies);
    if (writeToDisk) {
      writeFileSync(paths.PROD_MD, prodDepsData, { encoding: paths.ENCODING as BufferEncoding });
    }

    // Generate development dependencies document
    const devDepsData = arrayToDocument('Development dependencies', devDeps, depsToCQ, allDependencies);
    if (writeToDisk) {
      writeFileSync(paths.DEV_MD, devDepsData, { encoding: paths.ENCODING as BufferEncoding });
    }

    // Handle logs and problems
    const logs = getLogs();
    if (logs) {
      if (writeToDisk) {
        writeFileSync(paths.PROBLEMS_MD, `# Dependency analysis\n${logs}`, { encoding: paths.ENCODING as BufferEncoding });
      }
      console.log(logs);
    }

    // Exit with error code if there are unresolved dependencies
    if (getUnresolvedNumber() > 0) {
      process.exit(1);
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
