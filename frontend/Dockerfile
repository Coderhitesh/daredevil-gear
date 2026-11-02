# DareDevil Gears frontend (Next.js standalone).  docker build -t ddg-frontend ./frontend
FROM node:22-bookworm-slim AS build
# Inlined at build time (client bundles / middleware / dev rewrite). Runtime values go in `docker run -e`.
ARG API_INTERNAL_URL=http://backend:4000
ARG NEXT_PUBLIC_SITE_URL=
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone API_INTERNAL_URL=$API_INTERNAL_URL NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The backend is usually unreachable during an image build; affected pages then render on demand.
RUN rm -f .env.local && npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
