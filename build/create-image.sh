#!/bin/sh
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

# Simple script that helps to build local version to test easily
set -e
set -u

# Build Docker image (TypeScript compilation now happens inside Docker)
echo "Building Docker image..."
${PWD}/scripts/container_tool.sh build . -f build/dockerfiles/Dockerfile -t quay.io/che-incubator/dash-licenses:local
