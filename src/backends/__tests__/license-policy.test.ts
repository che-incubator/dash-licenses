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

import { isLicenseApproved } from '../license-policy';

describe('license-policy', () => {
  describe('isLicenseApproved', () => {
    it('approves MIT', () => {
      expect(isLicenseApproved('MIT')).toBe(true);
    });

    it('approves Apache-2.0', () => {
      expect(isLicenseApproved('Apache-2.0')).toBe(true);
    });

    it('approves BSD-2-Clause and BSD-3-Clause', () => {
      expect(isLicenseApproved('BSD-2-Clause')).toBe(true);
      expect(isLicenseApproved('BSD-3-Clause')).toBe(true);
    });

    it('approves compound MIT AND BSD-2-Clause', () => {
      expect(isLicenseApproved('MIT AND BSD-2-Clause')).toBe(true);
    });

    it('approves CC0-1.0 AND MIT', () => {
      expect(isLicenseApproved('CC0-1.0 AND MIT')).toBe(true);
    });

    it('restricts GPL-2.0', () => {
      expect(isLicenseApproved('GPL-2.0')).toBe(false);
    });

    it('restricts AGPL-3.0', () => {
      expect(isLicenseApproved('AGPL-3.0')).toBe(false);
    });

    it('restricts empty or NOASSERTION', () => {
      expect(isLicenseApproved('')).toBe(false);
      expect(isLicenseApproved('NOASSERTION')).toBe(false);
    });

    it('restricts unknown licenses', () => {
      expect(isLicenseApproved('Custom-Proprietary')).toBe(false);
    });
  });
});
