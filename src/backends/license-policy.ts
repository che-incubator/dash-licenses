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
 * Handles AND, OR, WITH expressions - all components must be acceptable.
 */
export function isLicenseApproved(expression: string): boolean {
  if (!expression || expression.trim() === 'NOASSERTION') {
    return false;
  }

  // Split by AND/OR - for approval, we require no restricted components
  const parts = expression
    .split(/\s+(?:AND|OR)\s+/i)
    .map(p => p.replace(/\s*\([^)]*\)\s*/, '').trim());

  for (const part of parts) {
    // Handle "X WITH Classpath-exception-2.0" - LGPL with exception is often OK
    const [base, _with] = part.split(/\s+WITH\s+/i);
    const licenseId = base?.trim() || part;

    if (RESTRICTED_PATTERNS.some(re => re.test(licenseId))) {
      // GPL with Classpath-exception is commonly approved
      if (/_with_classpath_exception|classpath-exception/i.test(part)) {
        continue;
      }
      return false;
    }

    if (!APPROVED_LICENSE_IDS.has(licenseId) && !isApprovedCompound(licenseId)) {
      // Unknown license - treat as restricted (needs review)
      return false;
    }
  }

  return true;
}

function isApprovedCompound(licenseId: string): boolean {
  // Allow compound like "Apache-2.0 AND MIT" - each part checked above
  return /\s+(?:AND|OR)\s+/i.test(licenseId);
}
