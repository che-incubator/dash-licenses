# Copyright (c) 2021     Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#
# Contributors:
#   Red Hat, Inc. - initial API and implementation

FROM registry.access.redhat.com/ubi8/openjdk-21:latest

USER 0

RUN microdnf install -y git rsync \
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

RUN npm install yarn synp -g

ARG DASH_LICENSE_REV=1.1.0
ARG DASH_LICENSE_URL=https://github.com/eclipse/dash-licenses/archive/refs/tags/${DASH_LICENSE_REV}.tar.gz

WORKDIR /workspace
RUN curl -fsSL ${DASH_LICENSE_URL} -o dash-licenses-${DASH_LICENSE_REV}.tar.gz \
  && tar -xzf dash-licenses-${DASH_LICENSE_REV}.tar.gz \
  && rm dash-licenses-${DASH_LICENSE_REV}.tar.gz \
  && cd dash-licenses-${DASH_LICENSE_REV} \
  && mvn clean install -DskipTests \
  && mv /workspace/dash-licenses-${DASH_LICENSE_REV}/shaded/target/org.eclipse.dash.licenses-${DASH_LICENSE_REV}.jar /workspace/dash-licenses.jar \
  && rm /workspace/dash-licenses-${DASH_LICENSE_REV} -rf

# Copy source files and build configuration
COPY ${PWD}/package*.json ./
COPY ${PWD}/tsconfig.json ./
COPY ${PWD}/src/ ./src/

# Install dependencies and build TypeScript
RUN npm ci --only=production && npm install typescript --no-save && npm run build

# Copy files from src to workspace root for backward compatibility
RUN cp -r ./src/package-manager /workspace/package-manager && \
    cp ./src/entrypoint.sh /workspace/entrypoint.sh

# Copy compiled TypeScript files to their expected locations for backward compatibility
RUN if [ -f ./dist/src/document.js ]; then \
        cp ./dist/src/document.js /workspace/document.js; \
    elif [ -f ./dist/document.js ]; then \
        cp ./dist/document.js /workspace/document.js; \
    fi && \
    if [ -d ./dist/src/package-manager ]; then \
        find ./dist/src/package-manager -name "*.js" -type f | while read file; do \
            relative_path=$(echo "$file" | sed 's|./dist/src/||'); \
            target_dir=$(dirname "/workspace/$relative_path"); \
            mkdir -p "$target_dir"; \
            cp "$file" "/workspace/$relative_path"; \
        done; \
    elif [ -d ./dist/package-manager ]; then \
        find ./dist/package-manager -name "*.js" -type f | while read file; do \
            relative_path=$(echo "$file" | sed 's|./dist/||'); \
            target_dir=$(dirname "/workspace/$relative_path"); \
            mkdir -p "$target_dir"; \
            cp "$file" "/workspace/$relative_path"; \
        done; \
    fi

# Keep the dist directory for reference (copy all compiled files)
RUN mkdir -p /workspace/dist && \
    cp -r ./dist/* /workspace/dist/ 2>/dev/null || true

RUN useradd -u 10001 -G wheel,root -d /home/user --shell /bin/bash -m user \
    && chgrp -R 0 /home \
    && chmod -R g=u /etc/passwd /etc/group /home /workspace

USER 10001
ENV HOME=/home/user

ENTRYPOINT ["/workspace/entrypoint.sh"]
CMD ["--generate"]
