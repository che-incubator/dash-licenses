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

import * as path from 'path';
import { writeFileSync, existsSync, readFileSync, unlinkSync, mkdirSync, readdirSync, statSync } from 'fs';
import {
  getLogs,
  getUnresolvedNumber,
  parseExcludedFileData,
  parseDependenciesFile,
  arrayToDocument,
  type DependencyMap,
  type LicenseMap
} from '../document';
import { runJarFallback } from './jar-fallback';
import { logger } from './logger';

/**
 * Interface for file paths configuration
 */
export interface FilePaths {
  ENCODING: string;
  DEPS_DIR: string;
  TMP_DIR: string;
  EXCLUSIONS_DIR: string;
  PROD_MD: string;
  DEV_MD: string;
  PROBLEMS_MD: string;
  DEPENDENCIES: string;
  EXCLUDED_PROD_MD: string;
  EXCLUDED_DEV_MD: string;
}

/**
 * Interface for package identifier components
 */
export interface PackageIdentifier {
  name: string;
  version: string;
}

/**
 * File name constants
 */
export const FILE_NAMES = {
  PROD_MD: 'prod.md',
  DEV_MD: 'dev.md',
  PROBLEMS_MD: 'problems.md',
  DEPENDENCIES: 'DEPENDENCIES'
} as const;

/**
 * Regex patterns
 */
export const PATTERNS = {
  EXCLUDED_TABLE: /^\| `([^|^ ]+)` \| ([^|]+) \|$/gm
} as const;

/**
 * Utility functions
 */

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse non-empty lines from content
 */
export function parseNonEmptyLines(content: string): string[] {
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

/**
 * Get error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Options controlling transitive dependency handling in processAndGenerateDocuments.
 * Falls back to process.argv detection if not provided (CLI mode).
 */
export interface ProcessingOptions {
  harvest?: boolean;
  check?: boolean;
  /** GET timeout (ms) forwarded to triggerHarvestAsync. Defaults to 5 000. */
  getTimeoutMs?: number;
  /**
   * When provided and harvest is true, called with the list of **direct**
   * unresolved dependency identifiers (the ones that end up in problems.md).
   * Transitive unresolved deps (auto-added to EXCLUDED) are excluded.
   * The function should be fire-and-forget; the caller does not await it.
   */
  harvestFn?: (identifiers: string[]) => Promise<void>;
}

/**
 * Parse a dependency coordinate or resolution string into a plain
 * package identifier suitable for cache lookup.
 *
 * Handles two input formats:
 *
 * 1. Yarn Berry resolution strings (from parseYarnLockfile):
 *      express@npm:4.18.0              → express@4.18.0
 *      @babel/core@npm:7.0.0          → @babel/core@7.0.0
 *
 * 2. ClearlyDefined coordinate strings (from npm/yarn1 parsers):
 *      npm/npmjs/-/express/4.18.0     → express@4.18.0
 *      npm/npmjs/@babel/core/7.0.0    → @babel/core@7.0.0
 *
 * Returns an empty string for unrecognised / malformed input.
 */
export function coordinateToIdentifier(coordinate: string): string {
  // Already a plain identifier: package@version
  // e.g. express@4.18.0 or @babel/core@7.0.0 — used by yarn3 and npm processors
  if (!coordinate.startsWith('npm/') && !coordinate.includes('@npm:')) {
    const lastAt = coordinate.lastIndexOf('@');
    if (lastAt > 0) return coordinate;
  }

  // Yarn Berry resolution: name@npm:version  (last @npm: wins for scoped pkgs)
  const npmAt = coordinate.lastIndexOf('@npm:');
  if (npmAt > 0) {
    const name = coordinate.slice(0, npmAt);
    const version = coordinate.slice(npmAt + 5); // skip '@npm:'
    if (name && version) return `${name}@${version}`;
  }

  // ClearlyDefined coordinate: npm/npmjs/{scope}/{name}/{version}
  const parts = coordinate.split('/');
  if (parts.length >= 5 && parts[0] === 'npm') {
    const scope = parts[2];
    const name = parts[3];
    const version = parts.slice(4).join('/');
    if (scope === '-') return `${name}@${version}`;
    return `${scope}/${name}@${version}`;
  }

  return '';
}

/**
 * Convert a package identifier back to an npm coordinate.
 *
 *   express@4.18.0      → npm/npmjs/-/express/4.18.0
 *   @babel/core@7.0.0  → npm/npmjs/@babel/core/7.0.0
 *
 * Returns an empty string for identifiers without a version.
 */
export function identifierToCoordinate(identifier: string): string {
  const atIdx = identifier.lastIndexOf('@');
  if (atIdx <= 0) return '';
  const name = identifier.slice(0, atIdx);
  const version = identifier.slice(atIdx + 1);
  if (!version) return '';
  if (name.startsWith('@')) {
    const slashIdx = name.indexOf('/');
    if (slashIdx <= 1 || slashIdx === name.length - 1) return '';
    const scope = name.slice(0, slashIdx);
    const pkg = name.slice(slashIdx + 1);
    return `npm/npmjs/${scope}/${pkg}/${version}`;
  }
  return `npm/npmjs/-/${name}/${version}`;
}

/** Entry stored in the resolved dependency cache. */
export interface CacheEntry {
  /** SPDX license string from the .deps/*.md table row (e.g. "MIT"). */
  license: string;
  /** Resolved CQ value (e.g. "[clearlydefined](https://...)"). */
  cq: string;
}

/**
 * Load already-resolved dependencies from the existing .deps/prod.md and
 * .deps/dev.md files and return them as a map of
 * identifier → { license, cq }.
 *
 * Only entries whose "Resolved CQs" column is non-empty are included.
 * Empty CQ cells mean the dependency is still unresolved and must be queried.
 */
export function loadResolvedCache(
  prodMdPath: string,
  devMdPath: string,
): Map<string, CacheEntry> {
  const cache = new Map<string, CacheEntry>();

  // ── prod.md / dev.md (3-column: identifier | license | cq) ─────────────
  for (const filePath of [prodMdPath, devMdPath]) {
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, { encoding: 'utf8' as BufferEncoding });
    // Match table row formats (plain backtick or linked name; license may be empty):
    //   | `pkg@version` | MIT | [clearlydefined](...) |
    //   | [`pkg@version`](url) | MIT | [clearlydefined](...) |
    //   | `pkg@version` |  | ecd.che |   ← empty license (EXCLUDED-sourced entries)
    const rowPattern = /^\| \[?`([^`]+)`(?:\]\([^)]*\))? \| ([^|]*) \| (.+) \|$/gm;
    let match: RegExpExecArray | null;
    while ((match = rowPattern.exec(content)) !== null) {
      // Normalize to plain name@version so Yarn Berry (@npm:) and ClearlyDefined
      // coordinates (npm/npmjs/…) hit the same cache key as processor lookups.
      const identifier = coordinateToIdentifier(match[1].trim()) || match[1].trim();
      const license = match[2].trim();
      const cq = match[3].trim();
      // Only cache entries with an actual resolution — skip placeholders like
      // "transitive dependency" that don't represent a real ClearlyDefined result.
      if (cq && cq !== 'transitive dependency') {
        cache.set(identifier, { license, cq });
      }
    }
  }

  // ── EXCLUDED files (2-column: identifier | cq) ──────────────────────────
  // Deps in EXCLUDED are already classified (transitive or manually excluded).
  // Cache them so subsequent runs skip the ClearlyDefined API call entirely.
  const dir = path.dirname(prodMdPath);
  const excludedProd = path.join(dir, 'EXCLUDED', 'prod.md');
  const excludedDev  = path.join(dir, 'EXCLUDED', 'dev.md');
  for (const filePath of [excludedProd, excludedDev]) {
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, { encoding: 'utf8' as BufferEncoding });
    // EXCLUDED format: | `identifier` | cq_value |   (no license column)
    const excludedPattern = /^\| \[?`([^`]+)`(?:\]\([^)]*\))? \| ([^|]+) \|$/gm;
    let match: RegExpExecArray | null;
    while ((match = excludedPattern.exec(content)) !== null) {
      const identifier = coordinateToIdentifier(match[1].trim()) || match[1].trim();
      const cq = match[2].trim();
      if (identifier && cq) {
        cache.set(identifier, { license: '', cq });
      }
    }
  }

  return cache;
}

/**
 * Shared utilities for package manager implementations
 */
export class PackageManagerUtils {
  /**
   * Get standard file paths for dependency processing
   * @returns Object containing all standard file paths
   */
  public static getFilePaths(): FilePaths {
    const ENCODING = process.env.ENCODING ?? 'utf8';
    const DEPS_DIR = process.env.DEPS_COPY_DIR;
    
    if (!DEPS_DIR) {
      throw new Error('DEPS_COPY_DIR environment variable is required');
    }
    
    const TMP_DIR = path.join(DEPS_DIR, 'tmp');
    const EXCLUSIONS_DIR = path.join(DEPS_DIR, 'EXCLUDED');

    return {
      ENCODING,
      DEPS_DIR,
      TMP_DIR,
      EXCLUSIONS_DIR,
      // Write generated files to TMP_DIR so they can be compared in --check mode
      // and then copied to final destination by entrypoint.sh in generate mode
      PROD_MD: path.join(TMP_DIR, FILE_NAMES.PROD_MD),
      DEV_MD: path.join(TMP_DIR, FILE_NAMES.DEV_MD),
      PROBLEMS_MD: path.join(TMP_DIR, FILE_NAMES.PROBLEMS_MD),
      DEPENDENCIES: path.join(TMP_DIR, FILE_NAMES.DEPENDENCIES),
      EXCLUDED_PROD_MD: path.join(EXCLUSIONS_DIR, FILE_NAMES.PROD_MD),
      EXCLUDED_DEV_MD: path.join(EXCLUSIONS_DIR, FILE_NAMES.DEV_MD)
    };
  }

  /**
   * Check if we should write to disk based on command line arguments
   * @returns True if should write to disk, false otherwise
   */
  public static shouldWriteToDisk(): boolean {
    const args = process.argv.slice(2);
    return args[0] !== '--check';
  }

  /**
   * Process excluded dependencies from markdown files
   * @param depsToCQ - Map to store dependency to CQ mappings
   * @param excludedProdPath - Path to excluded production dependencies file
   * @param excludedDevPath - Path to excluded development dependencies file
   * @param encoding - File encoding
   * @param excludedProdIds - Optional set to collect identifiers from prod file
   * @param excludedDevIds - Optional set to collect identifiers from dev file
   */
  public static processExcludedDependencies(
    depsToCQ: DependencyMap,
    excludedProdPath: string,
    excludedDevPath: string,
    encoding: string,
    excludedProdIds?: Set<string>,
    excludedDevIds?: Set<string>
  ): void {
    if (existsSync(excludedProdPath)) {
      const content = readFileSync(excludedProdPath, { encoding: encoding as BufferEncoding });
      parseExcludedFileData(content, depsToCQ);
      if (excludedProdIds) {
        let m: RegExpExecArray | null;
        while ((m = PATTERNS.EXCLUDED_TABLE.exec(content)) !== null) excludedProdIds.add(m[1]);
      }
    }
    if (existsSync(excludedDevPath)) {
      const content = readFileSync(excludedDevPath, { encoding: encoding as BufferEncoding });
      parseExcludedFileData(content, depsToCQ);
      if (excludedDevIds) {
        let m: RegExpExecArray | null;
        while ((m = PATTERNS.EXCLUDED_TABLE.exec(content)) !== null) excludedDevIds.add(m[1]);
      }
    }
  }

  /**
   * Remove given identifiers from an EXCLUDED markdown file (table rows only).
   * Preserves header and comment lines.
   */
  public static removeUnusedExcludes(
    excludedPath: string,
    identifiersToRemove: Set<string>,
    encoding: string
  ): void {
    if (!existsSync(excludedPath) || identifiersToRemove.size === 0) return;
    const content = readFileSync(excludedPath, { encoding: encoding as BufferEncoding });
    const lines = content.split(/\r?\n/);
    // Match both plain (`pkg@v`) and linked-name ([`pkg@v`](url)) rows.
    const tablePattern = /^\| \[?`([^`]+)`(?:\]\([^)]*\))? \| ([^|]+) \|$/;
    // Normalize both sides so Yarn Berry / ClearlyDefined coordinates in
    // identifiersToRemove or in the EXCLUDED file match each other.
    const normalizedToRemove = new Set(
      [...identifiersToRemove].map(id => coordinateToIdentifier(id.trim()) || id.trim()),
    );
    const kept: string[] = [];
    for (const line of lines) {
      const m = line.match(tablePattern);
      if (m) {
        const rowId = coordinateToIdentifier(m[1].trim()) || m[1].trim();
        if (normalizedToRemove.has(rowId)) continue;
      }
      kept.push(line);
    }
    writeFileSync(excludedPath, kept.join('\n').trimEnd() + '\n', { encoding: encoding as BufferEncoding });
  }

  /**
   * Read package.json files for the project root and all workspace packages,
   * returning the union of direct dependency names (without versions).
   *
   * A dependency is "direct" if it is listed in dependencies or devDependencies
   * of ANY package.json in the project — root or workspace. This correctly
   * handles monorepos where individual workspace packages declare their own
   * deps that are not repeated in the root package.json.
   *
   * @param projectPath - Path to the project root
   * @returns Sets of production and development direct dependency names
   */
  public static getDirectPackageNames(projectPath: string): { prod: Set<string>; dev: Set<string> } {
    const prod = new Set<string>();
    const dev = new Set<string>();

    const collectFromPackageJson = (pkgJsonPath: string): void => {
      if (!existsSync(pkgJsonPath)) return;
      try {
        const pkgJson = JSON.parse(readFileSync(pkgJsonPath, { encoding: 'utf8' }));
        if (pkgJson.dependencies) Object.keys(pkgJson.dependencies).forEach(n => prod.add(n));
        if (pkgJson.devDependencies) Object.keys(pkgJson.devDependencies).forEach(n => dev.add(n));
      } catch {
        // silently ignore parse errors
      }
    };

    const rootPkgJsonPath = path.join(projectPath, 'package.json');
    collectFromPackageJson(rootPkgJsonPath);

    // Also scan workspace package.json files (monorepo support).
    // Resolve workspace glob patterns from the root package.json workspaces field.
    try {
      const rootPkgJson = JSON.parse(readFileSync(rootPkgJsonPath, { encoding: 'utf8' }));
      const workspacePatterns: string[] = Array.isArray(rootPkgJson.workspaces)
        ? rootPkgJson.workspaces
        : Array.isArray(rootPkgJson.workspaces?.packages)
          ? rootPkgJson.workspaces.packages
          : [];

      for (const pattern of workspacePatterns) {
        // Support simple glob patterns like "packages/*" or "packages/foo"
        const parts = pattern.split('/');
        const parentDir = path.join(projectPath, ...parts.slice(0, -1));
        const leaf = parts[parts.length - 1];

        if (!existsSync(parentDir)) continue;

        const candidates = leaf === '*'
          ? readdirSync(parentDir).map(name => path.join(parentDir, name))
          : [path.join(parentDir, leaf)];

        for (const candidate of candidates) {
          if (existsSync(candidate) && statSync(candidate).isDirectory()) {
            collectFromPackageJson(path.join(candidate, 'package.json'));
          }
        }
      }
    } catch {
      // silently ignore — workspace scanning is best-effort
    }

    return { prod, dev };
  }

  /**
   * Append transitive dependency entries to an EXCLUDED markdown file.
   * Creates the file with a default header if it does not exist.
   * Skips identifiers already present in the file.
   * @param excludedFilePath - Path to the EXCLUDED markdown file
   * @param identifiers - Package identifiers to append (name@version format)
   * @param encoding - File encoding
   */
  public static appendTransitiveExcludes(
    excludedFilePath: string,
    identifiers: string[],
    encoding: string
  ): void {
    if (identifiers.length === 0) return;
    if (!existsSync(excludedFilePath)) {
      mkdirSync(path.dirname(excludedFilePath), { recursive: true });
      writeFileSync(
        excludedFilePath,
        'This file lists dependencies that do not need CQs or auto-detection does not work.\n\n| Packages | Resolved CQs |\n| --- | --- |\n',
        { encoding: encoding as BufferEncoding }
      );
    }
    const content = readFileSync(excludedFilePath, { encoding: encoding as BufferEncoding });
    const toAdd: string[] = [];
    for (const id of identifiers) {
      if (!content.includes(`\`${id}\``)) {
        toAdd.push(`| \`${id}\` | transitive dependency |`);
      }
    }
    if (toAdd.length > 0) {
      const newContent = content.trimEnd() + '\n' + toAdd.join('\n') + '\n';
      writeFileSync(excludedFilePath, newContent, { encoding: encoding as BufferEncoding });
      logger.info(`Added ${toAdd.length} transitive dep(s) to ${path.basename(path.dirname(excludedFilePath))}/${path.basename(excludedFilePath)}`);
    }
  }

  /**
   * Process dependencies file and generate documents
   * Files are always written to TMP_DIR for comparison in --check mode.
   * In generate mode, entrypoint.sh handles copying files to the final destination.
   * @param prodDeps - Array of production dependencies
   * @param devDeps - Array of development dependencies
   * @param allDependencies - Map of all dependency information
   * @param paths - File paths object
   * @param options - Optional harvest/check flags (falls back to process.argv in CLI mode)
   */
  public static processAndGenerateDocuments(
    prodDeps: string[],
    devDeps: string[],
    allDependencies: LicenseMap,
    paths: FilePaths,
    options?: ProcessingOptions
  ): void {
    try {
      const depsToCQ: DependencyMap = new Map();
      const excludedProdIds = new Set<string>();
      const excludedDevIds = new Set<string>();

      // Process excluded dependencies
      this.processExcludedDependencies(
        depsToCQ,
        paths.EXCLUDED_PROD_MD,
        paths.EXCLUDED_DEV_MD,
        paths.ENCODING,
        excludedProdIds,
        excludedDevIds
      );

      // Parse main dependencies file
      if (!existsSync(paths.DEPENDENCIES)) {
        const errorMsg = `Error: DEPENDENCIES file not found at ${paths.DEPENDENCIES}`;
        console.error(errorMsg);
        writeFileSync(paths.PROBLEMS_MD, `# Dependency analysis\n\n${errorMsg}\n`, { encoding: paths.ENCODING as BufferEncoding });
        throw new Error(errorMsg);
      }

      const dependenciesStr = readFileSync(paths.DEPENDENCIES, { encoding: paths.ENCODING as BufferEncoding });
      if (!dependenciesStr || dependenciesStr.trim().length === 0) {
        const errorMsg = `Error: DEPENDENCIES file is empty at ${paths.DEPENDENCIES}`;
        console.error(errorMsg);
        writeFileSync(paths.PROBLEMS_MD, `# Dependency analysis\n\n${errorMsg}\n`, { encoding: paths.ENCODING as BufferEncoding });
        throw new Error(errorMsg);
      }

      const unusedExcludes: string[] = [];
      parseDependenciesFile(dependenciesStr, depsToCQ, allDependencies, unusedExcludes);

      // Auto-remove UNUSED Excludes from EXCLUDED files
      // Case 1: redundant — approved by ClearlyDefined AND listed in EXCLUDED
      if (unusedExcludes.length > 0) {
        const toRemoveFromProd = unusedExcludes.filter(id => excludedProdIds.has(id));
        const toRemoveFromDev = unusedExcludes.filter(id => excludedDevIds.has(id));
        if (toRemoveFromProd.length > 0) {
          this.removeUnusedExcludes(paths.EXCLUDED_PROD_MD, new Set(toRemoveFromProd), paths.ENCODING);
          logger.info(`Removed ${toRemoveFromProd.length} unused exclude(s) from EXCLUDED/prod.md`);
        }
        if (toRemoveFromDev.length > 0) {
          this.removeUnusedExcludes(paths.EXCLUDED_DEV_MD, new Set(toRemoveFromDev), paths.ENCODING);
          logger.info(`Removed ${toRemoveFromDev.length} unused exclude(s) from EXCLUDED/dev.md`);
        }
      }

      // Case 2: orphan — listed in EXCLUDED but no longer present in the lock file
      // (package removed or version bumped; the old identifier is stale)
      const allCurrentDeps = new Set([...prodDeps, ...devDeps]);
      const orphanFromProd = [...excludedProdIds].filter(id => !allCurrentDeps.has(id));
      const orphanFromDev = [...excludedDevIds].filter(id => !allCurrentDeps.has(id));
      if (orphanFromProd.length > 0) {
        this.removeUnusedExcludes(paths.EXCLUDED_PROD_MD, new Set(orphanFromProd), paths.ENCODING);
        logger.info(`Removed ${orphanFromProd.length} orphan exclude(s) from EXCLUDED/prod.md: ${orphanFromProd.join(', ')}`);
      }
      if (orphanFromDev.length > 0) {
        this.removeUnusedExcludes(paths.EXCLUDED_DEV_MD, new Set(orphanFromDev), paths.ENCODING);
        logger.info(`Removed ${orphanFromDev.length} orphan exclude(s) from EXCLUDED/dev.md: ${orphanFromDev.join(', ')}`);
      }

      // JAR fallback: if jarPath is set and we have unresolved deps, run Eclipse JAR and add approved to EXCLUDED
      const jarPath = process.env.JAR_PATH;
      const projectPath = process.env.PROJECT_COPY_DIR || path.dirname(paths.DEPS_DIR);

      // Process unresolved production dependencies with JAR
      const unresolvedProdDeps = prodDeps.filter(d => !depsToCQ.has(d));
      if (jarPath && unresolvedProdDeps.length > 0) {
        const approvedFromJar = runJarFallback(
          jarPath,
          projectPath,
          unresolvedProdDeps,
          paths.EXCLUDED_PROD_MD,
          paths.ENCODING
        );
        approvedFromJar.forEach((cq, id) => depsToCQ.set(id, cq));
      }

      // Process unresolved development dependencies with JAR
      const unresolvedDevDeps = devDeps.filter(d => !depsToCQ.has(d));
      if (jarPath && unresolvedDevDeps.length > 0) {
        const approvedFromJar = runJarFallback(
          jarPath,
          projectPath,
          unresolvedDevDeps,
          paths.EXCLUDED_DEV_MD,
          paths.ENCODING
        );
        approvedFromJar.forEach((cq, id) => depsToCQ.set(id, cq));
      }

      // Detect and handle transitive unresolved dependencies
      const isHarvest = options?.harvest ?? process.argv.includes('--harvest');
      const isCheck = options?.check ?? process.argv.includes('--check');
      const directDeps = PackageManagerUtils.getDirectPackageNames(projectPath);

      const getPackageName = (id: string): string => {
        const at = id.lastIndexOf('@');
        return at > 0 ? id.substring(0, at) : id;
      };

      // A package is "direct" if it appears in prod OR dev dependencies of any
      // package.json in the project. Both sets must be checked for each dep
      // regardless of which bucket (prod/dev) the dep was resolved into.
      const isDirectPackage = (id: string): boolean => {
        const name = getPackageName(id);
        return directDeps.prod.has(name) || directDeps.dev.has(name);
      };

      // A package that was previously cached as "transitive dependency" but is
      // now a direct dependency must be re-evaluated: remove its stale EXCLUDED
      // entry so it goes through ClearlyDefined lookup again.
      const staleTransitiveProd = prodDeps.filter(
        d => depsToCQ.get(d) === 'transitive dependency' && isDirectPackage(d),
      );
      const staleTransitiveDev = devDeps.filter(
        d => depsToCQ.get(d) === 'transitive dependency' && isDirectPackage(d),
      );
      if (staleTransitiveProd.length > 0 || staleTransitiveDev.length > 0) {
        staleTransitiveProd.forEach(d => depsToCQ.delete(d));
        staleTransitiveDev.forEach(d => depsToCQ.delete(d));
        PackageManagerUtils.removeUnusedExcludes(
          paths.EXCLUDED_PROD_MD,
          new Set(staleTransitiveProd),
          paths.ENCODING,
        );
        PackageManagerUtils.removeUnusedExcludes(
          paths.EXCLUDED_DEV_MD,
          new Set(staleTransitiveDev),
          paths.ENCODING,
        );
      }

      const stillUnresolvedProd = prodDeps.filter(d => !depsToCQ.has(d));
      const transitiveProd = stillUnresolvedProd.filter(d => !isDirectPackage(d));

      const stillUnresolvedDev = devDeps.filter(d => !depsToCQ.has(d));
      const transitiveDev = stillUnresolvedDev.filter(d => !isDirectPackage(d));

      const allTransitive = [...transitiveProd, ...transitiveDev];
      if (allTransitive.length > 0) {
        if (!isCheck) {
          // Always write transitive deps to EXCLUDED in generate mode so that
          // subsequent runs can skip the ClearlyDefined API call for them.
          // Without this, every run re-queries the same transitive deps.
          this.appendTransitiveExcludes(paths.EXCLUDED_PROD_MD, transitiveProd, paths.ENCODING);
          this.appendTransitiveExcludes(paths.EXCLUDED_DEV_MD, transitiveDev, paths.ENCODING);
        }
        if (!isHarvest && !isCheck) {
          console.log(`\nNote: ${allTransitive.length} UNRESOLVED transitive dep(s) added to .deps/EXCLUDED.`);
          console.log('  Run with --recheck to re-query them from scratch.');
          console.log();
        } else if (isCheck) {
          const suggestion = 'Run without --check to persist them to .deps/EXCLUDED.';
          console.log(`\nNote: ${allTransitive.length} UNRESOLVED transitive dep(s) found. ${suggestion}`);
          console.log('  .deps/EXCLUDED should be updated with the next transitive deps:');
          allTransitive.forEach(d => console.log(`    - ${d}`));
          console.log();
        }
        // Suppress transitive deps from UNRESOLVED section and problems.md
        allTransitive.forEach(d => depsToCQ.set(d, 'transitive dependency'));
      }

      // Trigger harvest for DIRECT unresolved deps only (those that will
      // appear in problems.md). Transitive deps are excluded — they are
      // handled by EXCLUDED files and do not need ClearlyDefined to harvest.
      if (isHarvest && options?.harvestFn) {
        const directUnresolved = [
          ...stillUnresolvedProd.filter(d => isDirectPackage(d)),
          ...stillUnresolvedDev.filter(d => isDirectPackage(d)),
        ];
        if (directUnresolved.length > 0) {
          // Fire-and-forget: harvestFn is async but we don't await it so
          // the tool output is not blocked on harvest HTTP round-trips.
          void options.harvestFn([...new Set(directUnresolved)]).catch((err: unknown) => {
            logger.warn(`Harvest trigger failed: ${getErrorMessage(err)}`);
          });
        }
      }

      // Generate production dependencies document
      // Always write to TMP_DIR for comparison (entrypoint.sh handles copying to final destination)
      const prodDepsData = arrayToDocument('Production dependencies', prodDeps, depsToCQ, allDependencies);
      try {
        writeFileSync(paths.PROD_MD, prodDepsData, { encoding: paths.ENCODING as BufferEncoding });
        logger.success(`Generated ${paths.PROD_MD} (${prodDeps.length} dependencies)`);
      } catch (error) {
        const errorMsg = `Error writing prod.md to ${paths.PROD_MD}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger.error(errorMsg);
        writeFileSync(paths.PROBLEMS_MD, `# Dependency analysis\n\n${errorMsg}\n`, { encoding: paths.ENCODING as BufferEncoding });
        throw new Error(errorMsg);
      }

      // Generate development dependencies document
      // Always write to TMP_DIR for comparison (entrypoint.sh handles copying to final destination)
      const devDepsData = arrayToDocument('Development dependencies', devDeps, depsToCQ, allDependencies);
      try {
        writeFileSync(paths.DEV_MD, devDepsData, { encoding: paths.ENCODING as BufferEncoding });
        logger.success(`Generated ${paths.DEV_MD} (${devDeps.length} dependencies)`);
      } catch (error) {
        const errorMsg = `Error writing dev.md to ${paths.DEV_MD}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger.error(errorMsg);
        writeFileSync(paths.PROBLEMS_MD, `# Dependency analysis\n\n${errorMsg}\n`, { encoding: paths.ENCODING as BufferEncoding });
        throw new Error(errorMsg);
      }

      // Handle logs and problems
      // Always write to TMP_DIR (entrypoint.sh handles copying to final destination)
      const logs = getLogs();
      if (logs) {
        writeFileSync(paths.PROBLEMS_MD, `# Dependency analysis\n${logs}`, { encoding: paths.ENCODING as BufferEncoding });
        logger.warn('Dependency analysis found issues:');
        console.log(logs);
      } else if (existsSync(paths.PROBLEMS_MD)) {
        // Delete old problems.md in TMP_DIR if all checks passed and no issues found
        unlinkSync(paths.PROBLEMS_MD);
        logger.success('All checks passed. Removed old problems.md file.');
      }

      // Check for unresolved dependencies
      const unresolvedCount = getUnresolvedNumber();
      if (unresolvedCount > 0) {
        const errorMsg = `Found ${unresolvedCount} unresolved dependencies. See problems.md for details.`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error) {
      const errorMsg = `Error processing dependencies: ${error instanceof Error ? error.message : 'Unknown error'}`;
      logger.error(errorMsg);
      if (error instanceof Error && error.stack) {
        logger.debug(error.stack);
      }

      // Don't overwrite problems.md if this is the expected "unresolved dependencies" error
      // In that case, problems.md was already written correctly by getLogs()
      const isUnresolvedDepsError = error instanceof Error && error.message.startsWith('Found ') && error.message.includes('unresolved dependencies');

      if (!isUnresolvedDepsError) {
        try {
          writeFileSync(paths.PROBLEMS_MD, `# Dependency analysis\n\n${errorMsg}\n${error instanceof Error && error.stack ? error.stack : ''}\n`, { encoding: paths.ENCODING as BufferEncoding });
        } catch {
          // Ignore errors writing problems.md if we're already in error state
        }
      }
      throw error;
    }
  }

  /**
   * Validate required environment variables
   * @throws {Error} If required environment variables are missing
   */
  public static validateEnvironment(): void {
    const required = ['DEPS_COPY_DIR', 'ENCODING'];
    const missing = required.filter(env => !process.env[env]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  /**
   * Parse package identifier to extract name and version
   * @param identifier - Package identifier (e.g., 'package@1.0.0' or '@scope/package@1.0.0')
   * @returns Object with name and version properties
   */
  public static parsePackageIdentifier(identifier: string): PackageIdentifier {
    if (!identifier || typeof identifier !== 'string') {
      throw new Error('Package identifier must be a non-empty string');
    }

    const atIndex = identifier.lastIndexOf('@');
    if (atIndex === -1 || atIndex === 0) {
      throw new Error(`Invalid package identifier format: ${identifier}`);
    }

    return {
      name: identifier.substring(0, atIndex),
      version: identifier.substring(atIndex + 1)
    };
  }

  /**
   * Create package identifier from name and version
   * @param name - Package name
   * @param version - Package version
   * @returns Package identifier
   */
  public static createPackageIdentifier(name: string, version: string): string {
    if (!name || !version) {
      throw new Error('Both name and version must be provided');
    }
    return `${name}@${version}`;
  }
}

