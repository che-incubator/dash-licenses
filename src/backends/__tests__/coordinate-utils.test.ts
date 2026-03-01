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

import {
  toClearlyDefinedId,
  npmToClearlyDefinedIdSimple,
  isClearlyDefinedId
} from '../coordinate-utils';

describe('coordinate-utils', () => {
  describe('npmToClearlyDefinedIdSimple', () => {
    it('converts lodash@4.17.21 to npm/npmjs/-/lodash/4.17.21', () => {
      expect(npmToClearlyDefinedIdSimple('lodash@4.17.21')).toBe(
        'npm/npmjs/-/lodash/4.17.21'
      );
    });

    it('converts @babel/core@7.0.0 to npm/npmjs/@babel/core/7.0.0', () => {
      expect(npmToClearlyDefinedIdSimple('@babel/core@7.0.0')).toBe(
        'npm/npmjs/@babel/core/7.0.0'
      );
    });

    it('throws for invalid format', () => {
      expect(() => npmToClearlyDefinedIdSimple('invalid')).toThrow();
      expect(() => npmToClearlyDefinedIdSimple('@onlyscope')).toThrow();
    });
  });

  describe('toClearlyDefinedId', () => {
    it('returns ClearlyDefined ID as-is', () => {
      const id = 'npm/npmjs/-/lodash/4.17.21';
      expect(toClearlyDefinedId(id)).toBe(id);
    });

    it('converts npm identifier', () => {
      expect(toClearlyDefinedId('lodash@4.17.21')).toBe(
        'npm/npmjs/-/lodash/4.17.21'
      );
    });
  });

  describe('isClearlyDefinedId', () => {
    it('returns true for npm ID', () => {
      expect(isClearlyDefinedId('npm/npmjs/-/lodash/4.17.21')).toBe(true);
    });
    it('returns false for name@version', () => {
      expect(isClearlyDefinedId('lodash@4.17.21')).toBe(false);
    });
  });
});
