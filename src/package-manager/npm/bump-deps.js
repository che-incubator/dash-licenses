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
const DEPENDENCIES = path.join(TMP_DIR, 'DEPENDENCIES');
const DEPENDENCIES_INFO = path.join(TMP_DIR, 'dependencies-info.json');
const EXCLUDED_PROD_MD = path.join(EXCLUSIONS_DIR, 'prod.md');
const EXCLUDED_DEV_MD = path.join(EXCLUSIONS_DIR, 'dev.md');


const depsToCQ = new Map();
const allDependencies = new Map();

const args = process.argv.slice(2);
let writeToDisk = true;
if (args[0] === '--check') {
  writeToDisk = false;
}

// get dependencies info
const depsInfo = JSON.parse(readFileSync(DEPENDENCIES_INFO));
const prodDeps = depsInfo.dependencies;
const devDeps = depsInfo.devDependencies;
const allDeps = [...prodDeps, ...devDeps];
allDeps.forEach(lib => allDependencies.set(lib, {}));

if (existsSync(EXCLUDED_PROD_MD)) {
  parseExcludedFileData(readFileSync(EXCLUDED_PROD_MD, ENCODING), depsToCQ);
}

// parse DEPENDENCIES file
const dependenciesStr = readFileSync(DEPENDENCIES, ENCODING);
parseDependenciesFile(dependenciesStr, depsToCQ, allDependencies);

// process.exit(1);

const prodDepsData = arrayToDocument('Production dependencies', prodDeps, depsToCQ, allDependencies);
if (writeToDisk) {
  writeFileSync(PROD_MD, prodDepsData, ENCODING);
}

if (existsSync(EXCLUDED_DEV_MD)) {
  parseExcludedFileData(readFileSync(EXCLUDED_DEV_MD, ENCODING), depsToCQ);
}

const devDepsData = arrayToDocument('Development dependencies', devDeps, depsToCQ, allDependencies);

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
