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
    ${bold}--batch${normal} <number>
        Set the batch size for license processing (default: 500).
    ${bold}--debug${normal}
        Copy TMP directory for inspection.
    ${bold}--help${normal}
        Print this message.
EOM
    exit 0
}

# --- Parse arguments ---

BATCH_SIZE=500
ACTION="--generate"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --help)
            usage
            ;;
        --check)
            ACTION="--check"
            shift
            ;;
        --generate)
            ACTION="--generate"
            shift
            ;;
        --debug)
            DEBUG="--debug"
            shift
            ;;
        --batch)
            if [ -n "$2" ] && [[ "$2" =~ ^[0-9]+$ ]]; then
                BATCH_SIZE="$2"
                shift 2
            else
                echo "Error: --batch requires a numeric value"
                exit 1
            fi
            ;;
        *)
            echo "Error: unknown argument \"$1\" for \"$0\""
            echo "Run with argument \"--help\" for usage."
            exit 1
            ;;
    esac
done

EXIT_CODE=0
if [ "$ACTION" = "--check" ]; then
    EXIT_CODE=1
fi

export ENCODING=utf8
export BATCH_SIZE
export WORKSPACE_DIR=/workspace
export PROJECT_DIR=$WORKSPACE_DIR/project
export DEPS_DIR=$PROJECT_DIR/.deps
export PROJECT_COPY_DIR=$WORKSPACE_DIR/project-copy
export DEPS_COPY_DIR=$PROJECT_COPY_DIR/.deps
export TMP_DIR=$DEPS_COPY_DIR/tmp
export DASH_LICENSES=$WORKSPACE_DIR/dash-licenses.jar

echo
echo "-------------------------------------------"
echo "Configuration:"
echo "  ACTION:       $ACTION"
echo "  DEBUG:        ${DEBUG:-<none>}"
echo "  BATCH_SIZE:   $BATCH_SIZE"
echo "-------------------------------------------"
echo

if [ ! -d $PROJECT_DIR ]; then
    echo "Error: The project directory is not mounted."
    exit $EXIT_CODE
fi

if [ ! -f $PROJECT_DIR/yarn.lock ] && [ ! -f $PROJECT_DIR/package-lock.json ] && [ ! -f $PROJECT_DIR/pom.xml ]; then
    if [ -f $PROJECT_DIR/package.json ]; then
        echo "Error: Can't find lock file. Generate and commit the lock file and then try again."
        exit 1
    fi
    echo "Error: Can't find any package manager file."
    exit 1
fi

# Create .deps directory structure with proper permissions
if [ ! -d $DEPS_DIR ]; then
    echo
    echo "Can't find .deps directory. Create..."
    mkdir -p $DEPS_DIR
    chmod 777 $DEPS_DIR 2>/dev/null || true
    echo "Done."
    echo
fi

# Create .deps/tmp directory if it doesn't exist
if [ ! -d "$DEPS_DIR/tmp" ]; then
    echo "Create .deps/tmp directory..."
    mkdir -p "$DEPS_DIR/tmp"
    chmod 777 "$DEPS_DIR/tmp" 2>/dev/null || true
    echo "Done."
    echo
fi

# Create .deps/EXCLUDED directory if it doesn't exist
if [ ! -d "$DEPS_DIR/EXCLUDED" ]; then
    echo "Create .deps/EXCLUDED directory..."
    mkdir -p "$DEPS_DIR/EXCLUDED"
    chmod 777 "$DEPS_DIR/EXCLUDED" 2>/dev/null || true
    echo "Done."
    echo
fi

# Create DEPENDENCIES file with proper permissions if it doesn't exist
# This is optional and may fail if the mounted directory has restricted permissions
if [ ! -f "$DEPS_DIR/tmp/DEPENDENCIES" ]; then
    touch "$DEPS_DIR/tmp/DEPENDENCIES" 2>/dev/null || true
    chmod 666 "$DEPS_DIR/tmp/DEPENDENCIES" 2>/dev/null || true
fi

# Create default EXCLUDED/dev.md if it doesn't exist
if [ ! -f "$DEPS_DIR/EXCLUDED/dev.md" ]; then
    echo "Create default .deps/EXCLUDED/dev.md file..."
    {
        cat > "$DEPS_DIR/EXCLUDED/dev.md" << 'EOF'
This file contains a manual contribution to .deps/dev.md and it's needed because eclipse/dash-licenses does not deal with work-with CQs (more see https://github.com/eclipse/dash-licenses/issues/13)

| Packages | Resolved CQs |
| --- | --- |
EOF
    } 2>/dev/null || echo "Warning: Could not create EXCLUDED/dev.md (permission denied)"
    chmod 666 "$DEPS_DIR/EXCLUDED/dev.md" 2>/dev/null || true
    echo "Done."
    echo
fi

# Create default EXCLUDED/prod.md if it doesn't exist
if [ ! -f "$DEPS_DIR/EXCLUDED/prod.md" ]; then
    echo "Create default .deps/EXCLUDED/prod.md file..."
    {
        cat > "$DEPS_DIR/EXCLUDED/prod.md" << 'EOF'
This file lists dependencies that do not need CQs or auto-detection does not work due to a bug in https://github.com/eclipse/dash-licenses

| Packages | Resolved CQs |
| --- | --- |
EOF
    } 2>/dev/null || echo "Warning: Could not create EXCLUDED/prod.md (permission denied)"
    chmod 666 "$DEPS_DIR/EXCLUDED/prod.md" 2>/dev/null || true
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
    chmod 777 $TMP_DIR 2>/dev/null || true
    echo "Done."
fi

if [ ! -f $DASH_LICENSES ]; then
    echo "Error: Can't find dash-licenses.jar. Contact https://github.com/che-incubator/dash-licenses maintainers to fix the issue."
    exit $EXIT_CODE
fi

cd $PROJECT_COPY_DIR

if [ -f $PROJECT_COPY_DIR/pom.xml ]; then
    node $WORKSPACE_DIR/package-managers/mvn/index.js $ACTION $DEBUG
    exit $?
fi

if [ -f $PROJECT_COPY_DIR/package.json ]; then
    if [ -f $PROJECT_COPY_DIR/package-lock.json ]; then
        node $WORKSPACE_DIR/package-managers/npm/index.js $ACTION $DEBUG
        exit $?
    fi

    if [ -f $PROJECT_COPY_DIR/yarn.lock ]; then
        if [ "$(yarn -v | sed -e s/\\./\\n/g | sed -n 1p)" -lt 2 ]; then
            node $WORKSPACE_DIR/package-managers/yarn/index.js $ACTION $DEBUG
            exit $?
        fi
        if [ "$(yarn -v | sed -e s/\\./\\n/g | sed -n 1p)" -le 4 ]; then
            node $WORKSPACE_DIR/package-managers/yarn3/index.js $ACTION $DEBUG
            exit $?
        fi
    fi
fi

echo "Error: Can't find any supported package manager file."
exit $EXIT_CODE
