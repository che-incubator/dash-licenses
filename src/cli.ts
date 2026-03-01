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

import { generate } from './library';

function parseArgs(): {
  projectPath: string;
  batchSize: number;
  check: boolean;
  debug: boolean;
  harvest: boolean;
  jarPath?: string;
} {
  const args = process.argv.slice(2);
  let projectPath = process.cwd();
  let batchSize = 500;
  let check = false;
  let debug = false;
  let harvest = false;
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
  --jar <path>   Optional path to Eclipse dash-licenses.jar for fallback on unresolved dev deps
  --help         Show this message

Examples:
  npx license-tool
  npx license-tool --check --batch 200
  npx license-tool /path/to/project
  npx license-tool --harvest
  npx license-tool --jar /path/to/dash-licenses.jar
`);
      process.exit(0);
    }
    if (args[i] === '--check') check = true;
    else if (args[i] === '--debug') debug = true;
    else if (args[i] === '--harvest') harvest = true;
    else if (args[i] === '--batch' && args[i + 1]) {
      batchSize = parseInt(args[++i], 10);
      if (isNaN(batchSize)) batchSize = 500;
    } else if (args[i] === '--jar' && args[i + 1]) {
      jarPath = args[++i];
    } else if (!args[i].startsWith('-')) {
      projectPath = args[i];
    }
  }

  return { projectPath, batchSize, check, debug, harvest, jarPath };
}

async function main(): Promise<void> {
  const { projectPath, batchSize, check, debug, harvest, jarPath } = parseArgs();
  const result = await generate({ projectPath, batchSize, check, debug, harvest, jarPath });
  if (result.exitCode !== 0 && result.error) {
    console.error(result.error);
  }
  process.exit(result.exitCode);
}

main();
