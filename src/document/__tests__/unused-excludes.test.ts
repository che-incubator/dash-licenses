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

import {
  DependencyParser,
  getLogs,
  type DependencyMap,
  type LicenseMap
} from '../index';

describe('Unused Excludes Detection', () => {
  beforeEach(() => {
    // Reset logger state before each test
    const { Logger } = require('../index');
    const logger = new Logger();
    logger.reset();
  });

  describe('parseDependenciesFile - unused excludes', () => {
    test('should detect unused excludes when dependency is already approved', () => {
      // Setup: Pre-populate dependenciesMap with an exclusion
      const dependenciesMap: DependencyMap = new Map([
        ['react@18.0.0', 'Manual IP team approval']
      ]);
      const allLicenses: LicenseMap = new Map();

      // This DEPENDENCIES file contains react@18.0.0 as approved by clearlydefined
      const fileData = `cq/npm/npmjs/-/react/18.0.0,MIT,approved,clearlydefined
cq/npm/npmjs/-/lodash/4.17.21,MIT,approved,IP team`;

      DependencyParser.parseDependenciesFile(fileData, dependenciesMap, allLicenses);

      // Verify: The log should contain UNUSED Excludes section
      const logs = getLogs();
      expect(logs).toContain('## UNUSED Excludes');
      expect(logs).toContain('1. `react@18.0.0`');
    });

    test('should not show unused excludes if exclusion is actually used', () => {
      // Setup: Pre-populate dependenciesMap with an exclusion
      const dependenciesMap: DependencyMap = new Map([
        ['unresolved-package@1.0.0', 'Manual approval']
      ]);
      const allLicenses: LicenseMap = new Map();

      // This DEPENDENCIES file doesn't contain unresolved-package
      const fileData = `cq/npm/npmjs/-/react/18.0.0,MIT,approved,clearlydefined
cq/npm/npmjs/-/lodash/4.17.21,MIT,approved,IP team`;

      DependencyParser.parseDependenciesFile(fileData, dependenciesMap, allLicenses);

      // Verify: The log should NOT contain UNUSED Excludes
      const logs = getLogs();
      expect(logs).not.toContain('UNUSED Excludes');
      expect(logs).not.toContain('unresolved-package@1.0.0');
    });

    test('should detect multiple unused excludes', () => {
      // Setup: Pre-populate with multiple exclusions
      const dependenciesMap: DependencyMap = new Map([
        ['react@18.0.0', 'Manual approval 1'],
        ['vue@3.0.0', 'Manual approval 2'],
        ['angular@15.0.0', 'Manual approval 3']
      ]);
      const allLicenses: LicenseMap = new Map();

      // All three are now approved by dash-licenses
      const fileData = `cq/npm/npmjs/-/react/18.0.0,MIT,approved,clearlydefined
cq/npm/npmjs/-/vue/3.0.0,MIT,approved,clearlydefined
cq/npm/npmjs/-/angular/15.0.0,MIT,approved,IP team`;

      DependencyParser.parseDependenciesFile(fileData, dependenciesMap, allLicenses);

      // Verify: All three should be listed as unused
      const logs = getLogs();
      expect(logs).toContain('## UNUSED Excludes');
      expect(logs).toContain('1. `react@18.0.0`');
      expect(logs).toContain('2. `vue@3.0.0`');
      expect(logs).toContain('3. `angular@15.0.0`');
    });

    test('should handle scoped packages in unused excludes', () => {
      // Setup: Pre-populate with scoped package exclusion
      const dependenciesMap: DependencyMap = new Map([
        ['@types/node@18.0.0', 'Manual approval']
      ]);
      const allLicenses: LicenseMap = new Map();

      // Scoped package is now approved
      const fileData = `cq/npm/npmjs/@types/node/18.0.0,MIT,approved,clearlydefined`;

      DependencyParser.parseDependenciesFile(fileData, dependenciesMap, allLicenses);

      // Verify: Should detect unused exclude for scoped package
      const logs = getLogs();
      expect(logs).toContain('## UNUSED Excludes');
      expect(logs).toContain('1. `@types/node@18.0.0`');
    });

    test('should only show unused excludes section if there are unused excludes', () => {
      // Setup: Empty exclusions map
      const dependenciesMap: DependencyMap = new Map();
      const allLicenses: LicenseMap = new Map();

      const fileData = `cq/npm/npmjs/-/react/18.0.0,MIT,approved,clearlydefined`;

      DependencyParser.parseDependenciesFile(fileData, dependenciesMap, allLicenses);

      // Verify: Should NOT show UNUSED Excludes section
      const logs = getLogs();
      expect(logs).not.toContain('UNUSED Excludes');
    });

    test('should handle mix of used and unused excludes', () => {
      // Setup: Some exclusions that will be used, some that won't
      const dependenciesMap: DependencyMap = new Map([
        ['approved-lib@1.0.0', 'Manual approval'],  // Will be unused (in DEPENDENCIES)
        ['unresolved-lib@1.0.0', 'Manual approval']  // Will be used (not in DEPENDENCIES)
      ]);
      const allLicenses: LicenseMap = new Map();

      // Only approved-lib is in the DEPENDENCIES file
      const fileData = `cq/npm/npmjs/-/approved-lib/1.0.0,MIT,approved,clearlydefined
cq/npm/npmjs/-/other-lib/2.0.0,MIT,approved,IP team`;

      DependencyParser.parseDependenciesFile(fileData, dependenciesMap, allLicenses);

      // Verify: Only approved-lib should be in unused excludes
      const logs = getLogs();
      expect(logs).toContain('## UNUSED Excludes');
      expect(logs).toContain('`approved-lib@1.0.0`');
      expect(logs).not.toContain('`unresolved-lib@1.0.0`');
    });
  });

  describe('Integration: EXCLUDED files workflow', () => {
    test('should generate problems.md with unused excludes from EXCLUDED files', () => {
      // This simulates the workflow:
      // 1. User has .deps/EXCLUDED/prod.md with some exclusions
      // 2. Those libs are now approved by dash-licenses
      // 3. Should appear in problems.md as unused excludes

      const dependenciesMap: DependencyMap = new Map();
      const allLicenses: LicenseMap = new Map();

      // Simulate loading from EXCLUDED/prod.md
      const excludedFileData = `
| \`old-lib@1.0.0\` | Manual IP approval from 2023 |
| \`another-old-lib@2.0.0\` | Ticket #12345 |
`;
      
      // Parse excluded file data (this populates dependenciesMap)
      DependencyParser.parseExcludedFileData(excludedFileData, dependenciesMap);

      // Verify exclusions were loaded
      expect(dependenciesMap.get('old-lib@1.0.0')).toBe('Manual IP approval from 2023');
      expect(dependenciesMap.get('another-old-lib@2.0.0')).toBe('Ticket #12345');

      // Now parse DEPENDENCIES file showing these are approved
      const dependenciesFileData = `cq/npm/npmjs/-/old-lib/1.0.0,MIT,approved,clearlydefined
cq/npm/npmjs/-/another-old-lib/2.0.0,Apache-2.0,approved,IP team
cq/npm/npmjs/-/current-lib/3.0.0,MIT,approved,clearlydefined`;

      DependencyParser.parseDependenciesFile(dependenciesFileData, dependenciesMap, allLicenses);

      // Verify: Should show unused excludes in logs
      const logs = getLogs();
      expect(logs).toContain('## UNUSED Excludes');
      expect(logs).toContain('`old-lib@1.0.0`');
      expect(logs).toContain('`another-old-lib@2.0.0`');
      
      // Verify: The now-approved libs are in dependenciesMap
      // Note: They get updated with the new approval info
      expect(dependenciesMap.has('current-lib@3.0.0')).toBe(true);
    });
  });
});

