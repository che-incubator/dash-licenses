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

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!src/**/*.{test,spec}.{js,ts}',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  testMatch: [
    '**/__tests__/**/*.{test,spec}.{js,ts}',
    '**/tests/**/*.{test,spec}.{js,ts}'
  ],
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup.ts'
  ],
  moduleFileExtensions: [
    'ts',
    'tsx',
    'js',
    'jsx',
    'json',
    'node'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  }
};
