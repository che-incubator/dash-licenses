# Architecture Overview

## General Structure

license-tool is a Node.js library that analyzes dependencies from JavaScript/TypeScript projects and validates their licenses against a policy. It can be used both as a library and as a CLI tool.

```
┌─────────────────────────────────────────────────────────────┐
│                        Entry Points                          │
├──────────────────────┬──────────────────────────────────────┤
│   CLI (cli.ts)       │   Library API (library.ts)           │
│   - Parse arguments  │   - generate() function              │
│   - Call generate()  │   - LibraryConfig interface          │
└──────────────────────┴──────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Package Manager Detection                  │
│   - Detects npm, yarn v1, or yarn 3+ from lock files       │
│   - Creates appropriate processor instance                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Package Manager Processors                │
├──────────────────────┬──────────────────┬──────────────────┤
│   NpmProcessor       │  YarnProcessor   │ Yarn3Processor   │
│   (package-lock.json)│  (yarn v1)       │ (yarn 3+)        │
└──────────────────────┴──────────────────┴──────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              ChunkedDashLicensesProcessor                    │
│   - Runs parser script to extract dependencies              │
│   - Splits into batches for processing                      │
│   - Handles retries and failures                            │
│   - Merges results from all batches                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      License Backends                        │
├──────────────────────┬──────────────────────────────────────┤
│ ClearlyDefinedBackend│        JarBackend (fallback)         │
│ - HTTP API calls     │ - Runs Eclipse dash-licenses.jar     │
│ - Batched processing │ - For unresolved dev dependencies    │
│ - Rate limiting      │ - Optional fallback mechanism        │
└──────────────────────┴──────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Document Generation                       │
│   - Parses DEPENDENCIES file                                │
│   - Reads EXCLUDED files                                    │
│   - Generates prod.md, dev.md, problems.md                  │
│   - Validates license policy                                │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
src/
├── library.ts              # Main library entry point
├── cli.ts                  # CLI entry point
│
├── backends/               # License resolution backends
│   ├── clearlydefined-backend.ts    # HTTP API backend
│   ├── clearlydefined-client.ts     # HTTP client with harvest support
│   ├── license-policy.ts           # SPDX license approval rules
│   ├── coordinate-utils.ts         # ID format conversions
│   └── types.ts                    # Shared types
│
├── document/               # Document generation
│   └── index.ts           # Markdown table generation
│
├── helpers/                # Shared utilities
│   ├── chunked-processor.ts        # Batch processing orchestrator
│   ├── package-manager-base.ts     # Base class for processors
│   ├── types.ts                    # Environment & options types
│   ├── utils.ts                    # Utility functions
│   ├── jar-fallback.ts             # JAR fallback logic
│   └── logger.ts                   # Logging utility
│
└── package-managers/       # Package manager implementations
    ├── npm/
    │   ├── npm-processor.ts       # npm entry point
    │   ├── parser.ts              # Export parseNpmDependencies()
    │   └── bump-deps.ts           # Export NpmDependencyProcessor class
    │
    ├── yarn/
    │   ├── yarn-processor.ts      # yarn v1 entry point
    │   ├── parser.ts              # Export parseYarnDependencies()
    │   └── bump-deps.ts           # Export YarnDependencyProcessor class
    │
    └── yarn3/
        ├── yarn3-processor.ts     # yarn 3+ entry point
        ├── parser.ts              # Export parseYarnLockfile()
        ├── yarn-lockfile.ts       # Lockfile parser utility
        └── bump-deps.ts           # Export Yarn3DependencyProcessor class
```

## Key Components

### 1. Entry Points

- **cli.ts**: Command-line interface that parses arguments and calls the library API
- **library.ts**: Main API with `generate()` function that orchestrates the entire process

### 2. Package Manager Layer

Each package manager has three files:
- **processor.ts**: Extends `PackageManagerBase`, implements `generateDependencies()` and optionally overrides `runBumpDeps()`
- **parser.ts**: Exports functions to extract dependency lists from lock files (used directly via imports)
- **bump-deps.ts**: Exports classes that generate markdown tables (prod.md, dev.md, problems.md)

### 3. License Resolution

- **ClearlyDefinedBackend**: Queries ClearlyDefined HTTP API in batches
- **JarBackend**: Fallback to Eclipse dash-licenses.jar for unresolved dependencies
- **ChunkedProcessor**: Orchestrates batching, retries, and merging

### 4. Document Generation

- Reads DEPENDENCIES file (format: `id, license, status, source`)
- Reads EXCLUDED files (markdown tables with manual exclusions)
- Generates prod.md, dev.md, problems.md
- Tracks unresolved dependencies

## Data Flow

1. **Detection**: Detect package manager from lock files
2. **Extraction**: Parse lock files using direct imports to extract all dependencies
3. **Resolution**: Query ClearlyDefined API via chunked batching for license data
4. **Harvest** (optional): Request ClearlyDefined to harvest missing license data
5. **JAR Fallback** (optional): Query Eclipse IP database for unresolved dev dependencies
6. **Generation**: Generate markdown tables (prod.md, dev.md) with license info
7. **Validation**: Check for restricted/unresolved licenses
8. **Output**: Copy files from `.deps/tmp/` to `.deps/` directory (generate mode only)

## Configuration

### Environment Variables

Set by `library.ts` for child processes:

- `PROJECT_COPY_DIR`: Project directory path
- `TMP_DIR`: Temporary directory for processing (`.deps/tmp`)
- `DEPS_COPY_DIR`: Output directory (`.deps/`)
- `WORKSPACE_DIR`: Path to compiled code (dist/)
- `BATCH_SIZE`: Number of dependencies per batch
- `JAR_PATH`: Optional path to Eclipse dash-licenses.jar

### Options

- **check**: Read-only mode, no file generation (only validation)
- **debug**: Keep temporary files for inspection in `.deps/tmp/`
- **batchSize**: Dependencies per batch (default: 500)
- **harvest**: Auto-request harvest for unresolved dependencies via ClearlyDefined API
- **jarPath**: Enable JAR fallback for unresolved dev dependencies via Eclipse IP database
