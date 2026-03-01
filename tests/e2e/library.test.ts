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

import * as fs from 'fs';
import * as path from 'path';
import { generate } from '../../src/library';

describe('Library E2E Tests', () => {
  const testProjectDir = path.join(__dirname, 'test-project');

  beforeAll(() => {
    if (!fs.existsSync(testProjectDir)) {
      fs.mkdirSync(testProjectDir, { recursive: true });
    }

    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: { lodash: '4.17.21' },
      devDependencies: { jest: '29.0.0' }
    };

    fs.writeFileSync(
      path.join(testProjectDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );

    const packageLock = {
      name: 'test-project',
      version: '1.0.0',
      lockfileVersion: 2,
      requires: true,
      packages: {
        '': {
          name: 'test-project',
          version: '1.0.0',
          dependencies: { lodash: '4.17.21' },
          devDependencies: { jest: '29.0.0' }
        },
        'node_modules/lodash': { version: '4.17.21' },
        'node_modules/jest': { version: '29.0.0', dev: true }
      }
    };

    fs.writeFileSync(
      path.join(testProjectDir, 'package-lock.json'),
      JSON.stringify(packageLock, null, 2)
    );
  });

  afterAll(() => {
    if (fs.existsSync(testProjectDir)) {
      fs.rmSync(testProjectDir, { recursive: true, force: true });
    }
  });

  test('should detect invalid project path', async () => {
    const result = await generate({ projectPath: '/nonexistent/path' });
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('does not exist');
  });

  test('should reject project without package manager files', async () => {
    const emptyDir = path.join(testProjectDir, 'empty');
    fs.mkdirSync(emptyDir, { recursive: true });
    const result = await generate({ projectPath: emptyDir });
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain("Can't find");
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });

  test('should generate dependencies for npm project', async () => {
    const result = await generate({
      projectPath: testProjectDir,
      batchSize: 500,
      check: false
    });
    const depsDir = path.join(testProjectDir, '.deps');
    // Without --debug, tmp is removed; prod.md, dev.md, problems.md are in .deps/
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(path.join(depsDir, 'prod.md'))).toBe(true);
    expect(fs.existsSync(path.join(depsDir, 'dev.md'))).toBe(true);
    expect(fs.existsSync(path.join(depsDir, 'tmp'))).toBe(false);
  }, 60000);

  test('should keep .deps/tmp when debug is true', async () => {
    const result = await generate({
      projectPath: testProjectDir,
      batchSize: 500,
      check: false,
      debug: true
    });
    const depsDir = path.join(testProjectDir, '.deps');
    const tmpDir = path.join(depsDir, 'tmp');
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(path.join(depsDir, 'prod.md'))).toBe(true);
    expect(fs.existsSync(tmpDir)).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'DEPENDENCIES'))).toBe(true);
  }, 60000);
});
