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
import { existsSync, copyFileSync, mkdirSync, writeFileSync, rmSync, unlinkSync } from 'fs';
import { NpmProcessor } from './package-managers/npm/npm-processor';
import { YarnProcessor } from './package-managers/yarn/yarn-processor';
import { Yarn3Processor } from './package-managers/yarn3/yarn3-processor';
import { FILE_NAMES } from './helpers/utils';
import { logger } from './helpers/logger';
import type { Environment } from './helpers/types';

/** Configuration for library usage */
export interface LibraryConfig {
  /** Path to the project directory (must contain package.json and lock files) */
  projectPath: string;
  /** Batch size for license processing (default: 500) */
  batchSize?: number;
  /** If true, only check existing files without generating (default: false) */
  check?: boolean;
  /** If true, copy tmp directory for debugging (default: false) */
  debug?: boolean;
  /** If true, request harvest for unresolved dependencies from ClearlyDefined (default: false) */
  harvest?: boolean;
  /** Optional path to Eclipse dash-licenses.jar for fallback check of unresolved dev deps */
  jarPath?: string;
}

/** Result of generate or check */
export interface LibraryResult {
  /** Exit code: 0 = success, 1 = failure */
  exitCode: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Build Environment from library config.
 * Uses projectPath directly (no rsync/copy - library works in place).
 */
function buildEnvironment(config: LibraryConfig, workspaceDir: string): Environment {
  const projectPath = path.resolve(config.projectPath);
  const depsDir = path.join(projectPath, '.deps');
  const tmpDir = path.join(depsDir, 'tmp');

  return {
    BATCH_SIZE: String(config.batchSize ?? 500),
    PROJECT_COPY_DIR: projectPath,
    TMP_DIR: tmpDir,
    DEPS_DIR: depsDir,
    DEPS_COPY_DIR: depsDir,
    WORKSPACE_DIR: workspaceDir,
    DASH_LICENSES: ''
  };
}

/**
 * Detect package manager from project directory.
 */
function detectPackageManager(projectPath: string): 'npm' | 'yarn' | 'yarn3' | null {
  if (existsSync(path.join(projectPath, 'package.json'))) {
    if (existsSync(path.join(projectPath, 'package-lock.json'))) return 'npm';
    if (existsSync(path.join(projectPath, 'yarn.lock'))) {
      const major = getYarnMajorVersion(projectPath);
      return major >= 2 ? 'yarn3' : 'yarn';
    }
  }
  return null;
}

function getYarnMajorVersion(projectPath: string): number {
  try {
    const v = execSync('yarn -v', { cwd: projectPath, encoding: 'utf8' }).trim();
    const major = parseInt(v.split('.')[0], 10);
    return isNaN(major) ? 3 : major;
  } catch {
    return 3; // Default to yarn3 if yarn not in PATH
  }
}

/**
 * Generate or check dependency licenses.
 * Use as a Node.js library - no containers required.
 */
export async function generate(config: LibraryConfig): Promise<LibraryResult> {
  const projectPath = path.resolve(config.projectPath);
  if (!existsSync(projectPath)) {
    return { exitCode: 1, error: `Project path does not exist: ${projectPath}` };
  }

  const pm = detectPackageManager(projectPath);
  if (!pm) {
    return {
      exitCode: 1,
      error: "Can't find package.json with package-lock.json or yarn.lock"
    };
  }

  // workspaceDir = directory containing package-managers/*.js (dist when built)
  const workspaceDir = (() => {
    const d = __dirname;
    if (path.basename(d) === 'dist') return d;
    const dist = path.join(d, '..', 'dist');
    if (existsSync(path.join(dist, 'package-managers', 'npm', 'parser.js'))) return dist;
    return d;
  })();

  const env = buildEnvironment(config, workspaceDir);
  const options = {
    check: config.check ?? false,
    debug: config.debug ?? false,
    harvest: config.harvest ?? false
  };

  // Ensure .deps directory structure exists
  const depsDir = env.DEPS_DIR;
  const tmpDir = env.TMP_DIR;
  const excludedDir = path.join(depsDir, 'EXCLUDED');

  // Create directories if they don't exist
  mkdirSync(depsDir, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });
  mkdirSync(excludedDir, { recursive: true });

  // Create default EXCLUDED markdown files if missing
  const defaultProdMd = `This file lists dependencies that do not need CQs or auto-detection does not work.

| Packages | Resolved CQs |
| --- | --- |
`;

  const defaultDevMd = `This file lists dependencies that do not need CQs or auto-detection does not work.

| Packages | Resolved CQs |
| --- | --- |
`;

  const prodMdPath = path.join(excludedDir, FILE_NAMES.PROD_MD);
  const devMdPath = path.join(excludedDir, FILE_NAMES.DEV_MD);

  if (!existsSync(prodMdPath)) {
    writeFileSync(prodMdPath, defaultProdMd, 'utf8');
  }

  if (!existsSync(devMdPath)) {
    writeFileSync(devMdPath, defaultDevMd, 'utf8');
  }

  // Set process.env so child processes (parser, bump-deps) can read paths
  process.env.PROJECT_COPY_DIR = env.PROJECT_COPY_DIR;
  process.env.TMP_DIR = env.TMP_DIR;
  process.env.DEPS_COPY_DIR = env.DEPS_COPY_DIR;
  process.env.WORKSPACE_DIR = env.WORKSPACE_DIR;
  process.env.BATCH_SIZE = env.BATCH_SIZE;
  process.env.ENCODING = 'utf8';
  if (config.jarPath) {
    process.env.JAR_PATH = path.resolve(config.jarPath);
  }

  let runError: unknown;
  try {
    let processor;
    if (pm === 'npm') {
      processor = new NpmProcessor(env, options);
    } else if (pm === 'yarn') {
      processor = new YarnProcessor(env, options);
    } else {
      processor = new Yarn3Processor(env, options);
    }
    await processor.run();
  } catch (error) {
    runError = error;
  }

  // Always copy results from tmp to .deps when generating (even on failure)
  if (!options.check) {
    // Copy files in parallel for better performance
    const filesToCopy = [FILE_NAMES.PROD_MD, FILE_NAMES.DEV_MD, FILE_NAMES.PROBLEMS_MD];
    filesToCopy.forEach(file => {
      const src = path.join(tmpDir, file);
      const dest = path.join(depsDir, file);
      if (existsSync(src)) {
        copyFileSync(src, dest);
      } else if (file === FILE_NAMES.PROBLEMS_MD && existsSync(dest)) {
        // Delete old problems.md if no new problems exist
        try {
          unlinkSync(dest);
          logger.success('✓ Removed old problems.md (all issues resolved)');
        } catch (error: unknown) {
          const isPermissionError = error !== null && typeof error === 'object' && 'code' in error && error.code === 'EACCES';
          if (isPermissionError) {
            logger.warn(`Permission denied deleting old ${file}`);
          }
        }
      }
    });
  }

  // Remove .deps/tmp and its contents when not in debug mode
  if (!options.debug && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true });
  }

  if (runError) {
    const msg = runError instanceof Error ? runError.message : String(runError);
    const isDependencyCheckFailed = msg.includes('Dependency check failed (outdated or restricted)');
    return { exitCode: 1, ...(isDependencyCheckFailed ? {} : { error: msg }) };
  }
  return { exitCode: 0 };
}
