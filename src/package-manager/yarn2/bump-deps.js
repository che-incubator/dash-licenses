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
const { writeFileSync, existsSync, readFileSync } = require('fs');
const {
  getLogs,
  getUnresolvedNumber,
  parseExcludedFileData,
  parseDependenciesFile,
  arrayToDocument
} = require('../../document.js');

const ENCODING = process.env.ENCODING;
const DEPS_DIR = process.env.DEPS_COPY_DIR;

const TMP_DIR = path.join(DEPS_DIR, 'tmp');
const EXCLUSIONS_DIR = path.join(DEPS_DIR, 'EXCLUDED');
const PROD_MD = path.join(DEPS_DIR, 'prod.md');
const DEV_MD = path.join(DEPS_DIR, 'dev.md');
const PROBLEMS_MD = path.join(DEPS_DIR, 'problems.md');
const YARN_DEPS_INFO = path.join(TMP_DIR, 'yarn-deps-info.json');
const DEPENDENCIES = path.join(TMP_DIR, 'DEPENDENCIES');
const YARN_ALL_DEPS = path.join(TMP_DIR, 'yarn-all-deps.json');
const YARN_PROD_DEPS = path.join(TMP_DIR, 'yarn-prod-deps.json');

const EXCLUDED_PROD_MD = path.join(EXCLUSIONS_DIR, 'prod.md');
const EXCLUDED_DEV_MD = path.join(EXCLUSIONS_DIR, 'dev.md');

const depsToCQ = new Map();
const allDependencies = new Map();

const args = process.argv.slice(2);
let writeToDisk = true;
if (args[0] === '--check') {
  writeToDisk = false;
}

// get all dependencies info using `yarn`
const allDependenciesInfoStr = readFileSync(YARN_DEPS_INFO).toString();
const tableStartIndex = allDependenciesInfoStr.indexOf('{"type":"table"');
if (tableStartIndex !== -1) {
  const licenses = JSON.parse(allDependenciesInfoStr.substring(tableStartIndex));
  const { head, body } = licenses.data;
  body.forEach(libInfo => {
    allDependencies.set(`${libInfo[head.indexOf('Name')]}@${libInfo[head.indexOf('Version')]}`, {
      License: libInfo[head.indexOf('License')],
      URL: libInfo[head.indexOf('URL')] === 'Unknown' ? undefined : libInfo[head.indexOf('URL')]
    });
  })
}

if (existsSync(EXCLUDED_PROD_MD)) {
  parseExcludedFileData(readFileSync(EXCLUDED_PROD_MD, ENCODING), depsToCQ);
}

// parse DEPENDENCIES file
parseDependenciesFile(readFileSync(DEPENDENCIES, ENCODING), depsToCQ);

// list of prod dependencies names
const yarnProdDepsStr = readFileSync(YARN_PROD_DEPS).toString();
const yarnProdDepsTree = JSON.parse(yarnProdDepsStr);
const yarnProdDeps = extractDependencies(yarnProdDepsTree);

// list of all dependencies names
const yarnAllDepsStr = readFileSync(YARN_ALL_DEPS).toString();
const yarnAllDepsTree = JSON.parse(yarnAllDepsStr);
const yarnAllDeps = extractDependencies(yarnAllDepsTree);

// build list of development dependencies
const yarnDevDeps = yarnAllDeps.filter(entry => yarnProdDeps.includes(entry) === false);

const prodDepsData = arrayToDocument('Production dependencies', yarnProdDeps, depsToCQ, allDependencies);
if (writeToDisk) {
  writeFileSync(PROD_MD, prodDepsData, ENCODING);
}

if (existsSync(EXCLUDED_DEV_MD)) {
  parseExcludedFileData(readFileSync(EXCLUDED_DEV_MD, ENCODING), depsToCQ);
}

const devDepsData = arrayToDocument('Development dependencies', yarnDevDeps, depsToCQ, allDependencies);
if (writeToDisk) {
  writeFileSync(DEV_MD, devDepsData, ENCODING);
}

const logs = getLogs();
if (logs) {
  if (writeToDisk) {
    writeFileSync(PROBLEMS_MD, `# Dependency analysis\n${logs}`, ENCODING);
  }
  console.log(logs);
}

if (getUnresolvedNumber() > 0) {
  process.exit(1);
}

function extractDependencies(obj) {
  if (!obj || !obj.data || !obj.data.trees) {
    return [];
  }
  return obj.data.trees.map(entry => entry.name).sort();
}
