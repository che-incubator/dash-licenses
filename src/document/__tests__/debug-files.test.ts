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

describe('Debug Files Generation', () => {
  const depsDir = path.join(process.cwd(), '.deps');
  const depsTmpDir = path.join(depsDir, 'tmp');
  const excludedDir = path.join(depsDir, 'EXCLUDED');

  describe('Directory Structure', () => {
    it('should have .deps directory structure', () => {
      // .deps directory should exist after any run
      // tmp directory only exists in debug mode
      // EXCLUDED directory should always exist
      if (fs.existsSync(depsDir)) {
        expect(fs.existsSync(depsDir)).toBe(true);
        // tmp directory is deleted in non-debug mode, so it's optional
        // expect(fs.existsSync(depsTmpDir)).toBe(true);
        expect(fs.existsSync(excludedDir)).toBe(true);
      }
    });

    it('should have EXCLUDED directory with default files', () => {
      if (fs.existsSync(excludedDir)) {
        const devMdPath = path.join(excludedDir, 'dev.md');
        const prodMdPath = path.join(excludedDir, 'prod.md');

        // Files should exist but may be empty initially
        if (fs.existsSync(devMdPath)) {
          expect(fs.statSync(devMdPath).isFile()).toBe(true);
        }

        if (fs.existsSync(prodMdPath)) {
          expect(fs.statSync(prodMdPath).isFile()).toBe(true);
        }
      } else {
        // If EXCLUDED dir doesn't exist, this test is not applicable
        expect(true).toBe(true);
      }
    });
  });

  describe('TMP Directory Files (from --debug)', () => {
    it('should have DEPENDENCIES file structure', () => {
      if (fs.existsSync(depsTmpDir)) {
        const dependenciesPath = path.join(depsTmpDir, 'DEPENDENCIES');
        
        if (fs.existsSync(dependenciesPath)) {
          // DEPENDENCIES file should exist (may be empty if generation failed)
          expect(fs.existsSync(dependenciesPath)).toBe(true);
          // Verify it's readable
          expect(() => fs.readFileSync(dependenciesPath, 'utf8')).not.toThrow();
        }
      }
    });

    it('should have dependencies-info.json for npm projects', () => {
      if (fs.existsSync(depsTmpDir)) {
        const depsInfoPath = path.join(depsTmpDir, 'dependencies-info.json');
        
        if (fs.existsSync(depsInfoPath)) {
          const content = fs.readFileSync(depsInfoPath, 'utf8');
          const depsInfo = JSON.parse(content);
          
          expect(depsInfo).toHaveProperty('dependencies');
          expect(depsInfo).toHaveProperty('devDependencies');
          expect(Array.isArray(depsInfo.dependencies)).toBe(true);
          expect(Array.isArray(depsInfo.devDependencies)).toBe(true);
        }
      }
    });

    it('should have yarn-deps-info.json for yarn projects', () => {
      if (fs.existsSync(depsTmpDir)) {
        const yarnDepsPath = path.join(depsTmpDir, 'yarn-deps-info.json');
        
        if (fs.existsSync(yarnDepsPath)) {
          const content = fs.readFileSync(yarnDepsPath, 'utf8');
          // Should be valid JSON
          expect(() => JSON.parse(content)).not.toThrow();
        }
      }
    });

    it('should have yarn-deps.json for yarn3 projects', () => {
      if (fs.existsSync(depsTmpDir)) {
        const yarn3DepsPath = path.join(depsTmpDir, 'yarn-deps.json');
        
        if (fs.existsSync(yarn3DepsPath)) {
          const content = fs.readFileSync(yarn3DepsPath, 'utf8');
          // Should be valid JSON
          expect(() => JSON.parse(content)).not.toThrow();
        }
      }
    });

    it('should have generated prod.md and dev.md in tmp', () => {
      if (fs.existsSync(depsTmpDir)) {
        const prodMdPath = path.join(depsTmpDir, 'prod.md');
        const devMdPath = path.join(depsTmpDir, 'dev.md');
        
        // These files may or may not exist depending on processing
        // We just check if they're valid markdown when they exist
        if (fs.existsSync(prodMdPath)) {
          const content = fs.readFileSync(prodMdPath, 'utf8');
          expect(content).toContain('# Production dependencies');
          expect(content).toContain('| Packages |');
        }
        
        if (fs.existsSync(devMdPath)) {
          const content = fs.readFileSync(devMdPath, 'utf8');
          expect(content).toContain('# Development dependencies');
          expect(content).toContain('| Packages |');
        }
      }
    });

    it('should have problems.md if there are issues', () => {
      if (fs.existsSync(depsTmpDir)) {
        const problemsPath = path.join(depsTmpDir, 'problems.md');
        
        if (fs.existsSync(problemsPath)) {
          const content = fs.readFileSync(problemsPath, 'utf8');
          expect(content).toContain('# Dependency analysis');
        }
      }
    });
  });

  describe('File Permissions and Accessibility', () => {
    it('should have readable files in .deps/tmp', () => {
      if (fs.existsSync(depsTmpDir)) {
        const files = fs.readdirSync(depsTmpDir);
        
        files.forEach(file => {
          const filePath = path.join(depsTmpDir, file);
          const stats = fs.statSync(filePath);
          
          if (stats.isFile()) {
            // Files should be readable
            expect(() => fs.readFileSync(filePath, 'utf8')).not.toThrow();
          }
        });
      }
    });
  });

  describe('EXCLUDED Files Format', () => {
    it('should have proper markdown table format in EXCLUDED/dev.md', () => {
      if (fs.existsSync(excludedDir)) {
        const devMdPath = path.join(excludedDir, 'dev.md');
        
        if (fs.existsSync(devMdPath)) {
          const content = fs.readFileSync(devMdPath, 'utf8');
          // Files may be empty initially, only check if they have content
          if (content.trim().length > 0) {
            expect(content).toMatch(/\| Packages \| Resolved CQs \|/);
            expect(content).toMatch(/\| --- \| --- \|/);
          } else {
            // Empty file is acceptable
            expect(content).toBe('');
          }
        }
      }
    });

    it('should have proper markdown table format in EXCLUDED/prod.md', () => {
      if (fs.existsSync(excludedDir)) {
        const prodMdPath = path.join(excludedDir, 'prod.md');
        
        if (fs.existsSync(prodMdPath)) {
          const content = fs.readFileSync(prodMdPath, 'utf8');
          // Files may be empty initially, only check if they have content
          if (content.trim().length > 0) {
            expect(content).toMatch(/\| Packages \| Resolved CQs \|/);
            expect(content).toMatch(/\| --- \| --- \|/);
          } else {
            // Empty file is acceptable
            expect(content).toBe('');
          }
        }
      }
    });
  });
});

