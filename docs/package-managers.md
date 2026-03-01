# Package Manager Separation

This document explains how the library is organized to support multiple package managers (npm, Yarn v1, Yarn 3+) through a modular architecture.

## Overview

Each package manager is isolated in its own directory with a consistent structure:

```
src/package-managers/
├── npm/
│   ├── npm-processor.ts    # Processor (entry point)
│   ├── parser.ts           # Dependency extraction
│   ├── bump-deps.ts        # Document generation
│   └── index.ts            # Exports
│
├── yarn/
│   ├── yarn-processor.ts   # Processor (entry point)
│   ├── parser.ts           # Dependency extraction
│   ├── bump-deps.ts        # Document generation
│   └── index.ts            # Exports
│
└── yarn3/
    ├── yarn3-processor.ts  # Processor (entry point)
    ├── parser.ts           # Dependency extraction
    ├── yarn-lockfile.ts    # Lockfile parser utility
    ├── bump-deps.ts        # Document generation
    └── index.ts            # Exports
```

---

## Base Class: PackageManagerBase

All package managers extend `PackageManagerBase` (in `helpers/package-manager-base.ts`), which provides:

### Shared Functionality

```typescript
abstract class PackageManagerBase {
  // Configuration
  protected readonly env: Environment;
  protected readonly options: Options;
  protected readonly config: PackageManagerConfig;

  // Main workflow
  public async run(): Promise<void> {
    this.validateProject();
    await this.generateDependencies();  // ← Abstract method
    this.verifyDependenciesFile();
    const result = await this.checkRestrictions();
    this.handleResults(result);
  }

  // File operations
  protected copyResultFiles(force?: boolean): void;
  protected copyTmpDir(): void;

  // Validation
  protected validateProject(): void;
  protected verifyDependenciesFile(): void;

  // License checking
  protected async runBumpDeps(): Promise<number>;  // Can be overridden
  protected async checkRestrictions(): Promise<PackageManagerResult>;
  protected handleResults(result: PackageManagerResult): void;

  // Abstract method - must be implemented by subclasses
  protected abstract generateDependencies(): Promise<void>;
}
```

### What Subclasses Must Implement

**Required:** `generateDependencies()`
- Extract dependencies from lock files
- Use `ChunkedDashLicensesProcessor` to query licenses via ClearlyDefined API
- Write results to `.deps/tmp/DEPENDENCIES`

**Optional:** `runBumpDeps()` override
- Execute the processor class directly (instead of via execSync)
- Allows for better error handling and library mode compatibility
- Returns exit code (0 = success, 1 = error)

---

## Package Manager: npm

### Files

#### 1. `npm-processor.ts`

**Purpose**: Entry point for npm projects

```typescript
import { parseNpmDependencies } from './parser';
import { NpmDependencyProcessor } from './bump-deps';

export class NpmProcessor extends PackageManagerBase {
  constructor(env?: Environment, options?: Options) {
    super(
      {
        name: 'npm',
        projectFile: 'package.json'
      },
      env,
      options
    );
  }

  protected async generateDependencies(): Promise<void> {
    // Parse dependencies from package-lock.json
    const allDeps = parseNpmDependencies(this.env.PROJECT_COPY_DIR);

    // Write to temp file for chunked processor
    const allDepsFile = path.join(this.env.TMP_DIR, 'npm-all-deps.txt');
    writeFileSync(allDepsFile, [...allDeps.dependencies, ...allDeps.devDependencies].join('\n') + '\n');

    const depsFilePath = path.join(this.env.TMP_DIR, 'DEPENDENCIES');

    const processor = new ChunkedDashLicensesProcessor({
      parserScript: 'cat',
      parserInput: allDepsFile,
      parserEnv: this.env,
      batchSize: parseInt(this.env.BATCH_SIZE),
      outputFile: depsFilePath,
      debug: this.options.debug,
      enableHarvest: this.options.harvest
    });

    await processor.process();
  }

  // Override to run bump-deps directly instead of via execSync
  protected override async runBumpDeps(): Promise<number> {
    console.log('Checking dependencies for restrictions to use...');
    try {
      const processor = new NpmDependencyProcessor();
      processor.process();
      return 0;
    } catch (error) {
      // Error already logged by the processor
      return 1;
    }
  }
}
```

#### 2. `parser.ts`

**Purpose**: Export function to extract dependencies from `package-lock.json`

**Export**: `parseNpmDependencies(projectDir: string): AllDeps`

**Returns**: Object with `dependencies` and `devDependencies` arrays

```typescript
export interface AllDeps {
  dependencies: string[];
  devDependencies: string[];
}

export function parseNpmDependencies(projectDir: string): AllDeps {
  const lockfilePath = path.join(projectDir, 'package-lock.json');
  const packageJsonPath = path.join(projectDir, 'package.json');

  const lockfile = JSON.parse(readFileSync(lockfilePath, 'utf8'));
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

  // Extract all unique dependencies
  const allDeps = extractDependencies(lockfile);

  // Separate prod vs dev using package.json
  const prodSet = new Set(Object.keys(packageJson.dependencies || {}));
  const devSet = new Set(Object.keys(packageJson.devDependencies || {}));

  const result: AllDeps = {
    dependencies: [],
    devDependencies: []
  };

  for (const dep of allDeps) {
    const pkgName = dep.split('@')[0];
    if (prodSet.has(pkgName)) {
      result.dependencies.push(dep);
    } else if (devSet.has(pkgName)) {
      result.devDependencies.push(dep);
    }
  }

  return result;
}
```

#### 3. `bump-deps.ts`

**Purpose**: Export class to generate markdown tables (prod.md, dev.md, problems.md)

**Export**: `NpmDependencyProcessor` class with `process()` method

**Input**:
- `.deps/tmp/DEPENDENCIES` file
- `.deps/tmp/dependencies-info.json` (written by npm-processor.ts)
- `.deps/EXCLUDED/*.md` files

**Output**:
- `.deps/tmp/prod.md`
- `.deps/tmp/dev.md`
- `.deps/tmp/problems.md` (if unresolved deps exist)

**Key logic**:
```typescript
export class NpmDependencyProcessor {
  public process(): void {
    try {
      const paths = PackageManagerUtils.getFilePaths();

      // Read dependencies info written by npm-processor
      const depsInfoPath = path.join(paths.TMP_DIR, 'dependencies-info.json');
      const allDeps = JSON.parse(readFileSync(depsInfoPath, 'utf8'));

      // Get all dependency information from DEPENDENCIES file
      const allDependencies: LicenseMap = new Map();

      // Generate documents using shared utility
      PackageManagerUtils.processAndGenerateDocuments(
        allDeps.dependencies,      // prod dependencies
        allDeps.devDependencies,   // dev dependencies
        allDependencies,           // license info map
        paths
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error processing NPM dependencies:', errorMessage);
      throw error;
    }
  }
}
```

---

## Package Manager: yarn (v1)

### Files

#### 1. `yarn-processor.ts`

**Purpose**: Entry point for Yarn v1 projects

```typescript
import { parseYarnDependencies } from './parser';
import { YarnDependencyProcessor } from './bump-deps';

export class YarnProcessor extends PackageManagerBase {
  constructor(env?: Environment, options?: Options) {
    super(
      {
        name: 'yarn',
        projectFile: 'package.json',
        lockFile: 'yarn.lock'
      },
      env,
      options
    );
  }

  protected async generateDependencies(): Promise<void> {
    // Generate all dependencies info using yarn licenses command
    console.log('Generating all dependencies info using yarn...');
    const depsInfoFile = path.join(this.env.TMP_DIR, 'yarn-deps-info.json');
    execSync(
      `yarn licenses list --ignore-engines --json --depth=0 --no-progress --network-timeout 300000 > "${depsInfoFile}"`,
      { cwd: this.env.PROJECT_COPY_DIR }
    );

    // Parse and write to temp file
    const allDeps = parseYarnDependencies(this.env.TMP_DIR);
    const allDepsFile = path.join(this.env.TMP_DIR, 'yarn-all-deps.txt');
    writeFileSync(allDepsFile, allDeps.join('\n') + '\n', 'utf8');

    // Process via ClearlyDefined
    const depsFilePath = path.join(this.env.TMP_DIR, 'DEPENDENCIES');
    const processor = new ChunkedDashLicensesProcessor({
      parserScript: 'cat',
      parserInput: allDepsFile,
      parserEnv: this.env,
      batchSize: parseInt(this.env.BATCH_SIZE),
      outputFile: depsFilePath,
      debug: this.options.debug,
      enableHarvest: this.options.harvest
    });

    await processor.process();

    // Generate prod/dev lists for bump-deps
    execSync(`yarn list --ignore-engines --json --prod --depth=0 --no-progress > yarn-prod-deps.json`, { cwd: this.env.PROJECT_COPY_DIR });
    execSync(`yarn list --ignore-engines --json --depth=0 --no-progress > yarn-all-deps.json`, { cwd: this.env.PROJECT_COPY_DIR });
  }

  // Override to run bump-deps directly
  protected override async runBumpDeps(): Promise<number> {
    console.log('Checking dependencies for restrictions to use...');
    try {
      const processor = new YarnDependencyProcessor();
      processor.process();
      return 0;
    } catch (error) {
      return 1;
    }
  }
}
```

#### 2. `parser.ts`

**Purpose**: Export function to parse Yarn v1 dependency info

**Export**: `parseYarnDependencies(tmpDir: string): string[]`

**Input**: Reads `yarn-deps-info.json` from tmpDir (generated by yarn licenses command)

**Output**: Array of dependency identifiers (format: `name@version`)

**Key logic**:
```typescript
export function parseYarnDependencies(tmpDir: string): string[] {
  const depsInfoFile = path.join(tmpDir, 'yarn-deps-info.json');
  const content = readFileSync(depsInfoFile, 'utf8');

  const dependencies: string[] = [];

  // Parse NDJSON format (one JSON object per line)
  const lines = content.trim().split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const data = JSON.parse(line);
      if (data.type === 'table' && data.data?.body) {
        for (const row of data.data.body) {
          const [name, version] = row;
          dependencies.push(`${name}@${version}`);
        }
      }
    } catch (err) {
      // Skip invalid lines
    }
  }

  return dependencies;
}
```

#### 3. `bump-deps.ts`

**Purpose**: Export `YarnDependencyProcessor` class

**Export**: `YarnDependencyProcessor` class with `process()` method

Uses similar logic to npm's bump-deps, but reads from yarn-specific temp files (yarn-prod-deps.json, yarn-all-deps.json) to separate production vs development dependencies.

---

## Package Manager: yarn3 (Yarn 3+)

### Files

#### 1. `yarn3-processor.ts`

**Purpose**: Entry point for Yarn 3+ projects

**Key difference**: Uses lockfile parsing + ClearlyDefined instead of yarn plugin

```typescript
import { parseYarnLockfile } from './yarn-lockfile';
import { Yarn3DependencyProcessor } from './bump-deps';

export class Yarn3Processor extends PackageManagerBase {
  protected async generateDependencies(): Promise<void> {
    // 1. yarn install (for node_modules)
    execSync('yarn install', {
      cwd: projectDir,
      stdio: this.options.debug ? 'inherit' : 'pipe'
    });

    // 2. Parse yarn.lock + package.json for prod/dev separation
    const lockfileResult = parseYarnLockfile(projectDir);

    // 3. Write dep lists for bump-deps
    const depsInfoPath = path.join(this.env.TMP_DIR, 'yarn3-deps-info.json');
    writeFileSync(depsInfoPath, JSON.stringify({
      dependencies: lockfileResult.prod,
      devDependencies: lockfileResult.dev
    }));

    const allDepsFile = path.join(this.env.TMP_DIR, 'yarn-all-deps.txt');
    writeFileSync(allDepsFile, lockfileResult.all.join('\n') + '\n');

    // 4. Generate DEPENDENCIES via ChunkedProcessor (ClearlyDefined)
    const processor = new ChunkedDashLicensesProcessor({
      parserScript: 'cat',
      parserInput: allDepsFile,
      parserEnv: this.env,
      batchSize: parseInt(this.env.BATCH_SIZE),
      outputFile: depsFilePath,
      debug: this.options.debug,
      enableHarvest: this.options.harvest
    });

    await processor.process();
  }

  // Override to run bump-deps directly
  protected override async runBumpDeps(): Promise<number> {
    console.log('Checking dependencies for restrictions to use...');
    try {
      const processor = new Yarn3DependencyProcessor();
      processor.process();
      return 0;
    } catch (error) {
      return 1;
    }
  }
}
```

**Why different from Yarn v1?**

Yarn 3+ doesn't have a built-in `yarn licenses` command. Instead:
1. Parse yarn.lock directly using `@yarnpkg/parsers`
2. Separate prod/dev using package.json
3. Write to temp file
4. Use `cat` to "parse" (just read the file)
5. No yarn plugin required

#### 2. `parser.ts`

**Purpose**: Simple wrapper around `yarn-lockfile.ts`

**Not used** during normal flow (processor calls YarnLockfileParser directly)

Only used for standalone testing/debugging:
```bash
node parser.js /path/to/project
```

#### 3. `yarn-lockfile.ts`

**Purpose**: Parse Yarn 3+ YAML lockfile format

**Yarn 3+ lock format**:
```yaml
__metadata:
  version: 6

"express@npm:^4.18.0":
  version: 4.18.0
  resolution: "express@npm:4.18.0"
  dependencies:
    accepts: ^1.3.8
  checksum: abc123...
```

**Key logic**:
```typescript
import { parse as parseYaml } from 'yaml';

export class YarnLockfileParser {
  static extractAllDependencies(projectPath: string): Set<string> {
    const lockfilePath = path.join(projectPath, 'yarn.lock');
    const content = readFileSync(lockfilePath, 'utf8');
    const parsed = parseYaml(content);

    const deps = new Set<string>();

    for (const [key, value] of Object.entries(parsed)) {
      if (key === '__metadata') continue;

      // key format: "express@npm:^4.18.0"
      // value.version: "4.18.0"
      const name = key.split('@npm:')[0].replace(/^"/, '');
      const version = value.version;

      deps.add(`${name}@${version}`);
    }

    return deps;
  }
}
```

#### 4. `bump-deps.ts`

**Purpose**: Export `Yarn3DependencyProcessor` class

**Export**: `Yarn3DependencyProcessor` class with `process()` method

Same pattern as npm/yarn processors - uses shared `PackageManagerUtils.processAndGenerateDocuments()` utility to generate markdown tables from the DEPENDENCIES file and yarn3-deps-info.json.

---

## Adding a New Package Manager

To add support for a new package manager (e.g., pnpm):

### 1. Create directory structure

```
src/package-managers/pnpm/
├── pnpm-processor.ts
├── parser.ts
├── bump-deps.ts
└── index.ts
```

### 2. Implement processor

```typescript
export class PnpmProcessor extends PackageManagerBase {
  constructor(env?: Environment, options?: Options) {
    super(
      {
        name: 'pnpm',
        projectFile: 'package.json',
        lockFile: 'pnpm-lock.yaml'
      },
      env,
      options
    );
  }

  protected async generateDependencies(): Promise<void> {
    const parserScript = path.join(
      this.env.WORKSPACE_DIR,
      'package-managers/pnpm/parser.js'
    );
    const depsFilePath = path.join(this.env.TMP_DIR, 'DEPENDENCIES');

    const processor = new ChunkedDashLicensesProcessor({
      parserScript,
      parserInput: '',
      parserEnv: this.env,
      batchSize: parseInt(this.env.BATCH_SIZE),
      outputFile: depsFilePath,
      debug: this.options.debug
    });

    await processor.process();
  }
}
```

### 3. Implement parser

```typescript
// parser.ts
import { readFileSync } from 'fs';
import { parse } from 'yaml';

const lockfile = parse(readFileSync('pnpm-lock.yaml', 'utf8'));

// Extract dependencies from pnpm lockfile format
const deps = new Set<string>();
// ... parse logic ...

// Print to stdout
deps.forEach(dep => console.log(dep));
```

### 4. Implement bump-deps

Can usually reuse npm's bump-deps.ts or extend it:

```typescript
// bump-deps.ts
import { main as npmBumpDeps } from '../npm/bump-deps';

// If logic is the same:
npmBumpDeps();

// Or customize:
// ... custom logic ...
```

### 5. Update library.ts detection

```typescript
function detectPackageManager(projectPath: string): PackageManager | null {
  if (existsSync(path.join(projectPath, 'package.json'))) {
    if (existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) {
      return 'pnpm';
    }
    // ... other checks ...
  }
  return null;
}

// Update processor creation
if (pm === 'pnpm') {
  processor = new PnpmProcessor(env, options);
}
```

### 6. Add tests

```
src/package-managers/pnpm/__tests__/
├── parser.test.ts
├── bump-deps.test.ts
└── integration.test.ts
```

---

## Comparison Matrix

| Feature | npm | Yarn v1 | Yarn 3+ |
|---------|-----|---------|---------|
| Lock file | package-lock.json | yarn.lock | yarn.lock |
| Lock format | JSON | Custom | YAML |
| Parser | Spawned process | Spawned process | In-process |
| Parser library | Built-in | @yarnpkg/lockfile | yaml |
| License extraction | ClearlyDefined only | ClearlyDefined only | ClearlyDefined + package.json |
| Prod/dev separation | package.json | package.json | package.json |

---

## Shared vs Isolated Code

### Shared (in `helpers/`)

- `PackageManagerBase` - Base class workflow
- `ChunkedDashLicensesProcessor` - Batch processing
- `PackageManagerUtils` - File path utilities
- Document generation helpers (in `document/`)

### Isolated (in `package-managers/{name}/`)

- Lock file parsing logic
- Dependency extraction
- Package manager-specific bump-deps logic

This separation ensures:
1. Easy to add new package managers
2. Changes to one don't affect others
3. Clear responsibility boundaries
4. Testable in isolation
