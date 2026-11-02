# Deployment

Two supported layouts. Both put Nginx in front and give each site its own `/api` proxy, so session cookies are first-party and host-only.

| Host | Serves | Proxies |
| --- | --- | --- |
| `www.daredevilgears.com` | storefront | `/api/*` → API (admin routes blocked) |
| `admin.daredevilgears.com` | admin | `/api/v1/admin/*` → API only |

Leave `COOKIE_DOMAIN` empty. Set `TRUST_PROXY=1` (one Nginx hop) so rate limits and audit logs see real client IPs.

---

## A. Single VPS with PM2 + Nginx (recommended to start)

Ubuntu 22.04/24.04, 2 vCPU / 4 GB RAM is enough for launch.

### 1. System packages

```bash
# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
sudo npm i -g pm2
# MongoDB 7 (official repo), Redis, Nginx, certbot
sudo apt-get install -y nginx redis-server certbot python3-certbot-nginx
# follow https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-ubuntu/ for mongodb-org 7.0
```

### 2. MongoDB as a single-node replica set (needed for transactions)

`/etc/mongod.conf`:

```yaml
net: { bindIp: 127.0.0.1, port: 27017 }
security: { authorization: enabled, keyFile: /etc/mongo-keyfile }
replication: { replSetName: rs0 }
```

```bash
openssl rand -base64 756 | sudo tee /etc/mongo-keyfile >/dev/null
sudo chown mongodb:mongodb /etc/mongo-keyfile && sudo chmod 400 /etc/mongo-keyfile
sudo systemctl restart mongod
mongosh --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]})'
mongosh admin --eval 'db.createUser({user:"admin",pwd:passwordPrompt(),roles:["root"]})'
mongosh -u admin -p --authenticationDatabase admin --eval 'db.getSiblingDB("daredevil_gears").createUser({user:"ddg",pwd:passwordPrompt(),roles:[{role:"readWrite",db:"daredevil_gears"}]})'
```

`MONGODB_URI=mongodb://ddg:<password>@127.0.0.1:27017/daredevil_gears?replicaSet=rs0&authSource=daredevil_gears`

The API detects transactions (`MONGODB_TRANSACTIONS=auto`). Without a replica set it falls back to compensating updates, which are safe but less strict under failure.

Redis: in `/etc/redis/redis.conf` keep `bind 127.0.0.1`, set `requirepass`, `appendonly yes`, `maxmemory-policy noeviction` (BullMQ needs it). `REDIS_URL=redis://:<password>@127.0.0.1:6379`.

### 3. Code and environment

```bash
sudo useradd -m -s /bin/bash ddg && sudo -iu ddg
git clone <repo> /home/ddg/daredevil-gears && cd /home/ddg/daredevil-gears
cp backend/.env.example backend/.env && chmod 600 backend/.env   # fill every value, see below
cat > frontend/.env.local <<'EOF'
API_INTERNAL_URL=http://127.0.0.1:4000
SITE_URL=https://www.daredevilgears.com
NEXT_PUBLIC_SITE_URL=https://www.daredevilgears.com
EOF
cat > admin/.env.local <<'EOF'
API_INTERNAL_URL=http://127.0.0.1:4000
NEXT_PUBLIC_STOREFRONT_URL=https://www.daredevilgears.com
EOF
(cd backend && npm ci --omit=dev)
(cd frontend && npm ci && npm run build)
(cd admin && npm ci && npm run build)
```

Each folder is a self-contained project with its own `package.json`, lockfile and `node_modules`.

Minimum production values in `backend/.env`:

```
NODE_ENV=production
STOREFRONT_URL=https://www.daredevilgears.com
ADMIN_URL=https://admin.daredevilgears.com
API_PUBLIC_URL=https://www.daredevilgears.com
TRUST_PROXY=1
MONGODB_URI=...            REDIS_URL=...
JWT_ACCESS_SECRET / JWT_REFRESH_SECRET / ADMIN_JWT_SECRET / OTP_PEPPER   # 4 different random values, 48+ chars
SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / MAIL_FROM_ADDRESS       # MAIL_DEV_OUTBOX=false
RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET
CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD / SUPER_ADMIN_NAME            # first run only
```

The API refuses to start in production with placeholder secrets, missing SMTP, or `ADMIN_MFA_REQUIRED=false`.

**Build-time values.** Next.js inlines `NEXT_PUBLIC_*` variables and the `/api` rewrite target (`API_INTERNAL_URL`) at build time. Change them → rebuild. `SITE_URL` (canonical/sitemap) is read at runtime.

### 4. Seed

```bash
cd backend
npm run seed:products -- --dry-run      # read backend/reports/import-report.md first
npm run seed:all
```

Then remove `SUPER_ADMIN_PASSWORD` from `backend/.env`, sign in to the admin, enrol two-factor, and change the password under **My account**.

### 5. Processes

```bash
pm2 start deploy/pm2/ecosystem.config.js
pm2 save && pm2 startup systemd -u ddg --hp /home/ddg
pm2 install pm2-logrotate
```

`ddg-backend` runs 2 clustered processes with the scheduler off; `ddg-worker` runs BullMQ jobs plus the payment reconciliation and pending-order expiry schedule. Without Redis, remove `RUN_SCHEDULER` and set `RUN_WORKER_INLINE=true` on `ddg-backend` and run it with `instances: 1`.

### 6. Nginx and TLS

```bash
sudo cp deploy/nginx/daredevilgears.conf /etc/nginx/sites-available/
sudo cp deploy/nginx/ddg-proxy-prod.inc /etc/nginx/snippets/
sudo ln -s /etc/nginx/sites-available/daredevilgears.conf /etc/nginx/sites-enabled/
sudo certbot certonly --nginx -d daredevilgears.com -d www.daredevilgears.com -d admin.daredevilgears.com
sudo nginx -t && sudo systemctl reload nginx
```

Optionally restrict the admin host to office/VPN IPs (commented `allow/deny` in the config). Firewall: `ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable` — MongoDB and Redis stay on localhost.

### 7. Razorpay webhook

Razorpay Dashboard → Settings → Webhooks → `https://www.daredevilgears.com/api/v1/webhooks/razorpay`, secret = `RAZORPAY_WEBHOOK_SECRET`, events: `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`. See the live-mode checklist in [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).

### 8. Updates

```bash
./deploy/scripts/deploy.sh   # pull; per folder ci + lint + test/build; sync indexes; pm2 reload
```

---

## B. Docker Compose (one host)

```bash
cp backend/.env.example .env.docker      # fill secrets; also set STOREFRONT_URL, ADMIN_URL, STORE_HOST, ADMIN_HOST
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker exec backend npm run seed:all
```

Services: `mongo` (single-node replica set, initialised by its health check), `redis`, `backend` (scheduler off), `worker`, `frontend`, `admin`, `nginx` (port 80). Each app builds from its own folder and `Dockerfile`. Only Nginx publishes a port. Terminate TLS in front of it (load balancer or a host Nginx using `daredevilgears.conf` pointed at port 80).

The compose MongoDB has no authentication because it is reachable only on the private Docker network. If you expose it or share the host, enable auth with a keyfile as in section A.

Images build without the API running; pages that need catalogue data then render on demand instead of being prerendered.

Build arguments that are baked in: `API_INTERNAL_URL`, `NEXT_PUBLIC_SITE_URL` (frontend), `NEXT_PUBLIC_STOREFRONT_URL` (admin).

---

## Backups and restore

```bash
# nightly at 02:30 IST, 14-day retention, optional off-site copy
30 2 * * * MONGODB_URI='mongodb://...' BACKUP_S3_URI='s3://bucket/ddg' /home/ddg/daredevil-gears/deploy/scripts/backup-mongo.sh >> /var/log/ddg-backup.log 2>&1

# restore (asks for confirmation, drops existing collections)
MONGODB_URI='mongodb://...' ./deploy/scripts/restore-mongo.sh /var/backups/daredevil-gears/ddg-YYYYMMDD-HHMMSS.archive.gz
(cd backend && npm run indexes)
```

Test a restore on a staging database at least once a quarter. Product images live in Cloudinary (enable its backup add-on or keep originals). Keep order and invoice data for at least 8 years (GST record-keeping).

## Monitoring

- `GET /health` (process up) and `GET /ready` (database reachable) for uptime checks.
- Logs: pino JSON to stdout → `pm2 logs` / `docker compose logs`. Secrets, OTPs, tokens and passwords are redacted.
- Errors: set `SENTRY_DSN` and `cd backend && npm i @sentry/node` to enable.
- Admin → **Launch checklist** shows integration status and open review items.
- Admin → **Email log** for failed deliveries; **Payments** for failed or unreconciled payments.
