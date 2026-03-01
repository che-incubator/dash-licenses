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

import { parseYarnLockfile } from '../yarn-lockfile';
import * as path from 'path';
import * as fs from 'fs';

describe('yarn-lockfile', () => {

  describe('parseYarnLockfile', () => {
    it('should throw when yarn.lock missing', () => {
      const emptyDir = path.join(__dirname, '__tmp_empty');
      fs.mkdirSync(emptyDir, { recursive: true });
      fs.writeFileSync(path.join(emptyDir, 'package.json'), '{}');
      expect(() => parseYarnLockfile(emptyDir)).toThrow('yarn.lock');
      fs.rmSync(emptyDir, { recursive: true });
    });

    it('should throw when package.json missing', () => {
      const dir = path.join(__dirname, '__tmp_no_pkg');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'yarn.lock'),
        `__metadata:
  version: 8
"lodash@npm:^4.0.0":
  version: 4.17.21
  resolution: "lodash@npm:4.17.21"
`
      );
      expect(() => parseYarnLockfile(dir)).toThrow('package.json');
      fs.rmSync(dir, { recursive: true });
    });

    it('should parse simple lockfile and separate prod vs dev', () => {
      const dir = path.join(__dirname, '__tmp_simple');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'yarn.lock'),
        `__metadata:
  version: 8

"lodash@npm:^4.0.0":
  version: 4.17.21
  resolution: "lodash@npm:4.17.21"

"jest@npm:^29.0.0":
  version: 29.0.0
  resolution: "jest@npm:29.0.0"
`
      );
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({
          dependencies: { lodash: '^4.0.0' },
          devDependencies: { jest: '^29.0.0' }
        })
      );

      const result = parseYarnLockfile(dir);
      expect(result.all).toContain('lodash@4.17.21');
      expect(result.all).toContain('jest@29.0.0');
      expect(result.prod).toContain('lodash@4.17.21');
      expect(result.dev).toContain('jest@29.0.0');
      expect(result.prod).not.toContain('jest@29.0.0');
      expect(result.dev).not.toContain('lodash@4.17.21');

      fs.rmSync(dir, { recursive: true });
    });
  });
});
