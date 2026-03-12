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

/**
 * License policy - SPDX-based approval/restriction.
 * Not Eclipse IP compliant: does not use Eclipse Foundation IP database.
 * See https://www.eclipse.org/legal/licenses/ for Eclipse approval reference.
 *
 * Approved: Common permissive licenses (MIT, Apache-2.0, BSD, ISC, EPL-2.0, etc.).
 * Restricted: GPL-family, unknown licenses. Maintain in sync with Eclipse expectations if desired.
 */
export const APPROVED_LICENSE_IDS = new Set([
  'MIT',
  'MIT-0',
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'EPL-2.0',
  'EPL-1.0',
  'CC0-1.0',
  'CC-BY-4.0', // Creative Commons Attribution - permissive for data/documentation
  'BSD-2-Clause-Views', // BSD-2-Clause variant with views clause - permissive
  'Unlicense',
  'Artistic-2.0',
  'BlueOak-1.0.0',
  'Python-2.0',
  'BSL-1.0',
  'AFL-2.1',
  'AFL-3.0'
]);

/** GPL-family and similar licenses that require review */
const RESTRICTED_PATTERNS = [
  /^GPL(-|\s)/i,
  /^AGPL(-|\s)/i,
  /^LGPL(-|\s)/i,
  /^GFDL/i,
  /^SSPL/i,
  /^Commons-Clause/i
];

/**
 * Check if a license expression (SPDX) is approved.
 *
 * OR: approved if ANY alternative is approved (consumer can choose).
 * AND: approved only if ALL components are approved.
 * Parentheses are stripped before evaluation.
 */
export function isLicenseApproved(expression: string): boolean {
  if (!expression || expression.trim() === 'NOASSERTION') {
    return false;
  }

  const cleaned = expression.replace(/[()]/g, '').trim();

  // Split top-level OR alternatives — approved if any branch is approved
  const orBranches = cleaned.split(/\s+OR\s+/i).map(s => s.trim());
  return orBranches.some(branch => isAndGroupApproved(branch));
}

/** All AND-joined license IDs must be individually approved. */
function isAndGroupApproved(branch: string): boolean {
  const parts = branch.split(/\s+AND\s+/i).map(s => s.trim());
  return parts.every(part => isSingleLicenseApproved(part));
}

function isSingleLicenseApproved(part: string): boolean {
  const [base] = part.split(/\s+WITH\s+/i);
  const licenseId = base?.trim() || part;

  if (RESTRICTED_PATTERNS.some(re => re.test(licenseId))) {
    if (/classpath-exception/i.test(part)) {
      return true;
    }
    return false;
  }

  return APPROVED_LICENSE_IDS.has(licenseId);
}
