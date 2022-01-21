#!/bin/bash

usage() {
    bold=$(tput bold)
    normal=$(tput sgr0)
    cat <<EOM
Extract and identify dependencies.

${bold}Arguments:${normal}
    ${bold}--generate${normal} [default]
        (Re)generate dependencies info and check if all of dependencies are approved to use.
    ${bold}--check${normal}
        Check if dependencies info is present and up-to-date, and all of dependencies are approved to use.
    ${bold}--help${normal}
        Print this message.
EOM
    exit 0
}

if [ "$1" = "--help" ]; then
    usage
fi
if [ "$1" != "--help" ] && [ "$1" != "--check" ] && [ "$1" != "--generate" ] && [ "$1" != "--debug" ]; then
    echo "Error: unknown argument \"$1\" for \"$0\""
    echo "Run with argument \"--help\" for usage."
    exit 0
fi

CHECK=""
if [ "$1" = "--check" ]; then
    CHECK="$1"
fi

DEBUG=""
if [ "$1" = "--debug" ]; then
    DEBUG="$1"
fi

export ENCODING=utf8

export WORKSPACE_DIR=/workspace
export PROJECT_DIR=$WORKSPACE_DIR/project
export DEPS_DIR=$PROJECT_DIR/.deps
export PROJECT_COPY_DIR=$WORKSPACE_DIR/project-copy
export DEPS_COPY_DIR=$PROJECT_COPY_DIR/.deps
export TMP_DIR=$DEPS_COPY_DIR/tmp
export DASH_LICENSES=$WORKSPACE_DIR/dash-licenses.jar

if [ ! -d $PROJECT_DIR ]; then
    echo
    echo "Error: The project directory is not mounted."
    exit 1
fi

if [ ! -f $PROJECT_DIR/yarn.lock ] && [ ! -f $PROJECT_DIR/package-lock.json ] && [ ! -f $PROJECT_DIR/pom.xml ]; then
    if [ -f $PROJECT_DIR/package.json ]; then
        echo "Error: Can't find lock file. Generate and commit the lock file and then try again."
        exit 1
    fi
    echo "Error: Can't find any package manager file."
    exit 1
fi

if [ ! -d $DEPS_DIR ]; then
    echo
    echo "Can't find .deps directory. Create..."
    mkdir $DEPS_DIR
    echo "Done."
    echo
fi

echo "Copy project..."
mkdir -p $PROJECT_COPY_DIR
rsync -amqP --exclude='node_modules' "$PROJECT_DIR/" $PROJECT_COPY_DIR
echo "Done."
echo

if [ ! -d $TMP_DIR ]; then
    echo "Create tmp dir..."
    mkdir -p $TMP_DIR
    echo "Done."
fi

DASH_LICENSES=$WORKSPACE_DIR/dash-licenses.jar
if [ ! -f $DASH_LICENSES ]; then
    echo "Error: Can't find dash-licenses.jar. Contact https://github.com/che-incubator/dash-licenses maintainers to fix the issue."
    exit 1
fi

cd $PROJECT_COPY_DIR

if [ -f $PROJECT_COPY_DIR/pom.xml ]; then
    $WORKSPACE_DIR/package-manager/mvn/start.sh $1
    exit $?
fi

if [ -f $PROJECT_COPY_DIR/yarn.lock ] && [ "$(yarn -v | sed -e s/\\./\\n/g | sed -n 1p)" -lt 2 ]; then
    $WORKSPACE_DIR/package-manager/yarn/start.sh $1
    exit $?
fi

if [ -f $PROJECT_COPY_DIR/package-lock.json ]; then
    $WORKSPACE_DIR/package-manager/npm/start.sh $1
    exit $?
fi

echo "Error: Can't find any supported package manager file."
exit 1
