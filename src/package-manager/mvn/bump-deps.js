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

const { join }  = require('path');
const { writeFileSync, existsSync, readFileSync } = require('fs');
const {
  getLogs,
  getUnresolvedNumber,
  parseExcludedFileData,
  parseDependenciesFile,
  arrayToDocument
} = require('../../document.js');

const DEPS_DIR = '.deps';
const TMP_DIR = `${DEPS_DIR}/tmp`;
const EXCLUSIONS_DIR = join(__dirname, `project/${DEPS_DIR}/EXCLUDED`);
const EXCLUDED_PROD_MD = `${EXCLUSIONS_DIR}/prod.md`;
const EXCLUDED_DEV_MD = `${EXCLUSIONS_DIR}/dev.md`;
const PROD_DEPENDENCIES = `${TMP_DIR}/PROD_DEPENDENCIES`;
const DEV_DEPENDENCIES = `${TMP_DIR}/DEV_DEPENDENCIES`;
const PROD_MD = `${TMP_DIR}/prod.md`;
const DEV_MD = `${TMP_DIR}/dev.md`;

const ENCODING = 'utf8';

const args = process.argv.slice(2);
let writeToDisk = true;
if (args[0] === '--check') {
  writeToDisk = false;
}

const prodDeps = new Map();
const prodLicenses = new Map();
// parse EXCLUDED_PROD_MD file if they exist
if (existsSync(EXCLUDED_PROD_MD)) {
  parseExcludedFileData(readFileSync(EXCLUDED_PROD_MD, ENCODING), prodDeps);
}
// parse PROD_DEPENDENCIES file
parseDependenciesFile(readFileSync(PROD_DEPENDENCIES, ENCODING), prodDeps, prodLicenses);
if (writeToDisk) {
  const prodArray = [];
  prodLicenses.forEach((value, key) => prodArray.push(key));
  const prodDepsData = arrayToDocument('Production dependencies', prodArray, prodDeps, prodLicenses);
  writeFileSync(PROD_MD, prodDepsData, ENCODING);
}

const devDeps = new Map();
const devLicenses = new Map();
// parse EXCLUDED_DEV_MD file if they exist
if (existsSync(EXCLUDED_DEV_MD)) {
  parseExcludedFileData(readFileSync(EXCLUDED_DEV_MD, ENCODING), devDeps);
}
// parse DEV_DEPENDENCIES file
parseDependenciesFile(readFileSync(DEV_DEPENDENCIES, ENCODING), devDeps, devLicenses);
if (writeToDisk) {
  const devArray = [];
  devLicenses.forEach((value, key) => devArray.push(key));
  const devDepsData = arrayToDocument('Development dependencies', devArray, devDeps, devLicenses);
  writeFileSync(DEV_MD, devDepsData, ENCODING);
}
// create a problems.md file if it needed
const logs = getLogs();
if (logs) {
  if (writeToDisk) {
    writeFileSync(`${TMP_DIR}/problems.md`, `# Dependency analysis\n${logs}`, ENCODING);
  }
  console.log(logs);
}
// exit if it has unresolved deps
if (getUnresolvedNumber() > 0) {
  process.exit(1);
}
