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
if [ "$1" != "--help" ] && [ "$1" != "--check" ] && [ "$1" != "--generate" ]; then
    echo "Error: unknown argument \"$1\" for \"$0\""
    echo "Run with argument \"--help\" for usage."
    exit 0
fi

CHECK=""
if [ "$1" = "--check" ]; then
    CHECK="$1"
fi

WORKSPACE=$(pwd)
PROJECT=$WORKSPACE/project

if [ ! -d $PROJECT ]; then
    echo
    echo "Error: The project directory is not mounted."
    exit 1
fi

if [ ! -f $PROJECT/package.json ]; then
    echo "Error: Can't find package.json file in the project directory. Commit it and then try again."
    exit 1
fi

if [ ! -f $PROJECT/yarn.lock ]; then
    echo "Error: Can't find yarn.lock file. Generate and commit the lock file and then try again."
    exit 1
fi

if [ -n "$CHECK" ] && [ ! -f $PROJECT/DEPENDENCIES ]; then
    # echo "Error: Can't find DEPENDENCIES file. Generate and commit this file for the project using 'dash-license' and then try again."
    cat <<EOM
Error: Can't find DEPENDENCIES file.
Execute the following command to generate dependencies info and then try again:

docker run \\
       -v \$(pwd):/workspace/project \\
       quay.io/che-incubator/dash-licenses:next
EOM
    exit 1
fi

DASH_LICENSES_DIR=$WORKSPACE/dash-licenses
DASH_LICENSES=$WORKSPACE/dash-licenses.jar
if [ ! -f $DASH_LICENSES ]; then
    echo "Error: Can't find dash-licenses.jar. Contact https://github.com/che-incubator/dash-licenses maintainers to fix the issue."
    exit 1
fi

cd $PROJECT

echo "The temporary DEPENDENCIES file is being generated..."
node $DASH_LICENSES_DIR/yarn/index.js | java -jar $DASH_LICENSES -summary $PROJECT/TMP_DEPENDENCIES - > /dev/null
echo "Done."
echo

DIFFER=""

if [ -n "$CHECK" ]; then
    echo "Comparing temporary DEPENDENCIES file with committed one..."
    DIFFER=$(comm --nocheck-order -3 $PROJECT/DEPENDENCIES $PROJECT/TMP_DEPENDENCIES)
    echo "Done."
    echo
fi

echo "Checking licenses for restrictions to use..."
node $WORKSPACE/bump-deps.js $CHECK
RESTRICTED=$?
echo "Done."
echo

if [ -n "$CHECK" ]; then
    rm $PROJECT/TMP_DEPENDENCIES
else
    mv $PROJECT/TMP_DEPENDENCIES $PROJECT/DEPENDENCIES
fi

if [ -n "$DIFFER" ]; then
    echo "Error: The generated dependencies list differs from one in the project. Please regenerate and commit DEPENDENCIES file."
fi
if [ $RESTRICTED -ne 0 ]; then
    echo "Error: Restricted dependencies are found in the project."
fi
if [ -z "$DIFFER" ] && [ $RESTRICTED -eq 0 ]; then
    echo "All found licenses are approved to use."
else
    exit 1
fi
