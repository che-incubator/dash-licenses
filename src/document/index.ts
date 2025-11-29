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

export interface LicenseInfo {
  License: string;
  URL?: string;
}

/**
 * Type for dependency maps
 */
export type DependencyMap = Map<string, string>;
export type LicenseMap = Map<string, LicenseInfo>;

/**
 * Logger class to manage logs and track unresolved dependencies
 */
export class Logger {
  private static logs: string = '';
  private unresolvedNumber: number = 0;

  public getLogs(): string {
    return Logger.logs;
  }

  public getUnresolvedNumber(): number {
    return this.unresolvedNumber;
  }

  public addLog(log: string): void {
    Logger.logs += log;
  }

  public incrementUnresolved(): void {
    this.unresolvedNumber++;
  }

  public reset(): void {
    Logger.logs = '';
    this.unresolvedNumber = 0;
  }
}

/**
 * Parser class for dependency data
 */
export class DependencyParser {
  /**
   * Parse excluded file data and update dependencies map
   * @param fileData - Content of the exclusions file
   * @param depsMap - Map to store dependency exclusions
   * @throws {Error} If fileData is not a string or depsMap is not a Map
   */
  public static parseExcludedFileData(fileData: string, depsMap: DependencyMap): void {
    if (typeof fileData !== 'string') {
      throw new Error('fileData must be a string');
    }
    if (!(depsMap instanceof Map)) {
      throw new Error('depsMap must be a Map instance');
    }

    const pattern = /^\| `([^|^ ]+)` \| ([^|]+) \|$/gm;
    let result: RegExpExecArray | null;
    while ((result = pattern.exec(fileData)) !== null) {
      depsMap.set(result[1], result[2]);
    }
  }

  /**
   * Parse dependencies file and update maps
   * @param fileData - Content of the dependencies file
   * @param dependenciesMap - Map to store dependency approvals
   * @param allLicenses - Optional map to store all license information
   * @throws {Error} If required parameters are invalid
   */
  public static parseDependenciesFile(
    fileData: string,
    dependenciesMap: DependencyMap,
    allLicenses?: LicenseMap
  ): void {
    if (typeof fileData !== 'string') {
      throw new Error('fileData must be a string');
    }
    if (!(dependenciesMap instanceof Map)) {
      throw new Error('dependenciesMap must be a Map instance');
    }
    if (allLicenses && !(allLicenses instanceof Map)) {
      throw new Error('allLicenses must be a Map instance or null/undefined');
    }

    let log = '';
    let numberUnusedExcludes = 0;

    if (dependenciesMap.size > 0) {
      log += '\n## UNUSED Excludes\n';
    }

    const deps = fileData.split(/\r?\n/)
      .filter(lineData => !!lineData)
      .map(line => line.split(/,\s?/));

    // Process license information if allLicenses map is provided
    if (allLicenses) {
      deps.forEach(lineData => {
        if (lineData.length >= 2) {
          const [cqIdentifier, license] = lineData;
          const parts = cqIdentifier.split('/');

          // Handle both old (cq/) and new formats:
          // Old: cq/npm/npmjs/-/name/version (6 parts)
          // New: npm/npmjs/-/name/version (5 parts)
          // Scoped: npm/npmjs/@scope/name/version (5 parts)
          // Scoped old: cq/npm/npmjs/@scope/name/version (6 parts)
          if (parts.length >= 5) {
            let identifier: string;
            
            // Determine offset based on whether 'cq/' prefix exists
            const offset = parts[0] === 'cq' ? 1 : 0;
            const scopeOrDashIndex = 2 + offset;
            
            // Check if it's a scoped package
            if (parts[scopeOrDashIndex] && parts[scopeOrDashIndex].startsWith('@')) {
              // Scoped package
              const scope = parts[scopeOrDashIndex];
              const name = parts[scopeOrDashIndex + 1];
              const version = parts[scopeOrDashIndex + 2];
              identifier = `${scope}/${name}@${version}`;
            } else {
              // Non-scoped package (has '-' at scopeOrDashIndex)
              const name = parts[scopeOrDashIndex + 1];
              const version = parts[scopeOrDashIndex + 2];
              identifier = `${name}@${version}`;
            }
            
            allLicenses.set(identifier, {
              License: license ? license.trim() : ''
            });
          }
        }
      });
    }

    // Process approved dependencies
    deps.filter(lineData => {
      const [, , status] = lineData;
      return status === 'approved';
    })
      .forEach(lineData => {
        if (lineData.length >= 4) {
          const [cqIdentifier, , , approvedBy] = lineData;
          const parts = cqIdentifier.split('/');

          // Handle both old (cq/) and new formats:
          // Old: cq/npm/npmjs/-/name/version (6 parts)
          // New: npm/npmjs/-/name/version (5 parts)
          // Scoped: npm/npmjs/@scope/name/version (5 parts)
          // Scoped old: cq/npm/npmjs/@scope/name/version (6 parts)
          if (parts.length >= 5) {
            let identifier: string;
            let scope: string;
            let name: string;
            let version: string;
            
            // Determine offset based on whether 'cq/' prefix exists
            const offset = parts[0] === 'cq' ? 1 : 0;
            const scopeOrDashIndex = 2 + offset;
            
            // Check if it's a scoped package
            if (parts[scopeOrDashIndex] && parts[scopeOrDashIndex].startsWith('@')) {
              // Scoped package
              scope = parts[scopeOrDashIndex];
              name = parts[scopeOrDashIndex + 1];
              version = parts[scopeOrDashIndex + 2];
              identifier = `${scope}/${name}@${version}`;
            } else {
              // Non-scoped package (has '-' at scopeOrDashIndex)
              scope = '-';
              name = parts[scopeOrDashIndex + 1];
              version = parts[scopeOrDashIndex + 2];
              identifier = `${name}@${version}`;
            }

            if (dependenciesMap.has(identifier)) {
              log += `\n${++numberUnusedExcludes}. \`${identifier}\``;
              return;
            }

            if (approvedBy === 'clearlydefined') {
              const link = `[clearlydefined](https://clearlydefined.io/definitions/npm/npmjs/${scope}/${name}/${version})`;
              dependenciesMap.set(identifier, link);
            } else {
              dependenciesMap.set(identifier, approvedBy);
            }
          }
        }
      });

    if (numberUnusedExcludes > 0) {
      logger.addLog(`${log}\n`);
    }
  }
}

/**
 * Document generator class for creating dependency reports
 */
export class DocumentGenerator {
  /**
   * Create output document from dependency array
   * @param title - Title for the document
   * @param depsArray - Array of dependencies
   * @param depToCQ - Map of dependencies to CQ information
   * @param allLicenses - Map of all license information
   * @returns Generated markdown document
   */
  public static arrayToDocument(
    title: string,
    depsArray: string[],
    depToCQ: DependencyMap,
    allLicenses: LicenseMap
  ): string {
    if (typeof title !== 'string') {
      throw new Error('title must be a string');
    }
    if (!Array.isArray(depsArray)) {
      throw new Error('depsArray must be an array');
    }
    if (!(depToCQ instanceof Map)) {
      throw new Error('depToCQ must be a Map instance');
    }
    if (!(allLicenses instanceof Map)) {
      throw new Error('allLicenses must be a Map instance');
    }

    let log = '';
    let document = `# ${title}\n\n`;
    document += '| Packages | License | Resolved CQs |\n| --- | --- | --- |\n';
    log += `\n## UNRESOLVED ${title}\n`;
    let unresolvedQuantity = 0;

    depsArray.sort().forEach(item => {
      const license = allLicenses.has(item) ? allLicenses.get(item)?.License ?? '' : '';
      let lib = `\`${item}\``;
      const licenseInfo = allLicenses.get(item);
      if (licenseInfo?.URL) {
        lib = `[${lib}](${licenseInfo.URL})`;
      }
      let cq = '';
      if (depToCQ.has(item)) {
        cq = depToCQ.get(item) ?? '';
      } else {
        log += `\n${++unresolvedQuantity}. \`${item}\``;
        logger.incrementUnresolved();
      }
      document += `| ${lib} | ${license} | ${cq} |\n`;
    });

    if (unresolvedQuantity > 0) {
      logger.addLog(`${log}\n`);
    }

    return document;
  }
}

// Global logger instance for backward compatibility
const logger = new Logger();

// Backward compatibility functions
export function getLogs(): string {
  return logger.getLogs();
}

export function getUnresolvedNumber(): number {
  return logger.getUnresolvedNumber();
}

export function parseExcludedFileData(fileData: string, depsMap: DependencyMap): void {
  return DependencyParser.parseExcludedFileData(fileData, depsMap);
}

export function parseDependenciesFile(
  fileData: string,
  dependenciesMap: DependencyMap,
  allLicenses?: LicenseMap
): void {
  return DependencyParser.parseDependenciesFile(fileData, dependenciesMap, allLicenses);
}

export function arrayToDocument(
  title: string,
  depsArray: string[],
  depToCQ: DependencyMap,
  allLicenses: LicenseMap
): string {
  return DocumentGenerator.arrayToDocument(title, depsArray, depToCQ, allLicenses);
}

// Default export for CommonJS compatibility
export default {
  Logger,
  DependencyParser,
  DocumentGenerator,
  getLogs,
  getUnresolvedNumber,
  parseExcludedFileData,
  parseDependenciesFile,
  arrayToDocument
};
