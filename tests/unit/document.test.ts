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
  Logger,
  DependencyParser,
  DocumentGenerator,
  getLogs,
  getUnresolvedNumber,
  parseExcludedFileData,
  parseDependenciesFile,
  arrayToDocument,
  type DependencyMap,
  type LicenseMap
} from '../../src/document';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
  });

  test('should initialize with empty logs and zero unresolved', () => {
    expect(logger.getLogs()).toBe('');
    expect(logger.getUnresolvedNumber()).toBe(0);
  });

  test('should add logs correctly', () => {
    logger.addLog('Test log');
    expect(logger.getLogs()).toBe('Test log');
    
    logger.addLog(' More content');
    expect(logger.getLogs()).toBe('Test log More content');
  });

  test('should increment unresolved count', () => {
    logger.incrementUnresolved();
    expect(logger.getUnresolvedNumber()).toBe(1);
    
    logger.incrementUnresolved();
    expect(logger.getUnresolvedNumber()).toBe(2);
  });

  test('should reset logs and unresolved count', () => {
    logger.addLog('Test');
    logger.incrementUnresolved();
    logger.reset();
    
    expect(logger.getLogs()).toBe('');
    expect(logger.getUnresolvedNumber()).toBe(0);
  });
});

describe('DependencyParser', () => {
  describe('parseExcludedFileData', () => {
    test('should parse excluded file data correctly', () => {
      const fileData = `
| \`react@18.0.0\` | IP team approval |
| \`lodash@4.17.21\` | clearlydefined |
`;
      const depsMap: DependencyMap = new Map();
      
      DependencyParser.parseExcludedFileData(fileData, depsMap);
      
      expect(depsMap.get('react@18.0.0')).toBe('IP team approval');
      expect(depsMap.get('lodash@4.17.21')).toBe('clearlydefined');
    });

    test('should handle empty file data', () => {
      const depsMap: DependencyMap = new Map();
      DependencyParser.parseExcludedFileData('', depsMap);
      expect(depsMap.size).toBe(0);
    });

    test('should throw error for invalid inputs', () => {
      expect(() => {
        DependencyParser.parseExcludedFileData(null as any, new Map());
      }).toThrow('fileData must be a string');

      expect(() => {
        DependencyParser.parseExcludedFileData('test', {} as any);
      }).toThrow('depsMap must be a Map instance');
    });
  });

  describe('parseDependenciesFile', () => {
    test('should parse dependencies file correctly', () => {
      const fileData = `cq/npm/npmjs/-/react/18.0.0,MIT,approved,clearlydefined
cq/npm/npmjs/@types/lodash/4.14.195,MIT,approved,IP team`;
      const dependenciesMap: DependencyMap = new Map();
      const allLicenses: LicenseMap = new Map();
      
      DependencyParser.parseDependenciesFile(fileData, dependenciesMap, allLicenses);
      
      expect(dependenciesMap.get('react@18.0.0')).toBe('[clearlydefined](https://clearlydefined.io/definitions/npm/npmjs/-/react/18.0.0)');
      expect(dependenciesMap.get('@types/lodash@4.14.195')).toBe('IP team');
      expect(allLicenses.get('react@18.0.0')?.License).toBe('MIT');
      expect(allLicenses.get('@types/lodash@4.14.195')?.License).toBe('MIT');
    });

    test('should handle scoped packages correctly', () => {
      const fileData = 'cq/npm/npmjs/@types/node/18.0.0,MIT,approved,clearlydefined';
      const dependenciesMap: DependencyMap = new Map();
      const allLicenses: LicenseMap = new Map();
      
      DependencyParser.parseDependenciesFile(fileData, dependenciesMap, allLicenses);
      
      expect(dependenciesMap.has('@types/node@18.0.0')).toBe(true);
      expect(allLicenses.has('@types/node@18.0.0')).toBe(true);
    });

    test('should handle packages without scope correctly', () => {
      const fileData = 'cq/npm/npmjs/-/react/18.0.0,MIT,approved,clearlydefined';
      const dependenciesMap: DependencyMap = new Map();
      const allLicenses: LicenseMap = new Map();
      
      DependencyParser.parseDependenciesFile(fileData, dependenciesMap, allLicenses);
      
      expect(dependenciesMap.has('react@18.0.0')).toBe(true);
      expect(allLicenses.has('react@18.0.0')).toBe(true);
    });

    test('should throw error for invalid inputs', () => {
      expect(() => {
        DependencyParser.parseDependenciesFile(null as any, new Map());
      }).toThrow('fileData must be a string');

      expect(() => {
        DependencyParser.parseDependenciesFile('test', {} as any);
      }).toThrow('dependenciesMap must be a Map instance');

      expect(() => {
        DependencyParser.parseDependenciesFile('test', new Map(), {} as any);
      }).toThrow('allLicenses must be a Map instance or null/undefined');
    });

    test('should work without allLicenses parameter', () => {
      const fileData = 'cq/npm/npmjs/-/react/18.0.0,MIT,approved,clearlydefined';
      const dependenciesMap: DependencyMap = new Map();
      
      expect(() => {
        DependencyParser.parseDependenciesFile(fileData, dependenciesMap);
      }).not.toThrow();
      
      expect(dependenciesMap.has('react@18.0.0')).toBe(true);
    });

    test('should handle malformed lines gracefully', () => {
      const fileData = `
cq/npm/npmjs/-/react/18.0.0,MIT,approved,clearlydefined
malformed line
incomplete,data
cq/npm/npmjs/-/lodash/4.17.21,MIT,approved,IP team
`;
      const dependenciesMap: DependencyMap = new Map();
      const allLicenses: LicenseMap = new Map();
      
      expect(() => {
        DependencyParser.parseDependenciesFile(fileData, dependenciesMap, allLicenses);
      }).not.toThrow();
      
      expect(dependenciesMap.has('react@18.0.0')).toBe(true);
      expect(dependenciesMap.has('lodash@4.17.21')).toBe(true);
    });
  });
});

describe('DocumentGenerator', () => {
  describe('arrayToDocument', () => {
    test('should generate document correctly', () => {
      const title = 'Production dependencies';
      const depsArray = ['react@18.0.0', 'lodash@4.17.21'];
      const depToCQ: DependencyMap = new Map([
        ['react@18.0.0', 'clearlydefined'],
        ['lodash@4.17.21', 'IP team approval']
      ]);
      const allLicenses: LicenseMap = new Map([
        ['react@18.0.0', { License: 'MIT' }],
        ['lodash@4.17.21', { License: 'MIT', URL: 'https://lodash.com' }]
      ]);
      
      const result = DocumentGenerator.arrayToDocument(title, depsArray, depToCQ, allLicenses);
      
      expect(result).toContain('# Production dependencies');
      expect(result).toContain('| Packages | License | Resolved CQs |');
      expect(result).toContain('| [`lodash@4.17.21`](https://lodash.com) | MIT | IP team approval |');
      expect(result).toContain('| `react@18.0.0` | MIT | clearlydefined |');
    });

    test('should handle dependencies with URLs', () => {
      const title = 'Test dependencies';
      const depsArray = ['test-package@1.0.0'];
      const depToCQ: DependencyMap = new Map([['test-package@1.0.0', 'approved']]);
      const allLicenses: LicenseMap = new Map([
        ['test-package@1.0.0', { License: 'MIT', URL: 'https://example.com' }]
      ]);
      
      const result = DocumentGenerator.arrayToDocument(title, depsArray, depToCQ, allLicenses);
      
      expect(result).toContain('[`test-package@1.0.0`](https://example.com)');
    });

    test('should handle unresolved dependencies', () => {
      const title = 'Test dependencies';
      const depsArray = ['unresolved@1.0.0'];
      const depToCQ: DependencyMap = new Map();
      const allLicenses: LicenseMap = new Map([['unresolved@1.0.0', { License: 'MIT' }]]);
      
      const result = DocumentGenerator.arrayToDocument(title, depsArray, depToCQ, allLicenses);
      
      expect(result).toContain('| `unresolved@1.0.0` | MIT |  |');
    });

    test('should sort dependencies alphabetically', () => {
      const title = 'Test dependencies';
      const depsArray = ['zebra@1.0.0', 'alpha@1.0.0', 'beta@1.0.0'];
      const depToCQ: DependencyMap = new Map();
      const allLicenses: LicenseMap = new Map([
        ['zebra@1.0.0', { License: 'MIT' }],
        ['alpha@1.0.0', { License: 'Apache' }],
        ['beta@1.0.0', { License: 'BSD' }]
      ]);
      
      const result = DocumentGenerator.arrayToDocument(title, depsArray, depToCQ, allLicenses);
      
      const lines = result.split('\n');
      const alphaIndex = lines.findIndex(line => line.includes('alpha@1.0.0'));
      const betaIndex = lines.findIndex(line => line.includes('beta@1.0.0'));
      const zebraIndex = lines.findIndex(line => line.includes('zebra@1.0.0'));
      
      expect(alphaIndex).toBeLessThan(betaIndex);
      expect(betaIndex).toBeLessThan(zebraIndex);
    });

    test('should throw error for invalid inputs', () => {
      const validDeps: string[] = [];
      const validMap: DependencyMap = new Map();
      const validLicenseMap: LicenseMap = new Map();
      
      expect(() => {
        DocumentGenerator.arrayToDocument(null as any, validDeps, validMap, validLicenseMap);
      }).toThrow('title must be a string');

      expect(() => {
        DocumentGenerator.arrayToDocument('title', null as any, validMap, validLicenseMap);
      }).toThrow('depsArray must be an array');

      expect(() => {
        DocumentGenerator.arrayToDocument('title', validDeps, {} as any, validLicenseMap);
      }).toThrow('depToCQ must be a Map instance');

      expect(() => {
        DocumentGenerator.arrayToDocument('title', validDeps, validMap, {} as any);
      }).toThrow('allLicenses must be a Map instance');
    });
  });
});

describe('Backward compatibility functions', () => {
  test('getLogs should work', () => {
    expect(typeof getLogs()).toBe('string');
  });

  test('getUnresolvedNumber should work', () => {
    expect(typeof getUnresolvedNumber()).toBe('number');
  });

  test('parseExcludedFileData should work', () => {
    const depsMap: DependencyMap = new Map();
    expect(() => {
      parseExcludedFileData('', depsMap);
    }).not.toThrow();
  });

  test('parseDependenciesFile should work', () => {
    const depsMap: DependencyMap = new Map();
    const licensesMap: LicenseMap = new Map();
    expect(() => {
      parseDependenciesFile('', depsMap, licensesMap);
    }).not.toThrow();
  });

  test('arrayToDocument should work', () => {
    const result = arrayToDocument('Test', [], new Map(), new Map());
    expect(typeof result).toBe('string');
    expect(result).toContain('# Test');
  });
});
