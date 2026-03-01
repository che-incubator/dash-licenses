# ClearlyDefined Harvest Feature

The `--harvest` flag enables automatic harvest requests for unresolved dependencies through the ClearlyDefined API.

## What is Harvesting?

ClearlyDefined uses a "harvest" process to gather license information from source repositories when a package's metadata is incomplete or missing. When you request a harvest:

1. ClearlyDefined's harvester tools clone the source repository
2. Extract license files (LICENSE, COPYING, etc.)
3. Scan code for license headers
4. Update the definition with discovered license information

This process typically takes a few minutes to hours depending on queue length.

## How --harvest Works

When you run `npx license-tool --harvest`, the tool:

### 1. Check Harvest Status (GET)

For each unresolved or "not found" dependency, the tool first checks if it has already been harvested:

```http
GET /harvest/{type}/{provider}/{namespace}/{name}/{revision}?form=list
```

Example:
```http
GET /harvest/npm/npmjs/-/my-package/1.0.0?form=list
```

Response:
```json
["package", "source"]  // Already harvested by these tools
```

If the response is an empty array `[]`, the package has not been harvested yet.

### 2. Request Harvest (POST)

If the dependency has NOT been harvested, the tool automatically requests a harvest:

```http
POST /harvest
Content-Type: application/json

[
  {
    "tool": "package",
    "coordinates": "npm/npmjs/-/my-package/1.0.0"
  }
]
```

The ClearlyDefined service will queue the harvest job and process it asynchronously.

## Usage

```sh
# Generate license files and request harvest for unresolved dependencies
npx license-tool --harvest

# Check mode with harvest (no file generation, but harvest requests are sent)
npx license-tool --check --harvest

# Library usage
import { generate } from 'license-tool';

const result = await generate({
  projectPath: '/path/to/project',
  harvest: true  // Enable auto-harvest
});
```

## Output

When `--harvest` is enabled, you'll see output like:

```
[19:48:00] [INFO] Processing harvest requests for 3 unresolved dependencies...
[19:48:01] [INFO] ✓ Already harvested: npm/npmjs/-/package-a/1.0.0
[19:48:01] [INFO] ✓ Harvest requested: npm/npmjs/-/package-b/2.0.0
[19:48:02] [INFO] ✓ Harvest requested: npm/npmjs/-/package-c/3.0.0
[19:48:02] [SUCCESS] Harvest summary: 1 already harvested, 2 newly requested
```

## Best Practices

1. **Run harvest on first encounter**: When you see unresolved dependencies in `problems.md`, run with `--harvest` to request harvesting

2. **Wait before re-running**: ClearlyDefined harvest can take minutes to hours. Don't re-run immediately

3. **Check ClearlyDefined UI**: Visit https://clearlydefined.io/definitions/npm/npmjs/-/package-name/version to see harvest status

4. **Re-run after harvest completes**: Once harvesting is done, run `npx license-tool` again (without `--harvest`) to pick up the new license data

## API Rate Limits

The harvest API has its own rate limits separate from the definitions API:

- **GET /harvest**: Limited to prevent abuse
- **POST /harvest**: Limited to prevent queue flooding

If you hit rate limits, wait a few minutes before retrying.

## Coordinate Format

Harvest uses the same coordinate format as definitions:

```
{type}/{provider}/{namespace}/{name}/{revision}
```

Examples:
- `npm/npmjs/-/express/4.18.0`
- `npm/npmjs/@babel/core/7.22.0`
- `maven/mavencentral/org.slf4j/slf4j-api/2.0.0`

## Limitations

1. **Not all packages can be harvested**: Some packages don't have accessible source repositories
2. **Queue delays**: Popular harvest times may have longer queues
3. **Manual curation still needed**: Harvest may not resolve all licensing ambiguities

## Resources

- ClearlyDefined Harvest API: https://api.clearlydefined.io/api-docs/#/harvest
- ClearlyDefined Documentation: https://docs.clearlydefined.io/
- How Harvesting Works: https://docs.clearlydefined.io/docs/get-involved/harvesting
