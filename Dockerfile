# Copyright (c) 2021     Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#
# Contributors:
#   Red Hat, Inc. - initial API and implementation

FROM quay.io/devfile/universal-developer-image:ubi8-latest

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
