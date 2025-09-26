#!/bin/bash
#
# Copyright (c) 2020-2025 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#
# Contributors:
#   Red Hat, Inc. - initial API and implementation
#

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

if [ ! -f $PROJECT_COPY_DIR/yarn.lock ]; then
    echo "Error: Can't find yarn.lock file. Generate and commit the lock file and then try again."
    exit 1
fi

cd $PROJECT_COPY_DIR

# Generate dependencies info
echo "Generating all dependencies info using yarn..."
yarn info --name-only --all --recursive --dependents --json > "$TMP_DIR/yarn-deps.json"
echo "Done."
echo

echo "Generating a temporary DEPENDENCIES file..."
node $WORKSPACE_DIR/package-manager/yarn3/parser.js "$TMP_DIR/yarn-deps.json" | java -jar $DASH_LICENSES -batch 500 -summary "$TMP_DIR/DEPENDENCIES" -
echo "Done."
echo

if [ "$(stat --format=%s $TMP_DIR/DEPENDENCIES)"  -lt  1 ]; then
  echo "Error: Can't create a temporary DEPENDENCIES file. Check internet connection and try again."
  if [ -n "$DEBUG" ]; then
     echo "Copy TMP dir."
     cp -RT $TMP_DIR $DEPS_DIR
     echo "Done."
     echo
  fi
  exit 1
fi

echo "Checking for yarn version..."
if [ "$(yarn -v | sed -e s/\\./\\n/g | sed -n 1p)" -ne "3" ]; then
  echo "Installing yarn version 3..."
  yarn set version 3.8.6
fi
echo "Done."
echo

echo "importing yarn plugin licenses..."
yarn plugin import https://raw.githubusercontent.com/mhassan1/yarn-plugin-licenses/v0.7.0/bundles/@yarnpkg/plugin-licenses.js
echo "Done."

echo "Installing dependencies..."
yarn install
echo "Done."

echo "Generating all dependencies info using yarn..."
yarn licenses list -R --json  > "$TMP_DIR/yarn-deps-info.json"
echo "Done."
echo

echo "Generating list of production dependencies using yarn..."
yarn licenses list -R --production --json > "$TMP_DIR/yarn-prod-deps.json"
echo "Done."
echo

echo "Checking dependencies for restrictions to use..."
node $WORKSPACE_DIR/package-manager/yarn3/bump-deps.js $CHECK
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
    cp -RT $TMP_DIR $DEPS_DIR
    echo "Done."
    echo
elif [ -z "$CHECK" ]; then
    cp $DEPS_COPY_DIR/prod.md $DEPS_DIR/prod.md
    cp $DEPS_COPY_DIR/dev.md $DEPS_DIR/dev.md
    if [ -f "$DEPS_COPY_DIR/problems.md" ]; then
      cp "$DEPS_COPY_DIR/problems.md" "$DEPS_DIR/problems.md"
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
