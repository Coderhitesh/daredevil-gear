'use strict';

/* eslint-disable no-console */
/**
 * Secure bootstrap of the initial Super Admin. There is no public admin registration endpoint.
 *
 *   SUPER_ADMIN_EMAIL=owner@example.com SUPER_ADMIN_PASSWORD='...' SUPER_ADMIN_NAME='Owner' npm run seed:admin
 *
 * - Refuses to run if a super admin already exists (use --reset-password to rotate the password).
 * - The password must meet the password policy. MFA enrolment is forced at first login when ADMIN_MFA_REQUIRED=true.
 */
const { run, args } = require('./lib/cli');
const env = require('../src/config/env');
const { User, Session } = require('../src/models');
const { hashPassword, passwordProblem } = require('../src/services/password.service');
const { audit } = require('../src/services/audit.service');

run('seed:admin', async () => {
  const opts = args();
  const email = (env.SUPER_ADMIN_EMAIL || '').toLowerCase();
  const password = env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in the environment');
  const problem = passwordProblem(password, { email });
  if (problem) throw new Error(`Password rejected: ${problem}`);

  const existingSuper = await User.findOne({ role: 'super_admin' });
  if (existingSuper && !opts['reset-password']) {
    console.log(`A super admin already exists (${existingSuper.email}). Nothing changed. Use --reset-password to rotate the password for SUPER_ADMIN_EMAIL.`);
    return;
  }
  if (opts['reset-password']) {
    const user = await User.findOne({ email, role: 'super_admin' });
    if (!user) throw new Error('No super admin with that email');
    user.passwordHash = await hashPassword(password);
    await user.save();
    await Session.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'password_reset_cli' } });
    await audit(null, { action: 'admin.password_reset_cli', entity: 'User', entityId: user._id, summary: 'Super admin password rotated via CLI' });
    console.log(`Password rotated for ${email}; all sessions revoked.`);
    return;
  }
  const clash = await User.findOne({ email });
  if (clash) throw new Error('A user with this email already exists. Use a dedicated admin email address.');
  const user = await User.create({
    name: env.SUPER_ADMIN_NAME || 'Super Admin',
    email,
    role: 'super_admin',
    status: 'active',
    emailVerified: true,
    emailVerifiedAt: new Date(),
    passwordHash: await hashPassword(password),
  });
  await audit(null, { action: 'admin.bootstrap', entity: 'User', entityId: user._id, summary: 'Initial super admin created via CLI' });
  console.log(`Super admin created: ${email}. ${env.ADMIN_MFA_REQUIRED ? 'You will be asked to enrol an authenticator app at first login.' : ''}`);
  console.log('Remove SUPER_ADMIN_PASSWORD from the environment now.');
});
