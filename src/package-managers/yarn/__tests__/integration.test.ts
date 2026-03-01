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

describe('Yarn Package Manager Files Integration', () => {
  const yarnFiles = [
    'src/package-managers/yarn/parser.ts',
    'src/package-managers/yarn/bump-deps.ts',
    'src/package-managers/yarn3/bump-deps.ts'
  ];

  describe('Source Files', () => {
    yarnFiles.forEach((filePath) => {
      it(`should have ${filePath} file exist`, () => {
        expect(fs.existsSync(filePath)).toBe(true);
      });

      it(`should have ${filePath} file contain proper license header`, () => {
        const content = fs.readFileSync(filePath, 'utf8');
        expect(content).toContain('Copyright (c) 2018-2025 Red Hat, Inc.');
        expect(content).toContain('SPDX-License-Identifier: EPL-2.0');
      });

      it(`should have ${filePath} file contain TypeScript imports`, () => {
        const content = fs.readFileSync(filePath, 'utf8');
        expect(content).toContain('import');
      });
    });
  });

  describe('Webpack Entrypoints', () => {
    it('should have cli.js compiled after build', () => {
      if (fs.existsSync('dist')) {
        expect(fs.existsSync('dist/cli.js')).toBe(true);
      } else {
        console.log('Skipping - dist directory not found. Run "npm run build" first.');
      }
    });

    it('should have index.js compiled after build', () => {
      if (fs.existsSync('dist')) {
        expect(fs.existsSync('dist/index.js')).toBe(true);
      } else {
        console.log('Skipping - dist directory not found. Run "npm run build" first.');
      }
    });
  });

  describe('File Structure Validation', () => {
    it('should have yarn parser file with correct structure', () => {
      const content = fs.readFileSync('src/package-managers/yarn/parser.ts', 'utf8');
      expect(content).toContain('parseYarnDependencies');
      expect(content).toContain('readFileSync');
    });

    it('should have yarn bump-deps file with correct structure', () => {
      const content = fs.readFileSync('src/package-managers/yarn/bump-deps.ts', 'utf8');
      expect(content).toContain('allDependencies.set');
      expect(content).toContain('extractDependencies');
      expect(content).toContain('prodDeps');
      expect(content).toContain('devDeps');
    });

    it('should have yarn3 lockfile parser', () => {
      expect(fs.existsSync('src/package-managers/yarn3/yarn-lockfile.ts')).toBe(true);
    });

    it('should have yarn3 bump-deps file with correct structure', () => {
      const content = fs.readFileSync('src/package-managers/yarn3/bump-deps.ts', 'utf8');
      expect(content).toContain('JSON.parse');
      expect(content).toContain('yarn3-deps-info.json');
      expect(content).toContain('extractLicenseInfo');
    });
  });

  describe('Import Validation', () => {
    it('should have yarn/bump-deps.ts import from helpers utils', () => {
      const content = fs.readFileSync('src/package-managers/yarn/bump-deps.ts', 'utf8');
      expect(content).toContain('from');
      expect(content).toContain('PackageManagerUtils');
    });

    it('should have yarn3/bump-deps.ts import from helpers utils', () => {
      const content = fs.readFileSync('src/package-managers/yarn3/bump-deps.ts', 'utf8');
      expect(content).toContain('from');
      expect(content).toContain('PackageManagerUtils');
    });
  });

  describe('Class-based Architecture', () => {
    it('should have yarn/bump-deps.ts export class', () => {
      const content = fs.readFileSync('src/package-managers/yarn/bump-deps.ts', 'utf8');
      expect(content).toContain('export class YarnDependencyProcessor');
      expect(content).toContain('process()');
    });

    it('should have yarn3/bump-deps.ts export class', () => {
      const content = fs.readFileSync('src/package-managers/yarn3/bump-deps.ts', 'utf8');
      expect(content).toContain('export class Yarn3DependencyProcessor');
      expect(content).toContain('process()');
    });
  });
});
