# DareDevil Gears — e-commerce platform

Three independent projects. Each folder has its own `package.json`, lockfile, `node_modules`, `.env` and `Dockerfile`, and can be developed, built and deployed on its own.

```
daredevil-gears/
├── backend/     Express + MongoDB REST API, jobs, seeds, tests          :4000
│   ├── src/         app, config, models, routes, services, jobs, shared/
│   ├── scripts/     seed:*, reconcile, indexes
│   ├── tests/       Jest unit + integration
│   ├── data/        product workbook (Excel)
│   └── reports/     import reports (generated)
├── frontend/    Customer storefront — Next.js App Router + Tailwind       :3000
│   ├── app/ components/ lib/ public/ e2e/
├── admin/       Staff dashboard — Next.js, separate host, MFA required    :3001
│   ├── app/ components/ lib/ public/
├── deploy/      nginx/, pm2/, scripts/ (backup, restore, deploy)
├── docs/        deployment, security, launch checklist, data mapping, decisions
└── docker-compose.yml   whole stack on one host
```

JavaScript only. Shared constants (order statuses, role → permission matrix, ₹ formatting) live in `backend/src/shared/index.js`, mirrored in `frontend/lib/shared.js` and `admin/lib/shared.js` — change all three together.

## Run locally

Requirements: Node 20.11+ (22 recommended), MongoDB 7 (replica set recommended), Redis 7 (optional).

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env            # fill secrets (comments in the file explain each)
npm run seed:all -- --dev-stock=25
npm run dev                     # http://localhost:4000   Swagger: /api/docs (non-production)
```

`--dev-stock` gives every product 25 units for local testing only. Without SMTP, emails (including sign-up codes) are written to `backend/.outbox/`. Without Razorpay keys, checkout stops before payment with a clear message and releases the held stock.

### 2. Frontend (storefront)

```bash
cd frontend
npm install
cp .env.example .env.local      # API_INTERNAL_URL=http://127.0.0.1:4000
npm run dev                     # http://localhost:3000
```

### 3. Admin

```bash
cd admin
npm install
cp .env.example .env.local      # API_INTERNAL_URL, NEXT_PUBLIC_STOREFRONT_URL
npm run dev                     # http://localhost:3001 → sign in with SUPER_ADMIN_* from backend/.env, enrol MFA
```

In development both Next apps proxy `/api` to the backend so cookies stay first-party. In production Nginx does this (see `deploy/nginx`).

## Scripts

| Folder | Command | What it does |
| --- | --- | --- |
| backend | `npm run dev` / `npm start` | API with watch / production |
| backend | `npm run worker` | BullMQ worker + payment reconciliation/expiry schedule (needs `REDIS_URL`) |
| backend | `npm test` | Unit + integration tests |
| backend | `npm run lint` | ESLint |
| backend | `npm run seed:all` | Categories → products → content → super admin; idempotent |
| backend | `npm run seed:products -- --dry-run` | Preview the Excel import; reports in `backend/reports/` |
| backend | `npm run seed:categories` / `seed:content` / `seed:admin` | Individual seeds |
| backend | `npm run reconcile:payments` | One-off Razorpay reconciliation |
| backend | `npm run indexes` | Sync MongoDB indexes after a deploy |
| frontend | `npm run dev` / `build` / `start` / `lint` | Storefront |
| frontend | `npm run e2e` | Playwright journey (backend + storefront running) |
| admin | `npm run dev` / `build` / `start` / `lint` | Admin |

## Deploy

- One VPS with PM2 + Nginx: `deploy/pm2/ecosystem.config.js`, `deploy/nginx/daredevilgears.conf`, `deploy/scripts/deploy.sh`.
- Docker: `docker compose --env-file .env.docker up -d --build` (builds `backend/`, `frontend/`, `admin/` from their own Dockerfiles).

Full steps: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — VPS and Docker, environment, backups, updates
- [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md) — launch checklist incl. Razorpay live mode
- [docs/SECURITY.md](docs/SECURITY.md) — implemented controls and operating rules
- [docs/DATA_MAPPING.md](docs/DATA_MAPPING.md) — Excel workbook → database
- [docs/BUSINESS_DECISIONS.md](docs/BUSINESS_DECISIONS.md) — decisions taken, items the business must confirm
- [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) — not done or not verified
- [PROJECT_STATUS.md](PROJECT_STATUS.md)

## Ground rules baked into the code

- Prices stored in integer **paise, GST inclusive**; GST split per line at checkout and frozen on the order.
- No fake discounts, reviews, ratings, stock counters or urgency.
- Products with unverified protection/safety claims, restricted items and force insignia are held for review and cannot be published until resolved.
- No public Super Admin sign-up; admins use mandatory TOTP two-factor.
- Payments confirmed only by a verified Razorpay signature or webhook with a matching amount. Card data never touches these servers.
