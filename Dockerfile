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
ENV NODE_DISTRO=linux-x64
ENV NODE_BASE_URL=https://nodejs.org/dist/${NODE_VERSION}

RUN curl -fsSL ${NODE_BASE_URL}/node-${NODE_VERSION}-${NODE_DISTRO}.tar.gz -o node-${NODE_VERSION}-${NODE_DISTRO}.tar.gz \
  && mkdir -p /usr/local/lib/nodejs \
  && tar -xzf node-${NODE_VERSION}-${NODE_DISTRO}.tar.gz -C /usr/local/lib/nodejs \
  && rm node-${NODE_VERSION}-${NODE_DISTRO}.tar.gz

ENV PATH=/usr/local/lib/nodejs/node-${NODE_VERSION}-${NODE_DISTRO}/bin/:$PATH

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

COPY ${PWD}/src/package-manager package-manager
COPY ${PWD}/src/entrypoint.sh entrypoint.sh
COPY ${PWD}/src/document.js document.js

RUN useradd -u 10001 -G wheel,root -d /home/user --shell /bin/bash -m user \
    && chgrp -R 0 /home \
    && chmod -R g=u /etc/passwd /etc/group /home /workspace

USER 10001
ENV HOME=/home/user

ENTRYPOINT ["/workspace/entrypoint.sh"]
CMD ["--generate"]
