FROM node:20-alpine
WORKDIR /app
COPY server/fate-ws-authority.js ./server/fate-ws-authority.js
COPY fates-entwined-website ./fates-entwined-website
COPY dist/Fates-Entwined-Setup-*.exe ./dist/
EXPOSE 8787
CMD ["node", "server/fate-ws-authority.js"]
