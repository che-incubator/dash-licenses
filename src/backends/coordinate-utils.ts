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
 * Convert various dependency formats to ClearlyDefined IDs.
 * See https://docs.clearlydefined.io/
 */

/** Check if input is already a ClearlyDefined ID (npm format) */
export function isClearlyDefinedId(input: string): boolean {
  return /^npm\/npmjs\/.+\/.+\/.+/.test(input.trim());
}

/**
 * NPM conversion: lodash@4.17.21 -> npm/npmjs/-/lodash/4.17.21
 * @scope/pkg@1.0.0 -> npm/npmjs/@scope/pkg/1.0.0
 */
export function npmToClearlyDefinedIdSimple(input: string): string {
  const trimmed = input.trim();
  const atIdx = trimmed.lastIndexOf('@');
  if (atIdx <= 0) {
    throw new Error(`Invalid npm identifier: ${input}`);
  }
  const beforeAt = trimmed.substring(0, atIdx);
  const version = trimmed.substring(atIdx + 1);
  if (beforeAt.startsWith('@')) {
    return `npm/npmjs/${beforeAt}/${version}`;
  }
  return `npm/npmjs/-/${beforeAt}/${version}`;
}

/**
 * Convert input to ClearlyDefined ID. Supports npm format only (name@version).
 */
export function toClearlyDefinedId(input: string): string {
  const trimmed = input.trim();
  if (isClearlyDefinedId(trimmed)) {
    return trimmed;
  }
  return npmToClearlyDefinedIdSimple(trimmed);
}
