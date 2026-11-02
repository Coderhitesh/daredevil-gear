# Production readiness checklist

Tick every line before taking real orders. Items with ⚙ are also checked live in Admin → **Launch checklist**.

## 1. Business & legal

- [ ] ⚙ Legal name, CIN, registered address, support email/phone entered and marked confirmed
- [ ] ⚙ GSTIN verified on the GST portal
- [ ] ⚙ Grievance Officer named with email and phone; 48-hour acknowledgement and 1-month resolution process owned by a person
- [ ] ⚙ All policy pages reviewed by a lawyer; every highlighted placeholder replaced; "requires review" unticked
- [ ] ⚙ GST & tax rules and every product HSN code confirmed by the CA
- [ ] Pepper spray / restricted items: legal opinion on file for selling online in India and couriering as dangerous goods
- [ ] Courier agreement allows aerosols/oils; courier rate card entered in Shipping and "confirm" flags cleared

## 2. Catalogue

- [ ] ⚙ No product with open blocking compliance flags is meant to be on sale
- [ ] ⚙ Real photos on every published product (at least one, 1200 px+)
- [ ] ⚙ Legal Metrology fields filled (country of origin, manufacturer/packer/importer name & address, net quantity, consumer care)
- [ ] ⚙ Stock counted and entered for every published product (Inventory → Adjust, reason "Opening stock")
- [ ] Shipping weights entered (the sheet's weights are `#REF!`)
- [ ] Prices spot-checked on 10 products: product page, cart, checkout and invoice agree to the paisa
- [ ] No struck-through prices unless a genuine prior price and its evidence are recorded

## 3. Infrastructure

- [ ] MongoDB replica set with authentication; Redis with password; both bound to localhost/private network
- [ ] `NODE_ENV=production`, https `STOREFRONT_URL`/`ADMIN_URL`, `TRUST_PROXY=1`, 4 distinct random secrets (the API refuses to start otherwise)
- [ ] TLS certificates for apex, www and admin; HTTP redirects to HTTPS; HSTS
- [ ] Nginx config from `deploy/nginx/daredevilgears.conf`; admin `/api` limited to `/api/v1/admin`; storefront blocks `/api/v1/admin`
- [ ] PM2 (or Compose) running backend ×2, worker ×1, frontend, admin; restart on boot verified
- [ ] Nightly backup cron running; one restore tested on a staging database
- [ ] Uptime monitors on `https://www.daredevilgears.com/` and `https://www.daredevilgears.com/api/ready` (200 = API and database up)
- [ ] Error monitoring (Sentry) enabled
- [ ] Release commit passes: `npm run lint` + `npm test` in `backend/`; `npm run lint` + `npm run build` in `frontend/` and `admin/`

## 4. Email

- [ ] ⚙ SMTP configured; SPF, DKIM and DMARC set for the sending domain
- [ ] Send a test of each template (Admin → Email templates → Send me a test); check spam folder placement
- [ ] Staff notification addresses set (Store settings → Staff notifications)

## 5. Accounts & access

- [ ] Super Admin signed in, enrolled two-factor and changed the seeded password
- [ ] `SUPER_ADMIN_PASSWORD` removed from the server environment
- [ ] Each staff member has their own account with the least role needed; ⚙ all have two-factor on
- [ ] Optional: admin host restricted to office/VPN IPs

## 6. Razorpay — switching to live mode

Do this in order, with the site still unannounced.

1. **Complete KYC** in the Razorpay Dashboard and wait for live mode activation. Confirm the settlement bank account and the business name customers will see.
2. **Full test run in test mode** (`rzp_test_` keys):
   - [ ] Place an order paying by UPI (success), card (success, use Razorpay test cards), and a deliberately failed payment.
   - [ ] Close the Razorpay window without paying → order stays "Awaiting payment", stock is held, then released when it expires (30 minutes by default).
   - [ ] Pay, then kill the browser before the callback → the webhook confirms the order within a minute.
   - [ ] Admin → order → Reconcile on a pending order returns the correct state.
   - [ ] Cancel a paid order → full refund created; refund webhook moves it to processed.
   - [ ] Partial refund of one item; restock option updates inventory.
   - [ ] Invoice numbers are sequential (`DDG/<FY>/00001`…) and the tax split matches the cart.
3. **Generate live keys** (Settings → API Keys → Live). Store `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` only in `backend/.env` on the server.
4. **Create the live webhook**: URL `https://www.daredevilgears.com/api/v1/webhooks/razorpay`, a new random secret in `RAZORPAY_WEBHOOK_SECRET`, events `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`. Test keys and live keys have separate webhooks.
5. Restart the API (`pm2 reload ddg-backend ddg-worker`). Admin → Launch checklist must show "Razorpay connected (live mode)".
6. **One real order** for a small amount with your own card/UPI: confirm payment, invoice, confirmation email, then refund it from the admin and confirm the money returns.
7. Enable payment methods you want (UPI, cards, net banking, wallets) in the Razorpay Dashboard. COD stays off in the store.
8. Watch Admin → Payments and the Razorpay Dashboard daily for the first two weeks; investigate any captured payment without a confirmed order (the scheduler should reconcile it automatically).

## 7. SEO & analytics

- [ ] `SITE_URL` set; `/robots.txt` allows crawling only in production; `/sitemap.xml` lists published products, categories, collections and pages
- [ ] Redirects added for old URLs from the previous site (Admin → Redirects)
- [ ] Google Search Console verified (Store settings → Analytics) and sitemap submitted
- [ ] GA4 measurement ID added if wanted; cookie/analytics disclosure in the privacy policy matches

## 8. Go-live day

- [ ] Announcement bar text confirmed
- [ ] Backup taken immediately before launch
- [ ] Someone on call for orders, payments and grievances for the first week
