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

/** Result for a single dependency from a license backend */
export interface DepResult {
  /** ClearlyDefined ID (e.g. npm/npmjs/-/lodash/4.17.21) */
  id: string;
  /** License expression (SPDX) */
  license: string;
  /** approved | restricted */
  status: 'approved' | 'restricted';
  /** Source (e.g. clearlydefined) */
  source: string;
}

/** Backend that resolves licenses for dependency identifiers */
export interface LicenseBackend {
  /** Process a batch of dependencies and return results in DEPENDENCIES format (one line per dependency) */
  processBatch(deps: string[], outputFile?: string): Promise<string[]>;
}
