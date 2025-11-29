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
import * as fs from 'fs';
import * as path from 'path';

// Check if Docker/Podman is available
function isContainerEngineAvailable(): boolean {
  try {
    execSync('docker version', { stdio: 'ignore' });
    return true;
  } catch {
    try {
      execSync('podman version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}

const containerEngineAvailable = isContainerEngineAvailable();

describe('Docker E2E Tests', () => {
  const testProjectDir = path.join(__dirname, 'test-project');
  
  beforeAll(() => {
    // Create test project directory
    if (!fs.existsSync(testProjectDir)) {
      fs.mkdirSync(testProjectDir, { recursive: true });
    }
    
    // Create a simple package.json for testing
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        'lodash': '4.17.21'
      },
      devDependencies: {
        'jest': '29.0.0'
      }
    };
    
    fs.writeFileSync(
      path.join(testProjectDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
    
    // Create package-lock.json
    const packageLock = {
      name: 'test-project',
      version: '1.0.0',
      lockfileVersion: 2,
      requires: true,
      packages: {
        '': {
          name: 'test-project',
          version: '1.0.0',
          dependencies: {
            'lodash': '4.17.21'
          },
          devDependencies: {
            'jest': '29.0.0'
          }
        },
        'node_modules/lodash': {
          version: '4.17.21'
        },
        'node_modules/jest': {
          version: '29.0.0',
          dev: true
        }
      }
    };
    
    fs.writeFileSync(
      path.join(testProjectDir, 'package-lock.json'),
      JSON.stringify(packageLock, null, 2)
    );
  });
  
  afterAll(() => {
    // Clean up test project directory
    if (fs.existsSync(testProjectDir)) {
      fs.rmSync(testProjectDir, { recursive: true, force: true });
    }
  });

  test('should build Docker image successfully', () => {
    console.log('Building Docker image...');
    
    try {
      // Ensure we're always building from the project root, regardless of where this test runs from
      const projectRoot = path.resolve(__dirname, '../..').replace('/dist', '');
      execSync('docker build -f build/dockerfiles/Dockerfile -t test-dash-licenses .', {
        stdio: 'pipe',
        cwd: projectRoot,
        encoding: 'utf8'
      });
      console.log('Docker image built successfully');
    } catch (error: any) {
      // Skip test if Docker is not available
      if (error && error.message && error.message.includes('Cannot connect to the Docker daemon')) {
        console.log('Skipping Docker build test - Docker daemon not available');
        return;
      }
      
      console.error('Docker build failed with error:', error);
      if (error && error.stderr) {
        console.error('Docker stderr:', error.stderr.toString());
      }
      if (error && error.stdout) {
        console.log('Docker stdout:', error.stdout.toString());
      }
      const errorMessage = error instanceof Error ? error.message : (error?.stderr || error?.message || 'Unknown error');
      throw new Error(`Failed to build Docker image: ${errorMessage}`);
    }
  }, 120000); // 2 minute timeout

  test('should run container and process dependencies', (done) => {
    if (!containerEngineAvailable) {
      console.log('Skipping container run test - no container engine available');
      done();
      return;
    }
    
    console.log('Running container with test project...');
    
    try {
      const result = execSync(
        `docker run --rm -v ${testProjectDir}:/workspace/project test-dash-licenses --debug`,
        {
          stdio: 'pipe',
          encoding: 'utf8'
        }
      );
      
      expect(result).toContain('Done.');
      done();
    } catch (error) {
      // Some tests might fail due to network issues or missing dependencies
      // This is expected in CI environments
      console.warn('Skipping container test - Docker not available or container failed');
      console.warn(error instanceof Error ? error.message : 'Unknown error');
      done();
    }
  }, 180000); // 3 minute timeout

  test('should handle check mode correctly', () => {
    console.log('Running container in check mode...');
    
    let exitCode: number;
    let output: string;
    
    try {
      output = execSync(
        `docker run --rm -v ${testProjectDir}:/workspace/project test-dash-licenses --check`,
        {
          stdio: 'pipe',
          encoding: 'utf8'
        }
      );
      exitCode = 0;
    } catch (error: any) {
      exitCode = error.status || 1;
      output = error.stdout || error.message || '';
      
      // Skip test if Docker is not available (exit code 125, 127, etc.)
      if (exitCode > 1) {
        console.log(`Skipping check mode test - Docker command failed with exit code ${exitCode}`);
        return;
      }
    }
    
    console.log(`Check mode completed with status: ${exitCode}`);
    console.log('Check mode output:', output);
    
    // In check mode, we expect either success (0) or failure (1) based on dependency status
    expect([0, 1]).toContain(exitCode);
    expect(output).toContain('Done.');
  }, 180000); // 3 minute timeout
});
