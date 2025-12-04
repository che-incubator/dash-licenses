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
      it(`should have compiled ${filePath} file exist`, () => {
        expect(fs.existsSync(filePath)).toBe(true);
      });

      it(`should have compiled ${filePath} file be valid JavaScript`, () => {
        const content = fs.readFileSync(filePath, 'utf8');
        // Should not throw when parsing as JavaScript
        expect(() => {
          new Function(content);
        }).not.toThrow();
      });
    });
  });

  describe('TypeScript Interfaces and Types', () => {
    it('should have yarn/parser.ts define YarnLicenseTable interface', () => {
      const content = fs.readFileSync('src/package-managers/yarn/parser.ts', 'utf8');
      expect(content).toContain('interface YarnLicenseTable');
      expect(content).toContain('type: string');
      expect(content).toContain('data:');
    });

    it('should have yarn/bump-deps.ts import LicenseInfo from document', () => {
      const content = fs.readFileSync('src/package-managers/yarn/bump-deps.ts', 'utf8');
      expect(content).toContain('import {');
      expect(content).toContain('LicenseInfo');
      expect(content).toContain('} from \'../../document\'');
    });

    it('should have yarn3/bump-deps.ts define proper interfaces', () => {
      const content = fs.readFileSync('src/package-managers/yarn3/bump-deps.ts', 'utf8');
      expect(content).toContain('interface YarnDependencyChildren');
      expect(content).toContain('interface YarnDependencyLine');
    });
  });

  describe('File Dependencies and Imports', () => {
    it('should have all bump-deps files import from document module', () => {
      const bumpDepsFiles = [
        'src/package-managers/yarn/bump-deps.ts',
        'src/package-managers/yarn3/bump-deps.ts'
      ];

      bumpDepsFiles.forEach((filePath) => {
        const content = fs.readFileSync(filePath, 'utf8');
        expect(content).toContain('from \'../../document\'');
        expect(content).toContain('getLogs');
        expect(content).toContain('getUnresolvedNumber');
        expect(content).toContain('parseExcludedFileData');
        expect(content).toContain('parseDependenciesFile');
        expect(content).toContain('arrayToDocument');
      });
    });

    it('should have parser files use filesystem operations', () => {
      const parserFiles = [
        'src/package-managers/yarn/parser.ts',
        'src/package-managers/yarn3/parser.ts'
      ];

      parserFiles.forEach((filePath) => {
        const content = fs.readFileSync(filePath, 'utf8');
        expect(content).toContain('readFileSync');
        expect(content).toContain('existsSync');
      });
    });
  });

  describe('Environment Variable Usage', () => {
    it('should have files use proper environment variables', () => {
      const content1 = fs.readFileSync('src/package-managers/yarn/parser.ts', 'utf8');
      expect(content1).toContain('process.env.TMP_DIR');

      const content2 = fs.readFileSync('src/package-managers/yarn/bump-deps.ts', 'utf8');
      expect(content2).toContain('process.env.ENCODING');
      expect(content2).toContain('process.env.DEPS_COPY_DIR');

      const content3 = fs.readFileSync('src/package-managers/yarn3/bump-deps.ts', 'utf8');
      expect(content3).toContain('process.env.ENCODING');
      expect(content3).toContain('process.env.DEPS_COPY_DIR');
    });
  });

  describe('Command Line Arguments', () => {
    it('should have yarn3/parser handle command line arguments', () => {
      const content = fs.readFileSync('src/package-managers/yarn3/parser.ts', 'utf8');
      expect(content).toContain('process.argv.slice(2)');
    });

    it('should have bump-deps files handle --check argument', () => {
      const bumpDepsFiles = [
        'src/package-managers/yarn/bump-deps.ts',
        'src/package-managers/yarn3/bump-deps.ts'
      ];

      bumpDepsFiles.forEach((filePath) => {
        const content = fs.readFileSync(filePath, 'utf8');
        expect(content).toContain('process.argv.slice(2)');
        expect(content).toContain('--check');
        expect(content).toContain('writeToDisk');
      });
    });
  });
});
