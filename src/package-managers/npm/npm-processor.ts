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
import { writeFileSync } from 'fs';
import { PackageManagerBase } from '../../helpers/package-manager-base';
import { ChunkedDashLicensesProcessor } from '../../helpers/chunked-processor';
import { parseNpmDependencies } from './parser';
import { NpmDependencyProcessor } from './bump-deps';
import type { Environment, Options } from '../../helpers/types';

/**
 * NPM package manager processor.
 * Handles dependency analysis for projects using npm (package-lock.json).
 * Uses ClearlyDefined HTTP API for license resolution (no Java/JAR required).
 */
export class NpmProcessor extends PackageManagerBase {
  constructor(env?: Environment, options?: Options) {
    super(
      {
        name: 'npm',
        projectFile: 'package.json'
      },
      env,
      options
    );
  }

  /**
   * Generate dependencies using npm-specific tooling.
   * Parses package-lock.json and uses ChunkedDashLicensesProcessor
   * with ClearlyDefined HTTP backend for license analysis.
   */
  protected async generateDependencies(): Promise<void> {
    console.log(`Generating a temporary DEPENDENCIES file (batch size: ${this.env.BATCH_SIZE})...`);

    // Parse dependencies from package-lock.json
    const allDeps = parseNpmDependencies(this.env.PROJECT_COPY_DIR);

    // Write dependencies info for bump-deps to use
    const depsInfoPath = path.join(this.env.TMP_DIR, 'dependencies-info.json');
    writeFileSync(depsInfoPath, JSON.stringify(allDeps, null, 2));

    // Get all dependencies for ClearlyDefined processing
    const allDepsArray = [...allDeps.dependencies, ...allDeps.devDependencies];

    // Write to temp file for chunked processor
    const allDepsFile = path.join(this.env.TMP_DIR, 'npm-all-deps.txt');
    writeFileSync(allDepsFile, allDepsArray.join('\n') + '\n', 'utf8');

    const depsFilePath = path.join(this.env.TMP_DIR, 'DEPENDENCIES');

    try {
      const processor = new ChunkedDashLicensesProcessor({
        parserScript: 'cat',
        parserInput: allDepsFile,
        parserEnv: this.env as unknown as NodeJS.ProcessEnv,
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
  }

  /**
   * Override: Run bump-deps directly instead of via execSync
   */
  protected override async runBumpDeps(): Promise<number> {
    console.log('Checking dependencies for restrictions to use...');
    try {
      const processor = new NpmDependencyProcessor();
      processor.process();
      return 0;
    } catch (error) {
      // Error already logged by the processor
      return 1;
    }
  }
}
