### What does this PR do?

Adds first-class handling for **transitive unresolved dependencies** — packages that appear in the lock-file but are not directly listed in the root `package.json`.

Previously, every dependency unresolved by ClearlyDefined caused a hard failure and was written to `problems.md`, regardless of whether it was a direct or transitive dep. This made it impossible to distinguish "we have a license issue" from "a transitive dep just isn't in ClearlyDefined yet."

#### Key changes

- **`src/helpers/utils.ts`**
  - `getDirectPackageNames(projectPath)` — reads root `package.json` and returns sets of direct prod/dev dependency _names_ (without versions).
  - `appendTransitiveExcludes(filePath, identifiers, encoding)` — appends `| \`pkg@version\` | transitive dependency |` rows to an EXCLUDED markdown file, creating it if absent, skipping duplicates.
  - `ProcessingOptions` interface — carries `harvest` and `check` flags through the call chain so library callers don't have to rely on `process.argv`.
  - `processAndGenerateDocuments()` — after JAR fallback, classifies still-unresolved deps as **direct** or **transitive** by comparing package names against the root `package.json`. Transitive deps are added to `depsToCQ` in memory with the value `"transitive dependency"` so they appear as resolved in the generated docs and are never written to `problems.md`. In `--harvest` mode they are also persisted to `.deps/EXCLUDED/dev.md` / `.deps/EXCLUDED/prod.md`.

- **`src/package-managers/{npm,yarn,yarn3}/bump-deps.ts`** — `process()` now accepts an optional `ProcessingOptions` parameter and forwards it to `processAndGenerateDocuments()`.

- **`src/package-managers/{npm,yarn,yarn3}/*-processor.ts`** — `runBumpDeps()` passes `{ harvest, check }` from the processor's own `options` object.

#### Behaviour summary

| Mode | Transitive unresolved | Direct unresolved |
|---|---|---|
| `--generate` (default) | Suppressed from `problems.md`; console note printed | Fails as before |
| `--check` | Suppressed; console note with advice to run `--harvest` | Fails as before |
| `--harvest` | Auto-written to `.deps/EXCLUDED/` as `transitive dependency`; no ClearlyDefined harvest request sent | Harvest requested as before |

#### Inspired by

[devworkspace-generator#387](https://github.com/devfile/devworkspace-generator/pull/387) — a GitHub Actions workflow that reads `problems.md` and auto-excludes transitive deps between retries. This PR bakes the same logic directly into the tool.

### What issues does this PR fix or reference?

- Eliminates false-positive failures caused by transitive dependencies that are not directly managed by the project.
- Aligns `problems.md` content with "deps the project owner is responsible for", making the file actionable.
- Running `license-tool --harvest` now fully self-heals transitive UNRESOLVED entries without manual EXCLUDED file edits.

### Is it tested? How?

1. Run `npm test` — all 199 tests pass.
2. Run `npm run build` — webpack bundle compiled successfully.
3. Manual verification:
   - Add a package to `node_modules` that is not in `package.json` and is unknown to ClearlyDefined; confirm it appears in the console note but NOT in `problems.md` and does not cause exit code 1.
   - Re-run with `--harvest`; confirm the dep is appended to `.deps/EXCLUDED/dev.md` as `transitive dependency` and the run exits 0.
   - Confirm a direct dep that is UNRESOLVED still causes failure and appears in `problems.md`.
