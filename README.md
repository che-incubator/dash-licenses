# Container wrapper for Eclipse Dash License Tool

It's container wrapper for (The Eclipse Dash License Tool)[https://github.com/eclipse/dash-licenses] that allows easily to generate dependencies files with container image without need to compile dash-licenses jar.

## Requirements

- Docker

## Running
To generate dependencies info:
```sh
docker run --rm -t \
       -v ${PWD}/:/workspace/project  \
       quay.io/che-incubator/dash-licenses:next
```

To generate dependencies info and fail if any dependency present which does not satisfies license requirements:
```sh
docker run --rm -t \
       -v ${PWD}/:/workspace/project  \
       quay.io/che-incubator/dash-licenses:next --check
```
