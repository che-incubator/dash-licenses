/*
 * Copyright (c) 2018-2024 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

const path = require('path');
const { existsSync, readFileSync, writeFileSync } = require('fs');

const DEPENDENCIES_INFO = path.join(process.env.TMP_DIR, 'dependencies-info.json');
const PACKAGE_LOCK_JSON = path.join(process.env.PROJECT_COPY_DIR, 'package-lock.json');

const allDeps = {
  dependencies: [],
  devDependencies: []
};

if (existsSync(PACKAGE_LOCK_JSON)) {
  const { packages } = JSON.parse(readFileSync(PACKAGE_LOCK_JSON).toString());
  Object.keys(packages).forEach(packageKey => {
    if (packageKey) {
      const _namesArr	 = packageKey.replace(/node_modules\//g, " ").trim().split(' ');
      const packageName = _namesArr[_namesArr.length - 1] + '@' + packages[packageKey].version;
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
