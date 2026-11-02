'use strict';

const fs = require('fs');
const path = require('path');
const smtp = require('./smtp');
const env = require('../config/env');
const logger = require('../config/logger');
const { render, TEMPLATES } = require('../emails/templates');
const { EmailTemplate, EmailLog } = require('../models');
const settings = require('./settings.service');
const queue = require('../jobs/queue');

const OUTBOX_DIR = path.resolve(__dirname, '../../.outbox');

let transporter = null;
function getTransport() {
  if (transporter) return transporter;
  if (!env.smtpConfigured) return null;
  transporter = smtp.createTransport();
  return transporter;
}

async function buildMessage(templateKey, data) {
  const [override, business, emailSettings] = await Promise.all([
    EmailTemplate.findOne({ key: templateKey, isActive: true }).lean(),
    settings.get('business'),
    settings.get('notifications'),
  ]);
  const msg = render(templateKey, data, { override, business });
  return { ...msg, fromName: emailSettings?.fromName || env.MAIL_FROM_NAME };
}

/**
 * Deliver one email now. Throws on failure so callers of critical mail (OTP, password reset)
 * can tell the user it was not sent — an email is never treated as delivered when it was not.
 */
async function deliver({ to, templateKey, data, logId }) {
  const msg = await buildMessage(templateKey, data);
  const transport = getTransport();
  let log = logId ? await EmailLog.findById(logId) : null;
  if (!log) log = await EmailLog.create({ to, template: templateKey, subject: msg.subject, order: data?.order?._id, status: 'queued' });
  log.attempts += 1;

  try {
    if (!transport) {
      if (env.isProd || !env.MAIL_DEV_OUTBOX) throw new Error('SMTP is not configured');
      // Development only: write the message to backend/.outbox so OTPs can be read locally.
      fs.mkdirSync(OUTBOX_DIR, { recursive: true });
      const file = path.join(OUTBOX_DIR, `${Date.now()}-${templateKey}-${to.replace(/[^a-z0-9@.]/gi, '_')}.html`);
      fs.writeFileSync(file, `<!-- To: ${to} | Subject: ${msg.subject} -->\n${msg.html}`);
      log.status = 'dev_outbox';
      log.sentAt = new Date();
      await log.save();
      logger.info({ to, template: templateKey }, 'Email written to dev outbox (SMTP not configured)');
      return { delivered: true, devOutbox: true };
    }
    const info = await transport.sendMail({
      from: `"${msg.fromName}" <${env.MAIL_FROM_ADDRESS}>`,
      replyTo: env.MAIL_FROM_ADDRESS,
      to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    });
    log.status = 'sent';
    log.messageId = info.messageId;
    log.sentAt = new Date();
    log.error = undefined;
    await log.save();
    return { delivered: true };
  } catch (err) {
    const hint = smtp.explain(err);
    log.status = 'failed';
    log.error = `${hint}${hint !== err.message ? ` (${err.message})` : ''}`.slice(0, 500);
    await log.save();
    logger.error({ err: err.message, code: err.code, hint, to, template: templateKey, smtpHost: env.SMTP_HOST, smtpPort: env.SMTP_PORT }, `Email delivery failed: ${hint}`);
    err.hint = hint;
    throw err;
  }
}

/** Critical mail (OTP etc.) is sent inline; everything else goes to the background queue with retries. */
async function send(templateKey, to, data = {}) {
  if (!to) return null;
  if (TEMPLATES[templateKey]?.critical) return deliver({ to, templateKey, data });
  const log = await EmailLog.create({ to, template: templateKey, order: data?.order?._id, status: 'queued' });
  await queue.enqueue('email', { to, templateKey, data: serialise(data), logId: String(log._id) });
  return { queued: true };
}

async function notifyAdmins(title, lines, url) {
  const n = await settings.get('notifications');
  const recipients = [...new Set([...(n?.adminEmails || []), env.ADMIN_NOTIFY_EMAIL].filter(Boolean))];
  await Promise.all(recipients.map((to) => send('admin_alert', to, { title, lines, url })));
}

function serialise(data) {
  return JSON.parse(JSON.stringify(data));
}

queue.registerHandler('email', (job) => deliver(job));

module.exports = { send, deliver, notifyAdmins, OUTBOX_DIR };
