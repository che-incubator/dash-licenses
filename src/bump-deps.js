/*
 * Copyright (c) 2018-2020 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

const { execSync } = require('child_process');
const { writeFileSync, existsSync, readFileSync, mkdirSync } = require('fs');

const args = process.argv.slice(2);
let writeToDisk = true;
if (args[0] === '--check') {
  writeToDisk = false;
}

const EXCLUDED_PROD_DEPENDENCIES = '.deps/EXCLUDED/prod.md';
const EXCLUDED_DEV_DEPENDENCIES = '.deps/EXCLUDED/dev.md';
const ALL_DEPENDENCIES = './TMP_DEPENDENCIES';
const PROD_PATH = '.deps/prod.md';
const DEV_PATH = '.deps/dev.md';
const TMP_DIR_PATH = '.deps/tmp'
const ENCODING = 'utf8';

const depsToCQ = new Map();
const allLicenses = new Map();

let logs = '';

if (writeToDisk && !existsSync('.deps')) {
  mkdirSync('.deps');
}
if (writeToDisk && !existsSync(TMP_DIR_PATH)) {
  mkdirSync(TMP_DIR_PATH);
}

// update excluded deps
function parseExcludedFileData(fileData, depsMap) {
  const pattern = /^\| `([^|^ ]+)` \| ([^|]+) \|$/gm;
  let result;
  while ((result = pattern.exec(fileData)) !== null) {
    depsMap.set(result[1], result[2])
  }
}

// update depsMap
function parseDependenciesFileData(fileData, depsMap) {
  const pattern = /^npm\/npmjs\/(-\/)?([^,]+)\/([0-9.]+), ([^,]+)?, approved, (\w+)$/gm;

  let unusedQuantity = 0;
  let result;
  if (depsMap.size) {
    logs += '\n### UNUSED Excludes';
  }
  while ((result = pattern.exec(fileData)) !== null) {
    const key = `${result[2]}@${result[3]}`;
    let cq = result[5]
    if (depsMap.has(key)) {
      logs += `\n${++unusedQuantity}. '${key}'`;
    } else {
      const cqNum = parseInt(cq.replace('CQ', ''), 10);
      if (cqNum) {
        cq = `[CQ${cqNum}](https://dev.eclipse.org/ipzilla/show_bug.cgi?id=${cqNum})`;
      }
      depsMap.set(key, cq);
    }
  }
  logs += '\n';
}

function bufferToArray(buffer) {
  if (!buffer || !buffer.data || !buffer.data.trees) {
    return [];
  }
  return buffer.data.trees.map(entry => entry.name).sort();
}

let globalUnresolvedNumber = 0;
function arrayToDocument(title, depsArray, depToCQ, allLicenses) {
  // document title
  let document = '### ' + title + '\n\n';
  // table header
  document += '| Packages | License | Resolved CQs |\n| --- | --- | --- |\n';
  logs += '\n### UNRESOLVED ' + title;
  let unresolvedQuantity = 0;
  // table body
  depsArray.forEach(item => {
    const license = allLicenses.has(item) ? allLicenses.get(item).License : '';
    let lib = `\`${item}\``;
    if (allLicenses.has(item) && allLicenses.get(item).URL) {
      lib = `[${lib}](${allLicenses.get(item).URL})`;
    }
    let cq = '';
    if (depToCQ.has(item)) {
      cq = depToCQ.get(item);
    } else {
      logs += `\n${++unresolvedQuantity}. '${item}'`;
      globalUnresolvedNumber++;
    }
    document += `| ${lib} | ${license} | ${cq} |\n`;
  });
  logs += '\n';

  return document;
}

// licenses buffer
const allLicensesBuffer = execSync('yarn licenses list --json --depth=0 --no-progress').toString();
const index = allLicensesBuffer.indexOf('{"type":"table"');
if (index !== -1) {
  const licenses = JSON.parse(allLicensesBuffer.substring(index));
  const { head, body } = licenses.data;
  body.forEach(libInfo => {
    allLicenses.set(`${libInfo[head.indexOf('Name')]}@${libInfo[head.indexOf('Version')]}`, {
      License: libInfo[head.indexOf('License')],
      URL: libInfo[head.indexOf('URL')] === 'Unknown' ? undefined : libInfo[head.indexOf('URL')]
    });
  })
}

let path = ALL_DEPENDENCIES;
if (!existsSync(ALL_DEPENDENCIES)) {
  path = path.replace('./', '.deps/tmp/');
}
if (existsSync(path)) {
  parseDependenciesFileData(readFileSync(path, ENCODING), depsToCQ);
}

// prod dependencies
const prodDepsBuffer = execSync('yarn list --json --prod --depth=0 --no-progress');
const prodDeps = bufferToArray(JSON.parse(prodDepsBuffer.toString()));

// all dependencies
const allDepsBuffer = execSync('yarn list --json --depth=0 --no-progress');
const allDeps = bufferToArray(JSON.parse(allDepsBuffer.toString()))

// dev dependencies
const devDeps = allDeps.filter(entry => prodDeps.includes(entry) === false);

if (existsSync(EXCLUDED_PROD_DEPENDENCIES)) {
  parseExcludedFileData(readFileSync(EXCLUDED_PROD_DEPENDENCIES, ENCODING), depsToCQ);
}

const prodDepsData = arrayToDocument('Production dependencies', prodDeps, depsToCQ, allLicenses);
if (writeToDisk) {
  writeFileSync(PROD_PATH, prodDepsData, ENCODING);
}

if (existsSync(EXCLUDED_DEV_DEPENDENCIES)) {
  parseExcludedFileData(readFileSync(EXCLUDED_DEV_DEPENDENCIES, ENCODING), depsToCQ);
}

const devDepsData = arrayToDocument('Development dependencies', devDeps, depsToCQ, allLicenses);
if (writeToDisk) {
  writeFileSync(DEV_PATH, devDepsData, ENCODING);
}

if (logs) {
  if (writeToDisk) {
    writeFileSync(`${TMP_DIR_PATH}/logs`, logs, ENCODING);
  }
  console.log(logs);
}
if (globalUnresolvedNumber) {
  process.exit(1);
}
