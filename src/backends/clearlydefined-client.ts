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

import axios from 'axios';
import { logger } from '../helpers/logger';

const CLEARLYDEFINED_API = 'https://api.clearlydefined.io';

export interface ClearlyDefinedDefinition {
  described?: {
    releaseDate?: string;
    urls?: { registry?: string; version?: string };
  };
  licensed?: {
    declared?: string;
    facets?: {
      core?: {
        discovered?: {
          expressions?: string[];
        };
      };
    };
  };
  coordinates?: {
    type: string;
    provider: string;
    namespace?: string;
    name: string;
    revision: string;
  };
  _meta?: {
    schemaVersion?: string;
    updated?: string;
  };
  scores?: {
    effective?: number;
    tool?: number;
  };
}

export interface FetchResult {
  id: string;
  license: string;
  found: boolean;
}

/**
 * Response from batch POST /definitions endpoint.
 * Maps coordinate strings to their definitions.
 */
export type BatchDefinitionsResponse = Record<string, ClearlyDefinedDefinition>;

/**
 * Fetch license info for a ClearlyDefined component.
 * API: https://api.clearlydefined.io/definitions/{type}/{provider}/{namespace}/{name}/{revision}
 */
export async function fetchDefinition(
  clearlyDefinedId: string,
  timeoutMs: number = 30000
): Promise<ClearlyDefinedDefinition | null> {
  const url = `${CLEARLYDEFINED_API}/definitions/${clearlyDefinedId}`;

  try {
    const res = await axios.get<ClearlyDefinedDefinition>(url, {
      timeout: timeoutMs,
      headers: { Accept: 'application/json' }
    });
    return res.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.response?.status === 404) return null;
      if (err.code === 'ECONNABORTED') throw new Error('ClearlyDefined request timeout');
      throw new Error(`ClearlyDefined HTTP ${err.response?.status || 'error'}`);
    }
    throw err;
  }
}

/**
 * Batch fetch definitions for multiple components using POST /definitions.
 * Rate limit: 250 requests/minute (vs 2000/min for GET), but each POST can fetch many components.
 *
 * @param coordinates - Array of ClearlyDefined coordinate strings
 * @param timeoutMs - Request timeout in milliseconds
 * @returns Object mapping coordinates to their definitions
 */
export async function fetchDefinitionsBatch(
  coordinates: string[],
  timeoutMs: number = 30000
): Promise<BatchDefinitionsResponse> {
  if (coordinates.length === 0) {
    return {};
  }

  const url = `${CLEARLYDEFINED_API}/definitions`;

  try {
    const res = await axios.post<BatchDefinitionsResponse>(url, coordinates, {
      timeout: timeoutMs,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    return res.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.code === 'ECONNABORTED') throw new Error('ClearlyDefined batch request timeout');
      throw new Error(`ClearlyDefined batch HTTP ${err.response?.status || 'error'}`);
    }
    throw err;
  }
}

/**
 * Extract license expression from ClearlyDefined definition.
 */
export function extractLicense(def: ClearlyDefinedDefinition | null): string {
  if (!def?.licensed) return '';
  const declared = def.licensed.declared;
  if (declared) return declared;
  const discovered = def.licensed.facets?.core?.discovered?.expressions;
  if (discovered?.length) return discovered[0];
  return '';
}

/**
 * Check if a component has been harvested.
 * API: GET /harvest/{type}/{provider}/{namespace}/{name}/{revision}?form=list
 *
 * @param clearlyDefinedId - ClearlyDefined coordinate (e.g., "npm/npmjs/-/uri-js/4.4.1")
 * @param timeoutMs - Request timeout in milliseconds
 * @returns Array of harvested tools, or empty array if not harvested
 */
export async function checkHarvested(
  clearlyDefinedId: string,
  timeoutMs: number = 30000
): Promise<string[]> {
  const url = `${CLEARLYDEFINED_API}/harvest/${clearlyDefinedId}?form=list`;

  logger.debug(`[HARVEST CHECK] GET ${url}`);

  try {
    const res = await axios.get<string[]>(url, {
      timeout: timeoutMs,
      headers: { Accept: '*/*' }
    });

    logger.debug(`[HARVEST CHECK] ${res.status} ${url}`);

    const harvested = res.data;
    logger.debug(`[HARVEST CHECK] ${clearlyDefinedId}: found ${Array.isArray(harvested) ? harvested.length : 0} harvested tools`);
    return Array.isArray(harvested) ? harvested : [];
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.response?.status === 404) {
        logger.debug(`[HARVEST CHECK] ${clearlyDefinedId}: not harvested yet (404)`);
        return []; // Not harvested yet
      }
      if (err.code === 'ECONNABORTED') {
        logger.debug(`[HARVEST CHECK] ${clearlyDefinedId}: timeout after ${timeoutMs}ms`);
        throw new Error('ClearlyDefined harvest check timeout');
      }
      logger.debug(`[HARVEST CHECK] ${clearlyDefinedId}: error - ${err.message}`);
      throw new Error(`ClearlyDefined harvest check HTTP ${err.response?.status || 'error'}`);
    }
    if (err instanceof Error) {
      logger.debug(`[HARVEST CHECK] ${clearlyDefinedId}: error - ${err.message}`);
    }
    throw err;
  }
}

/**
 * Request harvest for a component.
 * API: POST /harvest
 *
 * @param clearlyDefinedId - ClearlyDefined coordinate (e.g., "npm/npmjs/-/uri-js/4.4.1")
 * @param timeoutMs - Request timeout in milliseconds
 * @returns true if harvest was requested successfully
 */
export async function requestHarvest(
  clearlyDefinedId: string,
  timeoutMs: number = 30000
): Promise<boolean> {
  const url = `${CLEARLYDEFINED_API}/harvest`;

  // Request harvest using ClearlyDefined API format (coordinates only)
  const harvestRequests = [
    {
      coordinates: clearlyDefinedId
    }
  ];

  logger.debug(`[HARVEST REQUEST] POST ${url} (${clearlyDefinedId})`);
  logger.debug(`[HARVEST REQUEST] Body: ${JSON.stringify(harvestRequests)}`);

  try {
    const res = await axios.post(url, harvestRequests, {
      timeout: timeoutMs,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    logger.debug(`[HARVEST REQUEST] ${res.status} ${url} (${clearlyDefinedId})`);
    logger.debug(`[HARVEST REQUEST] ${clearlyDefinedId}: successfully requested`);
    return true;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.code === 'ECONNABORTED') {
        logger.debug(`[HARVEST REQUEST] ${clearlyDefinedId}: timeout after ${timeoutMs}ms`);
        throw new Error('ClearlyDefined harvest request timeout');
      }
      logger.debug(`[HARVEST REQUEST] ${clearlyDefinedId}: failed with HTTP ${err.response?.status || 'error'}`);
      throw new Error(`ClearlyDefined harvest request HTTP ${err.response?.status || 'error'}`);
    }
    if (err instanceof Error) {
      logger.debug(`[HARVEST REQUEST] ${clearlyDefinedId}: error - ${err.message}`);
    }
    throw err;
  }
}
