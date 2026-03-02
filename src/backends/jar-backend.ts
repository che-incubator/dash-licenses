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

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import type { LicenseBackend } from './types';

/**
 * JAR backend - invokes Eclipse dash-licenses JAR via java -jar.
 * Uses Eclipse Foundation IP database + ClearlyDefined (Eclipse IP compliant).
 */
export class JarBackend implements LicenseBackend {
  constructor(
    private readonly jarPath: string,
    private readonly batchSize: number,
    private readonly debug?: boolean
  ) {}

  async processBatch(deps: string[]): Promise<string[]> {
    const outPath = `jar-out-${process.pid}-${Date.now()}.tmp`;
    const tempInputFile = `${outPath}.input.tmp`;
    try {
      writeFileSync(tempInputFile, deps.join('\n') + '\n', 'utf8');
      const command = `cat "${tempInputFile}" | java -jar ${this.jarPath} -batch "${this.batchSize}" -summary "${outPath}" -`;
      execSync(command, {
        stdio: this.debug ? 'inherit' : 'pipe',
        maxBuffer: 10 * 1024 * 1024
      });
      if (existsSync(outPath)) {
        const content = readFileSync(outPath, 'utf8');
        return content
          .split('\n')
          .map(l => l.trim())
          .filter(l => l.length > 0);
      }
      return [];
    } finally {
      if (existsSync(tempInputFile)) try { unlinkSync(tempInputFile); } catch { /* ignore */ }
      if (existsSync(outPath)) try { unlinkSync(outPath); } catch { /* ignore */ }
    }
  }
}
