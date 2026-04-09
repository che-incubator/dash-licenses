#!/bin/bash
#
# Copyright (c) 2022-2026 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#
# Contributors:
#   Red Hat, Inc. - initial API and implementation
#

set -e

usage() {
    local exit_code="${1:-0}"
    echo "Usage: ./make-release.sh -v <version>"
    echo "optional parameters:"
    echo "--no-push - no pushes to remote repository"
    echo "--skip-publish - no publishing to npmjs repository"
    echo "--skip-bump-version - no updating of the next version after release"
    exit "${exit_code}"
}

init() {
  unset VERSION

  SKIP_PUBLISH=0
  SKIP_NEXT_VERSION_BUMP=0
  NO_PUSH=0

  while [[ "$#" -gt 0 ]]; do
    case $1 in
      '-v'|'--version') VERSION="$2"; shift 1;;
      '--no-push') NO_PUSH=1;;
      '--skip-publish') SKIP_PUBLISH=1;;
      '--skip-bump-version') SKIP_NEXT_VERSION_BUMP=1;;
      '--help'|'-h') usage 0;;
      *) echo "[ERROR] Unknown argument: $1"; usage 1;;
    esac
    shift 1
  done

  [[ -z ${VERSION} ]] && { echo "[ERROR] Release version is not defined"; usage 1; }

  if [[ ! ${VERSION} =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "[ERROR] Invalid version '${VERSION}'. Expected format: x.y.z"
    exit 1
  fi

  X_BRANCH="${VERSION%?}x"
  NEXT_BRANCH="pr-main-to-${VERSION}-next"
  NEXT_VERSION="${VERSION}-next"

  echo "Running release script with following parameters:"
  echo "no pushes to github: ${NO_PUSH}"
  echo "no publishing to npmjs: ${SKIP_PUBLISH}"
  echo "no bumping of the next version: ${SKIP_NEXT_VERSION_BUMP}"
}

resetChanges() {
  local branch="$1"

  echo "[INFO] Reset changes in ${branch} branch"

  git reset --hard
  git checkout "${branch}"
  git fetch origin --prune
  git pull origin "${branch}"
}

checkoutToXBranch() {
  echo "[INFO] Check out to ${X_BRANCH} branch."

  if git ls-remote --exit-code --heads origin "refs/heads/${X_BRANCH}" >/dev/null 2>&1; then
    echo "[INFO] ${X_BRANCH} exists."
    resetChanges "${X_BRANCH}"
  else
    echo "[INFO] ${X_BRANCH} does not exist. Will be created a new one from main."
    resetChanges "main"
    if [[ ${NO_PUSH} -eq 0 ]]; then
      git push origin main:"${X_BRANCH}"
      git checkout "${X_BRANCH}"
    else
      echo "[INFO] Skipping pushing branch ${X_BRANCH} step"
      git checkout -b "${X_BRANCH}"
    fi
  fi
}

checkoutToNextBranch() {
  echo "[INFO] Check out to ${NEXT_BRANCH} branch."

  if git ls-remote --exit-code --heads origin "refs/heads/${NEXT_BRANCH}" >/dev/null 2>&1; then
    echo "[INFO] ${NEXT_BRANCH} exists."
    resetChanges "${NEXT_BRANCH}"
  else
    echo "[INFO] ${NEXT_BRANCH} does not exist. Will be created a new one from main."
    resetChanges "main"
    if [[ ${NO_PUSH} -eq 0 ]]; then
      git push origin main:"${NEXT_BRANCH}"
      git checkout "${NEXT_BRANCH}"
    else
      echo "[INFO] Skipping pushing branch ${NEXT_BRANCH} step"
      git checkout -b "${NEXT_BRANCH}"
    fi
  fi
}

publishArtifacts() {
  echo "[INFO] Publishing @eclipse-che/license-tool ${VERSION} artifacts"

  npm ci
  npm run build

  if [[ ${SKIP_PUBLISH} -eq 0 ]]; then
    npm publish --tag latest --access public
  else
    echo "[INFO] Skipping publishing step"
  fi
}

tagRelease() {
  git tag "${VERSION}"
  if [[ ${NO_PUSH} -eq 0 ]]; then
    git push origin "${VERSION}"
  else
    echo "[INFO] Skipping pushing tag ${VERSION} step"
  fi
}

createPR() {
  local base=$1
  local branch=$2
  local message=$3

  echo "[INFO] Create PR with base = ${base} and head = ${branch}"

  existing_pr=$(gh pr list --base "${base}" --head "${branch}" --state open --json number --jq '.[0].number' 2>/dev/null || true)
  if [[ -n "${existing_pr}" ]]; then
    echo "[INFO] PR #${existing_pr} already exists for ${branch} -> ${base}, skipping creation."
  else
    gh pr create --base "${base}" --head "${branch}" --title "${message}" --body ""
  fi
}

updatePackageVersionAndCommitChanges() {
  local version=$1
  local branch=$2
  local message=$3

  local current_version
  current_version=$(npm pkg get version)
  if [[ "$current_version" == "\"$version\"" ]]; then
    echo "[INFO] version is already specified in the package.json, skipping edits"
  else
    echo "[INFO] Setting ${version} in package.json"

    npm version "${version}" --no-git-tag-version

    git add package.json package-lock.json
    git commit -s -m "${message}"
    if [[ ${NO_PUSH} -eq 0 ]]; then
        git push origin "${branch}"
    else
      echo "[INFO] Skipping pushing branch ${branch} step"
    fi
  fi
}

updateXBranch() {
  checkoutToXBranch

  COMMIT_MSG="ci: bump ${VERSION} in ${X_BRANCH}"

  updatePackageVersionAndCommitChanges \
    "${VERSION}" \
    "${X_BRANCH}" \
    "${COMMIT_MSG}"

  tagRelease
  publishArtifacts
}

updateMainBranch() {
  checkoutToNextBranch

  COMMIT_MSG="ci: bump ${NEXT_VERSION} in main"

  updatePackageVersionAndCommitChanges \
    "${NEXT_VERSION}" \
    "${NEXT_BRANCH}" \
    "${COMMIT_MSG}"

  if [[ ${NO_PUSH} -eq 0 ]]; then
    createPR \
      "main" \
      "${NEXT_BRANCH}" \
      "${COMMIT_MSG}"
  else
    echo "[INFO] Skipping PR creation step"
  fi
}

run() {
  updateXBranch
  if [[ ${SKIP_NEXT_VERSION_BUMP} -eq 0 ]]; then
    updateMainBranch
  else
    echo "[INFO] Skipping next version bumping step"
  fi
}

init "$@"
run
