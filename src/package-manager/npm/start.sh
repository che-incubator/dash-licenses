#!/bin/bash

build_info_msg() {
    cat <<EOM
docker run \\
    -v \$(pwd):/workspace/project \\
    quay.io/che-incubator/dash-licenses:next
EOM
}

CHECK=""
if [ "$1" = "--check" ]; then
    CHECK="$1"
fi

DEBUG=""
if [ "$1" = "--debug" ]; then
    DEBUG="$1"
fi

if [ ! -f $PROJECT_COPY_DIR/package.json ]; then
    echo "Error: Can't find package.json file in the project directory. Commit it and then try again."
    exit 1
fi

echo "Converting package-lock.json to yarn.lock..."
synp --source-file package-lock.json
echo "Done."
echo

if [ ! -f $PROJECT_COPY_DIR/yarn.lock ]; then
    echo "Error: Can't find yarn.lock file. Generate and commit the lock file and then try again."
    exit 1
fi

echo "Generating all dependencies info using yarn..."
yarn licenses list --json --depth=0 --no-progres > $TMP_DIR/yarn-deps-info.json
echo "Done."
echo

echo "Generating a temporary DEPENDENCIES file..."
node $WORKSPACE_DIR/package-manager/npm/parser.js | java -jar $DASH_LICENSES -summary $TMP_DIR/DEPENDENCIES - > /dev/null
echo "Done."
echo

if [ "$(stat --format=%s $TMP_DIR/DEPENDENCIES)"  -lt  1 ]; then
  echo "Error: Can't create a temporary DEPENDENCIES file. Check internet connection and try again."
  exit 1
fi

echo "Generating list of production dependencies using yarn..."
yarn list --json --prod --depth=0 --no-progres > $TMP_DIR/yarn-prod-deps.json
echo "Done."
echo

echo "Generating list of all dependencies using yarn..."
yarn list --json --depth=0 --no-progress > $TMP_DIR/yarn-all-deps.json
echo "Done."
echo

echo "Checking dependencies for restrictions to use..."
node $WORKSPACE_DIR/package-manager/npm/bump-deps.js $CHECK
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

if [ -n "$DEBUG" ]; then
    echo "Copy TMP dir."
    cp -R $TMP_DIR/* $DEPS_DIR
    echo "Done."
    echo
elif [ -z "$CHECK" ]; then
    cp $TMP_DIR/prod.md $DEPS_DIR/prod.md
    cp $TMP_DIR/dev.md $DEPS_DIR/dev.md
    if [ -f "$TMP_DIR/problems.md" ]; then
      cp "$TMP_DIR/problems.md" "$DEPS_DIR/problems.md"
    elif [ -f "$DEPS_DIR/problems.md" ]; then
      rm -f "$DEPS_DIR/problems.md"
    fi
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
