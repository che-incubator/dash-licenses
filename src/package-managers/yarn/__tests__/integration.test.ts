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
      expect(content).toContain('yarnProdDeps');
      expect(content).toContain('yarnAllDeps');
      expect(content).toContain('yarnDevDeps');
    });

    it('should have yarn3 parser file with correct structure', () => {
      const content = fs.readFileSync('src/package-managers/yarn3/parser.ts', 'utf8');
      expect(content).toContain('process.argv');
      expect(content).toContain('readFileSync');
    });

    it('should have yarn3 bump-deps file with correct structure', () => {
      const content = fs.readFileSync('src/package-managers/yarn3/bump-deps.ts', 'utf8');
      expect(content).toContain('allDependenciesInfo.split');
      expect(content).toContain('JSON.parse(line)');
      expect(content).toContain('@npm:');
      expect(content).toContain('@virtual:');
      expect(content).toContain('extractDependencies');
    });
  });

  describe('Import Validation', () => {
    it('should have yarn/bump-deps.ts import from document module', () => {
      const content = fs.readFileSync('src/package-managers/yarn/bump-deps.ts', 'utf8');
      expect(content).toContain('from');
      expect(content).toContain('document');
    });

    it('should have yarn3/bump-deps.ts import from document module', () => {
      const content = fs.readFileSync('src/package-managers/yarn3/bump-deps.ts', 'utf8');
      expect(content).toContain('from');
      expect(content).toContain('document');
    });
  });
});



