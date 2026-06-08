FROM node:20-alpine
WORKDIR /app
COPY . .
EXPOSE 8787
ENV HOST=0.0.0.0
ENV PORT=8787
CMD ["node", "tools/solo-static-server.js"]
