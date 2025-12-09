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
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { PackageManagerUtils, type FilePaths } from '../../helpers/utils';
import {
  getLogs,
  getUnresolvedNumber,
  parseDependenciesFile,
  arrayToDocument,
  type DependencyMap,
  type LicenseMap
} from '../../document';

/**
 * Maven package manager bump dependencies implementation
 */
class MavenDependencyProcessor {
  private readonly paths: FilePaths;
  private readonly allDependencies: LicenseMap;
  
  constructor() {
    this.paths = PackageManagerUtils.getFilePaths();
    this.allDependencies = new Map();
    
    // Validate environment
    PackageManagerUtils.validateEnvironment();
  }

  /**
   * Parse Maven dependency line from DEPENDENCIES file format
   * Format: maven/mavencentral/groupId/artifactId/version, LICENSE, status, approvedBy
   */
  private parseMavenDependencyLine(line: string): string | null {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('Invalid:')) {
      return null;
    }
    
    // Split by comma to get parts: identifier, license, status, approvedBy
    const commaParts = trimmed.split(',');
    if (commaParts.length < 1) {
      return null;
    }
    
    const identifier = commaParts[0].trim();
    
    // Maven format: maven/mavencentral/groupId/artifactId/version
    const parts = identifier.split('/');
    if (parts.length >= 5 && parts[0] === 'maven') {
      // parts = ['maven', 'mavencentral', 'groupId', 'artifactId', 'version']
      const artifactId = parts[3];
      const version = parts[4];
      return `${artifactId}@${version}`;
    }
    
    return null;
  }

  /**
   * Parse Maven raw dependency line (from mvn dependency:list)
   * Format: groupId:artifactId:type:version:scope
   */
  private parseMavenRawDependency(line: string): string | null {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('[') || trimmed.startsWith('The following') || trimmed.startsWith('#')) {
      return null;
    }
    
    // Maven dependency format: groupId:artifactId:type:version:scope
    const parts = trimmed.split(':');
    if (parts.length >= 5) {
      const artifactId = parts[1];
      const version = parts[parts.length - 2]; // version is second to last (before scope)
      return `${artifactId}@${version}`;
    }
    
    return null;
  }

  /**
   * Read dependencies from Maven DEPENDENCIES file (processed by dash-licenses)
   */
  private readProcessedDependencies(filePath: string): string[] {
    try {
      const content = readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const deps: string[] = [];
      
      for (const line of lines) {
        const dep = this.parseMavenDependencyLine(line);
        if (dep) {
          deps.push(dep);
        }
      }
      
      return [...new Set(deps)].sort();
    } catch (error) {
      console.error(`Error reading ${filePath}:`, error instanceof Error ? error.message : 'Unknown error');
      return [];
    }
  }

  /**
   * Read dependencies from Maven raw dependency file (mvn dependency:list output)
   */
  private readRawDependencies(filePath: string): string[] {
    try {
      const content = readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const deps: string[] = [];
      
      for (const line of lines) {
        const dep = this.parseMavenRawDependency(line);
        if (dep) {
          deps.push(dep);
        }
      }
      
      return [...new Set(deps)].sort();
    } catch (error) {
      console.error(`Error reading ${filePath}:`, error instanceof Error ? error.message : 'Unknown error');
      return [];
    }
  }

  /**
   * Process Maven dependencies
   */
  public process(): void {
    try {
      // Read production dependencies from PROD_DEPENDENCIES file
      const prodDepsFile = path.join(this.paths.TMP_DIR, 'PROD_DEPENDENCIES');
      const prodDeps = this.readProcessedDependencies(prodDepsFile);
      
      // Read development dependencies from DEV_DEPENDENCIES file
      const devDepsFile = path.join(this.paths.TMP_DIR, 'DEV_DEPENDENCIES');
      const devDeps = this.readProcessedDependencies(devDepsFile);
      
      // Also read from the text files
      const prodDepsTextFile = path.join(this.paths.TMP_DIR, 'mvn-prod-deps.txt');
      const devDepsTextFile = path.join(this.paths.TMP_DIR, 'mvn-dev-deps.txt');
      
      const prodDepsFromText = this.readRawDependencies(prodDepsTextFile);
      const devDepsFromText = this.readRawDependencies(devDepsTextFile);
      
      // Merge and deduplicate
      const allProdDeps = [...new Set([...prodDeps, ...prodDepsFromText])].sort();
      const allDevDeps = [...new Set([...devDeps, ...devDepsFromText])].sort();
      
      // Initialize all dependencies map
      const allDeps = [...allProdDeps, ...allDevDeps];
      allDeps.forEach(lib => {
        if (!this.allDependencies.has(lib)) {
          this.allDependencies.set(lib, { License: '' });
        }
      });

      // Process using Maven-specific logic (merges PROD and DEV dependencies)
      this.processAndGenerateDocuments(prodDeps, devDeps, prodDepsFile, devDepsFile);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error processing Maven dependencies:', errorMessage);
      process.exit(1);
    }
  }

  /**
   * Process dependencies and generate documents (Maven-specific)
   * Uses separate PROD_DEPENDENCIES and DEV_DEPENDENCIES files
   */
  private processAndGenerateDocuments(
    prodDeps: string[],
    devDeps: string[],
    prodDepsFile: string,
    devDepsFile: string
  ): void {
    const depsToCQ: DependencyMap = new Map();
    
    // Process excluded dependencies
    PackageManagerUtils.processExcludedDependencies(
      depsToCQ, 
      this.paths.EXCLUDED_PROD_MD, 
      this.paths.EXCLUDED_DEV_MD, 
      this.paths.ENCODING
    );

    // Read both DEPENDENCIES files
    if (!existsSync(prodDepsFile)) {
      console.error(`Error: PROD_DEPENDENCIES file not found at ${prodDepsFile}`);
      process.exit(1);
    }
    const prodDependenciesStr = readFileSync(prodDepsFile, { encoding: this.paths.ENCODING as BufferEncoding });
    
    let devDependenciesStr = '';
    if (existsSync(devDepsFile)) {
      devDependenciesStr = readFileSync(devDepsFile, { encoding: this.paths.ENCODING as BufferEncoding });
    }

    // Combine both files and deduplicate lines to avoid "UNUSED Excludes" false positives
    // when the same dependency appears in both PROD and DEV files
    const allLines = [prodDependenciesStr, devDependenciesStr]
      .filter(s => s && s.trim().length > 0)
      .join('\n')
      .split('\n')
      .filter(line => line.trim().length > 0);
    
    // Deduplicate lines (same dependency can appear in both files)
    const uniqueLines = [...new Set(allLines)];
    const combinedDependencies = uniqueLines.join('\n');
    
    if (combinedDependencies.length > 0) {
      parseDependenciesFile(combinedDependencies, depsToCQ, this.allDependencies);
    }

    // Generate production dependencies document
    // Always write to TMP_DIR for comparison (entrypoint.sh handles copying to final destination)
    const prodDepsData = arrayToDocument('Production dependencies', prodDeps, depsToCQ, this.allDependencies);
    writeFileSync(this.paths.PROD_MD, prodDepsData, { encoding: this.paths.ENCODING as BufferEncoding });
    console.log(`Generated ${this.paths.PROD_MD} (${prodDeps.length} dependencies)`);

    // Generate development dependencies document
    // Always write to TMP_DIR for comparison (entrypoint.sh handles copying to final destination)
    const devDepsData = arrayToDocument('Development dependencies', devDeps, depsToCQ, this.allDependencies);
    writeFileSync(this.paths.DEV_MD, devDepsData, { encoding: this.paths.ENCODING as BufferEncoding });
    console.log(`Generated ${this.paths.DEV_MD} (${devDeps.length} dependencies)`);

    // Handle logs and problems
    // Always write to TMP_DIR (entrypoint.sh handles copying to final destination)
    const logs = getLogs();
    if (logs) {
      writeFileSync(this.paths.PROBLEMS_MD, `# Dependency analysis\n${logs}`, { encoding: this.paths.ENCODING as BufferEncoding });
      console.log(logs);
    } else if (existsSync(this.paths.PROBLEMS_MD)) {
      unlinkSync(this.paths.PROBLEMS_MD);
      console.log('All checks passed. Removed old problems.md file.');
    }

    // Exit with error code if there are unresolved dependencies
    const unresolvedCount = getUnresolvedNumber();
    if (unresolvedCount > 0) {
      console.error(`Error: Found ${unresolvedCount} unresolved dependencies. See problems.md for details.`);
      process.exit(1);
    }
  }
}

// Execute the processor
const processor = new MavenDependencyProcessor();
processor.process();
