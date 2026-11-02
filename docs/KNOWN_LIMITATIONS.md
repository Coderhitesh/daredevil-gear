# Known limitations

What is not built, not verified, or depends on something outside the code. Business data gaps are in [BUSINESS_DECISIONS.md](BUSINESS_DECISIONS.md).

## Not verified in the build environment

| Area | Status | How to verify |
| --- | --- | --- |
| MongoDB | Developed and tested against FerretDB 1.24 (MongoDB wire-compatible) because MongoDB binaries could not be downloaded. Multi-document transactions and the concurrent stock-reservation test (skipped on FerretDB, which misreports concurrent conditional updates) were not exercised on real MongoDB. | Run `npm test` against a MongoDB 7 replica set (`MONGODB_URI=... npm test`). The concurrency test runs automatically there. |
| Docker images | `docker compose config` validates; images were not built because the Docker registry is blocked from the sandbox. | `docker compose --env-file .env.docker up -d --build` on a normal host. |
| Nginx | Both configs pass `nginx -t`; host-based routing (`/api` on each host, admin API blocked on the storefront, public API blocked on the admin) was tested against the running apps. TLS was tested with a self-signed certificate. | `sudo nginx -t` on the server after certbot. |
| Razorpay | Signature, webhook, idempotency, reconciliation and refunds are covered by integration tests with a stubbed Razorpay client. No call was made to Razorpay's real API. | Section 6 of PRODUCTION_READINESS.md (test mode first). |
| SMTP, Cloudinary, Shiprocket | Code paths implemented; no credentials were available. In development emails go to `backend/.outbox/`; uploads return a clear "not configured" error. | Add credentials, then Admin → Email templates → Send me a test; upload a product photo; book one Shiprocket shipment. |
| Admin end-to-end | Exercised in a headless browser (sign-in with TOTP enrolment, products, import dry run, order status → ship → delivered, notes, settings, shipping, email preview). No committed Playwright spec for the admin, because sign-in needs a live TOTP secret. | Manual run-through before launch; optional spec reading the TOTP secret from an env var. |
| Accessibility | Built with semantic HTML, labelled controls, focus traps, visible focus, reduced-motion support and colour-contrast-checked tokens. No automated axe/Lighthouse audit was run. | Run Lighthouse/axe on home, category, product, cart, checkout and account pages. |
| Competitor / current site | Could not be fetched from the build environment; not reviewed. | — |

## Functional gaps (by design or deferred)

- **Invoices are HTML** (print / save as PDF from the browser). No server-side PDF generation or e-invoicing (IRN) integration. If turnover makes e-invoicing mandatory, integrate a GSP.
- **No cookie-consent banner.** GA4 loads only when a measurement ID is set in settings. Add a consent banner before enabling GA4 if the privacy policy or the DPDP Act rules require consent for analytics cookies.
- **Search** uses MongoDB queries with in-app typo tolerance. Fine for hundreds of products; for thousands, move to Atlas Search or Meilisearch.
- **No real-time updates** (Socket.IO was not needed): admin lists refresh on navigation; payment state updates via webhook/reconciliation.
- **Single currency (INR), India delivery.** International orders are quote-only through the bulk/contact form.
- **No COD, wallets/gift cards, loyalty points or subscriptions.**
- **One shipping provider integration** (Shiprocket) plus manual tracking entry. Rate cards are maintained in the admin, not fetched live from the courier.
- **Exchanges** are recorded as return requests; the replacement is a new order placed by staff or the customer.
- **Product images**: one image set per product; per-variant images are not supported (variants are usually separate products linked by a variant group).
- **Reviews** have no photo uploads.
- **Sentry** is optional: install `@sentry/node` in `backend` and set `SENTRY_DSN`.
- **Build-time configuration**: `NEXT_PUBLIC_*` values and the dev `/api` rewrite target are inlined at build; changing them needs a rebuild.

## Data limitations from the source workbook

- No photos, no shipping weights (`#REF!`), stock only for engine oils, HSN codes "indicative", Legal Metrology details missing for most products.
- 9 products held for review and 3 archived (see BUSINESS_DECISIONS.md, section B).
- The "Jungle Shoes" hide-list entry was not applied to "DareDevil Anti-Spike Jungle Shoes" automatically.
