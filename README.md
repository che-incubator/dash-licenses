# Container wrapper for Eclipse Dash License Tool

This is a container wrapper for [The Eclipse Dash License Tool](https://github.com/eclipse/dash-licenses) that allows you to easily generate dependencies files with a container image without the need to compile the `dash-licenses` jar.

## Features

- **Multi-package manager support**: Works with Maven, npm, Yarn (v1), and Yarn 3+
- **TypeScript-based**: Fully written in TypeScript with type safety
- **Comprehensive logging**: Structured logging for better debugging
- **Debug mode**: Copy all temporary files for inspection
- **License header enforcement**: Automated license header checking and fixing
- **CI/CD ready**: Designed for integration into build pipelines

## Supported Package Managers

- [Maven](https://maven.apache.org) (`pom.xml`)
- [npm](https://docs.npmjs.com) (`package-lock.json`)
- [Yarn v1](https://classic.yarnpkg.com) (`yarn.lock` with Yarn < 2)
- [Yarn 3+](https://yarnpkg.com) (`yarn.lock` with Yarn >= 3)

## Requirements

- Docker or Podman
- Node.js >= 20.0.0 (for local development)

## Quick Start

### Generate Dependency Information

Generate dependency information for your project:

```sh
docker run --rm -t \
  -v ${PWD}:/workspace/project \
  quay.io/che-incubator/dash-licenses:next --batch 200
```

This command creates the following files in `.deps/`:
- `prod.md` - List of production dependencies
- `dev.md` - List of development and test dependencies
- `problems.md` - Issues found (missing CQs, etc.)

Using `--batch 200` makes the tool more stable by reducing API load and avoiding timeouts.

### Check Dependencies

Verify that all dependencies satisfy IP requirements without generating new files:

```sh
docker run --rm -t \
  -v ${PWD}:/workspace/project \
  quay.io/che-incubator/dash-licenses:next --check --batch 200
```

### Debug Mode

Get all generated files including logs and intermediate files:

```sh
docker run --rm -t \
  -v ${PWD}:/workspace/project \
  quay.io/che-incubator/dash-licenses:next --debug --batch 200
```

This copies all temporary files to `.deps/tmp/` for inspection.

### Batch Size

Control the batch size for license processing (default: 500, recommended: 200):

```sh
# Using command-line argument (recommended)
docker run --rm -t \
  -v ${PWD}:/workspace/project \
  quay.io/che-incubator/dash-licenses:next --batch 200

# Or using environment variable
docker run --rm -t \
  -v ${PWD}:/workspace/project \
  -e BATCH_SIZE=200 \
  quay.io/che-incubator/dash-licenses:next
```

Lower batch sizes (like 200) are more stable and less likely to hit API rate limits or timeouts.

## Project Structure

```
dash-licenses/
├── build/                        # Build and Docker files
│   ├── create-image.sh           # Container image build script
│   └── dockerfiles/
│       ├── Dockerfile            # Main Dockerfile
│       └── entrypoint.sh         # Container entrypoint
├── dist/                         # Compiled JavaScript output
│   ├── document.js
│   └── package-managers/         # Compiled package manager modules
├── scripts/                      # Utility scripts
│   ├── container_tool.sh         # Docker/Podman wrapper script
│   └── strip-headers.sh          # License header utility
├── src/                          # TypeScript source code
│   ├── document/                 # Document generation module
│   │   ├── __tests__/            # Document tests
│   │   └── index.ts              # Main document logic
│   ├── helpers/                  # Shared utilities
│   │   ├── __tests__/            # Helper tests
│   │   ├── chunked-processor.ts  # Batch processing utilities
│   │   ├── package-manager-base.ts # Base class for package managers
│   │   ├── types.ts              # TypeScript type definitions
│   │   └── utils.ts              # Common helper functions
│   └── package-managers/         # Package manager implementations
│       ├── mvn/                  # Maven support
│       │   ├── __tests__/
│       │   ├── bump-deps.ts      # Dependency processing
│       │   ├── index.ts          # Entry point
│       │   └── mvn-processor.ts  # Maven-specific logic
│       ├── npm/                  # npm support
│       │   ├── __tests__/
│       │   ├── bump-deps.ts
│       │   ├── index.ts
│       │   ├── npm-processor.ts
│       │   └── parser.ts         # package-lock.json parser
│       ├── yarn/                 # Yarn v1 support
│       │   ├── __tests__/
│       │   ├── bump-deps.ts
│       │   ├── index.ts
│       │   ├── parser.ts
│       │   └── yarn-processor.ts
│       └── yarn3/                # Yarn 3+ support
│           ├── __tests__/
│           ├── bump-deps.ts
│           ├── index.ts
│           ├── parser.ts
│           └── yarn3-processor.ts
├── tests/                        # End-to-end tests and fixtures
│   ├── e2e/                      # Docker container tests
│   │   └── docker.test.ts
│   ├── fixtures/                 # Test data
│   │   ├── mvn-sample/
│   │   ├── npm-sample/
│   │   └── yarn-sample/
│   └── setup.ts                  # Test setup
├── header-check.js               # License header enforcement
├── package.json
├── tsconfig.json                 # TypeScript configuration
└── webpack.config.js             # Build configuration
```

## Development

### Prerequisites

- Node.js >= 20.0.0
- npm or yarn
- Docker or Podman (for testing container)

### Setup

```sh
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test
```

### Available Scripts

#### Build

- `npm run build` - Compile TypeScript to JavaScript (auto-cleans first)
- `npm run clean` - Remove build artifacts
- `npm run build:watch` - Watch mode for development
- `npm run type-check` - Type check without compilation

#### Testing

- `npm test` - Run all tests
- `npm run test:watch` - Watch mode for tests
- `npm run test:coverage` - Generate coverage report
- `npm run test:unit` - Run unit tests only
- `npm run test:e2e` - Run end-to-end tests only

#### Code Quality

- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues automatically
- `npm run type-check` - TypeScript type checking without compilation

#### License Headers

- `npm run header:check` - Check license headers in all files
- `npm run header:verbose` - Check with verbose output
- `npm run header:fix` - Automatically add missing license headers

### Building the Container

```sh
# Build using the build script
./build/create-image.sh

# Or build manually
docker build -f build/dockerfiles/Dockerfile -t quay.io/che-incubator/dash-licenses:next .
```

### Local Testing

Test the container locally:

```sh
# Using the container tool script (supports Docker/Podman)
./scripts/container_tool.sh run --rm -t \
  -v ${PWD}:/workspace/project \
  quay.io/che-incubator/dash-licenses:next --debug --batch 200
```

## Configuration

### License Headers

License headers are enforced using `header-check.js` at the project root.

To check headers:
```sh
npm run header:check
```

To fix missing headers:
```sh
npm run header:fix
```

### Linting

ESLint is configured for TypeScript. Run with:
```sh
npm run lint
npm run lint:fix  # Auto-fix issues
```

## How It Works

1. **Project Detection**: The tool detects the package manager by checking for:
   - `pom.xml` → Maven
   - `package-lock.json` → npm
   - `yarn.lock` → Yarn (version determined automatically)

2. **Dependency Extraction**: The appropriate parser extracts dependency information:
   - Maven: Uses `mvn dependency:list`
   - npm: Parses `package-lock.json`
   - Yarn: Uses `yarn licenses list` or `yarn info`

3. **License Analysis**: Dependencies are sent to Eclipse Dash License Tool in batches to:
   - Identify licenses
   - Check for CQ (Contribution Questionnaire) status
   - Detect restricted licenses

4. **Document Generation**: Creates markdown files:
   - `prod.md`: Production dependencies with license info
   - `dev.md`: Development dependencies with license info
   - `problems.md`: Issues requiring attention

5. **Exclusion Handling**: Manual exclusions can be added in `.deps/EXCLUDED/`:
   - `prod.md`: Production dependencies that don't need CQs
   - `dev.md`: Development dependencies that don't need CQs

## Troubleshooting

### Permission Denied Errors

If you encounter permission errors when creating `.deps/` directory, ensure the mounted volume has proper permissions. The container will attempt to create the directory structure automatically.

### Empty DEPENDENCIES File

If the `DEPENDENCIES` file is empty:
- Check your internet connection (Eclipse Foundation API access required)
- Verify the batch size isn't too large
- Use `--debug` flag to inspect intermediate files

### Yarn 3 Issues

For Yarn 3 projects:
- Ensure Yarn 3 is properly configured
- The tool will automatically install the licenses plugin if needed
- Check `.deps/tmp/yarn-deps-info.json` in debug mode

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Ensure all tests pass: `npm test`
5. Check code quality: `npm run lint && npm run format:check`
6. Check license headers: `npm run header:check`
7. Submit a pull request

### Code Style

- Follow TypeScript best practices
- Use the provided ESLint and Prettier configurations
- Ensure all files have proper license headers
- Write tests for new features

## License

This project is licensed under the Eclipse Public License 2.0 (EPL-2.0).

## Related Projects

- [Eclipse Dash License Tool](https://github.com/eclipse/dash-licenses) - The underlying license analysis tool
- [Eclipse Che](https://github.com/eclipse-che) - Uses this tool for dependency management

## Support

For issues and questions:
- GitHub Issues: https://github.com/che-incubator/dash-licenses/issues
- Eclipse Che Community: https://github.com/eclipse-che/che
