FROM n8nio/n8n:latest

USER root
WORKDIR /app

COPY package.json /app/package.json
RUN npm install --omit=dev --no-audit --no-fund && chown -R node:node /app

COPY server.js /app/server.js

USER node
EXPOSE 5434
ENTRYPOINT ["node", "/app/server.js"]

