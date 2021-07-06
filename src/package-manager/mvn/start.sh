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

if [ ! -f $PROJECT_COPY_DIR/pom.xml ]; then
    echo "Error: Can't find pom.xml file in the project directory."
    exit 1
fi

echo "Generating list of production dependencies using mvn..."
mvn dependency:list | grep -Poh "\S+:(system|provided)" | sort | uniq > $TMP_DIR/mvn-prod-deps.txt
echo "Done."
echo

echo "Generating list of development dependencies using mvn..."
mvn dependency:list | grep -Poh "\S+:(compile|test)" | sort | uniq > $TMP_DIR/mvn-dev-deps.txt
echo "Done."
echo

echo "Generating a temporary PROD_DEPENDENCIES file..."
cat $TMP_DIR/mvn-prod-deps.txt | java -jar $DASH_LICENSES -summary $TMP_DIR/PROD_DEPENDENCIES - > /dev/null
echo "Done."
echo

if [ "$(stat --format=%s $TMP_DIR/PROD_DEPENDENCIES)"  -lt  1 ]; then
  echo "Error: Can't create a temporary PROD_DEPENDENCIES file. Check internet connection and try again."
  exit 1
fi

echo "Generating a temporary DEV_DEPENDENCIES file..."
cat $TMP_DIR/mvn-dev-deps.txt | java -jar $DASH_LICENSES -summary $TMP_DIR/DEV_DEPENDENCIES - > /dev/null
echo "Done."
echo

if [ "$(stat --format=%s $TMP_DIR/DEV_DEPENDENCIES)"  -lt  1 ]; then
  echo "Error: Can't create a temporary DEV_DEPENDENCIES file. Check internet connection and try again."
  exit 1
fi

echo "Checking dependencies for restrictions to use..."
node $WORKSPACE_DIR/package-manager/mvn/bump-deps.js $CHECK
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
    elif [ -f "$DEPS_COPY_DIR/problems.md" ]; then
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
