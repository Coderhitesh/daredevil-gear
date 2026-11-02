'use strict';

const nodemailer = require('nodemailer');
const env = require('../config/env');

/**
 * SMTP transport + plain-language diagnosis of common configuration mistakes.
 * Port 465 needs an implicit-TLS connection (secure: true); 587/25/2525 use STARTTLS (secure: false).
 * Getting this pair wrong is the most common cause of "wrong version number" / timeout errors,
 * so the port decides unless SMTP_SECURE is set for a non-standard port.
 */
function transportOptions() {
  const port = env.SMTP_PORT;
  const secure = port === 465 ? true : [587, 25, 2525].includes(port) ? false : env.SMTP_SECURE;
  const isGmail = /gmail\.com$/i.test(env.SMTP_HOST || '');
  return {
    host: env.SMTP_HOST,
    port,
    secure,
    requireTLS: !secure && port === 587,
    tls: { servername: env.SMTP_HOST, rejectUnauthorized: env.isProd ? true : env.SMTP_TLS_REJECT_UNAUTHORIZED !== false },
    // Google shows app passwords as "abcd efgh ijkl mnop"; the spaces are not part of the password
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: isGmail ? String(env.SMTP_PASS || '').replace(/\s+/g, '') : env.SMTP_PASS } : undefined,
    pool: true,
    maxConnections: 3,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  };
}

function createTransport() {
  return nodemailer.createTransport(transportOptions());
}

/** Human explanation for a nodemailer error. */
function explain(err) {
  const msg = String(err?.message || err || '');
  const code = err?.code || '';
  const host = env.SMTP_HOST || '';
  const gmail = /gmail\.com$/i.test(host);
  if (code === 'EAUTH' || /535|534|auth/i.test(msg)) {
    return gmail
      ? 'SMTP login rejected. For Gmail use a 16-character App Password (Google Account → Security → 2-Step Verification → App passwords), not your normal Gmail password. SMTP_USER must be the full Gmail address.'
      : 'SMTP login rejected — check SMTP_USER and SMTP_PASS (for Zoho/Outlook/Workspace use an app-specific password if 2FA is on).';
  }
  if (/self[- ]signed|SELF_SIGNED|UNABLE_TO_VERIFY|unable to get local issuer|certificate/i.test(`${code} ${msg}`)) {
    return `The TLS certificate presented for ${host} is not the real one (${msg}). Something on this computer or network is intercepting encrypted connections — usually antivirus "Email/SSL/HTTPS scanning" (Avast, AVG, Kaspersky, ESET, Quick Heal, Norton) or an office proxy/firewall. Fix: turn off email/SSL scanning in the antivirus (or add an exception for node.exe / ${host}), or try another network such as a mobile hotspot. For local testing only you can set SMTP_TLS_REJECT_UNAUTHORIZED=false in backend/.env (never in production).`;
  }
  if (/wrong version number|ssl3_get_record|EPROTO/i.test(msg)) return `TLS mismatch: port ${env.SMTP_PORT} needs ${env.SMTP_PORT === 465 ? 'SMTP_SECURE=true' : 'SMTP_SECURE=false'}.`;
  if (code === 'ETIMEDOUT' || code === 'ESOCKET' || /timeout/i.test(msg)) return `Could not reach ${host}:${env.SMTP_PORT}. Check the host/port, and that your network or hosting provider does not block outgoing SMTP (try port 587 or 465).`;
  if (code === 'EDNS' || /ENOTFOUND|getaddrinfo/i.test(msg)) return `SMTP_HOST "${host}" could not be found. Check the spelling (e.g. smtp.gmail.com, smtp.zoho.in, smtp.office365.com).`;
  if (code === 'ECONNREFUSED') return `${host}:${env.SMTP_PORT} refused the connection. Check SMTP_PORT.`;
  if (code === 'EENVELOPE' || /sender|from address|not owned|553|550 5\.7/i.test(msg)) return `The mail server refused the sender. MAIL_FROM_ADDRESS (${env.MAIL_FROM_ADDRESS}) must be the SMTP account itself or an alias/domain verified with your provider.`;
  return msg;
}

/** Connect + authenticate without sending. Returns { ok, error?, hint? }. */
async function verify() {
  if (!env.SMTP_HOST) return { ok: false, error: 'SMTP_HOST is empty', hint: 'Emails go to backend/.outbox in development.' };
  const t = nodemailer.createTransport({ ...transportOptions(), pool: false });
  try {
    await t.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message, code: err.code, hint: explain(err) };
  } finally {
    t.close();
  }
}

module.exports = { createTransport, transportOptions, explain, verify };
