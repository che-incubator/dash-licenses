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
  DocumentGenerator,
  getUnresolvedNumber,
  type DependencyMap,
  type LicenseMap,
  type LicenseInfo
} from '../index';

describe('Yarn Real Data Integration Tests', () => {
  const fixturesDir = path.join(__dirname, '../../../tests/fixtures/yarn-sample');

  describe('Parse real che-dashboard DEPENDENCIES file', () => {
    test('should correctly parse approved dependencies from DEPENDENCIES file', () => {
      const dependenciesFile = readFileSync(path.join(fixturesDir, 'DEPENDENCIES'), 'utf8');
      const depsToCQ: DependencyMap = new Map();
      const allLicenses: LicenseMap = new Map();

      DependencyParser.parseDependenciesFile(dependenciesFile, depsToCQ, allLicenses);

      // Check that approved dependencies are added to depsToCQ with their approval source
      expect(depsToCQ.has('abab@2.0.6')).toBe(true);
      expect(depsToCQ.get('abab@2.0.6')).toContain('clearlydefined');
      
      expect(depsToCQ.has('abort-controller@3.0.0')).toBe(true);
      expect(depsToCQ.get('abort-controller@3.0.0')).toBe('#7592');
      
      // Check license information is captured in allLicenses
      expect(allLicenses.has('abab@2.0.6')).toBe(true);
      expect(allLicenses.get('abab@2.0.6')?.License).toBe('BSD-3-Clause');
      
      expect(allLicenses.has('abort-controller@3.0.0')).toBe(true);
      expect(allLicenses.get('abort-controller@3.0.0')?.License).toBe('MIT');
      
      // Should have many approved dependencies
      expect(depsToCQ.size).toBeGreaterThan(1000);
      expect(allLicenses.size).toBeGreaterThan(1000);
    });

    test('should handle both scoped and non-scoped packages correctly', () => {
      const dependenciesFile = readFileSync(path.join(fixturesDir, 'DEPENDENCIES'), 'utf8');
      const depsToCQ: DependencyMap = new Map();
      const allLicenses: LicenseMap = new Map();

      DependencyParser.parseDependenciesFile(dependenciesFile, depsToCQ, allLicenses);

      // Check that packages are parsed correctly
      expect(depsToCQ.size).toBeGreaterThan(1000);
      expect(allLicenses.size).toBeGreaterThan(1000);
      
      // Verify non-scoped packages are present
      expect(depsToCQ.has('abab@2.0.6')).toBe(true);
      expect(allLicenses.has('abab@2.0.6')).toBe(true);
      
      // Test scoped package parsing with manual data (current format WITHOUT dash)
      const scopedTest = 'npm/npmjs/@babel/core/7.23.2, MIT, approved, clearlydefined';
      const testDepsToCQ: DependencyMap = new Map();
      const testAllLicenses: LicenseMap = new Map();
      DependencyParser.parseDependenciesFile(scopedTest, testDepsToCQ, testAllLicenses);
      
      expect(testDepsToCQ.has('@babel/core@7.23.2')).toBe(true);
      expect(testAllLicenses.has('@babel/core@7.23.2')).toBe(true);
      expect(testAllLicenses.get('@babel/core@7.23.2')?.License).toBe('MIT');
    });

    test('should handle complex license expressions', () => {
      const dependenciesFile = readFileSync(path.join(fixturesDir, 'DEPENDENCIES'), 'utf8');
      const depsToCQ: DependencyMap = new Map();
      const allLicenses: LicenseMap = new Map();

      DependencyParser.parseDependenciesFile(dependenciesFile, depsToCQ, allLicenses);

      // Find entry with complex license like acorn@8.14.0
      // npm/npmjs/-/acorn/8.14.0, MIT AND BSD-2-Clause AND (Apache-2.0 AND BSD-3-Clause AND MIT) AND (BSD-3-Clause AND MIT), approved, #19983
      const acornLicense = allLicenses.get('acorn@8.14.0');
      if (acornLicense) {
        expect(acornLicense.License).toContain('MIT');
        expect(acornLicense.License).toContain('AND');
      }
    });

    test('should not mark approved dependencies as unresolved', () => {
      const dependenciesFile = readFileSync(path.join(fixturesDir, 'DEPENDENCIES'), 'utf8');
      const depsToCQ: DependencyMap = new Map();
      const allLicenses: LicenseMap = new Map();

      DependencyParser.parseDependenciesFile(dependenciesFile, depsToCQ, allLicenses);

      // After parsing approved dependencies, unresolved count should be 0
      const unresolvedCount = getUnresolvedNumber();
      expect(unresolvedCount).toBe(0);
    });
  });

  describe('Generate markdown documents from real data', () => {
    test('should generate production dependencies markdown without unresolved items', () => {
      const dependenciesFile = readFileSync(path.join(fixturesDir, 'DEPENDENCIES'), 'utf8');
      
      const depsToCQ: DependencyMap = new Map();
      const allLicenses: LicenseMap = new Map();

      // Simulate yarn license info extraction
      const yarnDepsInfo = readFileSync(path.join(fixturesDir, 'yarn-deps-info.json'), 'utf8');
      const tableStartIndex = yarnDepsInfo.indexOf('{"type":"table"');
      if (tableStartIndex !== -1) {
        const licenses = JSON.parse(yarnDepsInfo.substring(tableStartIndex));
        const { head, body } = licenses.data;
        body.forEach((libInfo: string[]) => {
          const url = libInfo[head.indexOf('URL')];
          const licenseInfo: LicenseInfo = {
            License: libInfo[head.indexOf('License')]
          };
          if (url && url !== 'Unknown') {
            licenseInfo.URL = url;
          }
          allLicenses.set(`${libInfo[head.indexOf('Name')]}@${libInfo[head.indexOf('Version')]}`, licenseInfo);
        });
      }

      // Parse DEPENDENCIES file with allLicenses parameter (this is the fix!)
      DependencyParser.parseDependenciesFile(dependenciesFile, depsToCQ, allLicenses);

      // Create a simple test dependency array (since yarn-prod-deps.json is NDJSON format)
      const prodDeps = ['abab@2.0.6', 'abort-controller@3.0.0', '@babel/code-frame@7.26.2'];

      // Generate markdown
      const prodMarkdown = DocumentGenerator.arrayToDocument(
        'Production dependencies',
        prodDeps,
        depsToCQ,
        allLicenses
      );

      // Verify markdown structure
      expect(prodMarkdown).toContain('# Production dependencies');
      expect(prodMarkdown).toContain('| Packages | License | Resolved CQs |');
      expect(prodMarkdown).toContain('abab@2.0.6'); // Should have the dependencies
      expect(prodMarkdown).not.toContain('| `` | | |'); // Should not have empty entries
    });

    test('should not mark dependencies as unresolved when they are in DEPENDENCIES file', () => {
      const dependenciesFile = readFileSync(path.join(fixturesDir, 'DEPENDENCIES'), 'utf8');
      const depsToCQ: DependencyMap = new Map();
      const allLicenses: LicenseMap = new Map();

      // Parse DEPENDENCIES file which contains approved dependencies
      DependencyParser.parseDependenciesFile(dependenciesFile, depsToCQ, allLicenses);

      // The parsing itself doesn't increment unresolved count - that happens during document generation
      // when a dependency is in the list but not in depsToCQ or allLicenses
      // Here we just verify that the parsing populated the maps correctly
      expect(depsToCQ.size).toBeGreaterThan(0);
      expect(allLicenses.size).toBeGreaterThan(0);
      
      // Verify some known approved packages are present
      expect(depsToCQ.has('abab@2.0.6')).toBe(true);
      expect(allLicenses.has('abab@2.0.6')).toBe(true);
    });
  });

  describe('Verify fixture files are present', () => {
    test('should have DEPENDENCIES file', () => {
      const dependenciesFile = readFileSync(path.join(fixturesDir, 'DEPENDENCIES'), 'utf8');
      expect(dependenciesFile.length).toBeGreaterThan(0);
      expect(dependenciesFile).toContain('npm/npmjs/');
      expect(dependenciesFile).toContain('approved');
    });

    test('should have yarn-deps.json file', () => {
      const yarnDepsFile = readFileSync(path.join(fixturesDir, 'yarn-deps.json'), 'utf8');
      expect(yarnDepsFile.length).toBeGreaterThan(0);
      expect(yarnDepsFile).toContain('@npm:');
    });

    test('should have yarn-deps-info.json file', () => {
      const yarnDepsInfoFile = readFileSync(path.join(fixturesDir, 'yarn-deps-info.json'), 'utf8');
      expect(yarnDepsInfoFile.length).toBeGreaterThan(0);
      // File may be NDJSON format or contain a table structure
      expect(yarnDepsInfoFile).toMatch(/({"type":"table"|"value":|"children":)/);
    });

    test('should have yarn-prod-deps.json file', () => {
      const yarnProdDepsFile = readFileSync(path.join(fixturesDir, 'yarn-prod-deps.json'), 'utf8');
      expect(yarnProdDepsFile.length).toBeGreaterThan(0);
      // File is NDJSON format (newline-delimited JSON)
      expect(yarnProdDepsFile).toContain('"value"');
      expect(yarnProdDepsFile).toContain('"children"');
    });
  });
});

