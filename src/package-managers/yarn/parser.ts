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

import { readFileSync, existsSync } from 'fs';
import * as path from 'path';

interface YarnLicenseTable {
  type: string;
  data: {
    head: string[];
    body: string[][];
  };
}

/**
 * Parse yarn dependencies info file and return list of package@version strings
 */
export function parseYarnDependencies(tmpDir: string = process.env.TMP_DIR || ''): string[] {
  const dependencies: string[] = [];
  const YARN_DEPS_INFO = path.join(tmpDir, 'yarn-deps-info.json');

  if (!existsSync(YARN_DEPS_INFO)) {
    return dependencies;
  }

  const allDependenciesInfoStr: string = readFileSync(YARN_DEPS_INFO).toString();
  const tableStartIndex: number = allDependenciesInfoStr.indexOf('{"type":"table"');

  if (tableStartIndex !== -1) {
    const licenses: YarnLicenseTable = JSON.parse(allDependenciesInfoStr.substring(tableStartIndex));
    const { head, body } = licenses.data;
    body.forEach((libInfo: string[]) => {
      const libName: string = libInfo[head.indexOf('Name')];
      const libVersion: string = libInfo[head.indexOf('Version')];
      dependencies.push(`${libName}@${libVersion}`);
    });
  }

  return dependencies;
}
