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

import * as path from 'path';
import { PackageManagerBase } from '../../helpers/package-manager-base';
import { ChunkedDashLicensesProcessor } from '../../helpers/chunked-processor';

/**
 * NPM package manager processor.
 * Handles dependency analysis for projects using npm (package-lock.json).
 */
export class NpmProcessor extends PackageManagerBase {
  constructor() {
    super({
      name: 'npm',
      projectFile: 'package.json',
      // npm doesn't require package-lock.json to exist (can use package.json)
    });
  }

  /**
   * Generate dependencies using npm-specific tooling.
   * Uses the parser.js script to extract dependencies and ChunkedDashLicensesProcessor
   * for license analysis.
   */
  protected async generateDependencies(): Promise<void> {
    console.log(`Generating a temporary DEPENDENCIES file (batch size: ${this.env.BATCH_SIZE})...`);
    
    const parserScript = path.join(this.env.WORKSPACE_DIR, 'package-managers/npm/parser.js');
    const depsFilePath = path.join(this.env.TMP_DIR, 'DEPENDENCIES');

    try {
      const processor = new ChunkedDashLicensesProcessor({
        parserScript,
        parserInput: '', // npm parser doesn't need input, reads from project
        dashLicensesJar: this.env.DASH_LICENSES,
        batchSize: parseInt(this.env.BATCH_SIZE),
        outputFile: depsFilePath,
        debug: this.options.debug,
        maxRetries: 3,
        retryDelayMs: 10000
      });

      await processor.process();
    } catch (error: unknown) {
      const err = error as Error;
      console.error(`Error: Failed to generate DEPENDENCIES file: ${err.message}`);
      console.error('This is usually caused by Eclipse Foundation or ClearlyDefined API issues (timeout, rate limit, etc.).');
      if (this.options.debug) {
        this.copyTmpDir();
      }
      process.exit(1);
    }
  }
}
