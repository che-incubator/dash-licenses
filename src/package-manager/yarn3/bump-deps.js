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
const YARN_DEPS_INFO = path.join(TMP_DIR, 'yarn-deps-info.json');
const DEPENDENCIES = path.join(TMP_DIR, 'DEPENDENCIES');

// const YARN_ALL_DEPS = path.join(TMP_DIR, 'yarn-all-deps.json');
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
const allDependenciesInfo = readFileSync(YARN_DEPS_INFO).toString().trim();
(allDependenciesInfo.split('\n')).forEach(line => {
  const { value, children } = JSON.parse(line);
  const keys = Object.keys(children);
  keys.filter(val => val.includes('@npm:') | val.includes('@virtual:')).forEach(key => {
    const key_ = key
        .replace(/@npm:/g, '@')
        .replace(/@virtual:.+#npm:/g, '@');
    allDependencies.set(key_, { License: value, URL: children[key]['children']['url'] });
  });
})

if (existsSync(EXCLUDED_PROD_MD)) {
  parseExcludedFileData(readFileSync(EXCLUDED_PROD_MD, ENCODING), depsToCQ);
}

// parse DEPENDENCIES file
parseDependenciesFile(readFileSync(DEPENDENCIES, ENCODING), depsToCQ);

// list of prod dependencies names
const yarnProdDepsInfo = readFileSync(YARN_PROD_DEPS).toString().trim().split('\n');
const yarnProdDeps = extractDependencies(yarnProdDepsInfo);

// list of all dependencies names
const yarnAllDeps = [];
allDependencies.forEach((value, key) => {
  yarnAllDeps.push(key);
});
yarnAllDeps.sort();

// build list of development dependencies
const yarnDevDeps = yarnAllDeps.filter(entry => !yarnProdDeps.includes(entry));

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

function extractDependencies(dependenciesInfo) {
  const allDependencies = [];
  (dependenciesInfo).forEach(line => {
    const {children} = JSON.parse(line);
    const keys = Object.keys(children);
    keys.filter(val => val.includes('@npm:') | val.includes('@virtual:')).forEach(key => {
      const key_ = key
          .replace(/@npm:/g, '@')
          .replace(/@virtual:.+#npm:/g, '@');
      allDependencies.push(key_);
    });
  })

  return allDependencies;
}
