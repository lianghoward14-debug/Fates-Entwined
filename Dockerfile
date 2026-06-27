FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787
ENV FATE_WEBSITE_DIR=/app/game

COPY server ./server
COPY src/scripts/01-data-and-state.js ./src/scripts/01-data-and-state.js
COPY index.html manifest.json pwa-icon.svg blank.png back.png deck.png sw.js voicelines.txt ./game/
COPY *.png ./game/
COPY src ./game/src
COPY optimized ./game/optimized
COPY titlscreenbackgrounds ./game/titlscreenbackgrounds
COPY ingamebackgrouds ./game/ingamebackgrouds
COPY setvoicelines ./game/setvoicelines
COPY ["new voices", "./game/new voices"]
COPY soundeffects ./game/soundeffects
COPY afficon ./game/afficon
COPY aiicons ./game/aiicons
COPY rankicons ./game/rankicons
COPY pfp ./game/pfp
COPY UIpictures ./game/UIpictures
COPY fates-entwined-website ./fates-entwined-website

EXPOSE 8787

CMD ["node", "server/fate-ws-authority.js"]
