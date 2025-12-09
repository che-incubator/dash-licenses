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
import { statSync, writeFileSync, existsSync } from 'fs';
import * as path from 'path';
import { PackageManagerBase } from '../../helpers/package-manager-base';
import { ChunkedDashLicensesProcessor } from '../../helpers/chunked-processor';

/**
 * Maven package manager processor.
 * Handles dependency analysis for projects using Maven (pom.xml).
 * Supports both single-module and multi-module Maven projects.
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
   * Check if this is a multi-module (aggregator) Maven project
   */
  private isMultiModuleProject(): boolean {
    try {
      const pomPath = path.join(this.env.PROJECT_COPY_DIR, 'pom.xml');
      const pomContent = execSync(`cat "${pomPath}"`, { encoding: 'utf-8' });
      // Check for <packaging>pom</packaging> which indicates an aggregator pom
      return /<packaging>\s*pom\s*<\/packaging>/i.test(pomContent);
    } catch {
      return false;
    }
  }

  /**
   * Generate dependencies using Maven specific tooling.
   * Handles both single-module and multi-module projects.
   */
  protected async generateDependencies(): Promise<void> {
    const isMultiModule = this.isMultiModuleProject();
    
    if (isMultiModule) {
      console.log('Detected multi-module Maven project.');
      console.log();
    }

    // Generate production dependencies
    // For multi-module projects, dependency:list runs across all modules
    // Output format: [INFO]    groupId:artifactId:packaging:version:scope -- module ...
    console.log('Generating list of production dependencies using mvn (recursively)...');
    
    // Use dependency:list which iterates through all modules in multi-module projects
    // Filter for compile, system, provided, runtime scopes (production dependencies)
    // Extract just the dependency coordinate (remove module info after " -- ")
    const prodDepsCmd = `mvn dependency:list 2>&1 | grep -E 'jar.*(compile|system|provided|runtime)' | sed 's/.*\\[INFO\\]\\s*//' | sed 's/ -- .*//' | sort | uniq`;
    
    let prodDepsOutput = '';
    try {
      prodDepsOutput = execSync(prodDepsCmd, { 
        cwd: this.env.PROJECT_COPY_DIR,
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024 // 50MB buffer for large projects
      });
    } catch (error) {
      // Command might fail if no matches, which is OK
      prodDepsOutput = '';
    }
    
    const prodDepsFile = path.join(this.env.TMP_DIR, 'mvn-prod-deps.txt');
    writeFileSync(prodDepsFile, prodDepsOutput.trim());
    
    const prodDepsCount = prodDepsOutput.trim().split('\n').filter(l => l.trim()).length;
    console.log(`Found ${prodDepsCount} production dependencies.`);
    console.log('Done.');
    console.log();

    // Generate development dependencies (test scope)
    console.log('Generating list of development dependencies using mvn (recursively)...');
    
    const devDepsCmd = `mvn dependency:list 2>&1 | grep -E 'jar.*:test' | sed 's/.*\\[INFO\\]\\s*//' | sed 's/ -- .*//' | sort | uniq`;
    
    let devDepsOutput = '';
    try {
      devDepsOutput = execSync(devDepsCmd, { 
        cwd: this.env.PROJECT_COPY_DIR,
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024
      });
    } catch (error) {
      devDepsOutput = '';
    }
    
    const devDepsFile = path.join(this.env.TMP_DIR, 'mvn-dev-deps.txt');
    writeFileSync(devDepsFile, devDepsOutput.trim());
    
    const devDepsCount = devDepsOutput.trim().split('\n').filter(l => l.trim()).length;
    console.log(`Found ${devDepsCount} development dependencies.`);
    console.log('Done.');
    console.log();

    // Verify we have at least some dependencies
    if (prodDepsCount === 0 && devDepsCount === 0) {
      console.warn('Warning: No dependencies found. This might indicate an issue with Maven configuration.');
    }

    // Generate PROD_DEPENDENCIES file using chunked processing
    console.log(`Generating a temporary PROD_DEPENDENCIES file (batch size: ${this.env.BATCH_SIZE})...`);
    const prodDepsFilePath = path.join(this.env.TMP_DIR, 'PROD_DEPENDENCIES');

    if (prodDepsCount > 0) {
      try {
        const processor = new ChunkedDashLicensesProcessor({
          parserScript: 'cat',
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
      if (!existsSync(prodDepsFilePath) || statSync(prodDepsFilePath).size < 1) {
        console.error('Error: PROD_DEPENDENCIES file is empty. Check internet connection and try again.');
        if (this.options.debug) {
          this.copyTmpDir();
        }
        process.exit(1);
      }
    } else {
      // Create empty file if no production dependencies
      writeFileSync(prodDepsFilePath, '');
      console.log('No production dependencies to process.');
    }

    // Generate DEV_DEPENDENCIES file using chunked processing
    console.log(`Generating a temporary DEV_DEPENDENCIES file (batch size: ${this.env.BATCH_SIZE})...`);
    const devDepsFilePath = path.join(this.env.TMP_DIR, 'DEV_DEPENDENCIES');

    if (devDepsCount > 0) {
      try {
        const processor = new ChunkedDashLicensesProcessor({
          parserScript: 'cat',
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
      if (!existsSync(devDepsFilePath) || statSync(devDepsFilePath).size < 1) {
        console.error('Error: DEV_DEPENDENCIES file is empty. Check internet connection and try again.');
        if (this.options.debug) {
          this.copyTmpDir();
        }
        process.exit(1);
      }
    } else {
      // Create empty file if no dev dependencies
      writeFileSync(devDepsFilePath, '');
      console.log('No development dependencies to process.');
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
