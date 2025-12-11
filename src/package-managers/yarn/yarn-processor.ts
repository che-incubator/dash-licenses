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
import * as path from 'path';
import { PackageManagerBase } from '../../helpers/package-manager-base';
import { ChunkedDashLicensesProcessor } from '../../helpers/chunked-processor';

/**
 * Yarn v1 package manager processor.
 * Handles dependency analysis for projects using Yarn Classic (v1).
 */
export class YarnProcessor extends PackageManagerBase {
  constructor() {
    super({
      name: 'yarn',
      projectFile: 'package.json',
      lockFile: 'yarn.lock',
    });
  }

  /**
   * Generate dependencies using Yarn v1 specific tooling.
   */
  protected async generateDependencies(): Promise<void> {
    // Generate all dependencies info
    console.log('Generating all dependencies info using yarn...');
    const depsInfoFile = path.join(this.env.TMP_DIR, 'yarn-deps-info.json');
    execSync(
      `yarn licenses list --ignore-engines --json --depth=0 --no-progress --network-timeout 300000 > "${depsInfoFile}"`,
      { cwd: this.env.PROJECT_COPY_DIR }
    );
    console.log('Done.');
    console.log();

    // Generate DEPENDENCIES file using chunked processing
    console.log(`Generating a temporary DEPENDENCIES file (batch size: ${this.env.BATCH_SIZE})...`);
    const parserScript = path.join(this.env.WORKSPACE_DIR, 'package-managers/yarn/parser.js');
    const depsFilePath = path.join(this.env.TMP_DIR, 'DEPENDENCIES');

    try {
      const processor = new ChunkedDashLicensesProcessor({
        parserScript,
        parserInput: '', // yarn parser doesn't need input, reads from project
        dashLicensesJar: this.env.DASH_LICENSES,
        batchSize: parseInt(this.env.BATCH_SIZE),
        outputFile: depsFilePath,
        debug: this.options.debug
        // Uses default: maxRetries=9, retryDelayMs=3000
      });

      await processor.process();
    } catch (error: unknown) {
      const err = error as Error;
      console.error(`Error: Failed to generate DEPENDENCIES file: ${err.message}`);
      console.error('This is usually caused by Eclipse Foundation or ClearlyDefined API issues (timeout, rate limit, etc.).');
      if (this.options.debug) {
        this.copyTmpDir();
      }
      process.exit(1);
    }

    // Generate list of production dependencies
    console.log('Generating list of production dependencies using yarn...');
    const prodDepsFile = path.join(this.env.TMP_DIR, 'yarn-prod-deps.json');
    execSync(
      `yarn list --ignore-engines --json --prod --depth=0 --no-progress > ${prodDepsFile}`,
      { cwd: this.env.PROJECT_COPY_DIR }
    );
    console.log('Done.');
    console.log();

    // Generate list of all dependencies
    console.log('Generating list of all dependencies using yarn...');
    const allDepsFile = path.join(this.env.TMP_DIR, 'yarn-all-deps.json');
    execSync(
      `yarn list --ignore-engines --json --depth=0 --no-progress > ${allDepsFile}`,
      { cwd: this.env.PROJECT_COPY_DIR }
    );
    console.log('Done.');
    console.log();
  }
}
