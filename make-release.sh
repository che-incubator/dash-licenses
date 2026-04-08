#!/bin/bash
#
# Copyright (c) 2026 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#
# Contributors:
#   Red Hat, Inc. - initial API and implementation
#

# release script
# parameters
# --prepare-branch

# init default variables
SKIP_PUBLISH=0
SKIP_TAG=0

while [[ "$#" -gt 0 ]]; do
  case $1 in
    '-v'|'--version') RELEASE_VERSION="$2"; shift 1;;
    '--skip-publish') SKIP_PUBLISH=1; shift 0;;
    '--skip-tag') SKIP_TAG=1; shift 0;;
  esac
  shift 1
done

# parse variables
RELEASE_BRANCH=main

# checkout release branch
# this project is only released from the main branch
git checkout $RELEASE_BRANCH

# validate version in package.json
CURRENT_VERSION=$(npm pkg get version)
if [[ "$CURRENT_VERSION" != "\"$RELEASE_VERSION\"" ]]; then
  echo "release version is not specified in package.json! Aborting release"
  exit 1;
fi

# build project
npm ci
npm run build

# publish project
if [[ ${SKIP_PUBLISH} -eq 0 ]]; then
  npm publish
else
  echo "skipping publishing step"
fi

# tag release
if [[ ${SKIP_TAG} -eq 0 ]]; then
  git tag "$RELEASE_VERSION"
  git push "$RELEASE_VERSION"
else
  echo "skipping tagging step"
fi

echo "end of release script"
