# Copyright (c) 2021     Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#
# Contributors:
#   Red Hat, Inc. - initial API and implementation

FROM quay.io/ubi8/openjdk-21:latest

RUN microdnf install -y git rsync

ARG MAVEN_VERSION=3.9.6
ARG BASE_URL=https://apache.osuosl.org/maven/maven-3/${MAVEN_VERSION}/binaries
# https://github.com/eclipse/dash-licenses/commits Apr 23, 2024
ARG DASH_LICENSE_REV=0001fc18bde5b736ca659b37b429ee55b8610efb

RUN mkdir -p /usr/local/apache-maven /usr/local/apache-maven/ref \
  && curl -fsSL -o /tmp/apache-maven.tar.gz ${BASE_URL}/apache-maven-${MAVEN_VERSION}-bin.tar.gz \
  && tar -xzf /tmp/apache-maven.tar.gz -C /usr/local/apache-maven --strip-components=1 \
  && rm -f /tmp/apache-maven.tar.gz \
  && ln -s /usr/local/apache-maven/bin/mvn /usr/bin/mvn

ENV NODE_VERSION=v20.12.0
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

ENTRYPOINT ["/workspace/entrypoint.sh"]
CMD ["--generate"]
