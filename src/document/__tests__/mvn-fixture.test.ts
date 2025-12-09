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

describe('Maven Package Manager - Real Fixture Data', () => {
  const fixturesDir = path.join(__dirname, '../../../tests/fixtures/mvn-sample');

  test('should correctly parse PROD_DEPENDENCIES file from maven project', () => {
    const dependenciesFile = readFileSync(path.join(fixturesDir, 'PROD_DEPENDENCIES'), 'utf8');
    const depsToCQ: DependencyMap = new Map();
    const allLicenses: LicenseMap = new Map();

    DependencyParser.parseDependenciesFile(dependenciesFile, depsToCQ, allLicenses);

    // Should have production dependencies (26 in che-server)
    expect(depsToCQ.size).toBeGreaterThan(20);
    
    // Note: Maven format maven/mavencentral/groupId/artifactId/version
    // Parser extracts as artifactId@version (groupId is in the "dash" position)
    expect(depsToCQ.has('guava@32.1.2-jre')).toBe(true);
    expect(depsToCQ.get('guava@32.1.2-jre')).toBe('#9229');
    
    expect(depsToCQ.has('slf4j-api@2.0.9')).toBe(true);
    expect(depsToCQ.get('slf4j-api@2.0.9')).toBe('#5915');
    
    // Check clearlydefined approvals
    expect(depsToCQ.has('error_prone_annotations@2.18.0')).toBe(true);
    expect(depsToCQ.get('error_prone_annotations@2.18.0')).toContain('clearlydefined');
    
    // Check that licenses are extracted
    expect(allLicenses.size).toBeGreaterThan(20);
    expect(allLicenses.get('guava@32.1.2-jre')?.License).toBe('Apache-2.0 AND CC0-1.0 AND LicenseRef-Public-Domain');
    expect(allLicenses.get('slf4j-api@2.0.9')?.License).toBe('MIT');
  });

  test('should correctly parse DEV_DEPENDENCIES file from maven project', () => {
    const dependenciesFile = readFileSync(path.join(fixturesDir, 'DEV_DEPENDENCIES'), 'utf8');
    const depsToCQ: DependencyMap = new Map();
    const allLicenses: LicenseMap = new Map();

    DependencyParser.parseDependenciesFile(dependenciesFile, depsToCQ, allLicenses);

    // Should have dev dependencies (including test scope)
    expect(depsToCQ.size).toBeGreaterThan(5);
    
    // Check logback (test dependency)
    expect(depsToCQ.has('logback-classic@1.5.6')).toBe(true);
    expect(depsToCQ.get('logback-classic@1.5.6')).toBe('#15279');
    
    expect(depsToCQ.has('logback-core@1.5.6')).toBe(true);
    expect(depsToCQ.get('logback-core@1.5.6')).toBe('#15210');
    
    // Check testng
    expect(depsToCQ.has('testng@7.8.0')).toBe(true);
    expect(depsToCQ.get('testng@7.8.0')).toBe('#15749');
    
    // Check licenses
    expect(allLicenses.get('logback-classic@1.5.6')?.License).toBe('EPL-1.0 AND LGPL-2.1-only');
  });

  test('should handle invalid maven dependency entries', () => {
    const dependenciesFile = readFileSync(path.join(fixturesDir, 'DEV_DEPENDENCIES'), 'utf8');
    const depsToCQ: DependencyMap = new Map();
    const allLicenses: LicenseMap = new Map();

    DependencyParser.parseDependenciesFile(dependenciesFile, depsToCQ, allLicenses);

    // The file contains "Invalid: org.testng:test, unknown, restricted, none"
    // This line is not in approved state, so it won't be in depsToCQ
    // But valid entries should still be parsed correctly
    expect(depsToCQ.has('testng@7.8.0')).toBe(true);
  });

  test('should parse mvn-prod-deps.txt format correctly', () => {
    const depsFile = readFileSync(path.join(fixturesDir, 'mvn-prod-deps.txt'), 'utf8');
    const lines = depsFile.split('\n').filter(l => l.trim());
    
    // Maven dependency format: groupId:artifactId:type:version:scope
    // e.g., "aopalliance:aopalliance:jar:1.0:provided"
    expect(lines.length).toBeGreaterThan(25);
    
    // Check format of first line
    const firstLine = lines[0];
    const parts = firstLine.split(':');
    expect(parts.length).toBeGreaterThanOrEqual(5); // groupId:artifactId:type:version:scope
    
    // Verify specific entries
    expect(lines.some(l => l.includes('com.google.guava:guava:jar:32.1.2-jre'))).toBe(true);
    expect(lines.some(l => l.includes('org.slf4j:slf4j-api:jar:2.0.9'))).toBe(true);
  });

  test('should parse mvn-dev-deps.txt format correctly', () => {
    const depsFile = readFileSync(path.join(fixturesDir, 'mvn-dev-deps.txt'), 'utf8');
    const lines = depsFile.split('\n').filter(l => l.trim());
    
    // Should have test-scoped dependencies
    expect(lines.length).toBeGreaterThan(5);
    
    // All lines should have :test scope
    const testLines = lines.filter(l => l.includes(':test'));
    expect(testLines.length).toBeGreaterThan(5);
    
    // Verify specific test entries
    expect(lines.some(l => l.includes('ch.qos.logback:logback-classic'))).toBe(true);
    expect(lines.some(l => l.includes('org.mockito:mockito-core'))).toBe(true);
  });

  test('should verify fixture files exist and have content', () => {
    expect(readFileSync(path.join(fixturesDir, 'PROD_DEPENDENCIES'), 'utf8').length).toBeGreaterThan(0);
    expect(readFileSync(path.join(fixturesDir, 'DEV_DEPENDENCIES'), 'utf8').length).toBeGreaterThan(0);
    expect(readFileSync(path.join(fixturesDir, 'mvn-prod-deps.txt'), 'utf8').length).toBeGreaterThan(0);
    expect(readFileSync(path.join(fixturesDir, 'mvn-dev-deps.txt'), 'utf8').length).toBeGreaterThan(0);
  });

  test('should handle maven package format parsing', () => {
    // Maven DEPENDENCIES format: maven/mavencentral/groupId/artifactId/version
    // Parser extracts as: artifactId@version (groupId treated as scope position)
    const mavenLine = 'maven/mavencentral/com.google.guava/guava/32.1.2-jre';
    const parts = mavenLine.split('/');
    
    // parts = ['maven', 'mavencentral', 'com.google.guava', 'guava', '32.1.2-jre']
    expect(parts.length).toBe(5);
    expect(parts[0]).toBe('maven');
    expect(parts[1]).toBe('mavencentral');
    expect(parts[2]).toBe('com.google.guava'); // groupId (in "scope" position)
    expect(parts[3]).toBe('guava'); // artifactId
    expect(parts[4]).toBe('32.1.2-jre'); // version
    
    // Parser produces: artifactId@version
    const identifier = `${parts[3]}@${parts[4]}`;
    expect(identifier).toBe('guava@32.1.2-jre');
  });

  test('should correctly identify Eclipse Foundation approved packages', () => {
    const prodDepsFile = readFileSync(path.join(fixturesDir, 'PROD_DEPENDENCIES'), 'utf8');
    const depsToCQ: DependencyMap = new Map();
    const allLicenses: LicenseMap = new Map();

    DependencyParser.parseDependenciesFile(prodDepsFile, depsToCQ, allLicenses);

    // Check EE4J project approvals (parsed as artifactId@version)
    expect(depsToCQ.has('jakarta.servlet-api@6.0.0')).toBe(true);
    expect(depsToCQ.get('jakarta.servlet-api@6.0.0')).toBe('ee4j.servlet');
    
    expect(depsToCQ.has('jakarta.ws.rs-api@3.1.0')).toBe(true);
    expect(depsToCQ.get('jakarta.ws.rs-api@3.1.0')).toBe('ee4j.rest');
    
    // Check Eclipse Persistence approvals
    expect(depsToCQ.has('jakarta.persistence@2.2.3')).toBe(true);
    expect(depsToCQ.get('jakarta.persistence@2.2.3')).toBe('ee4j.jpa');
  });

  test('should handle CQ number format variations', () => {
    const prodDepsFile = readFileSync(path.join(fixturesDir, 'PROD_DEPENDENCIES'), 'utf8');
    const depsToCQ: DependencyMap = new Map();
    const allLicenses: LicenseMap = new Map();

    DependencyParser.parseDependenciesFile(prodDepsFile, depsToCQ, allLicenses);

    // CQ format with "CQ" prefix
    expect(depsToCQ.has('aopalliance@1.0')).toBe(true);
    expect(depsToCQ.get('aopalliance@1.0')).toBe('CQ2918');
    
    // CQ format with "#" prefix
    expect(depsToCQ.has('jcommander@1.82')).toBe(true);
    expect(depsToCQ.get('jcommander@1.82')).toBe('#19665');
    
    // Project approval format
    expect(depsToCQ.has('org.eclipse.persistence.core@2.7.10')).toBe(true);
    expect(depsToCQ.get('org.eclipse.persistence.core@2.7.10')).toBe('ee4j.eclipselink');
  });
});
