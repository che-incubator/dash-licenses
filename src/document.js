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

let logs = '';
function getLogs() {
  return logs;
}

let unresolvedNumber = 0;
function  getUnresolvedNumber() {
  return unresolvedNumber;
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
function parseDependenciesFile(fileData, dependenciesMap, allLicenses) {
  let log = '';
  let numberUnusedExcludes = 0;
  if (dependenciesMap.size > 0) {
    log += '\n## UNUSED Excludes\n';
  }
  const deps = fileData.split(/\r?\n/).filter(lineData => !!lineData).map(line => line.split(/,\s?/));
  if (allLicenses) {
    deps.forEach(lineData => {
      const [cqIdentifier, license] = lineData;
      const [ , , scope, name, version] = cqIdentifier.split('/');

      const identifier = scope === '-'
          ? `${name}@${version}`
          : `${scope}/${name}@${version}`;
      allLicenses.set(identifier, { License: license ? license : '-' });
    });
  }
  deps.filter(lineData => {
      const [ , , status, ] = lineData;
      return status === 'approved';
    })
    .forEach(lineData => {
      const [cqIdentifier, , , approvedBy] = lineData;
      const [ , , scope, name, version] = cqIdentifier.split('/');

      const identifier = scope === '-'
        ? `${name}@${version}`
        : `${scope}/${name}@${version}`;

      if (dependenciesMap.has(identifier)) {
        log += `\n${++numberUnusedExcludes}. \`${identifier}\``;
        return;
      }

      const approvalLink = approvedBy === 'clearlydefined'
        ? approvedBy
        : cqNumberToLink(approvedBy);
      dependenciesMap.set(identifier, approvalLink);
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

// create output document
function arrayToDocument(title, depsArray, depToCQ, allLicenses) {
  let log = '';
  // document title
  let document = '# ' + title + '\n\n';
  // table header
  document += '| Packages | License | Resolved CQs |\n| --- | --- | --- |\n';
  log += '\n## UNRESOLVED ' + title + '\n';
  let unresolvedQuantity = 0;
  // table body
  depsArray.sort().forEach(item => {
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
      unresolvedNumber++;
    }
    document += `| ${lib} | ${license} | ${cq} |\n`;
  });
  if (unresolvedQuantity > 0) {
    logs += log +'\n';
  }

  return document;
}

module.exports = {
  getLogs,
  getUnresolvedNumber,
  parseExcludedFileData,
  parseDependenciesFile,
  arrayToDocument
};
