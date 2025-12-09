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
import { statSync } from 'fs';
import * as path from 'path';
import { PackageManagerBase } from '../../helpers/package-manager-base';
import { ChunkedDashLicensesProcessor } from '../../helpers/chunked-processor';

/**
 * Maven package manager processor.
 * Handles dependency analysis for projects using Maven (pom.xml).
 */
export class MvnProcessor extends PackageManagerBase {
  constructor() {
    super({
      name: 'mvn',
      projectFile: 'pom.xml',
      // Maven doesn't have a lock file
    });
  }

  /**
   * Generate dependencies using Maven specific tooling.
   */
  protected async generateDependencies(): Promise<void> {
    // Generate production dependencies
    console.log('Generating list of production dependencies using mvn (recursively)...');
    const prodDepsOutput = execSync(
      'mvn dependency:list 2>/dev/null | grep -Poh "\\S+:(compile|system|provided|runtime)" | sort | uniq',
      { cwd: this.env.PROJECT_COPY_DIR }
    );
    const prodDepsFile = path.join(this.env.TMP_DIR, 'mvn-prod-deps.txt');
    execSync(`echo '${prodDepsOutput.toString()}' > ${prodDepsFile}`);
    console.log('Done.');
    console.log();

    // Generate development dependencies
    console.log('Generating list of development dependencies using mvn (recursively)...');
    const devDepsOutput = execSync(
      'mvn dependency:list 2>/dev/null | grep -Poh "\\S+:(test)" | sort | uniq',
      { cwd: this.env.PROJECT_COPY_DIR }
    );
    const devDepsFile = path.join(this.env.TMP_DIR, 'mvn-dev-deps.txt');
    execSync(`echo '${devDepsOutput.toString()}' > ${devDepsFile}`);
    console.log('Done.');
    console.log();

    // Generate PROD_DEPENDENCIES file using chunked processing
    console.log(`Generating a temporary PROD_DEPENDENCIES file (batch size: ${this.env.BATCH_SIZE})...`);
    const prodDepsFilePath = path.join(this.env.TMP_DIR, 'PROD_DEPENDENCIES');

    try {
      const processor = new ChunkedDashLicensesProcessor({
        parserScript: 'cat', // Special marker to read from file directly
        parserInput: prodDepsFile,
        dashLicensesJar: this.env.DASH_LICENSES,
        batchSize: parseInt(this.env.BATCH_SIZE),
        outputFile: prodDepsFilePath,
        debug: this.options.debug,
        maxRetries: 3,
        retryDelayMs: 10000
      });

      await processor.process();
    } catch (error: unknown) {
      const err = error as Error;
      console.error(`Error: Failed to generate PROD_DEPENDENCIES file: ${err.message}`);
      console.error('This is usually caused by Eclipse Foundation or ClearlyDefined API issues (timeout, rate limit, etc.).');
      if (this.options.debug) {
        this.copyTmpDir();
      }
      process.exit(1);
    }

    // Verify PROD_DEPENDENCIES file was created
    const prodDepsFileSize = statSync(prodDepsFilePath).size;
    if (prodDepsFileSize < 1) {
      console.error('Error: PROD_DEPENDENCIES file is empty. Check internet connection and try again.');
      if (this.options.debug) {
        this.copyTmpDir();
      }
      process.exit(1);
    }

    // Generate DEV_DEPENDENCIES file using chunked processing
    console.log(`Generating a temporary DEV_DEPENDENCIES file (batch size: ${this.env.BATCH_SIZE})...`);
    const devDepsFilePath = path.join(this.env.TMP_DIR, 'DEV_DEPENDENCIES');

    try {
      const processor = new ChunkedDashLicensesProcessor({
        parserScript: 'cat', // Special marker to read from file directly
        parserInput: devDepsFile,
        dashLicensesJar: this.env.DASH_LICENSES,
        batchSize: parseInt(this.env.BATCH_SIZE),
        outputFile: devDepsFilePath,
        debug: this.options.debug,
        maxRetries: 3,
        retryDelayMs: 10000
      });

      await processor.process();
    } catch (error: unknown) {
      const err = error as Error;
      console.error(`Error: Failed to generate DEV_DEPENDENCIES file: ${err.message}`);
      console.error('This is usually caused by Eclipse Foundation or ClearlyDefined API issues (timeout, rate limit, etc.).');
      if (this.options.debug) {
        this.copyTmpDir();
      }
      process.exit(1);
    }

    // Verify DEV_DEPENDENCIES file was created
    const devDepsFileSize = statSync(devDepsFilePath).size;
    if (devDepsFileSize < 1) {
      console.error('Error: DEV_DEPENDENCIES file is empty. Check internet connection and try again.');
      if (this.options.debug) {
        this.copyTmpDir();
      }
      process.exit(1);
    }
  }

  /**
   * Verify the DEPENDENCIES file was created.
   * Override for Maven since it creates separate PROD/DEV files.
   */
  protected override verifyDependenciesFile(): void {
    // Maven creates PROD_DEPENDENCIES and DEV_DEPENDENCIES instead
    // Verification is done in generateDependencies
  }
}
