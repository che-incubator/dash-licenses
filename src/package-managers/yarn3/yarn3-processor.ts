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
import { existsSync, writeFileSync } from 'fs';
import * as path from 'path';
import { PackageManagerBase } from '../../helpers/package-manager-base';
import { ChunkedDashLicensesProcessor } from '../../helpers/chunked-processor';
import { parseYarnLockfile } from './yarn-lockfile';
import { Yarn3DependencyProcessor } from './bump-deps';
import type { Environment, Options } from '../../helpers/types';
import { environmentToProcessEnv } from '../../helpers/types';

/**
 * Yarn 3+ package manager processor.
 * Uses yarn.lock parsing for prod/dev separation—no yarn-plugin-licenses required.
 */
export class Yarn3Processor extends PackageManagerBase {
  constructor(env?: Environment, options?: Options) {
    super(
      {
        name: 'yarn3',
        projectFile: 'package.json',
        lockFile: 'yarn.lock'
      },
      env,
      options
    );
  }

  /**
   * Generate dependencies using lockfile parsing + ClearlyDefined.
   * No plugin installation.
   */
  protected async generateDependencies(): Promise<void> {
    const projectDir = this.env.PROJECT_COPY_DIR;

    // 1. yarn install (for node_modules - needed for license extraction in bump-deps)
    console.log('Installing dependencies...');
    try {
      execSync('yarn install', {
        cwd: projectDir,
        stdio: this.options.debug ? 'inherit' : 'pipe',
        maxBuffer: 50 * 1024 * 1024
      });
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      const hasNodeModules =
        existsSync(path.join(projectDir, 'node_modules')) ||
        existsSync(path.join(projectDir, '.yarn', 'cache'));
      if (!hasNodeModules) {
        console.error('Error during yarn install:', err.message);
        if (this.options.debug) this.copyTmpDir();
        process.exit(1);
      }
    }
    console.log('Done.');
    console.log();

    // 2. Parse yarn.lock + package.json for prod/dev separation
    console.log('Parsing yarn.lock for prod/dev dependencies...');
    let lockfileResult;
    try {
      lockfileResult = parseYarnLockfile(projectDir);
    } catch (err) {
      console.error('Error parsing lockfile:', (err as Error).message);
      if (this.options.debug) this.copyTmpDir();
      process.exit(1);
    }
    console.log('Done.');
    console.log();

    // 3. Write dep lists for bump-deps (lockfile format)
    const depsInfoPath = path.join(this.env.TMP_DIR, 'yarn3-deps-info.json');
    writeFileSync(
      depsInfoPath,
      JSON.stringify({
        dependencies: lockfileResult.prod,
        devDependencies: lockfileResult.dev
      }),
      'utf8'
    );

    const allDepsFile = path.join(this.env.TMP_DIR, 'yarn-all-deps.txt');
    writeFileSync(allDepsFile, lockfileResult.all.join('\n') + '\n', 'utf8');

    // 4. Generate DEPENDENCIES via ChunkedProcessor (ClearlyDefined)
    console.log(`Generating DEPENDENCIES file (batch size: ${this.env.BATCH_SIZE})...`);
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
      if (this.options.debug) this.copyTmpDir();
      process.exit(1);
    }
    console.log('Done.');
  }

  /**
   * Override: Run bump-deps directly instead of via execSync
   */
  protected override async runBumpDeps(): Promise<number> {
    console.log('Checking dependencies for restrictions to use...');
    try {
      const processor = new Yarn3DependencyProcessor();
      processor.process();
      return 0;
    } catch (error) {
      // Error already logged by the processor
      return 1;
    }
  }
}
