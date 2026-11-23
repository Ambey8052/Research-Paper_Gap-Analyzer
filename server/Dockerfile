# Debian-based (not alpine) because @huggingface/transformers pulls in onnxruntime-node,
# whose prebuilt native binaries do not support musl libc.
FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Bake the embedding model into the image (otherwise each fresh container downloads it on first
# use). It lives in node_modules/@huggingface/transformers/.cache, which also needs to stay
# writable at runtime — hence the chown of the whole tree to `node`.
RUN npm run prefetch-models

RUN chown -R node:node /app

ENV NODE_ENV=production

USER node

EXPOSE 5000

CMD ["node", "src/server.js"]
