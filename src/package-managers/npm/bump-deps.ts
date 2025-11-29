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
import { readFileSync, existsSync } from 'fs';
import { PackageManagerUtils, type FilePaths } from '../../helpers/utils';
import type { LicenseMap, LicenseInfo } from '../../document';

/**
 * Interface for NPM dependencies info
 */
interface DependenciesInfo {
  dependencies?: string[];
  devDependencies?: string[];
}

/**
 * NPM package manager bump dependencies implementation
 */
class NpmDependencyProcessor {
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
   * Extract license information from node_modules package.json files
   */
  private extractLicenseInfo(packageName: string): LicenseInfo {
    const licenseInfo: LicenseInfo = { License: '' };
    
    try {
      // Parse package name and version
      const atIndex = packageName.lastIndexOf('@');
      if (atIndex === -1) return licenseInfo;
      
      const name = packageName.substring(0, atIndex);
      const packageJsonPath = path.join(process.env.PROJECT_COPY_DIR || '', 'node_modules', name, 'package.json');
      
      if (existsSync(packageJsonPath)) {
        const pkgJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        
        if (pkgJson.license) {
          licenseInfo.License = typeof pkgJson.license === 'string' 
            ? pkgJson.license 
            : pkgJson.license.type || '';
        }
        
        if (pkgJson.homepage) {
          licenseInfo.URL = pkgJson.homepage;
        } else if (pkgJson.repository) {
          const repo = typeof pkgJson.repository === 'string' 
            ? pkgJson.repository 
            : pkgJson.repository.url || '';
          if (repo) {
            licenseInfo.URL = repo.replace(/^git\+/, '').replace(/\.git$/, '');
          }
        }
      }
    } catch (error) {
      // Silently ignore errors for individual packages
    }
    
    return licenseInfo;
  }

  /**
   * Process NPM dependencies
   */
  public process(): void {
    try {
      // Get dependencies info
      const dependenciesInfoPath = path.join(this.paths.TMP_DIR, 'dependencies-info.json');
      const depsInfo: DependenciesInfo = JSON.parse(readFileSync(dependenciesInfoPath, 'utf8'));
      const prodDeps = depsInfo.dependencies ?? [];
      const devDeps = depsInfo.devDependencies ?? [];
      const allDeps = [...prodDeps, ...devDeps];
      
      // Extract license information from node_modules package.json files
      allDeps.forEach(lib => {
        const licenseInfo = this.extractLicenseInfo(lib);
        this.allDependencies.set(lib, licenseInfo);
      });

      // Process and generate documents
      PackageManagerUtils.processAndGenerateDocuments(
        prodDeps,
        devDeps,
        this.allDependencies,
        this.paths,
        this.writeToDisk
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error processing NPM dependencies:', errorMessage);
      process.exit(1);
    }
  }
}

// Execute the processor
const processor = new NpmDependencyProcessor();
processor.process();
