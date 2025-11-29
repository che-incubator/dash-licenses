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

interface YarnTreeEntry {
  name: string;
}

interface YarnTreeData {
  data: {
    trees: YarnTreeEntry[];
  };
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
const YARN_ALL_DEPS: string = path.join(TMP_DIR, 'yarn-all-deps.json');
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
const allDependenciesInfoStr: string = readFileSync(YARN_DEPS_INFO).toString();
const tableStartIndex: number = allDependenciesInfoStr.indexOf('{"type":"table"');
if (tableStartIndex !== -1) {
  const licenses = JSON.parse(allDependenciesInfoStr.substring(tableStartIndex));
  const { head, body } = licenses.data;
  body.forEach((libInfo: string[]) => {
    const url = libInfo[head.indexOf('URL')];
    const licenseInfo: LicenseInfo = {
      License: libInfo[head.indexOf('License')]
    };
    if (url !== 'Unknown') {
      licenseInfo.URL = url;
    }
    allDependencies.set(`${libInfo[head.indexOf('Name')]}@${libInfo[head.indexOf('Version')]}`, licenseInfo);
  });
}

if (existsSync(EXCLUDED_PROD_MD)) {
  parseExcludedFileData(readFileSync(EXCLUDED_PROD_MD, { encoding: ENCODING }), depsToCQ);
}

// parse DEPENDENCIES file - pass allDependencies to update license info and approval status
parseDependenciesFile(readFileSync(DEPENDENCIES, { encoding: ENCODING }), depsToCQ, allDependencies);

// list of prod dependencies names
const yarnProdDepsStr: string = readFileSync(YARN_PROD_DEPS).toString();
const yarnProdDepsTree: YarnTreeData = JSON.parse(yarnProdDepsStr);
const yarnProdDeps: string[] = extractDependencies(yarnProdDepsTree);

// list of all dependencies names
const yarnAllDepsStr: string = readFileSync(YARN_ALL_DEPS).toString();
const yarnAllDepsTree: YarnTreeData = JSON.parse(yarnAllDepsStr);
const yarnAllDeps: string[] = extractDependencies(yarnAllDepsTree);

// build list of development dependencies
const yarnDevDeps: string[] = yarnAllDeps.filter(entry => yarnProdDeps.includes(entry) === false);

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

function extractDependencies(obj: YarnTreeData): string[] {
  if (!obj || !obj.data || !obj.data.trees) {
    return [];
  }
  // Transform @npm: to @ to match DEPENDENCIES file format
  return obj.data.trees.map(entry => entry.name.replace(/@npm:/g, '@')).sort();
}
