<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

---

## Project Documentation

All internal docs live in `docs/`. Read the relevant file before making changes to the area it covers.

### [`docs/architecture.md`](docs/architecture.md)
Overall system design. Covers:
- Component diagram (CLI → package manager processors → ClearlyDefined backend → document generation)
- Directory structure (`src/backends/`, `src/helpers/`, `src/package-managers/`)
- Key components: entry points, package manager layer, license resolution, document generation
- Transitive vs direct dependency classification — `getDirectPackageNames()` scans root **and** all workspace `package.json` files; transitive unresolved deps are suppressed from `problems.md` and auto-written to `.deps/EXCLUDED/` in `--harvest` mode
- EXCLUDED file hygiene (orphan removal, blank line prevention)
- `ProcessingOptions` interface (`harvest`, `check` flags)
- Environment variables and options reference
- Note: `dist/` is gitignored — run `npm run build` to generate it

### [`docs/request-flow.md`](docs/request-flow.md)
Step-by-step trace of a full run. Covers:
- CLI vs library entry points
- Package manager detection and validation
- Dependency extraction from lock files
- Chunked ClearlyDefined API processing
- JAR fallback for unresolved dev deps
- Document generation (prod.md, dev.md, problems.md)
- Generate mode vs check mode behaviour
- Error handling and retries

### [`docs/harvest.md`](docs/harvest.md)
`--harvest` flag and transitive dependency handling. Covers:
- What ClearlyDefined harvesting is (GET status → POST request)
- Transitive dep detection: a dep is transitive if it is absent from every `package.json` in the project (root + workspace packages); transitive deps are never sent for harvest — they are appended to `.deps/EXCLUDED/` instead
- Behaviour table: direct vs transitive in `--generate` / `--check` / `--harvest` modes
- Example console output before and after `--harvest`
- Best practices (wait before re-running, check ClearlyDefined UI)
- API rate limits and coordinate format

### [`docs/package-managers.md`](docs/package-managers.md)
Per-package-manager implementation details. Covers:
- Modular structure (`processor.ts` / `parser.ts` / `bump-deps.ts` per package manager)
- `PackageManagerBase` abstract class and shared workflow
- npm: `package-lock.json` parsing, `NpmDependencyProcessor`
- Yarn v1: `yarn licenses list` command, NDJSON parsing
- Yarn 3+: direct `yarn.lock` YAML parsing via `@yarnpkg/parsers`, no plugin required
- `processAndGenerateDocuments()` calls workspace-aware `getDirectPackageNames()` — monorepos are handled correctly
- Comparison matrix (lock file format, parser approach, prod/dev separation)
- How to add a new package manager (pnpm example)