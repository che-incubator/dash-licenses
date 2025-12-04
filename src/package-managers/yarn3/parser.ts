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

import { existsSync, readFileSync } from 'fs';

const [YARN_DEPS_INFO]: string[] = process.argv.slice(2);

(function (): void {
  if (existsSync(YARN_DEPS_INFO)) {
    // get all dependencies info
    const allDependencies: string = readFileSync(YARN_DEPS_INFO).toString();
    if (allDependencies.length > 0) {
      const licenses: string = allDependencies
          .replace(/"/g, '')
          .replace(/.+[^(@npm)]:.+/g, '')
          .replace(/@npm:/g, '@')
          .replace(/\n{1,}/g, '\n');
      console.log(licenses);
    }
  }
}());
