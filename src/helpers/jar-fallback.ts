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

import { execFileSync } from 'child_process';
import * as path from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import type { DependencyMap } from './types';
import { logger } from './logger';

/** Parse DEPENDENCIES line to identifier (pkg@version) and approvedBy, or null if not approved */
function parseApprovedLine(line: string): { identifier: string; approvedBy: string } | null {
  const parts = line.split(/,\s*/);
  if (parts.length < 4) return null;
  const [, , status, approvedBy] = parts;
  if (status !== 'approved' || !approvedBy) return null;
  const cqIdentifier = parts[0];
  const pathParts = cqIdentifier.split('/');
  const offset = pathParts[0] === 'cq' ? 1 : 0;
  const scopeOrDashIndex = 2 + offset;
  if (pathParts.length < 5) return null;
  let identifier: string;
  if (pathParts[scopeOrDashIndex]?.startsWith('@')) {
    const scope = pathParts[scopeOrDashIndex];
    const name = pathParts[scopeOrDashIndex + 1];
    const version = pathParts[scopeOrDashIndex + 2];
    identifier = `${scope}/${name}@${version}`;
  } else {
    const name = pathParts[scopeOrDashIndex + 1];
    const version = pathParts[scopeOrDashIndex + 2];
    identifier = `${name}@${version}`;
  }
  return { identifier, approvedBy: approvedBy.trim() };
}

/** Format CQ value for EXCLUDED markdown (clearlydefined link or plain CQ id) */
function formatCQ(approvedBy: string, identifier: string): string {
  if (approvedBy.toLowerCase() === 'clearlydefined') {
    const atIdx = identifier.lastIndexOf('@');
    const version = identifier.substring(atIdx + 1);
    const namePart = identifier.substring(0, atIdx);
    if (namePart.startsWith('@')) {
      return `[clearlydefined](https://clearlydefined.io/definitions/npm/npmjs/${namePart}/${version})`;
    }
    return `[clearlydefined](https://clearlydefined.io/definitions/npm/npmjs/-/${namePart}/${version})`;
  }
  return approvedBy;
}

/**
 * Run Eclipse dash-licenses JAR on project, parse its DEPENDENCIES output,
 * and add approved entries for unresolved dependencies into EXCLUDED file.
 * @param jarPath - Path to dash-licenses.jar
 * @param projectPath - Project directory (with package.json)
 * @param unresolvedDeps - List of unresolved dependencies (pkg@version)
 * @param excludedPath - Path to .deps/EXCLUDED/*.md file (prod.md or dev.md)
 * @param encoding - File encoding
 * @returns Map of newly approved entries (identifier -> CQ value) to merge into depsToCQ
 */
export function runJarFallback(
  jarPath: string,
  projectPath: string,
  unresolvedDeps: string[],
  excludedPath: string,
  encoding: string
): DependencyMap {
  const startTime = Date.now();
  const unresolvedSet = new Set(unresolvedDeps);
  const jarOutputPath = path.join(path.dirname(excludedPath), '..', 'tmp', 'DEPENDENCIES_JAR');
  const jarDir = path.dirname(jarOutputPath);
  if (!existsSync(jarDir)) {
    logger.warn('JAR fallback: tmp dir not found, skipping.');
    return new Map();
  }
  if (!existsSync(jarPath)) {
    logger.warn(`JAR fallback: jar not found at ${jarPath}, skipping.`);
    return new Map();
  }

  // Convert unresolved dependencies to ClearlyDefined format for JAR input
  // Format: npm/npmjs/-/package/version or npm/npmjs/@scope/name/version
  const convertToClearlyDefinedId = (pkgAtVersion: string): string => {
    const atIdx = pkgAtVersion.lastIndexOf('@');
    if (atIdx <= 0) return pkgAtVersion; // Invalid format, return as-is
    const namePart = pkgAtVersion.substring(0, atIdx);
    const version = pkgAtVersion.substring(atIdx + 1);

    if (namePart.startsWith('@')) {
      // Scoped package: @scope/name@version -> npm/npmjs/@scope/name/version
      return `npm/npmjs/${namePart}/${version}`;
    } else {
      // Non-scoped: package@version -> npm/npmjs/-/package/version
      return `npm/npmjs/-/${namePart}/${version}`;
    }
  };

  const jarInputLines = unresolvedDeps.map(convertToClearlyDefinedId);
  const jarInput = jarInputLines.join('\n') + '\n';

  logger.info(`Running Eclipse dash-licenses JAR for ${unresolvedDeps.length} unresolved dependencies...`);

  try {
    logger.debug(`JAR path: ${jarPath}`);
    logger.debug(`JAR output file: ${jarOutputPath}`);

    const resolvedJarPath = path.resolve(jarPath);
    execFileSync(
      'java',
      ['-jar', resolvedJarPath, '-summary', jarOutputPath, '-'],
      {
        cwd: projectPath,
        encoding: 'utf8',
        input: jarInput,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024
      }
    );

    const duration = Date.now() - startTime;
    logger.duration('JAR execution', duration);
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.duration('JAR execution', duration);
    // JAR exits non-zero when some deps are unresolved, but still writes output
    if (existsSync(jarOutputPath)) {
      logger.info('JAR exited with errors but produced output, parsing results...');
    } else {
      logger.warn(
        'JAR fallback: Eclipse dash-licenses JAR failed. Ensure Java is installed and JAR is valid.'
      );
      logger.debug((error as Error).message);
      return new Map();
    }
  }

  if (!existsSync(jarOutputPath)) {
    logger.warn('JAR fallback: No DEPENDENCIES output from JAR.');
    return new Map();
  }

  const jarContent = readFileSync(jarOutputPath, { encoding: encoding as BufferEncoding });
  const approvedToAdd = new Map<string, string>();
  for (const line of jarContent.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parsed = parseApprovedLine(line);
    if (parsed && unresolvedSet.has(parsed.identifier)) {
      const cqValue = formatCQ(parsed.approvedBy, parsed.identifier);
      approvedToAdd.set(parsed.identifier, cqValue);
      logger.debug(`JAR approved: ${parsed.identifier} → ${parsed.approvedBy}`);
    }
  }

  if (approvedToAdd.size === 0) {
    logger.info('JAR fallback: No additional approved dependencies from JAR.');
    return new Map();
  }

  // Read existing EXCLUDED file, add new lines, sort, write back
  const tablePattern = /^\| `([^|]+)` \| ([^|]+) \|$/gm;
  const existing: Array<{ identifier: string; cq: string }> = [];
  if (existsSync(excludedPath)) {
    const content = readFileSync(excludedPath, { encoding: encoding as BufferEncoding });
    let m: RegExpExecArray | null;
    while ((m = tablePattern.exec(content)) !== null) {
      existing.push({ identifier: m[1], cq: m[2].trim() });
    }
  }

  const existingIds = new Set(existing.map(e => e.identifier));
  for (const [identifier, cq] of approvedToAdd) {
    if (!existingIds.has(identifier)) {
      existing.push({ identifier, cq });
      existingIds.add(identifier);
    }
  }

  existing.sort((a, b) => a.identifier.localeCompare(b.identifier));
  let header = '| Packages | Resolved CQs |\n| --- | --- |\n';
  if (existsSync(excludedPath)) {
    const lines = readFileSync(excludedPath, { encoding: encoding as BufferEncoding }).split(/\n/);
    const tableStart = lines.findIndex((l: string) => l.startsWith('| Packages'));
    header = tableStart >= 0 ? lines.slice(0, tableStart + 2).join('\n') + '\n' : header;
  }
  const tableRows = existing.map(e => `| \`${e.identifier}\` | ${e.cq} |`).join('\n');
  writeFileSync(excludedPath, header + tableRows, { encoding: encoding as BufferEncoding });

  const fileName = excludedPath.includes('prod.md') ? 'prod.md' : 'dev.md';
  logger.success(`JAR fallback: Added ${approvedToAdd.size} approved dependencies to EXCLUDED/${fileName}.`);

  return approvedToAdd;
}
