# Request Processing Flow

This document describes the complete flow of a license analysis request from start to finish.

## Overview

```
User Request → Detection → Extraction → Resolution → Generation → Validation → Output
```

## Detailed Flow

### 1. Entry Point

#### CLI Mode
```typescript
// User runs: npx license-tool --check
cli.ts:main()
  ├─ parseArgs() → { projectPath, batchSize, check, debug, jarPath }
  └─ generate(config) → LibraryResult
```

#### Library Mode
```typescript
import { generate } from 'license-tool';

const result = await generate({
  projectPath: '/path/to/project',
  batchSize: 500,
  check: false,
  debug: false,
  jarPath: '/optional/path/to/dash-licenses.jar'
});
```

---

### 2. Project Detection & Validation

**File**: `library.ts:generate()`

```
1. Resolve absolute projectPath
2. Check projectPath exists
3. detectPackageManager(projectPath)
   ├─ Look for package.json + package-lock.json → npm
   ├─ Look for package.json + yarn.lock
   │  ├─ getYarnMajorVersion() → execSync('yarn -v')
   │  ├─ version >= 2 → yarn3
   │  └─ version < 2 → yarn
   └─ None found → Error
4. Determine workspaceDir (dist/ or current dir)
5. buildEnvironment(config, workspaceDir)
   └─ Create Environment object with all paths
```

**Environment Setup**:
```typescript
{
  PROJECT_COPY_DIR: '/path/to/project',
  DEPS_DIR: '/path/to/project/.deps',
  TMP_DIR: '/path/to/project/.deps/tmp',
  DEPS_COPY_DIR: '/path/to/project/.deps',  // Same as DEPS_DIR
  WORKSPACE_DIR: '/path/to/dist',
  BATCH_SIZE: '500',
  DASH_LICENSES: ''
}
```

---

### 3. Directory Initialization

**File**: `library.ts:generate()`

```
1. Create .deps/tmp/ directory (recursive)
2. Create .deps/EXCLUDED/ directory (recursive)
3. Create default EXCLUDED files if missing:
   ├─ .deps/EXCLUDED/prod.md
   └─ .deps/EXCLUDED/dev.md
4. Set process.env variables for child processes
```

---

### 4. Package Manager Processing

**File**: `NpmProcessor` / `YarnProcessor` / `Yarn3Processor`

Each processor extends `PackageManagerBase` and follows the same flow:

```
processor.run()
  ├─ validateProject()
  │  ├─ Check package.json exists
  │  └─ Check lock file exists
  │
  ├─ chdir(PROJECT_COPY_DIR)
  │
  ├─ generateDependencies()  [ABSTRACT - implemented by each processor]
  │  └─ See "Dependency Extraction" below
  │
  ├─ verifyDependenciesFile()
  │  ├─ Check .deps/tmp/DEPENDENCIES exists
  │  └─ Check file size > 0
  │
  ├─ checkRestrictions()
  │  ├─ runBumpDeps()
  │  │  └─ See "Document Generation" below
  │  │
  │  ├─ If --check mode:
  │  │  ├─ Compare .deps/prod.md vs .deps/tmp/prod.md
  │  │  └─ Compare .deps/dev.md vs .deps/tmp/dev.md
  │  │
  │  └─ Return { differProd, differDev, restricted }
  │
  └─ handleResults(result)
     ├─ Report outdated dependencies (warnings in --check mode)
     ├─ Report restricted dependencies (always errors)
     └─ Exit with code 0 (success) or 1 (failure)
```

---

### 5. Dependency Extraction

**File**: `ChunkedDashLicensesProcessor:process()`

```
Step 1: Get All Dependencies
────────────────────────────
getAllDependencies()
  ├─ If parserScript is 'cat' or *.txt:
  │  └─ readFileSync(parserInput)  [Used by yarn3]
  │
  └─ Else:
     └─ execSync(`node parser.js`)
        ├─ npm/parser.js → Reads package-lock.json
        ├─ yarn/parser.js → Reads yarn.lock v1
        └─ yarn3/parser.js → Reads yarn.lock v3

  Returns: Array of dependency identifiers
  Example: ["express@4.18.0", "@types/node@20.0.0", ...]


Step 2: Split into Chunks
──────────────────────────
splitIntoChunks(dependencies, batchSize)

  Returns: [[chunk1], [chunk2], ...]
  Example with batchSize=500:
    1000 deps → [500 deps, 500 deps]


Step 3: Process Each Chunk with Retry
──────────────────────────────────────
For each chunk (with retry logic):
  processChunkWithRetry(chunk, tempFile, chunkNum)
    ├─ Attempt 1-9 (DEFAULT_MAX_RETRIES):
    │  ├─ processChunk(chunk, outputFile)
    │  │  └─ backend.processBatch(chunk)
    │  │     ├─ ClearlyDefinedBackend:
    │  │     │  ├─ Convert to ClearlyDefined IDs
    │  │     │  ├─ Fetch in batches of 8 (CONCURRENCY)
    │  │     │  ├─ Sleep 200ms between batches
    │  │     │  └─ Return lines: "id, license, status, source"
    │  │     │
    │  │     └─ JarBackend (fallback):
    │  │        └─ execSync(dash-licenses.jar)
    │  │
    │  ├─ Verify output file created & not empty
    │  └─ If success → return true
    │
    └─ If all attempts fail → return false → ABORT


Step 4: Merge Chunk Results
────────────────────────────
mergeChunkResults(tempFiles)
  ├─ Read each chunk file
  ├─ Use Set to deduplicate entries
  ├─ Sort entries
  └─ Write to final DEPENDENCIES file


Step 5: Cleanup
───────────────
cleanupTempFiles(tempFiles)
  └─ Delete chunk files (unless debug mode)
```

**Example DEPENDENCIES file**:
```
npm/npmjs/-/express/4.18.0, MIT, approved, clearlydefined
npm/npmjs/@types/node/20.0.0, MIT, approved, clearlydefined
npm/npmjs/-/unknown-pkg/1.0.0, , restricted, notfound
```

---

### 6. Document Generation

**File**: `bump-deps.ts` (in each package manager)

```
runBumpDeps() → execSync(`node bump-deps.js ${--check}`)

bump-deps.js flow:
──────────────────

1. Get file paths
   └─ PackageManagerUtils.getFilePaths()

2. Read DEPENDENCIES file
   └─ .deps/tmp/DEPENDENCIES

3. Read EXCLUDED files
   ├─ .deps/EXCLUDED/prod.md
   └─ .deps/EXCLUDED/dev.md

4. Parse DEPENDENCIES
   └─ Split into prod & dev based on package.json

5. Build dependency maps
   ├─ depsToCQ: Map<packageId, CQ link>
   ├─ allLicenses: Map<packageId, { License, URL }>
   └─ Add entries from EXCLUDED files

6. Generate markdown tables
   ├─ arrayToDocument('Production', prodDeps, depsToCQ, allLicenses)
   │  └─ Writes .deps/tmp/prod.md
   │
   ├─ arrayToDocument('Development', devDeps, depsToCQ, allLicenses)
   │  └─ Writes .deps/tmp/dev.md
   │
   └─ If unresolved dependencies:
      └─ Writes .deps/tmp/problems.md

7. JAR Fallback (if jarPath configured)
   └─ runJarFallback() for unresolved dev dependencies
      ├─ Runs Eclipse dash-licenses.jar
      ├─ Parses newly approved items
      ├─ Adds to .deps/EXCLUDED/dev.md
      └─ Regenerates dev.md

8. Check for restricted dependencies
   └─ Exit with code 1 if restricted found
```

**Example prod.md**:
```markdown
# Production

| Packages | License | Resolved CQs |
| --- | --- | --- |
| `express@4.18.0` | MIT | [clearlydefined](https://clearlydefined.io/...) |
| `react@18.0.0` | MIT | [clearlydefined](https://clearlydefined.io/...) |
```

---

### 7. File Copying & Cleanup

**File**: `library.ts:generate()`

```
After processing:

1. If NOT --check mode:
   ├─ Copy .deps/tmp/prod.md → .deps/prod.md
   ├─ Copy .deps/tmp/dev.md → .deps/dev.md
   └─ Copy .deps/tmp/problems.md → .deps/problems.md (if exists)

2. If NOT debug mode:
   └─ Delete .deps/tmp/ directory

3. Return result
   └─ { exitCode: 0 | 1, error?: string }
```

---

## Check Mode vs Generate Mode

### Generate Mode (default)
```
1. Extract dependencies
2. Query license backend
3. Generate markdown files in .deps/tmp/
4. Copy files to .deps/
5. Delete .deps/tmp/
6. Exit 0 if no restricted, 1 if restricted found
```

### Check Mode (--check)
```
1. Extract dependencies
2. Query license backend
3. Generate markdown files in .deps/tmp/
4. Compare .deps/tmp/prod.md with .deps/prod.md
5. Compare .deps/tmp/dev.md with .deps/dev.md
6. DO NOT copy files (read-only)
7. Exit 0 if no restricted AND no changes
8. Exit 1 if restricted found
9. Warn if files differ (but don't fail if no restricted)
```

---

## Error Handling & Retries

### Retry Strategy (ChunkedProcessor)

```
For each chunk:
  ├─ Max retries: 9 (DEFAULT_MAX_RETRIES)
  ├─ Retry delay: 3000ms (DEFAULT_RETRY_DELAY_MS)
  │
  └─ Retry on:
     ├─ HTTP 524 (Timeout)
     ├─ HTTP 429 (Rate limit)
     ├─ HTTP 502 (Bad gateway)
     └─ Empty output file
```

### Error Types

1. **Validation Errors** → Exit immediately
   - Missing package.json
   - Missing lock file
   - Invalid project path

2. **Processing Errors** → Retry 9 times
   - Network timeout
   - Rate limit
   - API unavailable

3. **License Errors** → Continue processing, report at end
   - Restricted license
   - Unresolved license
   - Missing license info

---

## Performance Optimizations

1. **Batching**: Process 500 dependencies per batch (configurable)
2. **Concurrency**: 8 parallel requests per batch to ClearlyDefined
3. **Rate limiting**: 200ms delay between batches
4. **Deduplication**: Use Set to eliminate duplicate dependencies
5. **Caching**: EXCLUDED files act as manual cache
6. **Parallel file I/O**: File copies executed concurrently
