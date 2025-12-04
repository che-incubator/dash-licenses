# Copyright (c) 2021-2025 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#
# Contributors:
#   Red Hat, Inc. - initial API and implementation

# ============================================
# Builder stage: Build TypeScript and JAR
# ============================================
FROM registry.access.redhat.com/ubi8/openjdk-21:latest as builder

USER 0

# Install build dependencies
RUN microdnf install -y git rsync curl tar gzip \
    && microdnf clean all

ENV NODE_VERSION=v20.18.0
ENV NODE_BASE_URL=https://nodejs.org/dist/${NODE_VERSION}

# Determine Node.js architecture based on platform
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
        NODE_DISTRO="linux-x64"; \
    elif [ "$ARCH" = "aarch64" ]; then \
        NODE_DISTRO="linux-arm64"; \
    else \
        echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    curl -fsSL ${NODE_BASE_URL}/node-${NODE_VERSION}-${NODE_DISTRO}.tar.gz -o node-${NODE_VERSION}-${NODE_DISTRO}.tar.gz && \
    mkdir -p /usr/local/lib/nodejs && \
    tar -xzf node-${NODE_VERSION}-${NODE_DISTRO}.tar.gz -C /usr/local/lib/nodejs && \
    rm node-${NODE_VERSION}-${NODE_DISTRO}.tar.gz && \
    mv /usr/local/lib/nodejs/node-${NODE_VERSION}-${NODE_DISTRO} /usr/local/lib/nodejs/node

ENV PATH=/usr/local/lib/nodejs/node/bin/:$PATH

RUN npm install -g yarn synp

ARG DASH_LICENSE_REV=1.1.0
ARG DASH_LICENSE_URL=https://github.com/eclipse/dash-licenses/archive/refs/tags/${DASH_LICENSE_REV}.tar.gz

# Build Eclipse Dash License Tool JAR
WORKDIR /build/dash-licenses
RUN curl -fsSL ${DASH_LICENSE_URL} -o dash-licenses-${DASH_LICENSE_REV}.tar.gz \
  && tar -xzf dash-licenses-${DASH_LICENSE_REV}.tar.gz --strip-components=1 \
  && rm dash-licenses-${DASH_LICENSE_REV}.tar.gz \
  && mvn clean install -DskipTests \
  && mv shaded/target/org.eclipse.dash.licenses-${DASH_LICENSE_REV}.jar /build/dash-licenses.jar

# Copy package files for dependency installation
WORKDIR /build/app
COPY package*.json ./
COPY tsconfig.json ./
COPY webpack.config.js ./

# Install all dependencies for building
RUN npm ci

# Copy source files
COPY src/ ./src/

# Build with webpack (production mode)
RUN npm run build

# ============================================
# Final stage: Minimal runtime image
# ============================================
FROM registry.access.redhat.com/ubi8/openjdk-21:latest

USER 0

# Install runtime dependencies only
RUN microdnf install -y git rsync \
    && microdnf clean all

ENV NODE_VERSION=v20.18.0
ENV NODE_BASE_URL=https://nodejs.org/dist/${NODE_VERSION}

# Install Node.js (runtime only)
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
        NODE_DISTRO="linux-x64"; \
    elif [ "$ARCH" = "aarch64" ]; then \
        NODE_DISTRO="linux-arm64"; \
    else \
        echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    curl -fsSL ${NODE_BASE_URL}/node-${NODE_VERSION}-${NODE_DISTRO}.tar.gz -o node-${NODE_VERSION}-${NODE_DISTRO}.tar.gz && \
    mkdir -p /usr/local/lib/nodejs && \
    tar -xzf node-${NODE_VERSION}-${NODE_DISTRO}.tar.gz -C /usr/local/lib/nodejs && \
    rm node-${NODE_VERSION}-${NODE_DISTRO}.tar.gz && \
    mv /usr/local/lib/nodejs/node-${NODE_VERSION}-${NODE_DISTRO} /usr/local/lib/nodejs/node

ENV PATH=/usr/local/lib/nodejs/node/bin/:$PATH

# Install global dependencies needed at runtime
RUN npm install -g yarn synp

WORKDIR /workspace

# Copy Eclipse Dash License Tool JAR from builder
COPY --from=builder /build/dash-licenses.jar /workspace/dash-licenses.jar

# Copy webpack bundled output from builder
COPY --from=builder /build/app/dist /workspace

# Copy entrypoint script
COPY build/dockerfiles/entrypoint.sh /workspace/entrypoint.sh

# Create user and set permissions
RUN useradd -u 10001 -G wheel,root -d /home/user --shell /bin/bash -m user \
    && chgrp -R 0 /home \
    && chmod -R g=u /etc/passwd /etc/group /home /workspace

USER 10001
ENV HOME=/home/user

ENTRYPOINT ["/workspace/entrypoint.sh"]
CMD ["--generate"]
