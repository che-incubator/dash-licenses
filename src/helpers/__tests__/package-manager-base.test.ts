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

import { Environment, Options, parseEnvironment, parseOptions } from '../types';

describe('types', () => {
  describe('parseEnvironment', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    test('should return default values when environment variables are not set', () => {
      delete process.env.BATCH_SIZE;
      delete process.env.PROJECT_COPY_DIR;
      delete process.env.TMP_DIR;
      delete process.env.DEPS_DIR;
      delete process.env.DEPS_COPY_DIR;
      delete process.env.WORKSPACE_DIR;
      delete process.env.DASH_LICENSES;

      const env = parseEnvironment();

      expect(env.BATCH_SIZE).toBe('500');
      expect(env.PROJECT_COPY_DIR).toBe('');
      expect(env.TMP_DIR).toBe('');
      expect(env.DEPS_DIR).toBe('');
      expect(env.DEPS_COPY_DIR).toBe('');
      expect(env.WORKSPACE_DIR).toBe('');
      expect(env.DASH_LICENSES).toBe('');
    });

    test('should return environment variable values when set', () => {
      process.env.BATCH_SIZE = '200';
      process.env.PROJECT_COPY_DIR = '/project';
      process.env.TMP_DIR = '/tmp';
      process.env.DEPS_DIR = '/deps';
      process.env.DEPS_COPY_DIR = '/deps/copy';
      process.env.WORKSPACE_DIR = '/workspace';
      process.env.DASH_LICENSES = '/dash.jar';

      const env = parseEnvironment();

      expect(env.BATCH_SIZE).toBe('200');
      expect(env.PROJECT_COPY_DIR).toBe('/project');
      expect(env.TMP_DIR).toBe('/tmp');
      expect(env.DEPS_DIR).toBe('/deps');
      expect(env.DEPS_COPY_DIR).toBe('/deps/copy');
      expect(env.WORKSPACE_DIR).toBe('/workspace');
      expect(env.DASH_LICENSES).toBe('/dash.jar');
    });
  });

  describe('parseOptions', () => {
    const originalArgv = process.argv;

    beforeEach(() => {
      process.argv = ['node', 'script.js'];
    });

    afterEach(() => {
      process.argv = originalArgv;
    });

    test('should return false for both options when no flags are passed', () => {
      const options = parseOptions();

      expect(options.check).toBe(false);
      expect(options.debug).toBe(false);
    });

    test('should return true for check when --check flag is passed', () => {
      process.argv = ['node', 'script.js', '--check'];

      const options = parseOptions();

      expect(options.check).toBe(true);
      expect(options.debug).toBe(false);
    });

    test('should return true for debug when --debug flag is passed', () => {
      process.argv = ['node', 'script.js', '--debug'];

      const options = parseOptions();

      expect(options.check).toBe(false);
      expect(options.debug).toBe(true);
    });

    test('should return true for both when both flags are passed', () => {
      process.argv = ['node', 'script.js', '--check', '--debug'];

      const options = parseOptions();

      expect(options.check).toBe(true);
      expect(options.debug).toBe(true);
    });
  });
});

describe('Environment interface', () => {
  test('should have all required fields', () => {
    const env: Environment = {
      BATCH_SIZE: '500',
      PROJECT_COPY_DIR: '/project',
      TMP_DIR: '/tmp',
      DEPS_DIR: '/deps',
      DEPS_COPY_DIR: '/deps/copy',
      WORKSPACE_DIR: '/workspace',
      DASH_LICENSES: '/dash.jar',
    };

    expect(env).toHaveProperty('BATCH_SIZE');
    expect(env).toHaveProperty('PROJECT_COPY_DIR');
    expect(env).toHaveProperty('TMP_DIR');
    expect(env).toHaveProperty('DEPS_DIR');
    expect(env).toHaveProperty('DEPS_COPY_DIR');
    expect(env).toHaveProperty('WORKSPACE_DIR');
    expect(env).toHaveProperty('DASH_LICENSES');
  });
});

describe('Options interface', () => {
  test('should have all required fields', () => {
    const options: Options = {
      check: true,
      debug: false,
    };

    expect(options).toHaveProperty('check');
    expect(options).toHaveProperty('debug');
  });
});
