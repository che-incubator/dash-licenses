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

build_info_msg() {
    cat <<EOM
docker run \\
    -v \$(pwd):/workspace/project \\
    quay.io/che-incubator/dash-licenses:next
EOM
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

WORKSPACE_DIR=$(pwd)
PROJECT_DIR=$WORKSPACE_DIR/project
DEPS_DIR=$PROJECT_DIR/.deps
TMP_DIR=$DEPS_DIR/tmp
CACHE_DIR=$TMP_DIR/cache

mkdir -p $CACHE_DIR

if [ ! -d $PROJECT_DIR ]; then
    echo
    echo "Error: The project directory is not mounted."
    exit 1
fi

echo $PROJECT_DIR
if [ ! -f $PROJECT_DIR/package.json ]; then
    echo "Error: Can't find package.json file in the project directory. Commit it and then try again."
    exit 1
fi

if [ ! -f $PROJECT_DIR/yarn.lock ]; then
    echo "Error: Can't find yarn.lock file. Generate and commit the lock file and then try again."
    exit 1
fi

DASH_LICENSES_DIR=$WORKSPACE_DIR/dash-licenses
DASH_LICENSES=$WORKSPACE_DIR/dash-licenses.jar
if [ ! -f $DASH_LICENSES ]; then
    echo "Error: Can't find dash-licenses.jar. Contact https://github.com/che-incubator/dash-licenses maintainers to fix the issue."
    exit 1
fi

cd $PROJECT_DIR

echo "Generating a temporary DEPENDENCIES file..."
node $DASH_LICENSES_DIR/yarn/index.js | java -jar $DASH_LICENSES -summary $TMP_DIR/DEPENDENCIES - > /dev/null
echo "Done."
echo

echo "Generating all dependencies info using yarn..."
yarn licenses list --json --depth=0 --no-progres --prefer-offline --frozen-lockfile > $TMP_DIR/yarn-deps-info.json
echo "Done."
echo

echo "Generating list of production dependencies using yarn..."
yarn list --json --prod --depth=0 --no-progres > $TMP_DIR/yarn-prod-deps.json
echo "Done."
echo

echo "Generating list of all dependencies using yarn..."
yarn list --json --depth=0 --no-progress > $TMP_DIR/yarn-all-deps.json
echo "Done."
echo

echo "Checking dependencies for restrictions to use..."
node $WORKSPACE_DIR/bump-deps.js $CHECK
RESTRICTED=$?
echo "Done."
echo

DIFFER_PROD=""
DIFFER_DEV=""

# production dependencies
if [ -n "$CHECK" ]; then
    echo "Looking for changes in production dependencies list..."
    DIFFER_PROD=$(comm --nocheck-order -3 $DEPS_DIR/prod.md $TMP_DIR/prod.md)
    echo "Done."
    echo
fi

if [ -n "$CHECK" ]; then
    echo "Looking for changes in test- and development dependencies list..."
    DIFFER_DEV=$(comm --nocheck-order -3 $DEPS_DIR/dev.md $TMP_DIR/dev.md)
    echo "Done."
    echo
fi

if [ -z "$CHECK" ]; then
    cp $TMP_DIR/prod.md $DEPS_DIR/prod.md
    cp $TMP_DIR/dev.md $DEPS_DIR/dev.md
fi
if [ -z "$DEBUG" ]; then
    rm -r $TMP_DIR
fi

if [ -n "$DIFFER_PROD" ]; then
    echo "Error: The list of production dependencies is outdated. Please run the following command and commit changes:"
    build_info_msg
fi
if [ -n "$DIFFER_DEV" ]; then
    echo "Error: The list of development dependencies is outdated. Please run the following command and commit changes:"
    build_info_msg
fi
if [ $RESTRICTED -ne 0 ]; then
    echo "Error: Restricted dependencies are found in the project."
fi
if [ -z "$DIFFER_PROD" ] && [ -z "$DIFFER_DEV" ] && [ $RESTRICTED -eq 0 ]; then
    echo "All found licenses are approved to use."
else
    exit 1
fi
