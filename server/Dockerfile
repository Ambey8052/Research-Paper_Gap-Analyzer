# Debian-based (not alpine) because @xenova/transformers pulls in onnxruntime-node,
# whose prebuilt native binaries do not support musl libc.
FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# @xenova/transformers downloads its embedding model into node_modules/@xenova/transformers/.cache
# on first use, so the app needs write access there at runtime — chown the whole tree to `node`.
RUN chown -R node:node /app

ENV NODE_ENV=production

USER node

EXPOSE 5000

CMD ["node", "src/server.js"]
