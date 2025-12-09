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
import type { LicenseMap, LicenseInfo } from '../../document';

/**
 * Interface for Yarn 3 dependency children structure
 */
interface YarnDependencyChildren {
  [key: string]: {
    children: {
      url?: string;
    };
  };
}

/**
 * Interface for Yarn 3 dependency line structure
 */
interface YarnDependencyLine {
  value: string;
  children: YarnDependencyChildren;
}

/**
 * Yarn 3+ package manager bump dependencies implementation
 */
class Yarn3DependencyProcessor {
  private readonly paths: FilePaths;
  private readonly allDependencies: LicenseMap;

  constructor() {
    this.paths = PackageManagerUtils.getFilePaths();
    this.allDependencies = new Map();
  }

  /**
   * Normalize Yarn 3 package key to standard format
   */
  private normalizePackageKey(key: string): string {
    return key
      .replace(/@npm:/g, '@')
      .replace(/@virtual:.+#npm:/g, '@');
  }

  /**
   * Extract dependencies from Yarn 3 dependency info
   */
  private extractDependencies(dependenciesInfo: string[]): string[] {
    const deps: string[] = [];
    dependenciesInfo.forEach((line: string) => {
      const { children }: { children: YarnDependencyChildren } = JSON.parse(line);
      const keys = Object.keys(children);
      keys.filter(val => val.includes('@npm:') || val.includes('@virtual:')).forEach(key => {
        deps.push(this.normalizePackageKey(key));
      });
    });
    return deps;
  }

  /**
   * Parse Yarn 3 license info and populate allDependencies map
   */
  private parseLicenseInfo(): void {
    const depsInfoPath = path.join(this.paths.TMP_DIR, 'yarn-deps-info.json');
    const allDependenciesInfo = readFileSync(depsInfoPath).toString().trim();

    allDependenciesInfo.split('\n').forEach((line: string) => {
      const { value, children }: YarnDependencyLine = JSON.parse(line);
      const keys = Object.keys(children);
      keys.filter(val => val.includes('@npm:') || val.includes('@virtual:')).forEach(key => {
        const normalizedKey = this.normalizePackageKey(key);
        const url = children[key]?.children?.url;
        const licenseInfo: LicenseInfo = {
          License: value
        };
        if (url) {
          licenseInfo.URL = url;
        }
        this.allDependencies.set(normalizedKey, licenseInfo);
      });
    });
  }

  /**
   * Process Yarn 3 dependencies
   */
  public process(): void {
    try {
      // Parse license information from yarn-deps-info.json
      this.parseLicenseInfo();

      // Read production dependencies
      const prodDepsPath = path.join(this.paths.TMP_DIR, 'yarn-prod-deps.json');
      const yarnProdDepsInfo = readFileSync(prodDepsPath).toString().trim().split('\n');
      const prodDeps = this.extractDependencies(yarnProdDepsInfo);

      // Build list of all dependencies from allDependencies map
      const allDeps: string[] = [];
      this.allDependencies.forEach((_value: LicenseInfo, key: string) => {
        allDeps.push(key);
      });
      allDeps.sort();

      // Build list of development dependencies (all - prod)
      const devDeps = allDeps.filter(entry => !prodDeps.includes(entry));

      // Process and generate documents using shared utility
      PackageManagerUtils.processAndGenerateDocuments(
        prodDeps,
        devDeps,
        this.allDependencies,
        this.paths
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error processing Yarn 3 dependencies:', errorMessage);
      process.exit(1);
    }
  }
}

// Execute the processor
const processor = new Yarn3DependencyProcessor();
processor.process();
