#!/bin/sh
# Simple script that helps to build local version to test easily
set -e
set -u

${PWD}/scripts/container_tool.sh build . -f Dockerfile -t quay.io/che-incubator/dash-licenses:local
