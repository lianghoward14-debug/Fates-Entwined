FROM registry.fly.io/fates-entwined-main@sha256:deb6ca5f97af4904a902793e7607db35bd884f501c0cae2fbf96df08eb269366
COPY release/ /app/public/
RUN node --check /app/public/src/scripts/mobile-input.js && node --check /app/public/src/scripts/render-v2/06-match-scene-input.js && node --check /app/public/src/scripts/render-v2/09-hand-drag-bridge.js
