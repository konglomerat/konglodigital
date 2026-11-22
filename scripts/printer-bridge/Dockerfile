FROM ubuntu:22.04 AS build
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends g++ libglib2.0-dev curl ca-certificates unzip xz-utils && rm -rf /var/lib/apt/lists/*
WORKDIR /build
RUN mkdir -p include/nlohmann sdk && \
    curl -fsSL https://raw.githubusercontent.com/nlohmann/json/v3.11.3/single_include/nlohmann/json.hpp -o include/nlohmann/json.hpp && \
    echo '9bea4c8066ef4a1c206b2be5a36302f8926f7fdc6087af5d20b417d0cf103ea6  include/nlohmann/json.hpp' | sha256sum -c - && \
    curl -fsSL https://public-cdn.bblmw.com/upgrade/studio/plugins/02.08.02.54/f1a94b8828/linux_02.08.02.54.zip -o sdk.zip && \
    echo 'a7ea8ccec85ab5a7b8959a5697f7be957d58da82e67aad1cb0ad9b3cdf5baed6  sdk.zip' | sha256sum -c - && \
    unzip -q sdk.zip -d sdk
RUN curl -fsSL https://nodejs.org/dist/v22.23.4/node-v22.23.4-linux-x64.tar.xz -o node.tar.xz && \
    echo '1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce  node.tar.xz' | sha256sum -c - && \
    mkdir node && tar -xJf node.tar.xz -C node --strip-components=1
COPY scripts/printer-bridge/native ./native
RUN g++ -std=c++17 -O2 -Iinclude native/light-state.test.cpp -o light-test && ./light-test && \
    g++ -std=c++17 -O2 -Iinclude native/authorize.cpp -ldl -lpthread -o authorize && \
    g++ -std=c++17 -O2 native/receive.cpp $(pkg-config --cflags --libs glib-2.0) -ldl -lpthread -o receive

FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 libcurl4 libglib2.0-0 libgtk-3-0 libsecret-1-0 ffmpeg && rm -rf /var/lib/apt/lists/*
COPY --from=build /build/node /usr/local
RUN node --version && useradd -u 1000 -m node
WORKDIR /app
COPY scripts/printer-bridge/docker/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /build/sdk /opt/bambu
COPY --from=build /build/authorize /build/receive /opt/camera/
COPY scripts/printer-bridge/*.mjs ./scripts/printer-bridge/
COPY scripts/printer-automation-worker.mjs ./scripts/
ENV FFMPEG_PATH=/usr/bin/ffmpeg LD_LIBRARY_PATH=/opt/bambu PRINTER_BRIDGE_CONFIG=/config/bridge.json
RUN mkdir -p /state /captures && chown node:node /state /captures
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node scripts/printer-bridge/healthcheck.mjs
CMD ["node", "scripts/printer-bridge/server.mjs"]
