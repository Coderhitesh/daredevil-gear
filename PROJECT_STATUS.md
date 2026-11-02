# PROJECT STATUS — DareDevil Gears

_Last updated: 2026-10-28 (session 3 — split into separate backend / frontend / admin projects)_

## Status: feature-complete, pending business data and live credentials

All three apps, seeds, tests and deployment assets are built. Launch is blocked only by items the business must supply (legal details, grievance officer, CA sign-off, photos, stock, weights, Razorpay/SMTP/Cloudinary credentials) — see `docs/BUSINESS_DECISIONS.md` and `docs/PRODUCTION_READINESS.md`.

## Completed

**Backend** (`backend/`) — Express + Mongoose, REST under `/api/v1`, admin under `/api/v1/admin`, OpenAPI at `/api/docs` (non-production).
Auth with email OTP, rotating refresh sessions, admin sessions with mandatory TOTP; RBAC; pricing/GST engine; compliance scanner; catalogue, search, inventory (atomic reserve/release/commit); cart, coupons, shipping zones/weight slabs; idempotent checkout; Razorpay signature/webhook/reconcile/refunds; order state machine, shipments, returns, invoices; reviews; CMS/home sections/menus/redirects; grievances, contact & bulk enquiries, newsletter; reports and CSV exports; uploads (Cloudinary, magic-byte checks); BullMQ worker with scheduler; audit and email logs; hardened production config guard.

**Excel import & seeds** — `seed:categories`, `seed:products` (dry run, idempotent, manual edits protected), `seed:content`, `seed:admin`, `seed:all`; reports in `backend/reports/`. 70 products: 58 published, 9 review, 3 archived.

**Frontend / storefront** (`frontend/`) — home (admin-configured sections), shop/category/collection with filters and sort, typo-tolerant search, product page (gallery, variants, delivery check, specs, statutory info, genuine reviews only), cart drawer and page, guest/registered checkout with GST split and Razorpay, order success, account (orders, cancel/return, invoices, addresses, wishlist, reviews, profile, security, privacy requests), track order, CMS/policy pages with grievance form, contact, bulk orders, SEO (metadata, JSON-LD, sitemap, robots, redirects), self-hosted fonts, brand design system.

**Admin** (`admin/`) — sign-in + TOTP enrolment, role-aware navigation, launch-item strip; dashboard (revenue chart, payments, recent orders, top products, low/out of stock); products (list with compliance tabs, editor with details, pricing & GST preview, compliance & certificates, SEO, photos, options & stock, status/publish gate, flag resolution, legal review, history), Excel import with dry run, inventory & stock ledger, categories, collections, brands; orders (queues, filters, export) with full workspace (status, ship manual/Shiprocket, shipment updates, cancel with auto-refund, partial refunds, returns processing, reconcile, resend emails, notes, invoice); payments, refunds, returns; coupons; customers with privacy export/erasure; review moderation; grievances with statutory deadlines; messages & bulk enquiries; newsletter; homepage sections, banners, pages & policies, menus, redirects; store settings (all groups, mark reviewed), GST & tax, shipping zones/rates, email templates with live preview and test send, admin users & role matrix, audit log, email log, launch checklist, reports, my account.

**Deployment** — `backend/Dockerfile`, `frontend/Dockerfile`, `admin/Dockerfile`, `docker-compose.yml` (Mongo replica set, Redis, backend, worker, frontend, admin, Nginx), `deploy/nginx/` (production TLS + Compose), `deploy/pm2/ecosystem.config.js`, `deploy/scripts/` (backup, restore, deploy).

**Docs** — README, DEPLOYMENT, PRODUCTION_READINESS (incl. Razorpay live-mode), SECURITY, DATA_MAPPING, BUSINESS_DECISIONS, KNOWN_LIMITATIONS.

## Storefront design (session 4)

Storefront restyled to the agreed reference: dark two-tier header (search pill, All Categories menu), dusk/ridge-line hero with script accent, round category icons, dark Top Categories panel, card grid with orange Add to Cart, brand band with live catalogue counts, Why-choose-us, dark newsletter band and footer, dark page headers on inner pages. Fonts: Poppins (headings), Inter (body), Kaushan Script (hero accent). Fake ratings, discount badges, customer-count stats and third-party brand logos from the reference were not used.

## Structure

No monorepo/workspaces: `backend/`, `frontend/` and `admin/` are independent npm projects (own `package.json`, lockfile, `node_modules`, env file, Dockerfile). Shared constants are copied into each (`backend/src/shared/index.js`, `frontend/lib/shared.js`, `admin/lib/shared.js`).

## Verification

| Check | Result |
| --- | --- |
| `npm run lint` (api, storefront, admin) | clean |
| `npm test` (API unit + integration) | 82 / 82 passed |
| `next build` storefront and admin | pass (also with the API unreachable, as in Docker builds) |
| Playwright storefront journey (desktop + mobile) | 8 / 8 passed |
| Admin in headless browser | sign-in with MFA enrolment, all main pages render (only console error: the expected 401 from the signed-out session check), order lifecycle confirmed → processing → shipped → delivered with emails logged |
| `docker compose config` | valid |
| `nginx -t` both configs + routing test | pass |
| Re-import of the workbook | 70 unchanged (idempotent) |

## Not verified here

See `docs/KNOWN_LIMITATIONS.md` (real MongoDB replica set, Docker image builds, live Razorpay/SMTP/Cloudinary/Shiprocket).

## Local dev environment used

FerretDB 1.24 (SQLite) on 127.0.0.1:27017 and Redis on 6379 (`/home/claude/ddg-local`), secrets in `backend/.env` (git-ignored). Dev stock seeded with `--dev-stock=25`; one dev-only paid order inserted locally for admin screenshots (not part of any seed).

## Session 5 — functionality check (login 503, checkout)
- Login 503 = SMTP send failure for an unverified account. New `src/services/smtp.js` (port↔TLS auto, Gmail app-password spaces, plain-language errors), startup SMTP check, `npm run email:test -- you@x.com`, dev-only hint appended to the 503 message.
- Razorpay: startup key check, `createOrder` failures → 503 PAYMENT_GATEWAY_ERROR with a plain reason in logs; `placeOrder` refuses before creating an order when keys are missing; `/checkout/config` exposes `paymentsEnabled` and the checkout shows a notice + disables Pay.
- Checkout: form validation is never silent (summary message + focus first bad field); `crypto.randomUUID` fallback for http LAN-IP access; hint under a disabled Pay button.
- Hydration: `useMe` reports "no user" until hydration ends (streamed product reviews mismatched for signed-in users); zustand local store rehydrates after mount.
- `/wishlist` redirects to `/account/wishlist`.

## Session 6 — Shiprocket + hero slider
- Live delivery charges: `shipping.options()` asks Shiprocket serviceability (pickup PIN from Admin → Settings → Shiprocket, parcel weight from products, box size from settings) and offers the cheapest courier plus a faster one. Product page PIN check, cart and checkout all use it; `placeOrder` recomputes it server-side (rateId `sr_<courierId>`). Free-delivery threshold still applies. Falls back to manual zones if Shiprocket is down (configurable). Rates cached 10 min.
- Auto push: `markPaid` → `shiprocket-sync.service` job (`shiprocket.push`, retries, idempotent, looks the order up before re-creating). `order.shiprocket` holds status/order id/shipment id/AWB/last error. Optional auto AWB with the quoted courier. Cancelling an order cancels it in Shiprocket.
- Admin: Settings → Shiprocket (+ "Check rates" connection test), Shiprocket card on the order page with Send/Retry, "Book through Shiprocket" reuses the pushed order.
- Hero: banners get `linkHref` (whole slide clickable), `openInNewTab`, `layout` (overlay | image_only), `durationSeconds`. Slider auto-advances, pauses on hover/focus/hidden tab/reduced motion, has pause button, dots with progress, arrows, swipe, keyboard.
- Hydration: `useCart`, `useLocalSafe` (recently viewed, guest wishlist, recent searches) render server-equal output until hydration ends.
- Tests: `tests/integration/shiprocket.test.js` (mock Shiprocket API) — 91/91.

## Session 7 — Cash on delivery
- Admin → Settings → Checkout: COD on/off, fixed COD fee, add courier's COD charge (Shiprocket `cod_charges`), min/max order value, guests allowed, max undelivered COD orders per customer.
- Quote/checkout: `paymentMethod: online|cod`. COD asks Shiprocket with `cod=1` (only COD couriers), delivery charge stays the freight charge, COD fee is its own GST-inclusive line (`pricing.codCharge/codTax`). PIN codes without COD fall back to online with a reason.
- `placeOrder` COD branch: no Razorpay (works without keys), stock + coupon committed, order `confirmed`, `payment: { provider: 'cod', status: 'cod_pending' }`, invoice number, emails, Shiprocket push as `payment_method: COD` (sub_total + shipping + transaction charges = grand total). Idempotent replays.
- Marking delivered sets payment `captured` (cash collected). Cancel before delivery: restock + coupon released, no refund. Refunds on COD orders are manual (bank/UPI) with a reference (`Refund.mode = manual`).
- Storefront: Payment step (Pay online / Cash on delivery), "Place COD order" button, success/order pages say pay on delivery. Admin: COD notice + fee on order page, manual refund reference, settings.
- Tests: `tests/integration/cod.test.js` — 101/101 total.

## Session 8 — Storefront motion
- `html.motion-ok` (inline head script) gates all decorative motion; nothing animates for prefers-reduced-motion.
- Hero: ridges rise in and follow the mouse (parallax via --mx/--my), twinkling stars, drifting sun, headline words climb in, brush underline paints, Ken Burns on photo banners; replays on every slide.
- Trail ticker under the hero (trust items, pauses on hover). Scroll reveals via one `RevealObserver` (.reveal / .reveal-pop + --i stagger): section heads (kicker trail line), category icons (pop + hop on hover), product cards, category tiles, reviews, trust strip, story stats with `CountUp`.
- Product card quick-add: photo flies to the header cart (`lib/fly-to-cart.js`), cart bumps, badge pops, button shows "Added ✓"; card lifts on hover. Wishlist heart pop + ring. Footer band: drifting topo contour lines (`TopoLines`).

## Session 9 — Offers, combos, weights & sizes
- Homepage "Offers & combos" section (`HomeSection` type `offers`, auto-created at startup by `content.ensureSections`): offer posts = Banners with placement `offer` (+ optional `product`, card opens /product/slug), followed by live combo offers.
- `Offer` model + `offer.service`: `bundle` (fixed set at one GST-inclusive price, once per complete set) and `multi_buy` (N+ eligible units → % off, optional cap). Savings from today's prices; skipped when not cheaper. Runs before coupons; `combinableWithCoupons:false` keeps coupons off those lines. Discounts shared across units so GST is on the real price. Totals: `offerDiscount`, `offers[]`; order snapshot stores both; Shiprocket sub_total, emails, invoice, admin & customer summaries show them. Nudges ("add 1 more…") in cart/drawer.
- Storefront: product page "Offers on this product" (multi-buy line + combo cards with "Add combo to cart" → `POST /cart/offers/:id`), `GET /offers`, `GET /products/:slug/offers`.
- Admin: Combo offers page (combo item editor with "bought separately" total; server rejects combo price ≥ today's total), Banners placement "Homepage offer post" with product picker.
- Parcel: `shipping.parcel()` = actual weight + packed box from product L×W×H (largest footprint, height from total volume) or the default box; sent to Shiprocket rates and stored on the order (`delivery.lengthCm…`) for the Shiprocket order.
- Admin → Weights & sizes: inline table (missing filter, volumetric/billable preview, option weights), CSV download/upload (sku, variant_sku, weight_kg, length_cm, width_cm, height_cm).
- Tests: `tests/integration/offers.test.js` — 115/115.
- Session 9b: homepage split into two sections — `offers` ("Offers": admin offer posts) and `combos` ("Combo offers": dark band with combo cards + "Buy more, save more" multi-buy cards linking to their category/products). `ensureSections` creates both and renames the old combined title.
- Session 9c: hero mobile image — shown below 768px (was 640px), either image alone works, only the visible one is preloaded; promo tiles fall back to the mobile image. Instant storefront refresh: admin changes to banners/home/offers/settings/catalogue call `POST /revalidate-cache` on the storefront (`REVALIDATE_SECRET` in backend/.env + frontend/.env.local, `STOREFRONT_INTERNAL_URL`), otherwise pages refresh within 60 s.
- Session 9d: About page is now code (`frontend/app/about/page.js`, `components/about/TrailMap.js`): animated trail-map hero, story + linked pack list, four promises, live departments with counts, who we serve, popular products, numbered order journey, contact/CTA from business settings, AboutPage JSON-LD. `/pages/about-us` → 308 `/about`; header/seed links updated; CMS "about-us" page no longer shown. RevealObserver also reveals passed elements when scrolling settles.
