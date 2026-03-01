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
import { existsSync, readFileSync } from 'fs';

/**
 * Interface for package-lock.json structure
 */
interface PackageLockPackage {
  version: string;
  name?: string; // For npm aliases (e.g., "string-width-cjs": "npm:string-width@4.2.0")
  dev?: boolean;
  dependencies?: Record<string, string>;
}

interface PackageLockJson {
  packages: Record<string, PackageLockPackage>;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Interface for dependencies info output
 */
export interface AllDeps {
  dependencies: string[];
  devDependencies: string[];
}

/**
 * Parse npm package-lock.json and extract prod/dev dependencies
 */
export function parseNpmDependencies(projectDir: string = process.env.PROJECT_COPY_DIR ?? ''): AllDeps {
  const PACKAGE_LOCK_JSON = path.join(projectDir, 'package-lock.json');
  const PACKAGE_JSON = path.join(projectDir, 'package.json');

  const allDeps: AllDeps = {
    dependencies: [],
    devDependencies: []
  };

  if (!existsSync(PACKAGE_LOCK_JSON) || !existsSync(PACKAGE_JSON)) {
    return allDeps;
  }

  try {
  const packageLockContent = readFileSync(PACKAGE_LOCK_JSON, 'utf8');
  const packageJsonContent = readFileSync(PACKAGE_JSON, 'utf8');

  const { packages }: PackageLockJson = JSON.parse(packageLockContent);
  const packageJson: PackageJson = JSON.parse(packageJsonContent);

  // Build dependency graph: package path -> list of dependency paths
  const depGraph = new Map<string, string[]>();
  const pathToName = new Map<string, string>();

  Object.entries(packages).forEach(([packageKey, packageData]) => {
    if (!packageKey) return; // Skip root package

    // Use packageData.name for npm aliases, otherwise extract from path
    let pkgName: string;
    if (packageData.name) {
      // npm alias (e.g., "string-width-cjs": "npm:string-width@4.2.0")
      pkgName = packageData.name;
    } else {
      // Regular package - extract name from path
      const namesArr = packageKey.replace(/node_modules\//g, ' ').trim().split(' ');
      pkgName = namesArr[namesArr.length - 1];
    }
    const packageName = `${pkgName}@${packageData.version}`;
    pathToName.set(packageKey, packageName);

    // Build dependency edges
    if (packageData.dependencies) {
      const deps: string[] = [];
      Object.keys(packageData.dependencies).forEach(depName => {
        // Find the resolved path for this dependency
        const depPath = findDependencyPath(packageKey, depName, packages);
        if (depPath) {
          deps.push(depPath);
        }
      });
      if (deps.length > 0) {
        depGraph.set(packageKey, deps);
      }
    }
  });

  // Get root prod and dev dependencies
  const rootProdDeps: string[] = [];
  const rootDevDeps: string[] = [];

  if (packageJson.dependencies) {
    Object.keys(packageJson.dependencies).forEach(name => {
      const depPath = `node_modules/${name}`;
      if (packages[depPath]) {
        rootProdDeps.push(depPath);
      }
    });
  }

  if (packageJson.devDependencies) {
    Object.keys(packageJson.devDependencies).forEach(name => {
      const depPath = `node_modules/${name}`;
      if (packages[depPath]) {
        rootDevDeps.push(depPath);
      }
    });
  }

  // Traverse from prod dependencies
  const prodSet = new Set<string>();
  const prodQueue = [...rootProdDeps];
  prodQueue.forEach(p => prodSet.add(p));

  let i = 0;
  while (i < prodQueue.length) {
    const deps = depGraph.get(prodQueue[i++]) || [];
    for (const d of deps) {
      if (!prodSet.has(d)) {
        prodSet.add(d);
        prodQueue.push(d);
      }
    }
  }

  // Traverse from dev dependencies and override prod classification for transitive deps
  const devSet = new Set<string>();
  const devQueue = [...rootDevDeps];
  const rootProdSet = new Set(rootProdDeps);

  devQueue.forEach(p => {
    devSet.add(p);
    // Only remove from prod if it's NOT a direct root dependency
    if (!rootProdSet.has(p)) {
      prodSet.delete(p);
    }
  });

  i = 0;
  while (i < devQueue.length) {
    const deps = depGraph.get(devQueue[i++]) || [];
    for (const d of deps) {
      if (!devSet.has(d)) {
        devSet.add(d);
        // Only remove from prod if it's NOT a direct root dependency
        if (!rootProdSet.has(d)) {
          prodSet.delete(d);
        }
        devQueue.push(d);
      }
    }
  }

  // Convert paths back to names
  prodSet.forEach(pkgPath => {
    const name = pathToName.get(pkgPath);
    if (name) allDeps.dependencies.push(name);
  });

  devSet.forEach(pkgPath => {
    const name = pathToName.get(pkgPath);
    if (name) allDeps.devDependencies.push(name);
  });

  return allDeps;
  } catch (error) {
    console.error('Error parsing npm dependencies:', error);
    return allDeps;
  }
}

/**
 * Find the resolved path for a dependency within package-lock.json
 */
function findDependencyPath(
  parentPath: string,
  depName: string,
  packages: Record<string, PackageLockPackage>
): string | null {
  // Try direct child first
  const directPath = parentPath ? `${parentPath}/node_modules/${depName}` : `node_modules/${depName}`;
  if (packages[directPath]) {
    return directPath;
  }

  // Try hoisted to root
  const rootPath = `node_modules/${depName}`;
  if (packages[rootPath]) {
    return rootPath;
  }

  // Try walking up the tree (for nested node_modules)
  let currentPath = parentPath;
  while (currentPath.includes('node_modules')) {
    const parentDir = currentPath.substring(0, currentPath.lastIndexOf('/node_modules'));
    const hoistedPath = parentDir ? `${parentDir}/node_modules/${depName}` : `node_modules/${depName}`;
    if (packages[hoistedPath]) {
      return hoistedPath;
    }
    currentPath = parentDir;
  }

  return null;
}
