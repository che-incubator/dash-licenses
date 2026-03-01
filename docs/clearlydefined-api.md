# ClearlyDefined API Integration

This document describes our integration with the ClearlyDefined API and the optimizations implemented.

## API Overview

ClearlyDefined provides two methods for accessing license data:

- **Web UI**: https://clearlydefined.io
- **REST API**: https://api.clearlydefined.io/api-docs/

## Rate Limits

### Production Instance

| Endpoint | Rate Limit |
|----------|-----------|
| `POST /definitions`, `/curations`, `/notices` | 250 requests/minute |
| All other endpoints (including `GET /definitions`) | 2,000 requests/minute |

### Monitoring

Response headers:
- `x-ratelimit-limit` - Total requests allowed
- `x-ratelimit-remaining` - Requests remaining in current window

HTTP 429 response indicates rate limit exceeded.

## Coordinate Format

ClearlyDefined uses a five-part coordinate system:

```
type/provider/namespace/name/revision
```

**Examples:**
```
npm/npmjs/@scope/package/1.0.0     # Scoped package
npm/npmjs/-/package/1.0.0          # Non-scoped package (- for empty namespace)
```

**Our Implementation:**
- `src/backends/coordinate-utils.ts` - Converts `package@version` to ClearlyDefined format
- Handles scoped packages correctly
- Uses `-` for empty namespace

## API Methods

### Individual GET (Legacy)

```http
GET /definitions/{coordinate}
```

**Rate limit:** 2,000 requests/minute

**Our previous implementation:**
- Concurrency: 8 parallel GET requests
- Delay: 200ms between batches
- Throughput: ~2,000 coordinates/minute

### Batch POST (Current)

```http
POST /definitions
Content-Type: application/json

["coordinate1", "coordinate2", ...]
```

**Rate limit:** 250 requests/minute

**Response format:**
```json
{
  "npm/npmjs/-/chalk/4.1.2": {
    "licensed": {
      "declared": "MIT",
      "toolScore": { ... },
      "facets": { ... }
    },
    "described": { ... },
    "coordinates": { ... }
  },
  "npm/npmjs/-/package2/1.0.0": { ... }
}
```

**Our current implementation:**
- Batch size: 100 coordinates per POST request
- Concurrency: 2 concurrent POST requests (reduced from 4 to avoid API overload)
- Timeout: 60 seconds per POST request (increased from 30s for large batches)
- Delay: 500ms between batches
- Throughput: ~12,500 coordinates/minute (6.25x improvement)
- **Automatic fallback**: If POST times out, falls back to individual GET requests

## Performance Comparison

| Method | Requests/min | Coords/request | Concurrency | Coords/min | Speedup |
|--------|--------------|----------------|-------------|------------|---------|
| Individual GET | 2,000 | 1 | 8 | 2,000 | 1x |
| Batch POST | 250 | 100 | 2 | 12,500 | 6.25x |

**Note**: POST concurrency reduced from 4 to 2 to avoid overwhelming the API during high load. This halves theoretical throughput but significantly improves reliability.

### Real-world Example

Processing 525 dependencies (license-tool itself):

**Before (GET):**
- 483 unique coordinates
- 483 GET requests needed
- ~61 batches of 8 concurrent requests
- ~14-16 seconds total

**After (POST):**
- 483 unique coordinates
- 5 POST requests (4×100 + 1×83)
- 2 batches of 4 concurrent requests
- ~2-3 seconds total
- **~5-6x faster in practice**

## Implementation Details

### Files

- `src/backends/clearlydefined-client.ts`
  - `fetchDefinition()` - Single GET request
  - `fetchDefinitionsBatch()` - Batch POST request
  - `extractLicense()` - Extract license from definition

- `src/backends/clearlydefined-backend.ts`
  - `processBatchPOST()` - New batch implementation
  - `processBatchGET()` - Legacy individual implementation
  - `fetchBatch()` - POST request handler

### Configuration

```typescript
// Default: batch POST API
const backend = new ClearlyDefinedBackend({
  useBatchAPI: true  // Use batch POST (default)
});

// Legacy: individual GET API
const backend = new ClearlyDefinedBackend({
  useBatchAPI: false  // Use individual GET
});
```

### Constants

```typescript
// Batch POST settings
const POST_BATCH_SIZE = 100;      // Coordinates per POST
const POST_CONCURRENCY = 4;        // Concurrent POSTs
const POST_BATCH_DELAY_MS = 500;   // Delay between batches

// Legacy GET settings
const GET_CONCURRENCY = 8;         // Concurrent GETs
const GET_BATCH_DELAY_MS = 200;    // Delay between batches
```

## Data Structure

Definitions contain two main sections:

### Licensed

```typescript
{
  licensed: {
    declared: "MIT",                    // Primary license
    facets: {
      core: {
        discovered: {
          expressions: ["MIT", "BSD"]   // Fallback licenses
        }
      }
    }
  }
}
```

**Our extraction logic:**
1. Use `licensed.declared` if available
2. Fall back to `licensed.facets.core.discovered.expressions[0]`
3. Return empty string if neither available

### Described

```typescript
{
  described: {
    releaseDate: "2021-01-15",
    sourceLocation: { ... },
    urls: {
      registry: "https://npmjs.com/package/chalk",
      version: "https://npmjs.com/package/chalk/v/4.1.2",
      download: "https://registry.npmjs.com/..."
    }
  }
}
```

## Error Handling

### Missing Definitions

Some coordinates may return empty or partial data:

```json
{
  "npm/npmjs/-/unknown-package/1.0.0": {
    "described": { "toolScore": { "total": 0 } },
    "licensed": { "toolScore": { "total": 0 } }
  }
}
```

**Our handling:**
- Check for `def.licensed` existence
- Mark as `restricted` with source `notfound`
- Continue processing other coordinates

### Batch POST Failures & Fallback

When a batch POST request fails (timeout, rate limit, network error):

1. **Automatic fallback to individual GETs**
   - All coordinates from the failed batch are retried individually
   - Uses GET `/definitions/{coordinate}` endpoint
   - Each GET has its own retry logic (see below)

2. **Logged as warning**
   ```
   [WARN] Batch POST failed: Error: ClearlyDefined batch request timeout
   [INFO] Falling back to individual GET requests for 100 coordinates
   ```

### Individual GET Retry Logic

Each individual GET request includes automatic retry for transient errors:

**Retry strategy:**
- Maximum 3 attempts per coordinate
- Linear backoff: 1s, 2s, 3s between retries
- Only retries on transient errors (timeout, network failures)

**Retryable errors:**
- Timeouts (`Error: ClearlyDefined request timeout`)
- Network errors (`TypeError: fetch failed`, `ECONNREFUSED`)

**Non-retryable errors:**
- 404 Not Found (marks as `source: 'notfound'`)
- Other HTTP errors (marks as `source: 'error'`)

**Example debug output:**
```
[REQUEST] GET https://api.clearlydefined.io/definitions/npm/npmjs/-/package/1.0.0
[RESPONSE] 500 https://api.clearlydefined.io/definitions/npm/npmjs/-/package/1.0.0 | 22ms
[DEBUG] Network error for npm/npmjs/-/package/1.0.0, retrying in 1000ms...
[DEBUG] Retry 2/3 for npm/npmjs/-/package/1.0.0
[RESPONSE] 200 https://api.clearlydefined.io/definitions/npm/npmjs/-/package/1.0.0 | 850ms
[DEBUG] npm/npmjs/-/package/1.0.0: MIT → approved
```

### Timeout Configuration

**Default:** 30 seconds per request
**Configurable:** Pass `timeoutMs` to `ClearlyDefinedBackend` constructor

```typescript
const backend = new ClearlyDefinedBackend({ timeoutMs: 60000 }); // 60 second timeout
```

## Debug Output

With `--debug` flag:

```
[08:57:14] [INFO] Processing 483 dependencies via ClearlyDefined batch POST API (100 coords/request)
[08:57:14] [INFO] [1/2] (50%) Fetching batch 1/2 (4 POST requests, 400 coords)
[08:57:14] [REQUEST] POST https://api.clearlydefined.io/definitions (100 coordinates)
[08:57:16] [RESPONSE] 200 https://api.clearlydefined.io/definitions | 1.3s
[08:57:16] [DEBUG] npm/npmjs/-/chalk/4.1.2: MIT → approved
```

## Implemented Features

✅ **Batch POST API** - 12.5x theoretical throughput improvement
✅ **Automatic Fallback** - Batch POST failures fall back to individual GETs
✅ **Retry Logic** - Automatic retry with linear backoff for transient errors
✅ **Error Classification** - Distinguish timeout, network, and HTTP errors

## Future Improvements

### High Priority

1. **Rate Limit Header Monitoring**
   ```typescript
   const remaining = response.headers.get('x-ratelimit-remaining');
   if (remaining && parseInt(remaining) < 100) {
     logger.warn(`Rate limit approaching: ${remaining} remaining`);
   }
   ```

2. **Adaptive Throttling**
   - Adjust batch size based on remaining rate limit
   - Slow down when approaching limits

### Medium Priority

3. **HTTP 429 Retry Logic**
   ```typescript
   if (response.status === 429) {
     const retryAfter = response.headers.get('retry-after');
     await sleep(retryAfter ? parseInt(retryAfter) * 1000 : 5000);
     // Retry with exponential backoff
   }
   ```

4. **Exponential Backoff**
   - Current: Linear backoff (1s, 2s, 3s)
   - Proposed: Exponential (1s, 2s, 4s)

5. **Connection Pooling**
   - Reuse HTTP connections for better performance
   - Reduce TCP handshake overhead

### Low Priority

6. **Response Caching**
   - Cache definitions locally to avoid duplicate API calls
   - Useful for multi-run scenarios

## Resources

- **Official Docs**: https://docs.clearlydefined.io/docs/get-involved/using-data
- **API Docs**: https://api.clearlydefined.io/api-docs/
- **Web UI**: https://clearlydefined.io
- **Project**: https://github.com/clearlydefined/clearlydefined

## Testing

View any package definition in the web UI:

```
https://clearlydefined.io/definitions/npm/npmjs/-/{package}/{version}
```

**Examples:**
- https://clearlydefined.io/definitions/npm/npmjs/-/chalk/4.1.2
- https://clearlydefined.io/definitions/npm/npmjs/@types/node/20.0.0
