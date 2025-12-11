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
import { existsSync, statSync } from 'fs';
import * as path from 'path';
import { PackageManagerBase } from '../../helpers/package-manager-base';
import { ChunkedDashLicensesProcessor } from '../../helpers/chunked-processor';

/**
 * Yarn 3+ package manager processor.
 * Handles dependency analysis for projects using Yarn Berry (v3+).
 */
export class Yarn3Processor extends PackageManagerBase {
  constructor() {
    super({
      name: 'yarn3',
      projectFile: 'package.json',
      lockFile: 'yarn.lock',
    });
  }

  /**
   * Generate dependencies using Yarn 3+ specific tooling.
   */
  protected async generateDependencies(): Promise<void> {
    // Generate dependencies info
    console.log('Generating all dependencies info using yarn...');
    const yarnDepsFile = path.join(this.env.TMP_DIR, 'yarn-deps.json');
    try {
      execSync(
        `yarn info --name-only --all --recursive --dependents --json > "${yarnDepsFile}" 2>&1`,
        { cwd: this.env.PROJECT_COPY_DIR }
      );

      if (!existsSync(yarnDepsFile) || statSync(yarnDepsFile).size === 0) {
        throw new Error('yarn-deps.json is empty');
      }
    } catch {
      console.error('Error: Failed to generate yarn-deps.json');
      if (this.options.debug) {
        this.copyTmpDir();
      }
      process.exit(1);
    }
    console.log('Done.');
    console.log();

    // Generate DEPENDENCIES file using chunked processing
    console.log(`Generating a temporary DEPENDENCIES file (batch size: ${this.env.BATCH_SIZE})...`);
    const parserScript = path.join(this.env.WORKSPACE_DIR, 'package-managers/yarn3/parser.js');
    const depsFilePath = path.join(this.env.TMP_DIR, 'DEPENDENCIES');

    try {
      const processor = new ChunkedDashLicensesProcessor({
        parserScript,
        parserInput: yarnDepsFile,
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

    // Check for yarn version and set to version 3 if needed
    console.log('Checking for yarn version...');
    try {
      const yarnVersion = execSync('yarn -v', { encoding: 'utf-8' }).trim();
      const majorVersion = parseInt(yarnVersion.split('.')[0], 10);

      if (majorVersion !== 3) {
        console.log('Installing yarn version 3...');
        execSync('yarn set version 3.8.6', { cwd: this.env.PROJECT_COPY_DIR });
      }
    } catch {
      console.error('Error checking yarn version');
    }
    console.log('Done.');
    console.log();

    // Import yarn plugin licenses (suppress verbose output)
    console.log('Importing yarn plugin licenses...');
    try {
      execSync(
        'yarn plugin import https://raw.githubusercontent.com/mhassan1/yarn-plugin-licenses/v0.7.0/bundles/@yarnpkg/plugin-licenses.js 2>/dev/null',
        { cwd: this.env.PROJECT_COPY_DIR, stdio: this.options.debug ? 'inherit' : 'pipe' }
      );
    } catch {
      // Plugin might already be installed, continue
      if (this.options.debug) {
        console.log('  Note: Plugin import returned error (may already be installed)');
      }
    }
    console.log('Done.');
    console.log();

    // Install dependencies (suppress verbose cleanup messages)
    console.log('Installing dependencies (this may take a while)...');
    try {
      // Use pipe to suppress YN0019 cleanup messages, but capture errors
      execSync('yarn install 2>&1', {
        cwd: this.env.PROJECT_COPY_DIR,
        stdio: this.options.debug ? 'inherit' : 'pipe',
        maxBuffer: 50 * 1024 * 1024 // 50MB buffer
      });
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      // Check if it's a buffer overflow error
      if (err.code === 'ENOBUFS') {
        console.error('Error: Output buffer overflow during yarn install.');
        console.error('This usually happens with very large projects.');
        console.error('The dependencies may have been installed successfully despite the error.');
      } else {
        // Yarn install might return non-zero for warnings, check if node_modules exists
        const nodeModulesExists = existsSync(path.join(this.env.PROJECT_COPY_DIR, 'node_modules')) ||
                                  existsSync(path.join(this.env.PROJECT_COPY_DIR, '.yarn', 'cache'));
        if (!nodeModulesExists) {
          console.error('Error during yarn install:', err.message || err);
          if (this.options.debug) {
            this.copyTmpDir();
          }
          process.exit(1);
        }
        // Dependencies installed despite warnings, continue
        if (this.options.debug) {
          console.log('  Note: yarn install completed with warnings');
        }
      }
    }
    console.log('Done.');
    console.log();

    // Generate all dependencies info with licenses
    console.log('Generating all dependencies info using yarn...');
    const depsInfoFile = path.join(this.env.TMP_DIR, 'yarn-deps-info.json');
    try {
      execSync(
        `yarn licenses list -R --json > "${depsInfoFile}" 2>&1`,
        { cwd: this.env.PROJECT_COPY_DIR }
      );

      if (!existsSync(depsInfoFile) || statSync(depsInfoFile).size === 0) {
        throw new Error('yarn-deps-info.json is empty');
      }
    } catch {
      console.error('Error: Failed to generate yarn-deps-info.json');
      if (this.options.debug) {
        this.copyTmpDir();
      }
      process.exit(1);
    }
    console.log('Done.');
    console.log();

    // Generate list of production dependencies
    console.log('Generating list of production dependencies using yarn...');
    const prodDepsFile = path.join(this.env.TMP_DIR, 'yarn-prod-deps.json');
    try {
      execSync(
        `yarn licenses list -R --production --json > "${prodDepsFile}" 2>&1`,
        { cwd: this.env.PROJECT_COPY_DIR }
      );

      if (!existsSync(prodDepsFile) || statSync(prodDepsFile).size === 0) {
        throw new Error('yarn-prod-deps.json is empty');
      }
    } catch {
      console.error('Error: Failed to generate yarn-prod-deps.json');
      if (this.options.debug) {
        this.copyTmpDir();
      }
      process.exit(1);
    }
    console.log('Done.');
    console.log();
  }
}
