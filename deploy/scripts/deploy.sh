#!/usr/bin/env bash
# Update on the VPS (PM2 setup). Run from the repository root.
set -euo pipefail
git pull --ff-only
(cd backend && npm ci && npm run lint && npm test && npm prune --omit=dev && npm run indexes)
(cd frontend && npm ci && npm run lint && npm run build)
(cd admin && npm ci && npm run lint && npm run build)
pm2 reload deploy/pm2/ecosystem.config.js --update-env
pm2 save
echo "Deployed $(git rev-parse --short HEAD)"
