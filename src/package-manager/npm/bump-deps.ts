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
import { readFileSync } from 'fs';
import { PackageManagerUtils, type FilePaths } from '../shared/utils';
import type { LicenseMap } from '../../document';

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
      
      // Initialize all dependencies map
      allDeps.forEach(lib => this.allDependencies.set(lib, { License: '' }));

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
