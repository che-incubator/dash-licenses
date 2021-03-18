# Container wrapper for Eclipse Dash License Tool

This is a container wrapper for [The Eclipse Dash License Tool](https://github.com/eclipse/dash-licenses) that allows easily to generate dependencies files with container image without the need to compile `dash-licenses` jar.

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

This command doesn't create any new files in the project directory (except a temporary one) but checks if dependencies info is up-to-date and then validates all found dependencies. It returns a non-zero exit code if any of the dependencies are restricted to use. 

```sh
docker run --rm -t \
       -v ${PWD}/:/workspace/project  \
       quay.io/che-incubator/dash-licenses:next --check
```
