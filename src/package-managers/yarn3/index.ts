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
import { ChunkedDashLicensesProcessor } from '../../helpers/chunked-processor';

interface Environment {
  BATCH_SIZE: string;
  PROJECT_COPY_DIR: string;
  TMP_DIR: string;
  DEPS_DIR: string;
  DEPS_COPY_DIR: string;
  WORKSPACE_DIR: string;
  DASH_LICENSES: string;
}

interface Options {
  check: boolean;
  debug: boolean;
}

(async function main() {
  const env: Environment = {
    BATCH_SIZE: process.env.BATCH_SIZE || '500',
    PROJECT_COPY_DIR: process.env.PROJECT_COPY_DIR || '',
    TMP_DIR: process.env.TMP_DIR || '',
    DEPS_DIR: process.env.DEPS_DIR || '',
    DEPS_COPY_DIR: process.env.DEPS_COPY_DIR || '',
    WORKSPACE_DIR: process.env.WORKSPACE_DIR || '',
    DASH_LICENSES: process.env.DASH_LICENSES || '',
  };

  const options: Options = {
    check: process.argv.includes('--check'),
    debug: process.argv.includes('--debug'),
  };

  const buildInfoMsg = (): string => {
    return `docker run \\
    -v $(pwd):/workspace/project \\
    quay.io/che-incubator/dash-licenses:next`;
  };

  const copyTmpDir = (): void => {
    console.log('Copy TMP dir to .deps/tmp...');
    const destTmpDir = path.join(env.DEPS_DIR, 'tmp');
    mkdirSync(destTmpDir, { recursive: true });
    try {
      execSync(`cp -r ${env.TMP_DIR}/* ${destTmpDir}/ 2>/dev/null || true`);
      console.log('Done.');
    } catch (error) {
      console.warn(`Warning: Could not copy all tmp files (permission issue). Continuing...`);
    }
    console.log();
  };

  const copyResultFiles = (force: boolean = false): void => {
    const files = ['prod.md', 'dev.md', 'problems.md'];
    
    for (const file of files) {
      const srcFile = path.join(env.DEPS_COPY_DIR, file);
      const destFile = path.join(env.DEPS_DIR, file);
      
      if (existsSync(srcFile)) {
        if (options.debug) {
          console.log(`Copy ${file} to .deps...`);
          try {
            copyFileSync(srcFile, destFile);
            console.log('Done.');
          } catch (error: any) {
            if (error.code === 'EACCES') {
              console.warn(`Warning: Permission denied copying ${file}. The file was generated but could not be written to the host directory.`);
            } else {
              throw error;
            }
          }
        } else if (force) {
          try {
            copyFileSync(srcFile, destFile);
          } catch (error: any) {
            if (error.code === 'EACCES') {
              console.warn(`Warning: Permission denied copying ${file}.`);
            } else {
              throw error;
            }
          }
        }
      } else if (force && file !== 'problems.md') {
        console.error(`Error: ${file} not generated in ${env.DEPS_COPY_DIR}`);
        process.exit(1);
      } else if (options.debug && file !== 'problems.md') {
        console.error(`Warning: ${file} not found in ${env.DEPS_COPY_DIR}`);
      } else if (file === 'problems.md' && existsSync(destFile) && !options.check) {
        try {
          unlinkSync(destFile);
        } catch (error: any) {
          if (error.code === 'EACCES') {
            console.warn(`Warning: Permission denied deleting old ${file}.`);
          }
        }
      }
    }
  };

  try {
    // Validate package.json exists
    if (!existsSync(path.join(env.PROJECT_COPY_DIR, 'package.json'))) {
      console.error('Error: Can\'t find package.json file in the project directory. Commit it and then try again.');
      process.exit(1);
    }

    // Validate yarn.lock exists
    if (!existsSync(path.join(env.PROJECT_COPY_DIR, 'yarn.lock'))) {
      console.error('Error: Can\'t find yarn.lock file. Generate and commit the lock file and then try again.');
      process.exit(1);
    }

    // Change to project directory
    process.chdir(env.PROJECT_COPY_DIR);

    // Generate dependencies info
    console.log('Generating all dependencies info using yarn...');
    const yarnDepsFile = path.join(env.TMP_DIR, 'yarn-deps.json');
    try {
      execSync(
        `yarn info --name-only --all --recursive --dependents --json > "${yarnDepsFile}" 2>&1`,
        { cwd: env.PROJECT_COPY_DIR }
      );
      
      if (!existsSync(yarnDepsFile) || statSync(yarnDepsFile).size === 0) {
        throw new Error('yarn-deps.json is empty');
      }
    } catch (error) {
      console.error('Error: Failed to generate yarn-deps.json');
      if (options.debug) {
        copyTmpDir();
      }
      process.exit(1);
    }
    console.log('Done.');
    console.log();

    // Generate DEPENDENCIES file using chunked processing
    console.log(`Generating a temporary DEPENDENCIES file (batch size: ${env.BATCH_SIZE})...`);
    const parserScript = path.join(env.WORKSPACE_DIR, 'package-managers/yarn3/parser.js');
    const depsFilePath = path.join(env.TMP_DIR, 'DEPENDENCIES');
    
    try {
      const processor = new ChunkedDashLicensesProcessor({
        parserScript,
        parserInput: yarnDepsFile,
        dashLicensesJar: env.DASH_LICENSES,
        batchSize: parseInt(env.BATCH_SIZE),
        outputFile: depsFilePath,
        debug: options.debug,
        maxRetries: 3,
        retryDelayMs: 10000
      });

      await processor.process();
    } catch (error: any) {
      console.error(`Error: Failed to generate DEPENDENCIES file: ${error.message}`);
      console.error('This is usually caused by Eclipse Foundation or ClearlyDefined API issues (timeout, rate limit, etc.).');
      if (options.debug) {
        copyTmpDir();
      }
      process.exit(1);
    }

    // Verify DEPENDENCIES file was created
    const depsFileSize = statSync(depsFilePath).size;
    if (depsFileSize < 1) {
      console.error('Error: DEPENDENCIES file is empty. Check internet connection and try again.');
      if (options.debug) {
        copyTmpDir();
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
        execSync('yarn set version 3.8.6', { cwd: env.PROJECT_COPY_DIR });
      }
    } catch (error) {
      console.error('Error checking yarn version');
    }
    console.log('Done.');
    console.log();

    // Import yarn plugin licenses
    console.log('importing yarn plugin licenses...');
    execSync(
      'yarn plugin import https://raw.githubusercontent.com/mhassan1/yarn-plugin-licenses/v0.7.0/bundles/@yarnpkg/plugin-licenses.js',
      { cwd: env.PROJECT_COPY_DIR }
    );
    console.log('Done.');
    console.log();

    // Install dependencies
    console.log('Installing dependencies...');
    try {
      execSync('yarn install', { 
        cwd: env.PROJECT_COPY_DIR,
        stdio: 'inherit', // Stream output directly to avoid buffer overflow
        maxBuffer: 50 * 1024 * 1024 // 50MB buffer as fallback
      });
    } catch (error: any) {
      // Check if it's a buffer overflow error
      if (error.code === 'ENOBUFS') {
        console.error('Error: Output buffer overflow during yarn install.');
        console.error('This usually happens with very large projects.');
        console.error('The dependencies may have been installed successfully despite the error.');
      } else {
        console.error('Error during yarn install:', error.message || error);
      }
      if (options.debug) {
        copyTmpDir();
      }
      process.exit(1);
    }
    console.log('Done.');
    console.log();

    // Generate all dependencies info with licenses
    console.log('Generating all dependencies info using yarn...');
    const depsInfoFile = path.join(env.TMP_DIR, 'yarn-deps-info.json');
    try {
      execSync(
        `yarn licenses list -R --json > "${depsInfoFile}" 2>&1`,
        { cwd: env.PROJECT_COPY_DIR }
      );
      
      if (!existsSync(depsInfoFile) || statSync(depsInfoFile).size === 0) {
        throw new Error('yarn-deps-info.json is empty');
      }
    } catch (error) {
      console.error('Error: Failed to generate yarn-deps-info.json');
      if (options.debug) {
        copyTmpDir();
      }
      process.exit(1);
    }
    console.log('Done.');
    console.log();

    // Generate list of production dependencies
    console.log('Generating list of production dependencies using yarn...');
    const prodDepsFile = path.join(env.TMP_DIR, 'yarn-prod-deps.json');
    try {
      execSync(
        `yarn licenses list -R --production --json > "${prodDepsFile}" 2>&1`,
        { cwd: env.PROJECT_COPY_DIR }
      );
      
      if (!existsSync(prodDepsFile) || statSync(prodDepsFile).size === 0) {
        throw new Error('yarn-prod-deps.json is empty');
      }
    } catch (error) {
      console.error('Error: Failed to generate yarn-prod-deps.json');
      if (options.debug) {
        copyTmpDir();
      }
      process.exit(1);
    }
    console.log('Done.');
    console.log();

    // Check dependencies for restrictions
    console.log('Checking dependencies for restrictions to use...');
    const bumpDepsScript = path.join(env.WORKSPACE_DIR, 'package-managers/yarn3/bump-deps.js');
    let restricted = 0;
    try {
      execSync(`node ${bumpDepsScript} ${options.check ? '--check' : ''}`, { stdio: 'inherit' });
    } catch (error: any) {
      restricted = error.status || 1;
    }
    console.log('Done.');
    console.log();

    let differProd = '';
    let differDev = '';

    // Check for changes in production dependencies
    if (options.check) {
      console.log('Looking for changes in production dependencies list...');
      try {
        differProd = execSync(
          `comm --nocheck-order -3 ${path.join(env.DEPS_DIR, 'prod.md')} ${path.join(env.TMP_DIR, 'prod.md')}`,
          { encoding: 'utf-8' }
        );
      } catch (error) {
        // comm returns non-zero if files differ
      }
      console.log('Done.');
      console.log();
    }

    // Check for changes in development dependencies
    if (options.check) {
      console.log('Looking for changes in test- and development dependencies list...');
      try {
        differDev = execSync(
          `comm --nocheck-order -3 ${path.join(env.DEPS_DIR, 'dev.md')} ${path.join(env.TMP_DIR, 'dev.md')}`,
          { encoding: 'utf-8' }
        );
      } catch (error) {
        // comm returns non-zero if files differ
      }
      console.log('Done.');
      console.log();
    }

    // Handle debug or copy mode
    if (options.debug) {
      copyTmpDir();
      copyResultFiles(true);
      console.log();
    } else if (!options.check) {
      copyResultFiles(true);
      // Delete tmp directory if not in debug mode
      const tmpDir = path.join(env.DEPS_DIR, 'tmp');
      if (existsSync(tmpDir)) {
        execSync(`rm -rf ${tmpDir}`);
      }
    }

    // Report errors
    if (differProd) {
      console.error('Error: The list of production dependencies is outdated. Please run the following command and commit changes:');
      console.error(buildInfoMsg());
    }
    if (differDev) {
      console.error('Error: The list of development dependencies is outdated. Please run the following command and commit changes:');
      console.error(buildInfoMsg());
    }
    if (restricted !== 0) {
      console.error('Error: Restricted dependencies are found in the project.');
    }
    if (!differProd && !differDev && restricted === 0) {
      console.log('All found licenses are approved to use.');
      // Delete problems.md if all checks passed
      const problemsFile = path.join(env.DEPS_DIR, 'problems.md');
      if (existsSync(problemsFile)) {
        unlinkSync(problemsFile);
        console.log('Removed old problems.md file (no issues found).');
      }
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
})();

