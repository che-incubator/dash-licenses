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
      } else if (file === 'problems.md' && existsSync(destFile)) {
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
    // Validate pom.xml exists
    if (!existsSync(path.join(env.PROJECT_COPY_DIR, 'pom.xml'))) {
      console.error('Error: Can\'t find pom.xml file in the project directory.');
      process.exit(1);
    }

    // Generate production dependencies
    console.log('Generating list of production dependencies using mvn (recursively)...');
    const prodDepsOutput = execSync(
      'mvn dependency:list 2>/dev/null | grep -Poh "\\S+:(compile|system|provided|runtime)" | sort | uniq',
      { cwd: env.PROJECT_COPY_DIR }
    );
    const prodDepsFile = path.join(env.TMP_DIR, 'mvn-prod-deps.txt');
    execSync(`echo '${prodDepsOutput.toString()}' > ${prodDepsFile}`);
    console.log('Done.');
    console.log();

    // Generate development dependencies
    console.log('Generating list of development dependencies using mvn (recursively)...');
    const devDepsOutput = execSync(
      'mvn dependency:list 2>/dev/null | grep -Poh "\\S+:(test)" | sort | uniq',
      { cwd: env.PROJECT_COPY_DIR }
    );
    const devDepsFile = path.join(env.TMP_DIR, 'mvn-dev-deps.txt');
    execSync(`echo '${devDepsOutput.toString()}' > ${devDepsFile}`);
    console.log('Done.');
    console.log();

    // Generate PROD_DEPENDENCIES file using chunked processing
    console.log(`Generating a temporary PROD_DEPENDENCIES file (batch size: ${env.BATCH_SIZE})...`);
    const prodDepsFilePath = path.join(env.TMP_DIR, 'PROD_DEPENDENCIES');
    
    try {
      const processor = new ChunkedDashLicensesProcessor({
        parserScript: 'cat', // Special marker to read from file directly
        parserInput: prodDepsFile,
        dashLicensesJar: env.DASH_LICENSES,
        batchSize: parseInt(env.BATCH_SIZE),
        outputFile: prodDepsFilePath,
        debug: options.debug,
        maxRetries: 3,
        retryDelayMs: 10000
      });

      await processor.process();
    } catch (error: any) {
      console.error(`Error: Failed to generate PROD_DEPENDENCIES file: ${error.message}`);
      console.error('This is usually caused by Eclipse Foundation or ClearlyDefined API issues (timeout, rate limit, etc.).');
      if (options.debug) {
        copyTmpDir();
      }
      process.exit(1);
    }

    // Verify PROD_DEPENDENCIES file was created
    const prodDepsFileSize = statSync(prodDepsFilePath).size;
    if (prodDepsFileSize < 1) {
      console.error('Error: PROD_DEPENDENCIES file is empty. Check internet connection and try again.');
      if (options.debug) {
        copyTmpDir();
      }
      process.exit(1);
    }

    // Generate DEV_DEPENDENCIES file using chunked processing
    console.log(`Generating a temporary DEV_DEPENDENCIES file (batch size: ${env.BATCH_SIZE})...`);
    const devDepsFilePath = path.join(env.TMP_DIR, 'DEV_DEPENDENCIES');
    
    try {
      const processor = new ChunkedDashLicensesProcessor({
        parserScript: 'cat', // Special marker to read from file directly
        parserInput: devDepsFile,
        dashLicensesJar: env.DASH_LICENSES,
        batchSize: parseInt(env.BATCH_SIZE),
        outputFile: devDepsFilePath,
        debug: options.debug,
        maxRetries: 3,
        retryDelayMs: 10000
      });

      await processor.process();
    } catch (error: any) {
      console.error(`Error: Failed to generate DEV_DEPENDENCIES file: ${error.message}`);
      console.error('This is usually caused by Eclipse Foundation or ClearlyDefined API issues (timeout, rate limit, etc.).');
      if (options.debug) {
        copyTmpDir();
      }
      process.exit(1);
    }

    // Verify DEV_DEPENDENCIES file was created
    const devDepsFileSize = statSync(devDepsFilePath).size;
    if (devDepsFileSize < 1) {
      console.error('Error: DEV_DEPENDENCIES file is empty. Check internet connection and try again.');
      if (options.debug) {
        copyTmpDir();
      }
      process.exit(1);
    }

    // Check dependencies for restrictions
    console.log('Checking dependencies for restrictions to use...');
    const bumpDepsScript = path.join(env.WORKSPACE_DIR, 'package-managers/mvn/bump-deps.js');
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

