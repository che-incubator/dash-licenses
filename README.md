# license-tool

Node.js library for dependency license analysis of **npm and Yarn** projects. Uses the [ClearlyDefined](https://clearlydefined.io/) HTTP API to resolve licenses—no Java, no containers required.

## Features

- **Pure Node.js**: No Java/JAR—uses ClearlyDefined HTTP API
- **npm & Yarn support**: npm (package-lock.json), Yarn v1, Yarn 3+
- **SPDX-based license policy**: Approves MIT, Apache-2.0, BSD, ISC, EPL-2.0, etc.
- **Use as library or CLI**: Programmatic API and `npx license-tool` command

## Eclipse IP Compliance

By default, this tool uses the **ClearlyDefined** HTTP API as its primary license data source. For full Eclipse IP Team compliance (CQ status, IPLab integration), use the `--jar` option to enable fallback to the official [Eclipse Dash License Tool](https://github.com/eclipse-dash/dash-licenses) JAR, which queries the Eclipse Foundation's internal IP database.

## Supported Package Managers

- [npm](https://docs.npmjs.com) (`package-lock.json`)
- [Yarn v1](https://classic.yarnpkg.com) (`yarn.lock` with Yarn < 2)
- [Yarn 3+](https://yarnpkg.com) (`yarn.lock` with Yarn >= 3)—parses lockfile directly, no plugins required

## Requirements

- Node.js >= 20.0.0

## Quick Start

### CLI

```sh
# From project directory (generate prod.md, dev.md in .deps/)
npx license-tool

# Check only (no generation)
npx license-tool --check

# With options
npx license-tool --batch 200 --debug /path/to/project

# With JAR fallback for unresolved dev dependencies
npx license-tool --jar /path/to/dash-licenses.jar

# Auto-request harvest for unresolved dependencies (ClearlyDefined)
npx license-tool --harvest
```

#### Downloading the Eclipse Dash JAR

The `--jar` option enables fallback to the official Eclipse Dash License Tool for unresolved dependencies.

**Why use it?** The Eclipse Dash JAR queries the **Eclipse Foundation's internal IP database** (IPLab), which contains additional approval data not available through the public ClearlyDefined API. This can resolve dependencies that appear as "restricted" or "unresolved" when using only the HTTP backend.

**Requirements**: Java 11 or higher must be installed.

**Download**:
```sh
# Download the latest dash-licenses JAR
curl -o dash-licenses.jar https://repo.eclipse.org/service/local/artifact/maven/redirect?r=dash-licenses&g=org.eclipse.dash&a=org.eclipse.dash.licenses&v=LATEST
```

**Resources**:
- Project page: https://projects.eclipse.org/projects/technology.dash
- Downloads: https://projects.eclipse.org/projects/technology.dash/downloads

**How it works**:
1. Processes unresolved dev dependencies through the Eclipse IP database
2. Adds newly approved items to `.deps/EXCLUDED/dev.md`
3. Regenerates `dev.md` with the updated approvals

**Important**: Once dependencies are added to the EXCLUDED files, you don't need to use `--jar` on every run. The EXCLUDED files act as a permanent cache of approved dependencies. Only re-run with `--jar` when you have new unresolved dev dependencies or want to refresh approvals from the Eclipse IP database.

#### Auto-Harvesting with ClearlyDefined

The `--harvest` flag enables automatic harvest requests for unresolved dependencies through the ClearlyDefined API.

**Why use it?** When ClearlyDefined doesn't have license information for a package, you can request it to "harvest" the license data from the source repository. This process extracts license files and headers automatically.

**How it works**:
1. For each unresolved dependency, check if it was already harvested (`GET /harvest/{coordinate}`)
2. If not harvested, request a new harvest (`POST /harvest`)
3. ClearlyDefined queues the harvest job (typically completes in minutes to hours)
4. Re-run `npx license-tool` after harvest completes to pick up new license data

**Example**:
```sh
# Request harvest for unresolved dependencies
npx license-tool --harvest

# Wait for harvest to complete, then re-run
npx license-tool
```

See [docs/harvest.md](docs/harvest.md) for detailed documentation.

### Library

```typescript
import { generate } from 'license-tool';

const result = await generate({
  projectPath: '/path/to/project',
  batchSize: 500,
  check: false,
  debug: false,
  harvest: false,  // Optional: Auto-request harvest for unresolved dependencies (ClearlyDefined)
  jarPath: '/path/to/dash-licenses.jar'  // Optional: Eclipse JAR fallback for unresolved dev deps
});

if (result.exitCode === 0) {
  console.log('Licenses OK');
} else {
  console.error(result.error);
}
```

## Output Files

Generated in `.deps/`:

- `prod.md` - Production dependencies
- `dev.md` - Development dependencies
- `problems.md` - Unresolved or restricted dependencies
- `EXCLUDED/prod.md`, `EXCLUDED/dev.md` - Manual exclusions

## Installation

```sh
npm install license-tool
# or
yarn add license-tool
```

## API

### `generate(config: LibraryConfig): Promise<LibraryResult>`

| Option       | Type    | Default | Description                                                    |
|--------------|---------|---------|----------------------------------------------------------------|
| projectPath  | string  | required| Path to project directory                                      |
| batchSize    | number  | 500     | Batch size for API requests                                    |
| check        | boolean | false   | Check only, do not generate                                     |
| debug        | boolean | false   | Copy tmp files for inspection                                   |
| jarPath      | string  | -       | Optional path to Eclipse dash-licenses.jar; when set, runs JAR fallback for unresolved dev deps, adds approved to EXCLUDED, and regenerates docs |

Returns `{ exitCode: 0|1, error?: string }`.

## Project Structure

```
license-tool/
├── src/
│   ├── library.ts          # Main library API
│   ├── cli.ts               # CLI entry point
│   ├── backends/            # License resolution (ClearlyDefined)
│   ├── document/            # Document generation
│   ├── helpers/             # Shared utilities
│   └── package-managers/    # npm, yarn, yarn3
├── dist/                    # Built output
└── package.json
```

## Development

```sh
npm install
npm run build
npm test
npm run lint
```

### Scripts

- `npm run build` - Compile TypeScript
- `npm test` - Run tests
- `npm run lint` - ESLint
- `npm run header:check` - License header check

## Risks and Limitations

- **ClearlyDefined coverage**: Newly published packages may not be indexed yet; use `--jar` or `--harvest` to resolve them
- **Approval rules**: Maintain `src/backends/license-policy.ts` per [Eclipse licenses](https://www.eclipse.org/legal/licenses/) if desired

## Related Projects

- [ClearlyDefined](https://clearlydefined.io/) - License data source
- [Eclipse Dash License Tool](https://github.com/eclipse-dash/dash-licenses) - Original Java tool

## License

EPL-2.0
