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

/**
 * Environment configuration for package managers
 */
export interface Environment {
  BATCH_SIZE: string;
  PROJECT_COPY_DIR: string;
  TMP_DIR: string;
  DEPS_DIR: string;
  DEPS_COPY_DIR: string;
  WORKSPACE_DIR: string;
  DASH_LICENSES: string;
}

/**
 * Command line options for package managers
 */
export interface Options {
  check: boolean;
  debug: boolean;
}

/**
 * Result of package manager dependency check
 */
export interface PackageManagerResult {
  differProd: string;
  differDev: string;
  restricted: number;
}

/**
 * Parse environment variables and return Environment object
 */
export function parseEnvironment(): Environment {
  return {
    BATCH_SIZE: process.env.BATCH_SIZE || '500',
    PROJECT_COPY_DIR: process.env.PROJECT_COPY_DIR || '',
    TMP_DIR: process.env.TMP_DIR || '',
    DEPS_DIR: process.env.DEPS_DIR || '',
    DEPS_COPY_DIR: process.env.DEPS_COPY_DIR || '',
    WORKSPACE_DIR: process.env.WORKSPACE_DIR || '',
    DASH_LICENSES: process.env.DASH_LICENSES || '',
  };
}

/**
 * Parse command line arguments and return Options object
 */
export function parseOptions(): Options {
  return {
    check: process.argv.includes('--check'),
    debug: process.argv.includes('--debug'),
  };
}
