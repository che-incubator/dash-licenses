# @eclipse-che/license-tool

[![Contribute](https://www.eclipse.org/che/contribute.svg)](https://workspaces.openshift.com#https://github.com/che-incubator/dash-licenses)
[![Contribute (nightly)](https://img.shields.io/static/v1?label=nightly%20Che&message=for%20maintainers&logo=eclipseche&color=FDB940&labelColor=525C86)](https://che-dogfooding.apps.che-dev.x6e0.p1.openshiftapps.com#https://github.com/che-incubator/dash-licenses)

Node.js library for dependency license analysis of **npm and Yarn** projects. Uses the [ClearlyDefined](https://clearlydefined.io/) HTTP API to resolve licenses—no Java, no containers required.

## Features

- **Pure Node.js**: No Java/JAR—uses ClearlyDefined HTTP API
- **npm & Yarn support**: npm (`package-lock.json`), Yarn v1, Yarn 3+
- **SPDX-based license policy**: Approves MIT, Apache-2.0, BSD, ISC, EPL-2.0, and more
- **Use as library or CLI**: Programmatic API and `npx @eclipse-che/license-tool` command
- **Eclipse IP compliance**: Optional JAR fallback for full IPLab/CQ integration

## Eclipse IP Compliance

By default, this tool uses the **ClearlyDefined** HTTP API as its primary license data source. For full Eclipse IP Team compliance (CQ status, IPLab integration), use the `--jar` option to enable fallback to the official [Eclipse Dash License Tool](https://github.com/eclipse-dash/dash-licenses) JAR, which queries the Eclipse Foundation's internal IP database.

## Supported Package Managers

| Package Manager | Lock File |
|---|---|
| [npm](https://docs.npmjs.com) | `package-lock.json` |
| [Yarn v1](https://classic.yarnpkg.com) | `yarn.lock` (Yarn < 2) |
| [Yarn 3+](https://yarnpkg.com) | `yarn.lock` (Yarn >= 3) — parsed directly, no plugins required |

## Requirements

- Node.js >= 20.0.0

## Installation

```sh
npm install @eclipse-che/license-tool
# or
yarn add @eclipse-che/license-tool
```

## Where is it Published?

This library is available on npm.

You can find the published package here: \
**npm:** [@eclipse-che/license-tool](https://www.npmjs.com/package/@eclipse-che/license-tool)

## Quick Start

### CLI

```sh
# Generate prod.md and dev.md in .deps/ (default)
npx @eclipse-che/license-tool

# Check only — fails if existing .deps files are outdated
npx @eclipse-che/license-tool --check

# Target a specific project directory
npx @eclipse-che/license-tool /path/to/project

# Tune batch size for ClearlyDefined API calls
npx @eclipse-che/license-tool --batch 200

# Auto-request harvest for unresolved dependencies
npx @eclipse-che/license-tool --harvest

# Force a full re-query, bypassing the cache
npx @eclipse-che/license-tool --recheck

# JAR fallback for unresolved dev dependencies
npx @eclipse-che/license-tool --jar /path/to/dash-licenses.jar
```

#### CLI Options

| Option | Description | Default |
|---|---|---|
| `[projectPath]` | Path to project directory | current working directory |
| `--generate` | (Re)generate dependency files | default mode |
| `--check` | Check only, do not write any files | `false` |
| `--batch <n>` | Batch size for ClearlyDefined API requests | `500` |
| `--harvest` | Request harvest for unresolved deps from ClearlyDefined | `false` |
| `--recheck` | Bypass the `.deps/` cache and re-query ClearlyDefined for every dependency | `false` |
| `--post-timeout <ms>` | Timeout for batch POST `/definitions` requests | `10000` ms |
| `--get-timeout <ms>` | Timeout for individual GET `/definitions/{id}` requests | `5000` ms |
| `--jar <path>` | Path to Eclipse `dash-licenses.jar` for fallback on unresolved dev deps | — |
| `--debug` | Copy tmp files for inspection | `false` |
| `--help` | Show help message | — |

#### Dependency cache

By default the tool reads `.deps/prod.md` and `.deps/dev.md` before calling ClearlyDefined. Any dependency whose **Resolved CQs** column is non-empty (contains a `clearlydefined` link or a CQ number) is considered already resolved and is **skipped** — only new or previously unresolved dependencies are sent to the API. This dramatically reduces API calls for projects with stable dependency trees.

Use `--recheck` to force a full re-query of all dependencies and regenerate the files from scratch.

#### Downloading the Eclipse Dash JAR

The `--jar` option enables fallback to the official Eclipse Dash License Tool for unresolved dependencies.

**Why use it?** The Eclipse Dash JAR queries the **Eclipse Foundation's internal IP database** (IPLab), which contains additional approval data not available through the public ClearlyDefined API. This can resolve dependencies that appear as "restricted" or "unresolved" when using only the HTTP backend.

**Requirements**: Java 11 or higher must be installed.

**Download**:
```sh
# Download dash-licenses JAR (1.1.0)
curl -Lo dash-licenses.jar https://repo.eclipse.org/repository/dash-maven2/org/eclipse/dash/org.eclipse.dash.licenses/1.1.0/org.eclipse.dash.licenses-1.1.0.jar
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

The `--harvest` flag enables automatic harvest requests for unresolved dependencies through the ClearlyDefined API. It also auto-excludes **transitive** unresolved dependencies (those not listed directly in `package.json`) by appending them to `.deps/EXCLUDED/` with the value `transitive dependency`, so they don't block future runs.

**Why use it?** When ClearlyDefined doesn't have license information for a package, you can request it to "harvest" the license data from the source repository. This process extracts license files and headers automatically.

**How it works**:
1. Transitive unresolved deps are written to `.deps/EXCLUDED/{prod,dev}.md` as `transitive dependency` — no ClearlyDefined request is sent for them
2. For each remaining (direct) unresolved dependency, check if it was already harvested (`GET /harvest/{coordinate}`)
3. If not harvested, request a new harvest (`POST /harvest`)
4. ClearlyDefined queues the harvest job (typically completes in minutes to hours)
5. Re-run `npx @eclipse-che/license-tool` after harvest completes to pick up new license data

**Example**:
```sh
# Request harvest for unresolved dependencies
npx @eclipse-che/license-tool --harvest

# Wait for harvest to complete, then re-run
npx @eclipse-che/license-tool
```

See [docs/harvest.md](docs/harvest.md) for detailed documentation.

### Library

```typescript
import { generate } from '@eclipse-che/license-tool';

const result = await generate({
  projectPath: '/path/to/project',
  batchSize: 500,
  check: false,
  debug: false,
  harvest: false,
  jarPath: '/path/to/dash-licenses.jar', // optional
});

if (result.exitCode === 0) {
  console.log('Licenses OK');
} else {
  console.error(result.error);
}
```

## Output Files

Generated in `.deps/`:

| File | Description |
|---|---|
| `prod.md` | Production dependencies |
| `dev.md` | Development dependencies |
| `problems.md` | Unresolved or restricted **direct** dependencies (transitive deps are omitted) |
| `EXCLUDED/prod.md` | Excluded production deps (CQs, manual approvals, or `transitive dependency`) |
| `EXCLUDED/dev.md` | Excluded dev deps (CQs, manual approvals, or `transitive dependency`) |

## API

### `generate(config: LibraryConfig): Promise<LibraryResult>`

| Option | Type | Default | Description |
|---|---|---|---|
| `projectPath` | `string` | required | Path to project directory (must contain `package.json` and a lock file) |
| `batchSize` | `number` | `500` | Batch size for ClearlyDefined API requests |
| `check` | `boolean` | `false` | Check only — do not write any files |
| `debug` | `boolean` | `false` | Copy tmp directory for inspection |
| `harvest` | `boolean` | `false` | Request harvest for unresolved dependencies from ClearlyDefined |
| `jarPath` | `string` | — | Path to Eclipse `dash-licenses.jar`; runs JAR fallback for unresolved dev deps, adds approved items to `EXCLUDED`, and regenerates `dev.md` |

Returns `Promise<{ exitCode: 0 | 1; error?: string }>`.

## Project Structure

```text
@eclipse-che/license-tool/
├── src/
│   ├── library.ts           # Main library API
│   ├── cli.ts               # CLI entry point
│   ├── backends/            # License resolution (ClearlyDefined)
│   ├── document/            # Document generation
│   ├── helpers/             # Shared utilities
│   └── package-managers/    # npm, yarn, yarn3
├── dist/                    # Built output
└── package.json
```

## Development

### Prerequisites

- Node.js >= 20.0.0
- npm >= 8

### Setup

```sh
git clone https://github.com/che-incubator/dash-licenses.git
cd dash-licenses
npm install
```

### Build

```sh
# Production build (output → dist/)
npm run build

# Development build (unminified, faster)
npm run build:dev

# Watch mode — rebuilds on every file change
npm run build:watch
```

> The `build` script runs `npm run clean` first (removes `dist/` and `*.tsbuildinfo`), then compiles all TypeScript with webpack.

### Test

```sh
# Run all tests
npm test

# Run only unit tests (src/**/*.test.ts)
npm run test:unit

# Run only end-to-end tests (tests/e2e/**/*.test.ts)
npm run test:e2e

# Watch mode — re-runs tests on file change
npm run test:watch

# Generate a coverage report
npm run test:coverage
```

### Lint & type-check

```sh
# Check for lint errors
npm run lint

# Auto-fix lint errors
npm run lint:fix

# TypeScript type-check without emitting files
npm run type-check

# Check that all source files have the EPL-2.0 license header
npm run header:check

# Auto-add missing license headers
npm run header:fix
```

### Run locally against a real project

After a build the CLI is available at `dist/cli.js`. You can point it at any project that has a `package.json` and a lock file:

```sh
# Generate .deps/ files for a project
node dist/cli.js /path/to/your/project

# Check mode (read-only, no files written)
node dist/cli.js --check /path/to/your/project

# Auto-exclude transitive unresolved dependencies and update .deps/EXCLUDED/
node dist/cli.js --harvest /path/to/your/project

# Debug mode (keeps .deps/tmp/ for inspection)
node dist/cli.js --debug /path/to/your/project
```

Alternatively, install the package globally from your local build:

```sh
npm pack            # creates eclipse-che-license-tool-*.tgz
npm install -g eclipse-che-license-tool-*.tgz
license-tool --help
```

### Scripts

| Script | Description |
|---|---|
| `npm run build` | Production webpack build (runs clean first) |
| `npm run build:dev` | Development webpack build (unminified) |
| `npm run build:watch` | Webpack in watch mode |
| `npm test` | Run all tests |
| `npm run test:unit` | Unit tests only (`src/**`) |
| `npm run test:e2e` | End-to-end tests only (`tests/e2e/**`) |
| `npm run test:watch` | Jest in watch mode |
| `npm run test:coverage` | Jest with coverage report |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run type-check` | TypeScript type check (no emit) |
| `npm run header:check` | Verify EPL-2.0 license headers |
| `npm run header:fix` | Add missing license headers |

## Risks and Limitations

- **ClearlyDefined coverage**: Newly published packages may not be indexed yet; use `--jar` or `--harvest` to resolve them
- **Approval rules**: Maintain `src/backends/license-policy.ts` per [Eclipse licenses](https://www.eclipse.org/legal/licenses/) as needed

## Related Projects

- [ClearlyDefined](https://clearlydefined.io/) — License data source
- [Eclipse Dash License Tool](https://github.com/eclipse-dash/dash-licenses) — Original Java tool

## License

EPL-2.0
