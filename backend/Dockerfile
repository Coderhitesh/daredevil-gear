# DareDevil Gears backend (API and worker).  docker build -t ddg-backend ./backend
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# argon2 ships prebuilt glibc binaries; build tools are only a fallback
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/* \
 && npm ci --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN rm -f .env && mkdir -p .outbox reports && chown -R node:node .outbox reports
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
