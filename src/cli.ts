#!/usr/bin/env node
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

import { generate, type LibraryConfig } from './library';

function parseArgs(): {
  projectPath: string;
  batchSize: number;
  check: boolean;
  debug: boolean;
  harvest: boolean;
  recheck: boolean;
  postTimeoutMs?: number;
  getTimeoutMs?: number;
  jarPath?: string;
} {
  const args = process.argv.slice(2);
  let projectPath = process.cwd();
  let batchSize = 500;
  let check = false;
  let debug = false;
  let harvest = false;
  let recheck = false;
  let postTimeoutMs: number | undefined;
  let getTimeoutMs: number | undefined;
  let jarPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Usage: npx license-tool [options] [projectPath]

Options:
  --generate     (Re)generate dependencies (default)
  --check        Check only, do not generate
  --batch <n>    Batch size (default: 500)
  --debug        Copy tmp files for inspection
  --harvest      Request harvest for unresolved dependencies from ClearlyDefined
  --recheck             Bypass the .deps/prod.md + .deps/dev.md cache and re-query
                        ClearlyDefined for every dependency (default: cache is used)
  --post-timeout <ms>   Timeout for batch POST /definitions requests (default: 30000 ms)
  --get-timeout <ms>    Timeout for individual GET /definitions/{id} requests (default: 5000 ms)
  --jar <path>          Optional path to Eclipse dash-licenses.jar for fallback on unresolved dev deps
  --help                Show this message

Cache behaviour (default):
  On each run the tool reads .deps/prod.md and .deps/dev.md. Any dependency
  that already has a non-empty "Resolved CQs" column (e.g. a clearlydefined
  link) is considered resolved and is skipped — only new or previously
  unresolved dependencies are sent to ClearlyDefined. This dramatically
  reduces API calls for projects with stable dependency trees.

  Use --recheck to force a full re-query of all dependencies.

Examples:
  npx license-tool
  npx license-tool --check --batch 200
  npx license-tool /path/to/project
  npx license-tool --harvest
  npx license-tool --recheck
  npx license-tool --post-timeout 20000 --get-timeout 10000
  npx license-tool --jar /path/to/dash-licenses.jar
`);
      process.exit(0);
    }
    if (args[i] === '--check') check = true;
    else if (args[i] === '--debug') debug = true;
    else if (args[i] === '--harvest') harvest = true;
    else if (args[i] === '--recheck') recheck = true;
    else if (args[i] === '--post-timeout' && args[i + 1]) {
      const v = parseInt(args[++i], 10);
      if (!isNaN(v) && v > 0) postTimeoutMs = v;
    } else if (args[i] === '--get-timeout' && args[i + 1]) {
      const v = parseInt(args[++i], 10);
      if (!isNaN(v) && v > 0) getTimeoutMs = v;
    } else if (args[i] === '--batch' && args[i + 1]) {
      batchSize = parseInt(args[++i], 10);
      if (isNaN(batchSize)) batchSize = 500;
    } else if (args[i] === '--jar' && args[i + 1]) {
      jarPath = args[++i];
    } else if (!args[i].startsWith('-')) {
      projectPath = args[i];
    }
  }

  const base = { projectPath, batchSize, check, debug, harvest, recheck };
  const timeouts = {
    ...(postTimeoutMs !== undefined ? { postTimeoutMs } : {}),
    ...(getTimeoutMs !== undefined ? { getTimeoutMs } : {}),
  };
  return jarPath
    ? { ...base, ...timeouts, jarPath }
    : { ...base, ...timeouts };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const config: LibraryConfig = args;
  const result = await generate(config);
  if (result.exitCode !== 0 && result.error) {
    console.error(result.error);
  }
  process.exit(result.exitCode);
}

main();
