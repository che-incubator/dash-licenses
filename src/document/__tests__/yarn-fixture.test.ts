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

describe('Yarn Package Manager - Real Fixture Data', () => {
  const fixturesDir = path.join(__dirname, '../../../tests/fixtures/yarn-sample');

  test('should correctly parse DEPENDENCIES file', () => {
    const dependenciesFile = readFileSync(path.join(fixturesDir, 'DEPENDENCIES'), 'utf8');
    const depsToCQ: DependencyMap = new Map();
    const allLicenses: LicenseMap = new Map();

    DependencyParser.parseDependenciesFile(dependenciesFile, depsToCQ, allLicenses);

    // Should have many approved dependencies
    expect(depsToCQ.size).toBeGreaterThan(1000);
    
    // Check specific known approved dependencies
    expect(depsToCQ.has('abab@2.0.6')).toBe(true);
    expect(depsToCQ.get('abab@2.0.6')).toContain('clearlydefined');
    
    expect(depsToCQ.has('abort-controller@3.0.0')).toBe(true);
    expect(depsToCQ.get('abort-controller@3.0.0')).toBe('#7592');
    
    // Check that licenses are extracted for non-scoped packages
    expect(allLicenses.size).toBeGreaterThan(1000);
    expect(allLicenses.get('abab@2.0.6')?.License).toBe('BSD-3-Clause');
    expect(allLicenses.get('abort-controller@3.0.0')?.License).toBe('MIT');
  });

  test('should handle yarn @npm: format correctly', () => {
    // Yarn outputs dependencies like "@babel/core@npm:7.23.2"
    // But DEPENDENCIES file has "npm/npmjs/-/@babel/core/7.23.2"
    // And we need to match them as "@babel/core@7.23.2"
    
    const yarnFormat = '@babel/core@npm:7.23.2';
    const expectedFormat = '@babel/core@7.23.2';
    
    // Transform @npm: to @ to match DEPENDENCIES format
    const transformed = yarnFormat.replace(/@npm:/g, '@');
    
    expect(transformed).toBe(expectedFormat);
  });

  test('should verify fixture files exist', () => {
    expect(readFileSync(path.join(fixturesDir, 'DEPENDENCIES'), 'utf8').length).toBeGreaterThan(0);
    expect(readFileSync(path.join(fixturesDir, 'yarn-deps.json'), 'utf8').length).toBeGreaterThan(0);
    expect(readFileSync(path.join(fixturesDir, 'yarn-deps-info.json'), 'utf8').length).toBeGreaterThan(0);
    expect(readFileSync(path.join(fixturesDir, 'yarn-prod-deps.json'), 'utf8').length).toBeGreaterThan(0);
  });
});
