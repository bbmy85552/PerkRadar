# Official Node image publishes linux/amd64 and linux/arm64.
# Docker Desktop on a Mac builds the architecture of that machine; do not pin --platform.
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Build while devDependencies are present, then drop them.
# next.config.mjs is plain JavaScript, so `next start` does not install TypeScript.
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=38471

EXPOSE 38471

# Run as the unprivileged node user (uid 1000).
USER node

CMD ["npm", "run", "start"]
