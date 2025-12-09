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
import { existsSync, statSync, unlinkSync, copyFileSync, mkdirSync } from 'fs';
import * as path from 'path';
import { Environment, Options, PackageManagerResult, parseEnvironment, parseOptions } from './types';

/**
 * Configuration options for a package manager
 */
export interface PackageManagerConfig {
  /** Name of the package manager (e.g., 'npm', 'yarn', 'mvn') */
  name: string;
  /** The main project file to look for (e.g., 'package.json', 'pom.xml') */
  projectFile: string;
  /** Optional lock file to look for (e.g., 'yarn.lock', 'package-lock.json') */
  lockFile?: string;
}

/**
 * Abstract base class for package manager implementations.
 * Provides shared functionality for environment handling, file operations,
 * and the main processing flow.
 */
export abstract class PackageManagerBase {
  protected readonly env: Environment;
  protected readonly options: Options;
  protected readonly config: PackageManagerConfig;

  constructor(config: PackageManagerConfig) {
    this.env = parseEnvironment();
    this.options = parseOptions();
    this.config = config;
  }

  /**
   * Main entry point - runs the package manager processing flow
   */
  public async run(): Promise<void> {
    try {
      // Validate project files exist
      this.validateProject();

      // Change to project directory
      console.log(`Changing directory to ${this.env.PROJECT_COPY_DIR}...`);
      process.chdir(this.env.PROJECT_COPY_DIR);
      console.log('Done.');
      console.log();

      // Generate dependencies (package-manager-specific)
      await this.generateDependencies();

      // Verify DEPENDENCIES file was created
      this.verifyDependenciesFile();

      // Check dependencies for restrictions and handle results
      const result = await this.checkRestrictions();
      this.handleResults(result);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  }

  /**
   * Build the docker command info message for users
   */
  protected buildInfoMsg(): string {
    return `docker run \\
    -v $(pwd):/workspace/project \\
    quay.io/che-incubator/dash-licenses:next`;
  }

  /**
   * Copy temporary directory to .deps/tmp for debugging
   */
  protected copyTmpDir(): void {
    console.log('Copy TMP dir to .deps/tmp...');
    const destTmpDir = path.join(this.env.DEPS_DIR, 'tmp');
    mkdirSync(destTmpDir, { recursive: true });
    try {
      execSync(`cp -r ${this.env.TMP_DIR}/* ${destTmpDir}/ 2>/dev/null || true`);
      console.log('Done.');
    } catch {
      console.warn(`Warning: Could not copy all tmp files (permission issue). Continuing...`);
    }
    console.log();
  }

  /**
   * Copy result files (prod.md, dev.md, problems.md) to destination
   */
  protected copyResultFiles(force: boolean = false): void {
    const files = ['prod.md', 'dev.md', 'problems.md'];

    for (const file of files) {
      const srcFile = path.join(this.env.DEPS_COPY_DIR, file);
      const destFile = path.join(this.env.DEPS_DIR, file);

      if (existsSync(srcFile)) {
        if (this.options.debug) {
          console.log(`Copy ${file} to .deps...`);
          try {
            copyFileSync(srcFile, destFile);
            console.log('Done.');
          } catch (error: unknown) {
            if (this.isPermissionError(error)) {
              console.warn(`Warning: Permission denied copying ${file}. The file was generated but could not be written to the host directory.`);
            } else {
              throw error;
            }
          }
        } else if (force) {
          try {
            copyFileSync(srcFile, destFile);
          } catch (error: unknown) {
            if (this.isPermissionError(error)) {
              console.warn(`Warning: Permission denied copying ${file}.`);
            } else {
              throw error;
            }
          }
        }
      } else if (force && file !== 'problems.md') {
        console.error(`Error: ${file} not generated in ${this.env.DEPS_COPY_DIR}`);
        process.exit(1);
      } else if (this.options.debug && file !== 'problems.md') {
        console.error(`Warning: ${file} not found in ${this.env.DEPS_COPY_DIR}`);
      } else if (file === 'problems.md' && existsSync(destFile) && !this.options.check) {
        try {
          unlinkSync(destFile);
        } catch (error: unknown) {
          if (this.isPermissionError(error)) {
            console.warn(`Warning: Permission denied deleting old ${file}.`);
          }
        }
      }
    }
  }

  /**
   * Check if error is a permission error
   */
  private isPermissionError(error: unknown): boolean {
    return error !== null && typeof error === 'object' && 'code' in error && error.code === 'EACCES';
  }

  /**
   * Validate that required project files exist.
   * Default implementation checks for projectFile and optional lockFile.
   */
  protected validateProject(): void {
    // Check main project file
    if (!existsSync(path.join(this.env.PROJECT_COPY_DIR, this.config.projectFile))) {
      console.error(`Error: Can't find ${this.config.projectFile} file in the project directory. Commit it and then try again.`);
      process.exit(1);
    }

    // Check lock file if specified
    if (this.config.lockFile && !existsSync(path.join(this.env.PROJECT_COPY_DIR, this.config.lockFile))) {
      console.error(`Error: Can't find ${this.config.lockFile} file. Generate and commit the lock file and then try again.`);
      process.exit(1);
    }
  }

  /**
   * Verify that the DEPENDENCIES file was created and is non-empty.
   * Override in subclasses that use different file names.
   */
  protected verifyDependenciesFile(): void {
    const depsFilePath = path.join(this.env.TMP_DIR, 'DEPENDENCIES');
    
    if (!existsSync(depsFilePath)) {
      console.error('Error: DEPENDENCIES file was not created.');
      if (this.options.debug) {
        this.copyTmpDir();
      }
      process.exit(1);
    }

    const depsFileSize = statSync(depsFilePath).size;
    if (depsFileSize < 1) {
      console.error('Error: DEPENDENCIES file is empty. Check internet connection and try again.');
      if (this.options.debug) {
        this.copyTmpDir();
      }
      process.exit(1);
    }
  }

  /**
   * Run the bump-deps script and check for differences.
   * Returns the restriction status code.
   */
  protected async runBumpDeps(): Promise<number> {
    console.log('Checking dependencies for restrictions to use...');
    const bumpDepsScript = path.join(this.env.WORKSPACE_DIR, `package-managers/${this.config.name}/bump-deps.js`);
    let restricted = 0;
    try {
      execSync(`node ${bumpDepsScript} ${this.options.check ? '--check' : ''}`, { stdio: 'inherit' });
    } catch (error: unknown) {
      restricted = this.getExitStatus(error);
    }
    console.log('Done.');
    console.log();

    return restricted;
  }

  /**
   * Check dependencies for restrictions and compare with existing files
   */
  protected async checkRestrictions(): Promise<PackageManagerResult> {
    const restricted = await this.runBumpDeps();

    let differProd = '';
    let differDev = '';

    // Check for changes in production dependencies
    if (this.options.check) {
      console.log('Looking for changes in production dependencies list...');
      try {
        differProd = execSync(
          `comm --nocheck-order -3 ${path.join(this.env.DEPS_DIR, 'prod.md')} ${path.join(this.env.TMP_DIR, 'prod.md')}`,
          { encoding: 'utf-8' }
        );
      } catch {
        // comm returns non-zero if files differ
      }
      console.log('Done.');
      console.log();
    }

    // Check for changes in development dependencies
    if (this.options.check) {
      console.log('Looking for changes in test- and development dependencies list...');
      try {
        differDev = execSync(
          `comm --nocheck-order -3 ${path.join(this.env.DEPS_DIR, 'dev.md')} ${path.join(this.env.TMP_DIR, 'dev.md')}`,
          { encoding: 'utf-8' }
        );
      } catch {
        // comm returns non-zero if files differ
      }
      console.log('Done.');
      console.log();
    }

    return { differProd, differDev, restricted };
  }

  /**
   * Handle results based on mode and copy files as needed
   */
  protected handleResults(result: PackageManagerResult): void {
    const { differProd, differDev, restricted } = result;

    // Handle debug or copy mode
    if (this.options.debug) {
      this.copyTmpDir();
      this.copyResultFiles(true);
      console.log();
    } else if (!this.options.check) {
      this.copyResultFiles(true);
      // Delete tmp directory if not in debug mode
      const tmpDir = path.join(this.env.DEPS_DIR, 'tmp');
      if (existsSync(tmpDir)) {
        execSync(`rm -rf ${tmpDir}`);
      }
    }

    // Report errors
    if (differProd) {
      console.error('Error: The list of production dependencies is outdated. Please run the following command and commit changes:');
      console.error(this.buildInfoMsg());
    }
    if (differDev) {
      console.error('Error: The list of development dependencies is outdated. Please run the following command and commit changes:');
      console.error(this.buildInfoMsg());
    }
    if (restricted !== 0) {
      console.error('Error: Restricted dependencies are found in the project.');
    }
    if (!differProd && !differDev && restricted === 0) {
      console.log('All found licenses are approved to use.');
      // Delete problems.md if all checks passed (skip in check mode to avoid write operations)
      if (!this.options.check) {
        const problemsFile = path.join(this.env.DEPS_DIR, 'problems.md');
        if (existsSync(problemsFile)) {
          try {
            unlinkSync(problemsFile);
            console.log('Removed old problems.md file (no issues found).');
          } catch {
            // Ignore permission errors - entrypoint.sh will handle cleanup
          }
        }
      }
      process.exit(0);
    } else {
      process.exit(1);
    }
  }

  /**
   * Get exit status from error object
   */
  private getExitStatus(error: unknown): number {
    if (error !== null && typeof error === 'object' && 'status' in error) {
      return (error as { status: number }).status || 1;
    }
    return 1;
  }

  /**
   * Generate dependencies using package-manager-specific tooling.
   * Must be implemented by each package manager.
   */
  protected abstract generateDependencies(): Promise<void>;
}
