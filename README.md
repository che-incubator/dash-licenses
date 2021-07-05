# Container wrapper for Eclipse Dash License Tool

This is a container wrapper for [The Eclipse Dash License Tool](https://github.com/eclipse/dash-licenses) that allows easily to generate dependencies files with container image without the need to compile `dash-licenses` jar.
It supports next package-manager:
 - [mvn](https://maven.apache.org)
 - [npm](https://docs.npmjs.com)
 - [yarn](https://yarnpkg.com)

## Requirements

- Docker

## Build

```sh
./build.sh
```

## Usage

The following command generates dependencies info of a project and then checks all found dependencies. It returns a non-zero exit code if any of them are restricted to use.

```sh
docker run --rm -t \
       -v ${PWD}/:/workspace/project  \
       quay.io/che-incubator/dash-licenses:next
```
As the result this command creates next files: 

- `prod.md` with the list of production dependencies;
- `dev.md` which contains only build and test dependencies;
- `problems.md` will be created if some dependencies are not covered with CQ, unnecessary excludes present, etc. 

This command doesn't create any new files in the project directory (except a temporary one) but checks if dependencies info is up-to-date and then validates all found dependencies. It returns a non-zero exit code if any of the dependencies are restricted to use. 

```sh
docker run --rm -t \
       -v ${PWD}/:/workspace/project  \
       quay.io/che-incubator/dash-licenses:next --check
```
This command copies all files from the temporary directory. It returns a non-zero exit code if any of the dependencies are restricted to use.

```sh
docker run --rm -t \
       -v ${PWD}/:/workspace/project  \
       quay.io/che-incubator/dash-licenses:next --debug
```
