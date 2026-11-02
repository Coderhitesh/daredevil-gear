'use strict';

/**
 * Check the SMTP settings in backend/.env and send one test email.
 *   npm run email:test -- you@example.com
 */
require('dotenv').config();
const env = require('../src/config/env');
const smtp = require('../src/services/smtp');

(async () => {
  const to = process.argv[2];
  const o = smtp.transportOptions();
  console.log(`SMTP: ${o.host || '(not set)'}:${o.port} secure=${o.secure} verifyCert=${o.tls?.rejectUnauthorized !== false} user=${o.auth?.user || '(none)'} from=${env.MAIL_FROM_ADDRESS}`);
  if (!o.host) {
    console.log('SMTP_HOST is empty — emails are written to backend/.outbox in development.');
    process.exit(1);
  }
  const v = await smtp.verify();
  if (!v.ok) {
    console.error(`\n✖ Connection/login failed: ${v.error}\n  → ${v.hint}\n`);
    process.exit(1);
  }
  console.log('✔ Connected and logged in');
  if (!to) {
    console.log('Add an address to send a test email: npm run email:test -- you@example.com');
    process.exit(0);
  }
  const t = smtp.createTransport();
  try {
    const info = await t.sendMail({ from: `"${env.MAIL_FROM_NAME}" <${env.MAIL_FROM_ADDRESS}>`, to, subject: 'DareDevil Gears SMTP test', text: 'SMTP is working. You can ignore this email.' });
    console.log(`✔ Test email accepted by the server (${info.messageId}). Check the inbox and spam folder of ${to}.`);
    process.exit(0);
  } catch (err) {
    console.error(`\n✖ Sending failed: ${err.message}\n  → ${smtp.explain(err)}\n`);
    process.exit(1);
  }
})();
