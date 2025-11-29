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
import { existsSync, readFileSync, writeFileSync } from 'fs';

/**
 * Interface for package-lock.json structure
 */
interface PackageLockPackage {
  version: string;
  dev?: boolean;
}

interface PackageLockJson {
  packages: Record<string, PackageLockPackage>;
}

/**
 * Interface for dependencies info output
 */
interface AllDeps {
  dependencies: string[];
  devDependencies: string[];
}

const DEPENDENCIES_INFO = path.join(process.env.TMP_DIR ?? '', 'dependencies-info.json');
const PACKAGE_LOCK_JSON = path.join(process.env.PROJECT_COPY_DIR ?? '', 'package-lock.json');

const allDeps: AllDeps = {
  dependencies: [],
  devDependencies: []
};

if (existsSync(PACKAGE_LOCK_JSON)) {
  const packageLockContent = readFileSync(PACKAGE_LOCK_JSON, 'utf8');
  const { packages }: PackageLockJson = JSON.parse(packageLockContent);
  
  Object.keys(packages).forEach(packageKey => {
    if (packageKey) {
      const namesArr = packageKey.replace(/node_modules\//g, ' ').trim().split(' ');
      const packageName = `${namesArr[namesArr.length - 1]}@${packages[packageKey].version}`;
      
      if (packages[packageKey].dev === true) {
        allDeps.devDependencies.push(packageName);
      } else {
        allDeps.dependencies.push(packageName);
      }
    }
  });
  
  writeFileSync(DEPENDENCIES_INFO, JSON.stringify(allDeps, null, 2));
  console.log([...allDeps.dependencies, ...allDeps.devDependencies].join('\n'));
}
