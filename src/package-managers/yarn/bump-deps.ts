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
 * Interface for Yarn tree entry
 */
interface YarnTreeEntry {
  name: string;
}

/**
 * Interface for Yarn tree data structure
 */
interface YarnTreeData {
  data: {
    trees: YarnTreeEntry[];
  };
}

/**
 * Interface for Yarn license table structure
 */
interface YarnLicenseTable {
  type: string;
  data: {
    head: string[];
    body: string[][];
  };
}

/**
 * Yarn v1 package manager bump dependencies implementation
 */
class YarnDependencyProcessor {
  private readonly paths: FilePaths;
  private readonly allDependencies: LicenseMap;

  constructor() {
    this.paths = PackageManagerUtils.getFilePaths();
    this.allDependencies = new Map();
  }

  /**
   * Extract dependencies from Yarn tree structure
   */
  private extractDependencies(obj: YarnTreeData): string[] {
    if (!obj || !obj.data || !obj.data.trees) {
      return [];
    }
    // Transform @npm: to @ to match DEPENDENCIES file format
    return obj.data.trees.map(entry => entry.name.replace(/@npm:/g, '@')).sort();
  }

  /**
   * Parse Yarn license info file and populate allDependencies map
   */
  private parseLicenseInfo(): void {
    const depsInfoPath = path.join(this.paths.TMP_DIR, 'yarn-deps-info.json');
    const allDependenciesInfoStr = readFileSync(depsInfoPath).toString();
    const tableStartIndex = allDependenciesInfoStr.indexOf('{"type":"table"');

    if (tableStartIndex !== -1) {
      const licenses: YarnLicenseTable = JSON.parse(allDependenciesInfoStr.substring(tableStartIndex));
      const { head, body } = licenses.data;

      body.forEach((libInfo: string[]) => {
        const url = libInfo[head.indexOf('URL')];
        const licenseInfo: LicenseInfo = {
          License: libInfo[head.indexOf('License')]
        };
        if (url !== 'Unknown') {
          licenseInfo.URL = url;
        }
        this.allDependencies.set(
          `${libInfo[head.indexOf('Name')]}@${libInfo[head.indexOf('Version')]}`,
          licenseInfo
        );
      });
    }
  }

  /**
   * Process Yarn dependencies
   */
  public process(): void {
    try {
      // Parse license information from yarn-deps-info.json
      this.parseLicenseInfo();

      // Read production dependencies
      const prodDepsPath = path.join(this.paths.TMP_DIR, 'yarn-prod-deps.json');
      const yarnProdDepsStr = readFileSync(prodDepsPath).toString();
      const yarnProdDepsTree: YarnTreeData = JSON.parse(yarnProdDepsStr);
      const prodDeps = this.extractDependencies(yarnProdDepsTree);

      // Read all dependencies
      const allDepsPath = path.join(this.paths.TMP_DIR, 'yarn-all-deps.json');
      const yarnAllDepsStr = readFileSync(allDepsPath).toString();
      const yarnAllDepsTree: YarnTreeData = JSON.parse(yarnAllDepsStr);
      const allDeps = this.extractDependencies(yarnAllDepsTree);

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
      console.error('Error processing Yarn dependencies:', errorMessage);
      process.exit(1);
    }
  }
}

// Execute the processor
const processor = new YarnDependencyProcessor();
processor.process();
