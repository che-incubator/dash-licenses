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

import { MvnProcessor } from './mvn-processor';

/**
 * Entry point for Maven package manager processing.
 * This is a thin wrapper that delegates to MvnProcessor.
 */
(async function main() {
  const processor = new MvnProcessor();
  await processor.run();
})();
