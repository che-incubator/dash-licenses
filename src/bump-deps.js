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
const { DEPS_DIR, TMP_DIR, YARN_DEPS_INFO } = require('./index');

const EXCLUSIONS_DIR = join(__dirname, `project/${DEPS_DIR}/EXCLUDED`);

const DEPENDENCIES = `${TMP_DIR}/DEPENDENCIES`;
const YARN_ALL_DEPS = `${TMP_DIR}/yarn-all-deps.json`;
const YARN_PROD_DEPS = `${TMP_DIR}/yarn-prod-deps.json`;

const EXCLUDED_PROD_MD = `${EXCLUSIONS_DIR}/prod.md`;
const EXCLUDED_DEV_MD = `${EXCLUSIONS_DIR}/dev.md`;
const PROD_MD = `${TMP_DIR}/prod.md`;
const DEV_MD = `${TMP_DIR}/dev.md`;

const ENCODING = 'utf8';

const depsToCQ = new Map();
const allDependencies = new Map();

let globalUnresolvedNumber = 0;
let logs = '';

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
const yarnProdDeps = extractYarnDependencies(yarnProdDepsTree);

// list of all dependencies names
const yarnAllDepsStr = readFileSync(YARN_ALL_DEPS).toString();
const yarnAllDepsTree = JSON.parse(yarnAllDepsStr);
const yarnAllDeps = extractYarnDependencies(yarnAllDepsTree);

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

if (logs) {
  if (writeToDisk) {
    writeFileSync(`${TMP_DIR}/problems.md`, `# Dependency analysis\n${logs}`, ENCODING);
  }
  console.log(logs);
}

if (globalUnresolvedNumber) {
  process.exit(1);
}

// update excluded deps
function parseExcludedFileData(fileData, depsMap) {
  const pattern = /^\| `([^|^ ]+)` \| ([^|]+) \|$/gm;
  let result;
  while ((result = pattern.exec(fileData)) !== null) {
    depsMap.set(result[1], result[2]);
  }
}

// update depsMap
function parseDependenciesFile(fileData, dependenciesMap) {
  let log = '';
  let numberUnusedExcludes = 0;
  if (dependenciesMap.size > 0) {
    log += '\n## UNUSED Excludes\n';
  }
  fileData.split(/\r?\n/)
    .map(line => line.split(/,\s/))
    .filter(lineData => {
      const [_cqIdentifier, _license, status, _approvedBy] = lineData;
      return status === 'approved';
    })
    .forEach(lineData => {
      const [cqIdentifier, _license, _status, approvedBy] = lineData;
      const [_npm, _npmjs, scope, name, version] = cqIdentifier.split('/');

      const npmIdentifier = scope === '-'
        ? `${name}@${version}`
        : `${scope}/${name}@${version}`;

      if (dependenciesMap.has(npmIdentifier)) {
        log += `\n${++numberUnusedExcludes}. \`${npmIdentifier}\``;
        return;
      }

      const approvalLink = approvedBy === 'clearlydefined'
        ? approvedBy
        : cqNumberToLink(approvedBy);
      dependenciesMap.set(npmIdentifier, approvalLink);
    });
  if (numberUnusedExcludes > 0) {
    logs += log + '\n';
  }
}
function cqNumberToLink(cqNumber) {
  const number = parseInt(cqNumber.replace('CQ', ''), 10);
  if (!number) {
    console.warn(`Warning: failed to parse CQ number from string: "${cqNumber}"`);
    return cqNumber;
  }
  return `[${cqNumber}](https://dev.eclipse.org/ipzilla/show_bug.cgi?id=${number})`;
}

function extractYarnDependencies(obj) {
  if (!obj || !obj.data || !obj.data.trees) {
    return [];
  }
  return obj.data.trees.map(entry => entry.name).sort();
}

function arrayToDocument(title, depsArray, depToCQ, allLicenses) {
  let log = '';
  // document title
  let document = '# ' + title + '\n\n';
  // table header
  document += '| Packages | License | Resolved CQs |\n| --- | --- | --- |\n';
  log += '\n## UNRESOLVED ' + title + '\n';
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
      log += `\n${++unresolvedQuantity}. \`${item}\``;
      globalUnresolvedNumber++;
    }
    document += `| ${lib} | ${license} | ${cq} |\n`;
  });
  if (unresolvedQuantity > 0) {
    logs += log +'\n';
  }

  return document;
}
