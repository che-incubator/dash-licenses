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

import { readFileSync } from 'fs';
import * as path from 'path';
import {
  DependencyParser,
  type DependencyMap,
  type LicenseMap
} from '../index';

describe('NPM Package Manager - Real Fixture Data', () => {
  const fixturesDir = path.join(__dirname, '../../../tests/fixtures/npm-sample');

  test('should correctly parse DEPENDENCIES file from npm project', () => {
    const dependenciesFile = readFileSync(path.join(fixturesDir, 'DEPENDENCIES'), 'utf8');
    const depsToCQ: DependencyMap = new Map();
    const allLicenses: LicenseMap = new Map();

    DependencyParser.parseDependenciesFile(dependenciesFile, depsToCQ, allLicenses);

    // Should have many approved dependencies (521 in devworkspace-generator)
    expect(depsToCQ.size).toBeGreaterThan(400);
    
    // Check specific known approved dependencies from devworkspace-generator
    expect(depsToCQ.has('axios@1.12.2')).toBe(true);
    expect(depsToCQ.get('axios@1.12.2')).toContain('clearlydefined');
    
    expect(depsToCQ.has('lodash@4.17.21')).toBe(true);
    
    // Check argparse with specific CQ
    expect(depsToCQ.has('argparse@2.0.1')).toBe(true);
    expect(depsToCQ.get('argparse@2.0.1')).toBe('CQ22954');
    
    // Check that licenses are extracted
    expect(allLicenses.size).toBeGreaterThan(400);
    expect(allLicenses.get('axios@1.12.2')?.License).toBe('MIT');
    expect(allLicenses.get('lodash@4.17.21')?.License).toBe('CC0-1.0 AND MIT');
  });

  test('should parse scoped npm packages correctly', () => {
    const dependenciesFile = readFileSync(path.join(fixturesDir, 'DEPENDENCIES'), 'utf8');
    const depsToCQ: DependencyMap = new Map();
    const allLicenses: LicenseMap = new Map();

    DependencyParser.parseDependenciesFile(dependenciesFile, depsToCQ, allLicenses);

    // Check scoped packages from devworkspace-generator
    expect(depsToCQ.has('@babel/core@7.28.4')).toBe(true);
    expect(depsToCQ.get('@babel/core@7.28.4')).toContain('clearlydefined');
    
    expect(depsToCQ.has('@types/node@22.5.5')).toBe(true);
    
    // Check inversify scoped packages
    expect(depsToCQ.has('@inversifyjs/core@9.0.0')).toBe(true);
    
    // Check devfile scoped package
    expect(depsToCQ.has('@devfile/api@2.3.0-1746644330')).toBe(true);
  });

  test('should parse dependencies-info.json correctly', () => {
    const depsInfoFile = readFileSync(path.join(fixturesDir, 'dependencies-info.json'), 'utf8');
    const depsInfo = JSON.parse(depsInfoFile);

    // Should have dependencies and devDependencies arrays
    expect(depsInfo).toHaveProperty('dependencies');
    expect(depsInfo).toHaveProperty('devDependencies');
    
    // Check structure
    expect(Array.isArray(depsInfo.dependencies)).toBe(true);
    expect(Array.isArray(depsInfo.devDependencies)).toBe(true);
    
    // Check known production dependencies
    expect(depsInfo.dependencies).toContain('axios@1.12.2');
    expect(depsInfo.dependencies).toContain('lodash@4.17.21');
    expect(depsInfo.dependencies).toContain('inversify@7.10.0');
    expect(depsInfo.dependencies).toContain('@devfile/api@2.3.0-1746644330');
    
    // Check known dev dependencies
    expect(depsInfo.devDependencies).toContain('@babel/core@7.28.4');
    expect(depsInfo.devDependencies).toContain('jest@29.7.0');
    expect(depsInfo.devDependencies).toContain('typescript@5.7.3');
  });

  test('should verify fixture files exist and have content', () => {
    expect(readFileSync(path.join(fixturesDir, 'DEPENDENCIES'), 'utf8').length).toBeGreaterThan(0);
    expect(readFileSync(path.join(fixturesDir, 'dependencies-info.json'), 'utf8').length).toBeGreaterThan(0);
  });

  test('should handle npm package formats consistently', () => {
    // npm package format is simpler than yarn
    // Format: package@version or @scope/package@version
    
    const simplePackage = 'axios@1.12.2';
    const scopedPackage = '@babel/core@7.28.4';
    
    // Extract name and version
    const simpleAtIndex = simplePackage.lastIndexOf('@');
    expect(simplePackage.substring(0, simpleAtIndex)).toBe('axios');
    expect(simplePackage.substring(simpleAtIndex + 1)).toBe('1.12.2');
    
    const scopedAtIndex = scopedPackage.lastIndexOf('@');
    expect(scopedPackage.substring(0, scopedAtIndex)).toBe('@babel/core');
    expect(scopedPackage.substring(scopedAtIndex + 1)).toBe('7.28.4');
  });
});

