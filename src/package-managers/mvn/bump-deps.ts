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
import { readFileSync } from 'fs';
import { PackageManagerUtils, type FilePaths } from '../../helpers/utils';
import type { LicenseMap } from '../../document';

/**
 * Maven package manager bump dependencies implementation
 */
class MavenDependencyProcessor {
  private readonly paths: FilePaths;
  private readonly writeToDisk: boolean;
  private readonly allDependencies: LicenseMap;
  
  constructor() {
    this.paths = PackageManagerUtils.getFilePaths();
    this.writeToDisk = PackageManagerUtils.shouldWriteToDisk();
    this.allDependencies = new Map();
    
    // Validate environment
    PackageManagerUtils.validateEnvironment();
  }

  /**
   * Parse Maven dependency line (format: groupId:artifactId:type:classifier:version:scope)
   * Also handles format from DEPENDENCIES file: cq/maven/mavencentral/groupId/artifactId/version
   */
  private parseMavenDependency(line: string): string | null {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('[') || trimmed.startsWith('The following') || trimmed.startsWith('#')) {
      return null;
    }
    
    // Check if it's from DEPENDENCIES file (cq/maven/mavencentral/... format)
    if (trimmed.startsWith('cq/maven/')) {
      const parts = trimmed.split('/');
      if (parts.length >= 6) {
        const groupId = parts[3];
        const artifactId = parts[4];
        const version = parts[5].split(',')[0]; // Remove any trailing metadata
        return `${groupId}:${artifactId}@${version}`;
      }
    }
    
    // Maven dependency format: groupId:artifactId:type:classifier:version:scope
    const parts = trimmed.split(':');
    if (parts.length >= 5) {
      const groupId = parts[0];
      const artifactId = parts[1];
      const version = parts[parts.length - 2]; // version is second to last (before scope)
      return `${groupId}:${artifactId}@${version}`;
    }
    
    return null;
  }

  /**
   * Read dependencies from Maven dependency file
   */
  private readMavenDependencies(filePath: string): string[] {
    try {
      const content = readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const deps: string[] = [];
      
      for (const line of lines) {
        const dep = this.parseMavenDependency(line);
        if (dep) {
          deps.push(dep);
        }
      }
      
      return [...new Set(deps)].sort(); // Remove duplicates and sort
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
      const prodDeps = this.readMavenDependencies(prodDepsFile);
      
      // Read development dependencies from DEV_DEPENDENCIES file
      const devDepsFile = path.join(this.paths.TMP_DIR, 'DEV_DEPENDENCIES');
      const devDeps = this.readMavenDependencies(devDepsFile);
      
      // Also read from the text files for license info
      const prodDepsTextFile = path.join(this.paths.TMP_DIR, 'mvn-prod-deps.txt');
      const devDepsTextFile = path.join(this.paths.TMP_DIR, 'mvn-dev-deps.txt');
      
      const prodDepsFromText = this.readMavenDependencies(prodDepsTextFile);
      const devDepsFromText = this.readMavenDependencies(devDepsTextFile);
      
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

      // Process and generate documents
      PackageManagerUtils.processAndGenerateDocuments(
        allProdDeps,
        allDevDeps,
        this.allDependencies,
        this.paths,
        this.writeToDisk
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error processing Maven dependencies:', errorMessage);
      process.exit(1);
    }
  }
}

// Execute the processor
const processor = new MavenDependencyProcessor();
processor.process();

