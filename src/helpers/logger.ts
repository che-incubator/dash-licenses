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

import chalk from 'chalk';

/**
 * Log level type
 */
export type LogLevel = 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' | 'DEBUG' | 'REQUEST' | 'RESPONSE';

/**
 * Format duration in milliseconds to human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

/**
 * Get current timestamp in HH:MM:SS format
 */
function getTimestamp(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Get colored prefix for log level
 */
function getPrefix(level: LogLevel): string {
  const timestamp = chalk.gray(`[${getTimestamp()}]`);

  switch (level) {
    case 'INFO':
      return `${timestamp} ${chalk.blue('[INFO]')}`;
    case 'SUCCESS':
      return `${timestamp} ${chalk.green('[SUCCESS]')}`;
    case 'WARN':
      return `${timestamp} ${chalk.yellow('[WARN]')}`;
    case 'ERROR':
      return `${timestamp} ${chalk.red('[ERROR]')}`;
    case 'DEBUG':
      return `${timestamp} ${chalk.magenta('[DEBUG]')}`;
    case 'REQUEST':
      return `${timestamp} ${chalk.cyan('[REQUEST]')}`;
    case 'RESPONSE':
      return `${timestamp} ${chalk.cyan('[RESPONSE]')}`;
    default:
      return `${timestamp} ${chalk.white(`[${level}]`)}`;
  }
}

/**
 * Enhanced logger with colored output and timestamps
 */
export class Logger {
  private debugMode: boolean;

  constructor(debugMode = false) {
    this.debugMode = debugMode;
  }

  /**
   * Enable or disable debug mode
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  /**
   * Log info message
   */
  info(message: string): void {
    console.log(`${getPrefix('INFO')} ${message}`);
  }

  /**
   * Log success message
   */
  success(message: string): void {
    console.log(`${getPrefix('SUCCESS')} ${chalk.green(message)}`);
  }

  /**
   * Log warning message
   */
  warn(message: string): void {
    console.log(`${getPrefix('WARN')} ${chalk.yellow(message)}`);
  }

  /**
   * Log error message
   */
  error(message: string): void {
    console.error(`${getPrefix('ERROR')} ${chalk.red(message)}`);
  }

  /**
   * Log debug message (only if debug mode is enabled)
   */
  debug(message: string): void {
    if (this.debugMode) {
      console.log(`${getPrefix('DEBUG')} ${chalk.gray(message)}`);
    }
  }

  /**
   * Log HTTP request
   */
  request(method: string, url: string, body?: unknown): void {
    if (this.debugMode) {
      const msg = `${chalk.bold(method)} ${url}`;
      console.log(`${getPrefix('REQUEST')} ${msg}`);
      if (body) {
        console.log(`${getPrefix('REQUEST')} Body: ${chalk.gray(JSON.stringify(body, null, 2))}`);
      }
    }
  }

  /**
   * Log HTTP response with duration
   */
  response(status: number, url: string, duration: number, size?: number): void {
    if (this.debugMode) {
      const statusColor = status >= 200 && status < 300 ? chalk.green : chalk.red;
      const sizeStr = size ? ` | ${chalk.gray(this.formatSize(size))}` : '';
      const msg = `${statusColor(status)} ${url} | ${chalk.gray(formatDuration(duration))}${sizeStr}`;
      console.log(`${getPrefix('RESPONSE')} ${msg}`);
    }
  }

  /**
   * Log operation with duration
   */
  duration(operation: string, durationMs: number): void {
    const msg = `${operation} ${chalk.gray(`(took ${formatDuration(durationMs)})`)}`;
    console.log(`${getPrefix('INFO')} ${msg}`);
  }

  /**
   * Format bytes to human-readable size
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes}B`;
    }
    const kb = bytes / 1024;
    if (kb < 1024) {
      return `${kb.toFixed(1)}KB`;
    }
    const mb = kb / 1024;
    return `${mb.toFixed(1)}MB`;
  }

  /**
   * Create a progress indicator for batch operations
   */
  progress(current: number, total: number, message: string): void {
    const percentage = Math.round((current / total) * 100);
    const progress = `[${current}/${total}]`;
    const msg = `${chalk.cyan(progress)} ${chalk.gray(`(${percentage}%)`)} ${message}`;
    console.log(`${getPrefix('INFO')} ${msg}`);
  }
}

/**
 * Default logger instance
 */
export const logger = new Logger(process.argv.includes('--debug'));
