# Bygger den portabla Lydia-backend (Node/Express + kompilerade funktioner).
# Bygg-kontext är repo-roten så att base44/entities, base44/functions,
# base44/shared och src/lib/staffPermissions.js nås av build.
FROM node:20-slim
WORKDIR /app

COPY server/package*.json ./server/
RUN cd server && npm ci --production

COPY server ./server
COPY base44 ./base44
COPY src/lib/staffPermissions.js ./src/lib/staffPermissions.js

RUN cd server && node scripts/build-functions.mjs

WORKDIR /app/server
EXPOSE 3001
ENV NODE_ENV=production
CMD ["node", "src/index.js"]