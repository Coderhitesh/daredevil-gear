/**
 * PM2 process file for a single VPS. Each folder is installed and built on its own:
 *   (cd backend && npm ci --omit=dev)
 *   (cd frontend && npm ci && npm run build)
 *   (cd admin && npm ci && npm run build)
 *   pm2 start deploy/pm2/ecosystem.config.js && pm2 save && pm2 startup
 * Secrets live in backend/.env, frontend/.env.local and admin/.env.local on the server (never in git).
 */
const path = require('path');

const root = path.resolve(__dirname, '../..');

module.exports = {
  apps: [
    {
      name: 'ddg-backend',
      cwd: path.join(root, 'backend'),
      script: 'src/server.js',
      instances: 2,
      exec_mode: 'cluster',
      env: { NODE_ENV: 'production', RUN_WORKER_INLINE: 'false', RUN_SCHEDULER: 'false' }, // the worker runs jobs + scheduler (needs REDIS_URL)
      max_memory_restart: '512M',
      kill_timeout: 15000,
      time: true,
    },
    {
      name: 'ddg-worker',
      cwd: path.join(root, 'backend'),
      script: 'src/jobs/worker.js',
      instances: 1,
      env: { NODE_ENV: 'production' },
      max_memory_restart: '384M',
      time: true,
    },
    {
      name: 'ddg-frontend',
      cwd: path.join(root, 'frontend'),
      script: path.join(root, 'frontend/node_modules/next/dist/bin/next'),
      args: 'start -p 3000 -H 127.0.0.1',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '768M',
      time: true,
    },
    {
      name: 'ddg-admin',
      cwd: path.join(root, 'admin'),
      script: path.join(root, 'admin/node_modules/next/dist/bin/next'),
      args: 'start -p 3001 -H 127.0.0.1',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '512M',
      time: true,
    },
  ],
};
