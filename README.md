# Container wrapper for Eclipse Dash License Tool

This is a container wrapper for [The Eclipse Dash License Tool](https://github.com/eclipse/dash-licenses) that allows you to easily generate dependencies files with a container image without the need to compile the `dash-licenses` jar.
It supports the following package managers:
 - [mvn](https://maven.apache.org)
 - [npm](https://docs.npmjs.com)
 - [yarn](https://yarnpkg.com)

## Requirements

- Docker

## Build

```sh
scripts/build.sh
```

## Usage

### Update dependency info

The following command generates dependency information for a project and then checks all found dependencies. It returns a non-zero exit code if any of them are restricted for use.
```sh
docker run --rm -t \
       -v ${PWD}/:/workspace/project  \
       quay.io/che-incubator/dash-licenses:next
```
As a result, this command creates the following files:
- `prod.md` with the list of production dependencies;
- `dev.md` which contains only build and test dependencies;
- `problems.md` will be created if some dependencies are not covered with CQ, unnecessary excludes are present, etc.

### Check dependencies

If you just need to verify that all dependencies satisfy IP requirements, use the `--check` flag, like the following:
```sh
docker run --rm -t \
       -v ${PWD}/:/workspace/project  \
       quay.io/che-incubator/dash-licenses:next --check
```

This command doesn't create any new files in the project directory (except a temporary one) but checks if the dependency information is up-to-date and then validates all found dependencies. It returns a non-zero exit code if any of the dependencies are restricted for use.

### Debug

If you need all the generated files including logs and intermediate files, use the `--debug` flag:

```sh
docker run --rm -t \
       -v ${PWD}/:/workspace/project  \
       quay.io/che-incubator/dash-licenses:next --debug
```

This command copies all files from the temporary directory. It returns a non-zero exit code if any of the dependencies are restricted for use.

## Development

### TypeScript Support

This project is written in TypeScript and provides full type safety. See [TYPESCRIPT-MIGRATION.md](TYPESCRIPT-MIGRATION.md) for details.

Quick commands:
- `npm run build` - Compile TypeScript to JavaScript (automatically cleans first)
- `npm run clean` - Remove build artifacts (dist/ directory and .tsbuildinfo files)
- `npm run build:clean` - Explicitly clean and build (alternative to just `npm run build`)
- `npm run type-check` - Check TypeScript types without compilation
- `npm run dev` - Run TypeScript directly with ts-node

**Note**: When building the Docker image, TypeScript compilation happens automatically inside the container - no need to run `npm run build` beforehand.

### License Header Checking

This project enforces license headers in all source files. See [LICENSE-CHECKING.md](LICENSE-CHECKING.md) for details.

Quick commands:
- `npm run license:check` - Check license headers
- `npm run license:fix` - Fix license headers automatically
- `npm run lint` - Run full linting (includes license check)
