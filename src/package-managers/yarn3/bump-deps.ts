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
import { writeFileSync, existsSync, readFileSync } from 'fs';
import {
  getLogs,
  getUnresolvedNumber,
  parseExcludedFileData,
  parseDependenciesFile,
  arrayToDocument,
  LicenseInfo
} from '../../document';

interface YarnDependencyChildren {
  [key: string]: {
    children: {
      url?: string;
    };
  };
}

interface YarnDependencyLine {
  value: string;
  children: YarnDependencyChildren;
}

const ENCODING: BufferEncoding = (process.env.ENCODING as BufferEncoding) || 'utf8';
const DEPS_DIR: string = process.env.DEPS_COPY_DIR || '';

const TMP_DIR: string = path.join(DEPS_DIR, 'tmp');
const EXCLUSIONS_DIR: string = path.join(DEPS_DIR, 'EXCLUDED');
const PROD_MD: string = path.join(DEPS_DIR, 'prod.md');
const DEV_MD: string = path.join(DEPS_DIR, 'dev.md');
const PROBLEMS_MD: string = path.join(DEPS_DIR, 'problems.md');
const YARN_DEPS_INFO: string = path.join(TMP_DIR, 'yarn-deps-info.json');
const DEPENDENCIES: string = path.join(TMP_DIR, 'DEPENDENCIES');

// const YARN_ALL_DEPS = path.join(TMP_DIR, 'yarn-all-deps.json');
const YARN_PROD_DEPS: string = path.join(TMP_DIR, 'yarn-prod-deps.json');

const EXCLUDED_PROD_MD: string = path.join(EXCLUSIONS_DIR, 'prod.md');
const EXCLUDED_DEV_MD: string = path.join(EXCLUSIONS_DIR, 'dev.md');

const depsToCQ = new Map<string, string>();
const allDependencies = new Map<string, LicenseInfo>();

const args: string[] = process.argv.slice(2);
let writeToDisk: boolean = true;
if (args[0] === '--check') {
  writeToDisk = false;
}

// get all dependencies info using `yarn`
const allDependenciesInfo: string = readFileSync(YARN_DEPS_INFO).toString().trim();
(allDependenciesInfo.split('\n')).forEach((line: string) => {
  const { value, children }: YarnDependencyLine = JSON.parse(line);
  const keys: string[] = Object.keys(children);
  keys.filter((val: string) => val.includes('@npm:') || val.includes('@virtual:')).forEach((key: string) => {
    const key_: string = key
        .replace(/@npm:/g, '@')
        .replace(/@virtual:.+#npm:/g, '@');
    const url = children[key]?.children?.url;
    const licenseInfo: LicenseInfo = {
      License: value
    };
    if (url) {
      licenseInfo.URL = url;
    }
    allDependencies.set(key_, licenseInfo);
  });
});

if (existsSync(EXCLUDED_PROD_MD)) {
  parseExcludedFileData(readFileSync(EXCLUDED_PROD_MD, { encoding: ENCODING }), depsToCQ);
}

// parse DEPENDENCIES file - pass allDependencies to update license info and approval status
parseDependenciesFile(readFileSync(DEPENDENCIES, { encoding: ENCODING }), depsToCQ, allDependencies);

// list of prod dependencies names
const yarnProdDepsInfo: string[] = readFileSync(YARN_PROD_DEPS).toString().trim().split('\n');
const yarnProdDeps: string[] = extractDependencies(yarnProdDepsInfo);

// list of all dependencies names
const yarnAllDeps: string[] = [];
allDependencies.forEach((_value: LicenseInfo, key: string) => {
  yarnAllDeps.push(key);
});
yarnAllDeps.sort();

// build list of development dependencies
const yarnDevDeps: string[] = yarnAllDeps.filter((entry: string) => !yarnProdDeps.includes(entry));

const prodDepsData: string = arrayToDocument('Production dependencies', yarnProdDeps, depsToCQ, allDependencies);
if (writeToDisk) {
  writeFileSync(PROD_MD, prodDepsData, { encoding: ENCODING });
}

if (existsSync(EXCLUDED_DEV_MD)) {
  parseExcludedFileData(readFileSync(EXCLUDED_DEV_MD, { encoding: ENCODING }), depsToCQ);
}

const devDepsData: string = arrayToDocument('Development dependencies', yarnDevDeps, depsToCQ, allDependencies);
if (writeToDisk) {
  writeFileSync(DEV_MD, devDepsData, { encoding: ENCODING });
}

const logs: string | null = getLogs();
if (logs) {
  if (writeToDisk) {
    writeFileSync(PROBLEMS_MD, `# Dependency analysis\n${logs}`, { encoding: ENCODING });
  }
  console.log(logs);
}

if (getUnresolvedNumber() > 0) {
  process.exit(1);
}

function extractDependencies(dependenciesInfo: string[]): string[] {
  const allDependencies: string[] = [];
  (dependenciesInfo).forEach((line: string) => {
    const { children }: { children: YarnDependencyChildren } = JSON.parse(line);
    const keys: string[] = Object.keys(children);
    keys.filter((val: string) => val.includes('@npm:') || val.includes('@virtual:')).forEach((key: string) => {
      const key_: string = key
          .replace(/@npm:/g, '@')
          .replace(/@virtual:.+#npm:/g, '@');
      allDependencies.push(key_);
    });
  });

  return allDependencies;
}
