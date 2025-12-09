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
    'src/package-managers/yarn3/parser.ts',
    'src/package-managers/yarn3/bump-deps.ts'
  ];

  const compiledFiles = [
    'dist/package-managers/yarn/parser.js',
    'dist/package-managers/yarn/bump-deps.js',
    'dist/package-managers/yarn3/parser.js',
    'dist/package-managers/yarn3/bump-deps.js'
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

  describe('Compiled Files', () => {
    compiledFiles.forEach((filePath) => {
      it(`should have ${filePath} file exist after build`, () => {
        // These files only exist after running npm run build
        // Skip test if dist directory doesn't exist
        if (fs.existsSync('dist')) {
          expect(fs.existsSync(filePath)).toBe(true);
        } else {
          console.log(`Skipping ${filePath} - dist directory not found. Run 'npm run build' first.`);
        }
      });
    });
  });

  describe('File Structure Validation', () => {
    it('should have yarn parser file with correct structure', () => {
      const content = fs.readFileSync('src/package-managers/yarn/parser.ts', 'utf8');
      expect(content).toContain('YARN_DEPS_INFO');
      expect(content).toContain('readFileSync');
    });

    it('should have yarn bump-deps file with correct structure', () => {
      const content = fs.readFileSync('src/package-managers/yarn/bump-deps.ts', 'utf8');
      expect(content).toContain('allDependencies.set');
      expect(content).toContain('extractDependencies');
      expect(content).toContain('prodDeps');
      expect(content).toContain('devDeps');
    });

    it('should have yarn3 parser file with correct structure', () => {
      const content = fs.readFileSync('src/package-managers/yarn3/parser.ts', 'utf8');
      expect(content).toContain('process.argv');
      expect(content).toContain('readFileSync');
    });

    it('should have yarn3 bump-deps file with correct structure', () => {
      const content = fs.readFileSync('src/package-managers/yarn3/bump-deps.ts', 'utf8');
      expect(content).toContain('split');
      expect(content).toContain('JSON.parse');
      expect(content).toContain('@npm:');
      expect(content).toContain('@virtual:');
      expect(content).toContain('extractDependencies');
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
    it('should have yarn/bump-deps.ts use class pattern', () => {
      const content = fs.readFileSync('src/package-managers/yarn/bump-deps.ts', 'utf8');
      expect(content).toContain('class YarnDependencyProcessor');
      expect(content).toContain('process()');
    });

    it('should have yarn3/bump-deps.ts use class pattern', () => {
      const content = fs.readFileSync('src/package-managers/yarn3/bump-deps.ts', 'utf8');
      expect(content).toContain('class Yarn3DependencyProcessor');
      expect(content).toContain('process()');
    });
  });
});
