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
import { writeFileSync } from 'fs';
import { PackageManagerBase } from '../../helpers/package-manager-base';
import { ChunkedDashLicensesProcessor } from '../../helpers/chunked-processor';
import { parseYarnDependencies } from './parser';
import { YarnDependencyProcessor } from './bump-deps';
import type { Environment, Options } from '../../helpers/types';
import { environmentToProcessEnv } from '../../helpers/types';

/**
 * Yarn v1 package manager processor.
 * Handles dependency analysis for projects using Yarn Classic (v1).
 */
export class YarnProcessor extends PackageManagerBase {
  constructor(env?: Environment, options?: Options) {
    super(
      {
        name: 'yarn',
        projectFile: 'package.json',
        lockFile: 'yarn.lock'
      },
      env,
      options
    );
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

    // Parse dependencies and write to temp file for chunked processor
    const allDeps = parseYarnDependencies(this.env.TMP_DIR);
    const allDepsFile = path.join(this.env.TMP_DIR, 'yarn-all-deps.txt');
    writeFileSync(allDepsFile, allDeps.join('\n') + '\n', 'utf8');

    // Generate DEPENDENCIES file using chunked processing
    console.log(`Generating a temporary DEPENDENCIES file (batch size: ${this.env.BATCH_SIZE})...`);
    const depsFilePath = path.join(this.env.TMP_DIR, 'DEPENDENCIES');

    try {
      const processor = new ChunkedDashLicensesProcessor({
        parserScript: 'cat',
        parserInput: allDepsFile,
        parserEnv: environmentToProcessEnv(this.env),
        batchSize: parseInt(this.env.BATCH_SIZE),
        outputFile: depsFilePath,
        debug: this.options.debug,
        enableHarvest: this.options.harvest
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
    const allDepsFile2 = path.join(this.env.TMP_DIR, 'yarn-all-deps.json');
    execSync(
      `yarn list --ignore-engines --json --depth=0 --no-progress > ${allDepsFile2}`,
      { cwd: this.env.PROJECT_COPY_DIR }
    );
    console.log('Done.');
    console.log();
  }

  /**
   * Override: Run bump-deps directly instead of via execSync
   */
  protected override async runBumpDeps(): Promise<number> {
    console.log('Checking dependencies for restrictions to use...');
    try {
      const processor = new YarnDependencyProcessor();
      processor.process();
      return 0;
    } catch (error) {
      // Error already logged by the processor
      return 1;
    }
  }
}
