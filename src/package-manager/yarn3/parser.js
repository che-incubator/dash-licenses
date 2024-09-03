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

const { existsSync, readFileSync } = require('fs');

const [YARN_DEPS_INFO] = process.argv.slice(2);

(function () {
  if (existsSync(YARN_DEPS_INFO)) {
    // get all dependencies info
    const allDependencies = readFileSync(YARN_DEPS_INFO).toString();
    if (allDependencies.length > 0) {
      const licenses = allDependencies
          .replace(/"/g, '')
          .replace(/.+[^(@npm)]:.+/g, '')
          .replace(/@npm:/g, '@')
          .replace(/\n{1,}/g, '\n');
      console.log(licenses);
    }
  }
}());

