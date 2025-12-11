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
   * Copy result files (prod.md, dev.md, problems.md) from TMP_DIR to destination
   * Note: Files are generated in TMP_DIR, then copied to DEPS_DIR (original project)
   * If permission denied, saves as filename(1).md and shows warning with fix instructions
   */
  protected copyResultFiles(force: boolean = false): void {
    const files = ['prod.md', 'dev.md', 'problems.md'];
    const permissionErrors: string[] = [];

    for (const file of files) {
      // Files are generated in TMP_DIR (not DEPS_COPY_DIR)
      const srcFile = path.join(this.env.TMP_DIR, file);
      const destFile = path.join(this.env.DEPS_DIR, file);

      if (existsSync(srcFile)) {
        if (this.options.debug) {
          console.log(`Copy ${file} to .deps...`);
        }
        
        if (this.options.debug || force) {
          try {
            copyFileSync(srcFile, destFile);
            if (this.options.debug) {
              console.log('Done.');
            }
          } catch (error: unknown) {
            if (this.isPermissionError(error)) {
              // Try to save as filename(1).md
              const altFile = this.getAlternativeFilename(file);
              const altDestFile = path.join(this.env.DEPS_DIR, altFile);
              try {
                copyFileSync(srcFile, altDestFile);
                console.warn(`Warning: Permission denied overwriting ${file}. Saved as ${altFile} instead.`);
                permissionErrors.push(file);
              } catch (altError: unknown) {
                if (this.isPermissionError(altError)) {
                  console.warn(`Warning: Permission denied copying ${file}. Could not save alternative file either.`);
                  permissionErrors.push(file);
                } else {
                  throw altError;
                }
              }
            } else {
              throw error;
            }
          }
        }
      } else if (force && file !== 'problems.md') {
        console.error(`Error: ${file} not generated in ${this.env.TMP_DIR}`);
        process.exit(1);
      } else if (this.options.debug && file !== 'problems.md') {
        console.error(`Warning: ${file} not found in ${this.env.TMP_DIR}`);
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

    // Show permission fix instructions if there were errors
    if (permissionErrors.length > 0) {
      this.printPermissionFixInstructions(permissionErrors);
    }
  }

  /**
   * Get alternative filename for permission-denied cases (e.g., prod.md -> prod(1).md)
   */
  private getAlternativeFilename(file: string): string {
    const ext = path.extname(file);
    const base = path.basename(file, ext);
    return `${base}(1)${ext}`;
  }

  /**
   * Print instructions for fixing permission issues
   */
  private printPermissionFixInstructions(files: string[]): void {
    console.warn();
    console.warn('==============================================');
    console.warn('WARNING: Could not overwrite existing files');
    console.warn('==============================================');
    console.warn();
    console.warn(`The following files could not be updated: ${files.join(', ')}`);
    console.warn('New versions were saved with (1) suffix.');
    console.warn();
    console.warn('To fix, make the existing files writable:');
    console.warn('  chmod a+w .deps/*.md');
    console.warn();
    console.warn('Or delete them and let the container recreate:');
    console.warn('  rm .deps/*.md');
    console.warn();
    console.warn('Then run the license tool again.');
    console.warn('==============================================');
    console.warn();
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
      const origProdFile = path.join(this.env.DEPS_DIR, 'prod.md');
      const newProdFile = path.join(this.env.TMP_DIR, 'prod.md');
      
      if (!existsSync(origProdFile)) {
        console.warn('  Warning: Original prod.md not found - dependencies not initialized yet.');
        differProd = 'missing';
      } else if (!existsSync(newProdFile)) {
        console.warn('  Warning: New prod.md not generated.');
        differProd = 'missing';
      } else {
        try {
          differProd = execSync(
            `comm --nocheck-order -3 "${origProdFile}" "${newProdFile}"`,
            { encoding: 'utf-8' }
          );
        } catch {
          // comm returns non-zero if files differ
          differProd = 'differ';
        }
      }
      console.log('Done.');
      console.log();
    }

    // Check for changes in development dependencies
    if (this.options.check) {
      console.log('Looking for changes in test- and development dependencies list...');
      const origDevFile = path.join(this.env.DEPS_DIR, 'dev.md');
      const newDevFile = path.join(this.env.TMP_DIR, 'dev.md');
      
      if (!existsSync(origDevFile)) {
        console.warn('  Warning: Original dev.md not found - dependencies not initialized yet.');
        differDev = 'missing';
      } else if (!existsSync(newDevFile)) {
        console.warn('  Warning: New dev.md not generated.');
        differDev = 'missing';
      } else {
        try {
          differDev = execSync(
            `comm --nocheck-order -3 "${origDevFile}" "${newDevFile}"`,
            { encoding: 'utf-8' }
          );
        } catch {
          // comm returns non-zero if files differ
          differDev = 'differ';
        }
      }
      console.log('Done.');
      console.log();
    }

    return { differProd, differDev, restricted };
  }

  /**
   * Handle results based on mode and copy files as needed
   * Note: File copying to the mounted project directory is handled by entrypoint.sh
   * to avoid permission issues. Node code only generates files to TMP_DIR.
   */
  protected handleResults(result: PackageManagerResult): void {
    const { differProd, differDev, restricted } = result;

    // Report outdated dependencies as warnings in check mode (not errors)
    // Only restricted dependencies should cause check mode to fail
    if (differProd) {
      if (this.options.check && restricted === 0) {
        console.warn('Warning: The list of production dependencies is outdated. Please run the following command and commit changes:');
      } else {
        console.error('Error: The list of production dependencies is outdated. Please run the following command and commit changes:');
      }
      console.error(this.buildInfoMsg());
    }
    if (differDev) {
      if (this.options.check && restricted === 0) {
        console.warn('Warning: The list of development dependencies is outdated. Please run the following command and commit changes:');
      } else {
        console.error('Error: The list of development dependencies is outdated. Please run the following command and commit changes:');
      }
      console.error(this.buildInfoMsg());
    }
    if (restricted !== 0) {
      console.error('Error: Restricted dependencies are found in the project.');
    }

    // Determine exit code
    // - In check mode: only fail if there are restricted dependencies
    // - In generate mode: fail if anything is wrong
    const hasOutdatedDeps = differProd || differDev;
    const shouldFail = this.options.check ? (restricted !== 0) : (hasOutdatedDeps || restricted !== 0);

    if (!shouldFail) {
      console.log('All found licenses are approved to use.');
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
