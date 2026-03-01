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

interface LockfileDepsInfo {
  dependencies?: string[];
  devDependencies?: string[];
}

/**
 * Yarn 3+ bump dependencies.
 * Supports lockfile-based format (yarn3-deps-info.json) - no plugin required.
 * Extracts license info from node_modules/package.json.
 */
export class Yarn3DependencyProcessor {
  private readonly paths: FilePaths;
  private readonly allDependencies: LicenseMap;

  constructor() {
    this.paths = PackageManagerUtils.getFilePaths();
    this.allDependencies = new Map();
  }

  private extractLicenseInfo(packageName: string): LicenseInfo {
    const info: LicenseInfo = { License: '' };
    try {
      const atIdx = packageName.lastIndexOf('@');
      if (atIdx <= 0) return info;
      const name = packageName.substring(0, atIdx);
      const pkgPath = path.join(process.env.PROJECT_COPY_DIR || '', 'node_modules', name, 'package.json');
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        if (pkg.license) {
          info.License = typeof pkg.license === 'string' ? pkg.license : pkg.license.type || '';
        }
        if (pkg.homepage) info.URL = pkg.homepage;
        else if (pkg.repository) {
          const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url || '';
          if (repo) info.URL = repo.replace(/^git\+/, '').replace(/\.git$/, '');
        }
      }
    } catch {
      // Ignore per-package errors
    }
    return info;
  }

  public process(): void {
    try {
      const depsInfoPath = path.join(this.paths.TMP_DIR, 'yarn3-deps-info.json');
      if (!existsSync(depsInfoPath)) {
        throw new Error('yarn3-deps-info.json not found. Use lockfile-based Yarn 3 processor.');
      }

      const depsInfo: LockfileDepsInfo = JSON.parse(readFileSync(depsInfoPath, 'utf8'));
      const prodDeps = depsInfo.dependencies ?? [];
      const devDeps = depsInfo.devDependencies ?? [];
      const allDeps = [...new Set([...prodDeps, ...devDeps])];

      allDeps.forEach(pkg => {
        this.allDependencies.set(pkg, this.extractLicenseInfo(pkg));
      });

      PackageManagerUtils.processAndGenerateDocuments(
        prodDeps,
        devDeps,
        this.allDependencies,
        this.paths
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error processing Yarn 3 dependencies:', msg);
      throw error;
    }
  }
}
