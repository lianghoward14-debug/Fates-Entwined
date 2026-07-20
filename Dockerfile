FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787
ENV FATE_WEBSITE_DIR=/app

COPY server ./server
COPY index.html manifest.json pwa-icon.svg blank.png back.png deck.png sw.js voicelines.txt ./
COPY *.png ./
COPY src ./src
COPY optimized ./optimized
COPY titlscreenbackgrounds ./titlscreenbackgrounds
COPY ingamebackgrouds ./ingamebackgrouds
COPY setvoicelines ./setvoicelines
COPY ["new voices", "./new voices"]
COPY soundeffects ./soundeffects
COPY afficon ./afficon
COPY aiicons ./aiicons
COPY rankicons ./rankicons
COPY pfp ./pfp
COPY UIpictures ./UIpictures
COPY fates-entwined-website ./fates-entwined-website

EXPOSE 8787

CMD ["node", "server/fate-ws-authority.js"]
