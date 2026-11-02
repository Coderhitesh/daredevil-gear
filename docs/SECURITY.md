# Security

What is implemented, where, and the rules for operating it. Report suspected issues to the Super Admin and rotate affected secrets immediately.

## Authentication

| Control | Implementation |
| --- | --- |
| Password hashing | Argon2id (19 MiB, t=2) — `services/password.service.js`. Unknown-email logins verify a dummy hash so timing does not reveal accounts. |
| Password policy | 10+ characters with letters and numbers (12+ for admins); rejects common passwords and passwords containing the email or name. |
| Account lockout | Failed sign-ins are counted per account with a temporary lock, plus IP rate limits. |
| Customer sessions | 15-minute JWT access cookie `ddg_at` + opaque rotating refresh cookie `ddg_rt` (path `/api/v1/auth`). Refresh tokens are stored hashed; re-use of an old token revokes the whole session family. "Sign out everywhere" bumps a token version. |
| Admin sessions | Separate opaque cookie `ddg_admin` (SameSite=Strict, 8 h), stored hashed in `Session`, revocable. Suspending an admin, resetting their password/MFA or changing role revokes all their sessions. |
| Admin MFA | TOTP (RFC 6238) is mandatory. Until enrolled, every admin API except `/admin/auth/*` returns `MFA_SETUP_REQUIRED`. The API refuses to start in production with `ADMIN_MFA_REQUIRED=false`. |
| No public admin sign-up | Only `npm run seed:admin` (refuses if a Super Admin exists) and Super Admins in the dashboard can create admins. Temporary passwords are shown once. |
| Email OTP | 6 digits from `crypto.randomInt`, stored as HMAC-SHA256 with `OTP_PEPPER`, single use, 10-minute expiry, 5 attempts, 60-second resend cooldown, daily cap, generic responses. OTPs are never logged or returned by any API (development reads them from `.outbox/`). No fixed test codes exist. |
| Cookies | `httpOnly`, `secure` in production, host-only (leave `COOKIE_DOMAIN` empty). |

## Authorisation

- Role → permission matrix in `backend/src/shared` (`PERMISSIONS`, mirrored in `frontend/lib/shared.js` and `admin/lib/shared.js`), enforced server-side by `requirePermission` on every admin route. The admin UI hides what a role cannot do, but the API is the authority.
- Customer data access is scoped by the session user; guest order access needs the per-order token (stored hashed).
- Super Admin cannot demote or suspend themselves; at least one active Super Admin must remain.

## Request handling

- CSRF: every state-changing request must carry `x-ddg-csrf: 1` and, when present, an allowed `Origin` (`STOREFRONT_URL`, `ADMIN_URL`). Combined with SameSite cookies.
- Input: Zod schemas on every route (`validate`); keys starting with `$` or containing `.` are stripped from body, query and params (NoSQL operator injection).
- Rich text (CMS pages, descriptions) is sanitised with an allowlist (`sanitize-html`).
- Uploads: memory-only multer, size limits, magic-byte sniffing (JPEG/PNG/WebP/PDF/XLSX), stored in Cloudinary, never on local disk or served from the API.
- CSV exports neutralise spreadsheet formula injection (`=`, `+`, `-`, `@` prefixes).
- Rate limits (per IP): global 600/min, auth 30/15 min, OTP 10/h, admin login 10/15 min, forms 20/h, search 120/min, checkout 30/10 min — plus Nginx limits in `deploy/nginx`.
- Helmet with a deny-all CSP on API responses; the storefront and admin send `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS; the admin is `X-Frame-Options: DENY` and `noindex`.
- Admin API responses are `Cache-Control: no-store`. Swagger UI is disabled in production.

## Payments (Razorpay)

- Amounts are computed on the server from the cart; the client never sends a price.
- A payment is accepted only after (a) HMAC signature verification **and** a server-side fetch confirming the captured amount and currency, or (b) a webhook with a valid `X-Razorpay-Signature` over the raw body.
- Webhooks are idempotent (`WebhookEvent` by event id); order confirmation is compare-and-set, so a webhook and the browser callback cannot double-confirm.
- Reconciliation runs on a schedule and on demand; unpaid orders expire and release stock.
- Refunds go through Razorpay with an idempotency key and a server-side cap at the refundable amount.
- No card numbers, CVV or UPI PINs are ever received or stored. Only Razorpay ids and display metadata (network, last 4, bank).
- There is no simulated or "test success" payment path in the code.

## Secrets and data

- `.env` files are git-ignored; `.env.example` contains placeholders only. The API refuses to start in production with example or duplicated secrets, missing SMTP/Razorpay, or http URLs.
- Logs (pino) redact cookies, authorization headers, passwords, OTPs, tokens and secrets.
- Audit log records admin sign-ins, failed sign-ins and every admin change (who, what, before/after, IP).
- Customer privacy requests (export, erasure) are handled in the admin; erasure anonymises the account and keeps order/invoice records as tax law requires.
- Admin notes fields warn staff not to record card or ID numbers.

## Operating rules

1. Rotate `JWT_*`, `ADMIN_JWT_SECRET` and `OTP_PEPPER` if a server or `.env` is exposed. Rotating them signs everyone out; rotating `OTP_PEPPER` invalidates outstanding codes only.
2. Remove `SUPER_ADMIN_PASSWORD` from the server after the first sign-in.
3. Give each staff member their own account with the least role needed. Suspend accounts the day someone leaves.
4. Keep MongoDB and Redis bound to localhost/private network with authentication.
5. Patch monthly: `npm audit`, OS updates, Node LTS updates.
6. Review the audit log weekly for unexpected `admin.login_failed`, `refund.create` and `settings.update` entries.
