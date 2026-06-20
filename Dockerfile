FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787

COPY server ./server
COPY src/scripts/01-data-and-state.js ./src/scripts/01-data-and-state.js
COPY fates-entwined-website ./fates-entwined-website

EXPOSE 8787

CMD ["node", "server/fate-ws-authority.js"]
