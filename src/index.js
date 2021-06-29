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

const { readFileSync } = require('fs');

const DEPS_DIR = '.deps';
const TMP_DIR = `${DEPS_DIR}/tmp`;
const YARN_DEPS_INFO = `${TMP_DIR}/yarn-deps-info.json`;

// get all dependencies info using `yarn`
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

module.exports = {
  DEPS_DIR,
  TMP_DIR,
  YARN_DEPS_INFO,
};
