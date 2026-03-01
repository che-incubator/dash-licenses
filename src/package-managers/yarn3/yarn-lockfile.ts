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

import { parseSyml } from '@yarnpkg/parsers';
import { readFileSync, existsSync, readdirSync } from 'fs';
import * as path from 'path';

export interface YarnLockfileResult {
  /** All dependencies as name@version */
  all: string[];
  /** Production dependencies */
  prod: string[];
  /** Development dependencies */
  dev: string[];
}

interface LockfileEntry {
  resolution?: string;
  version?: string;
  dependencies?: Record<string, string>;
}

interface PackageJsonRoot {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
}

function toDescriptor(name: string, range: string): string {
  const r = range.startsWith('npm:') ? range : `npm:${range}`;
  return `${name}@${r}`;
}

/**
 * Parse Yarn Berry (2+) lockfile and package.json to separate prod vs dev dependencies.
 * No yarn-plugin-licenses required.
 */
export function parseYarnLockfile(projectDir: string): YarnLockfileResult {
  const lockPath = path.join(projectDir, 'yarn.lock');
  const pkgPath = path.join(projectDir, 'package.json');

  if (!existsSync(lockPath) || !existsSync(pkgPath)) {
    throw new Error('yarn.lock and package.json required');
  }

  const lockContent = readFileSync(lockPath, 'utf8');
  const raw = parseSyml(lockContent) as Record<string, LockfileEntry>;

  const entries = Object.entries(raw).filter(([k]) => k !== '__metadata');

  const resolutionMap = new Map<string, string>();
  for (const [key, entry] of entries) {
    const resolution =
      entry.resolution ||
      (entry.version ? key.split(',')[0].trim().replace(/@npm:[^@]+$/, `@npm:${entry.version}`) : null);
    if (resolution) {
      for (const d of key.split(',')) {
        resolutionMap.set(d.trim(), resolution);
      }
    }
  }

  const depGraph = new Map<string, string[]>();
  for (const [, entry] of entries) {
    const res = entry.resolution;
    if (!res || !entry.dependencies) continue;
    const deps: string[] = [];
    for (const [name, range] of Object.entries(entry.dependencies)) {
      const desc = toDescriptor(name, range);
      const resolved = resolutionMap.get(desc);
      if (resolved) deps.push(resolved);
    }
    depGraph.set(res, deps);
  }

  function resolve(descriptor: string): string | null {
    const r = resolutionMap.get(descriptor);
    return r || null;
  }

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as PackageJsonRoot;
  const rootProdDescriptors: string[] = [];
  const rootDevDescriptors: string[] = [];

  if (pkg.dependencies) {
    for (const [name, range] of Object.entries(pkg.dependencies)) {
      rootProdDescriptors.push(toDescriptor(name, range));
    }
  }
  if (pkg.devDependencies) {
    for (const [name, range] of Object.entries(pkg.devDependencies)) {
      rootDevDescriptors.push(toDescriptor(name, range));
    }
  }

  const wsPatterns =
    (Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages) || [];
  for (const pattern of wsPatterns) {
    const fullPath = path.join(projectDir, pattern);
    if (pattern.endsWith('/*')) {
      const parentDir = path.join(projectDir, pattern.slice(0, -2));
      if (!existsSync(parentDir)) continue;
      try {
        for (const item of readdirSync(parentDir, { withFileTypes: true })) {
          if (!item.isDirectory()) continue;
          const wsPkgPath = path.join(parentDir, item.name, 'package.json');
          if (existsSync(wsPkgPath)) {
            mergePackageDeps(wsPkgPath, rootProdDescriptors, rootDevDescriptors);
          }
        }
      } catch {
        // Skip
      }
    } else {
      const wsPkgPath = path.join(fullPath, 'package.json');
      if (existsSync(wsPkgPath)) {
        mergePackageDeps(wsPkgPath, rootProdDescriptors, rootDevDescriptors);
      }
    }
  }

  function mergePackageDeps(
    pkgPath: string,
    prod: string[],
    dev: string[]
  ): void {
    const wsPkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as PackageJsonRoot;
    if (wsPkg.dependencies) {
      for (const [name, range] of Object.entries(wsPkg.dependencies)) {
        prod.push(toDescriptor(name, range));
      }
    }
    if (wsPkg.devDependencies) {
      for (const [name, range] of Object.entries(wsPkg.devDependencies)) {
        dev.push(toDescriptor(name, range));
      }
    }
  }

  const prodSet = new Set<string>();
  const queue = rootProdDescriptors.map(resolve).filter(Boolean) as string[];
  queue.forEach(p => prodSet.add(p));
  let i = 0;
  while (i < queue.length) {
    const deps = depGraph.get(queue[i++]) || [];
    for (const d of deps) {
      const res = resolve(d) || (d.includes('@npm:') ? d : null);
      if (res && !prodSet.has(res)) {
        prodSet.add(res);
        queue.push(res);
      }
    }
  }

  // Get root resolutions for protection
  const rootProdSet = new Set(rootProdDescriptors.map(resolve).filter(Boolean) as string[]);

  const devSet = new Set<string>();
  const devQueue = rootDevDescriptors.map(resolve).filter(Boolean) as string[];
  for (const p of devQueue) {
    devSet.add(p);
    // Only remove from prod if it's NOT a direct root production dependency
    if (!rootProdSet.has(p)) {
      prodSet.delete(p);
    }
  }
  i = 0;
  while (i < devQueue.length) {
    const deps = depGraph.get(devQueue[i++]) || [];
    for (const d of deps) {
      const res = resolve(d) || (d.includes('@npm:') ? d : null);
      if (res && !devSet.has(res)) {
        devSet.add(res);
        // Only remove from prod if it's NOT a direct root production dependency
        if (!rootProdSet.has(res)) {
          prodSet.delete(res);
        }
        devQueue.push(res);
      }
    }
  }

  function toNameVersion(r: string): string {
    const m = r.match(/^(@?[^@]+)@npm:([^@]+)$/);
    if (m) return `${m[1]}@${m[2]}`;
    return r.replace(/@npm:/g, '@').replace(/@virtual:[^#]+#npm:/g, '@');
  }

  const allResolutions = new Set<string>();
  for (const [, entry] of entries) {
    if (entry.resolution?.includes('@npm:')) allResolutions.add(entry.resolution);
  }

  return {
    all: Array.from(allResolutions).map(toNameVersion).sort(),
    prod: Array.from(prodSet).map(toNameVersion).sort(),
    dev: Array.from(devSet).map(toNameVersion).sort()
  };
}
