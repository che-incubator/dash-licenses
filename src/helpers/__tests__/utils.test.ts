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
import * as os from 'os';
import * as path from 'path';
import { PackageManagerUtils, type FilePaths } from '../utils';
import type { DependencyMap } from '../../document';

describe('PackageManagerUtils Integration Tests', () => {
  describe('getFilePaths', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    test('should return correct file paths when environment is set', () => {
      process.env.DEPS_COPY_DIR = '/test/deps';
      process.env.ENCODING = 'utf8';

      const paths: FilePaths = PackageManagerUtils.getFilePaths();

      expect(paths.DEPS_DIR).toBe('/test/deps');
      expect(paths.ENCODING).toBe('utf8');
      expect(paths.TMP_DIR).toBe('/test/deps/tmp');
      expect(paths.EXCLUSIONS_DIR).toBe('/test/deps/EXCLUDED');
      expect(paths.PROD_MD).toBe('/test/deps/tmp/prod.md');
      expect(paths.DEV_MD).toBe('/test/deps/tmp/dev.md');
      expect(paths.PROBLEMS_MD).toBe('/test/deps/tmp/problems.md');
      expect(paths.DEPENDENCIES).toBe('/test/deps/tmp/DEPENDENCIES');
      expect(paths.EXCLUDED_PROD_MD).toBe('/test/deps/EXCLUDED/prod.md');
      expect(paths.EXCLUDED_DEV_MD).toBe('/test/deps/EXCLUDED/dev.md');
    });

    test('should use default encoding when not set', () => {
      process.env.DEPS_COPY_DIR = '/test/deps';
      delete process.env.ENCODING;

      const paths: FilePaths = PackageManagerUtils.getFilePaths();

      expect(paths.ENCODING).toBe('utf8');
    });

    test('should throw error when DEPS_COPY_DIR is not set', () => {
      delete process.env.DEPS_COPY_DIR;

      expect(() => {
        PackageManagerUtils.getFilePaths();
      }).toThrow('DEPS_COPY_DIR environment variable is required');
    });
  });

  describe('shouldWriteToDisk', () => {
    const originalArgv = process.argv;

    afterEach(() => {
      process.argv = originalArgv;
    });

    test('should return true when no --check argument', () => {
      process.argv = ['node', 'script.js'];
      expect(PackageManagerUtils.shouldWriteToDisk()).toBe(true);
    });

    test('should return true when different arguments are provided', () => {
      process.argv = ['node', 'script.js', '--generate'];
      expect(PackageManagerUtils.shouldWriteToDisk()).toBe(true);
    });

    test('should return false when --check argument is provided', () => {
      process.argv = ['node', 'script.js', '--check'];
      expect(PackageManagerUtils.shouldWriteToDisk()).toBe(false);
    });
  });

  describe('validateEnvironment', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    test('should not throw when all required variables are set', () => {
      process.env.DEPS_COPY_DIR = '/test/deps';
      process.env.ENCODING = 'utf8';

      expect(() => {
        PackageManagerUtils.validateEnvironment();
      }).not.toThrow();
    });

    test('should throw when DEPS_COPY_DIR is missing', () => {
      delete process.env.DEPS_COPY_DIR;
      process.env.ENCODING = 'utf8';

      expect(() => {
        PackageManagerUtils.validateEnvironment();
      }).toThrow('Missing required environment variables: DEPS_COPY_DIR');
    });

    test('should throw when ENCODING is missing', () => {
      process.env.DEPS_COPY_DIR = '/test/deps';
      delete process.env.ENCODING;

      expect(() => {
        PackageManagerUtils.validateEnvironment();
      }).toThrow('Missing required environment variables: ENCODING');
    });

    test('should throw when multiple variables are missing', () => {
      delete process.env.DEPS_COPY_DIR;
      delete process.env.ENCODING;

      expect(() => {
        PackageManagerUtils.validateEnvironment();
      }).toThrow('Missing required environment variables: DEPS_COPY_DIR, ENCODING');
    });
  });

  describe('parsePackageIdentifier', () => {
    test('should parse unscoped package correctly', () => {
      const result = PackageManagerUtils.parsePackageIdentifier('lodash@4.17.21');
      expect(result.name).toBe('lodash');
      expect(result.version).toBe('4.17.21');
    });

    test('should parse scoped package correctly', () => {
      const result = PackageManagerUtils.parsePackageIdentifier('@types/node@18.0.0');
      expect(result.name).toBe('@types/node');
      expect(result.version).toBe('18.0.0');
    });

    test('should handle complex version strings', () => {
      const result = PackageManagerUtils.parsePackageIdentifier('package@1.0.0-beta.1');
      expect(result.name).toBe('package');
      expect(result.version).toBe('1.0.0-beta.1');
    });

    test('should throw error for invalid identifier', () => {
      expect(() => {
        PackageManagerUtils.parsePackageIdentifier('invalid-package');
      }).toThrow('Invalid package identifier format: invalid-package');
    });

    test('should throw error for empty string', () => {
      expect(() => {
        PackageManagerUtils.parsePackageIdentifier('');
      }).toThrow('Package identifier must be a non-empty string');
    });

    test('should throw error for null/undefined', () => {
      expect(() => {
        PackageManagerUtils.parsePackageIdentifier(null as any);
      }).toThrow('Package identifier must be a non-empty string');

      expect(() => {
        PackageManagerUtils.parsePackageIdentifier(undefined as any);
      }).toThrow('Package identifier must be a non-empty string');
    });

    test('should throw error for identifier starting with @', () => {
      expect(() => {
        PackageManagerUtils.parsePackageIdentifier('@package');
      }).toThrow('Invalid package identifier format: @package');
    });
  });

  describe('createPackageIdentifier', () => {
    test('should create identifier correctly', () => {
      const result = PackageManagerUtils.createPackageIdentifier('lodash', '4.17.21');
      expect(result).toBe('lodash@4.17.21');
    });

    test('should create scoped identifier correctly', () => {
      const result = PackageManagerUtils.createPackageIdentifier('@types/node', '18.0.0');
      expect(result).toBe('@types/node@18.0.0');
    });

    test('should throw error for empty name', () => {
      expect(() => {
        PackageManagerUtils.createPackageIdentifier('', '1.0.0');
      }).toThrow('Both name and version must be provided');
    });

    test('should throw error for empty version', () => {
      expect(() => {
        PackageManagerUtils.createPackageIdentifier('package', '');
      }).toThrow('Both name and version must be provided');
    });

    test('should throw error for null/undefined inputs', () => {
      expect(() => {
        PackageManagerUtils.createPackageIdentifier(null as any, '1.0.0');
      }).toThrow('Both name and version must be provided');

      expect(() => {
        PackageManagerUtils.createPackageIdentifier('package', null as any);
      }).toThrow('Both name and version must be provided');
    });
  });

  describe('getDirectPackageNames', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-licenses-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const writeJson = (filePath: string, data: object) => {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(data));
    };

    test('returns empty sets when package.json is absent', () => {
      const result = PackageManagerUtils.getDirectPackageNames(tmpDir);
      expect(result.prod.size).toBe(0);
      expect(result.dev.size).toBe(0);
    });

    test('reads direct deps from root package.json', () => {
      writeJson(path.join(tmpDir, 'package.json'), {
        dependencies: { axios: '^1.0.0', lodash: '^4.0.0' },
        devDependencies: { jest: '^29.0.0' },
      });
      const { prod, dev } = PackageManagerUtils.getDirectPackageNames(tmpDir);
      expect(prod.has('axios')).toBe(true);
      expect(prod.has('lodash')).toBe(true);
      expect(dev.has('jest')).toBe(true);
    });

    test('scans workspace packages in monorepo (array workspaces field)', () => {
      writeJson(path.join(tmpDir, 'package.json'), {
        workspaces: ['packages/*'],
        dependencies: { shared: '^1.0.0' },
      });
      writeJson(path.join(tmpDir, 'packages', 'backend', 'package.json'), {
        dependencies: { 'workspace-dep-a': '^1.0.0' },
        devDependencies: { 'workspace-dev-dep': '^2.0.0' },
      });
      writeJson(path.join(tmpDir, 'packages', 'frontend', 'package.json'), {
        dependencies: { 'workspace-dep-b': '^3.0.0' },
      });

      const { prod, dev } = PackageManagerUtils.getDirectPackageNames(tmpDir);
      // Root dep
      expect(prod.has('shared')).toBe(true);
      // Workspace deps
      expect(prod.has('workspace-dep-a')).toBe(true);
      expect(prod.has('workspace-dep-b')).toBe(true);
      expect(dev.has('workspace-dev-dep')).toBe(true);
      // A transitive dep not in any package.json should be absent
      expect(prod.has('jsbn')).toBe(false);
    });

    test('scans workspace packages with yarn workspaces.packages field', () => {
      writeJson(path.join(tmpDir, 'package.json'), {
        workspaces: { packages: ['packages/*'] },
      });
      writeJson(path.join(tmpDir, 'packages', 'lib', 'package.json'), {
        dependencies: { 'lib-dep': '^1.0.0' },
      });

      const { prod } = PackageManagerUtils.getDirectPackageNames(tmpDir);
      expect(prod.has('lib-dep')).toBe(true);
    });

    test('a package in root package.json is direct; one only in node_modules is transitive', () => {
      writeJson(path.join(tmpDir, 'package.json'), {
        dependencies: { axios: '^1.0.0' },
      });
      const { prod } = PackageManagerUtils.getDirectPackageNames(tmpDir);
      expect(prod.has('axios')).toBe(true);   // direct
      expect(prod.has('follow-redirects')).toBe(false); // transitive dep of axios
    });
  });

  describe('processExcludedDependencies', () => {
    test('should process excluded dependencies correctly', () => {
      const depsToCQ: DependencyMap = new Map();
      
      // This test would need proper mocking setup to work fully
      // For now, we'll just test the interface
      expect(() => {
        PackageManagerUtils.processExcludedDependencies(
          depsToCQ,
          '/path/to/excluded-prod.md',
          '/path/to/excluded-dev.md',
          'utf8'
        );
      }).not.toThrow();
    });
  });
});

