/*
 * Copyright (c) 2018-2021 Red Hat, Inc.
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
const { existsSync, readFileSync } = require('fs');

const TMP_DIR = process.env.TMP_DIR;
const YARN_DEPS_INFO = path.join(TMP_DIR, 'yarn-deps-info.json');

if (existsSync(YARN_DEPS_INFO)) {
  // get all dependencies info
  const allDependenciesInfoStr = readFileSync(YARN_DEPS_INFO).toString();
  const tableStartIndex = allDependenciesInfoStr.indexOf('{"type":"table"');
  if (tableStartIndex !== -1) {
    const licenses = JSON.parse(allDependenciesInfoStr.substring(tableStartIndex));
    const { head, body } = licenses.data;
    body.forEach(libInfo => {
      const libName = libInfo[head.indexOf('Name')];
      const libVersion = libInfo[head.indexOf('Version')];
      console.log(`${libName}@${libVersion}\n`)
    });
  }
}
