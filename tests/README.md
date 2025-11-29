# Test Fixtures Generation

## Using --debug to Generate Test Fixtures

The `--debug` flag allows you to generate test fixture files from a real project for use in unit tests. This is useful for creating realistic test data that matches actual dependency analysis output.

## How It Works

When you run the dash-licenses container with the `--debug` flag, it:

1. Processes the project dependencies normally
2. **Copies all TMP directory files to the `.deps` directory** in your project
3. This includes:
   - `DEPENDENCIES` - The main dependencies file from dash-licenses
   - `dependencies-info.json` - Parsed dependency information
   - `prod.md` - Generated production dependencies markdown
   - `dev.md` - Generated development dependencies markdown
   - `problems.md` - Any dependency problems found
   - Other intermediate files used during processing

## Generating Test Fixtures

### Step 1: Run with --debug flag

```bash
podman run --rm -t \
  -v ${PWD}:/workspace/project \
  quay.io/che-incubator/dash-licenses:next --debug
```

This will create a `.deps` directory in your project root with all the generated files.

### Step 2: Copy to test fixtures directory

After running with `--debug`, copy the `.deps` directory to your test fixtures location:

```bash
# For npm projects
cp -r .deps tests/fixtures/npm-sample/

# For yarn projects  
cp -r .deps tests/fixtures/yarn-sample/

# For yarn3 projects
cp -r .deps tests/fixtures/yarn3-sample/

# For maven projects
cp -r .deps tests/fixtures/mvn-sample/
```

### Step 3: Use in unit tests

In your unit tests, you can reference these fixture files:

```typescript
import * as path from 'path';
import * as fs from 'fs';

describe('Dependency Processing', () => {
  const fixtureDir = path.join(__dirname, '../fixtures/npm-sample');
  
  beforeEach(() => {
    // Set up environment variables to point to fixtures
    process.env.DEPS_COPY_DIR = fixtureDir;
    process.env.TMP_DIR = path.join(fixtureDir, 'tmp');
    process.env.ENCODING = 'utf8';
  });
  
  it('should process dependencies from fixture files', () => {
    const dependenciesPath = path.join(fixtureDir, 'tmp', 'DEPENDENCIES');
    expect(fs.existsSync(dependenciesPath)).toBe(true);
    
    // Your test logic here
  });
});
```

## Directory Structure

After running with `--debug`, your `.deps` directory will have this structure:

```
.deps/
├── tmp/
│   ├── DEPENDENCIES              # Main dependencies file from dash-licenses
│   ├── dependencies-info.json    # Parsed dependency info (npm/yarn)
│   ├── yarn-deps-info.json       # Yarn-specific dependency info
│   ├── yarn-deps.json            # Yarn3 dependency info
│   ├── prod.md                   # Generated production deps
│   ├── dev.md                    # Generated development deps
│   └── problems.md               # Dependency problems
├── EXCLUDED/
│   ├── prod.md                   # Excluded production dependencies
│   └── dev.md                    # Excluded development dependencies
├── prod.md                       # Final production dependencies
├── dev.md                        # Final development dependencies
└── problems.md                   # Final problems report
```

## Example: Generating Fixtures from che-server-next

```bash
cd /Users/oleksiiorel/workspace/olexii4/che-server-next

# Run with --debug to generate files
podman run --rm -t \
  -v ${PWD}:/workspace/project \
  quay.io/che-incubator/dash-licenses:next --debug

# Copy to test fixtures
mkdir -p ../dash-licenses/tests/fixtures/yarn-sample
cp -r .deps/* ../dash-licenses/tests/fixtures/yarn-sample/
```

## Notes

- The `.deps` directory is gitignored by default
- Test fixtures should be committed to the repository for consistent testing
- Update fixtures when dependency structures change significantly
- Use different fixture sets for different package managers (npm, yarn, yarn3, mvn)

