'use strict';

const { setupDb, teardownDb, agent, captureEmails, models } = require('../helpers');

let sent;
beforeAll(async () => {
  await setupDb('auth');
});
afterAll(teardownDb);
beforeEach(() => {
  jest.restoreAllMocks();
  sent = captureEmails();
});

const lastCode = (to, template = 'otp_verify') => [...sent].reverse().find((m) => m.to === to && m.template === template)?.data.code;

describe('registration + email OTP', () => {
  const email = 'asha@example.com';
  const password = 'Trek-2026-Himalaya';

  test('register sends an OTP and does not verify the account', async () => {
    const a = agent();
    const res = await a.post('/api/v1/auth/register').send({ name: 'Asha Verma', email, password });
    expect(res.status).toBe(202);
    expect(lastCode(email)).toMatch(/^\d{6}$/);
    const user = await models.User.findOne({ email });
    expect(user.emailVerified).toBe(false);
    // OTP is stored hashed only
    const rec = await models.EmailVerification.findOne({ email });
    expect(rec.codeHash).not.toContain(lastCode(email));
  });

  test('login before verification is refused', async () => {
    const res = await agent().post('/api/v1/auth/login').send({ email, password });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  test('wrong code fails, attempts are limited, correct code verifies and signs in', async () => {
    const a = agent();
    await a.post('/api/v1/auth/resend-otp').send({ email });
    const code = lastCode(email);
    const wrong = code === '000000' ? '111111' : '000000';
    const bad = await a.post('/api/v1/auth/verify-email').send({ email, code: wrong });
    expect(bad.status).toBe(400);
    const ok = await a.post('/api/v1/auth/verify-email').send({ email, code });
    expect(ok.status).toBe(200);
    expect(ok.body.data.user.emailVerified).toBe(true);
    const me = await a.get('/api/v1/auth/me');
    expect(me.body.data.user.email).toBe(email);
    // code cannot be reused
    const reuse = await agent().post('/api/v1/auth/verify-email').send({ email, code });
    expect(reuse.status).toBe(400);
  });

  test('registration response does not reveal existing accounts', async () => {
    const res = await agent().post('/api/v1/auth/register').send({ name: 'Someone', email, password: 'Another-pass-2026' });
    expect(res.status).toBe(202);
    expect(res.body.data.message).toMatch(/If the details are valid/);
    const user = await models.User.findOne({ email }).select('+passwordHash');
    expect(user.emailVerified).toBe(true); // untouched
  });

  test('OTP locks after too many attempts', async () => {
    const other = 'locked@example.com';
    await agent().post('/api/v1/auth/register').send({ name: 'Lock Test', email: other, password });
    let last;
    for (let i = 0; i < 6; i++) last = await agent().post('/api/v1/auth/verify-email').send({ email: other, code: '999999' === lastCode(other) ? '999998' : '999999' });
    expect(last.status).toBe(429);
    const ok = await agent().post('/api/v1/auth/verify-email').send({ email: other, code: lastCode(other) });
    expect(ok.status).toBe(429);
  });

  test('login, refresh rotation, logout', async () => {
    const a = agent();
    const res = await a.post('/api/v1/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie'].join(';')).toMatch(/HttpOnly/);
    const r1 = await a.post('/api/v1/auth/refresh');
    expect(r1.status).toBe(200);
    await a.post('/api/v1/auth/logout');
    const me = await a.get('/api/v1/auth/me');
    expect(me.body.data.user).toBeNull();
  });

  test('wrong password is rejected with a generic message', async () => {
    const res = await agent().post('/api/v1/auth/login').send({ email, password: 'Wrong-password-1' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Incorrect email or password');
    const none = await agent().post('/api/v1/auth/login').send({ email: 'nobody@example.com', password: 'Wrong-password-1' });
    expect(none.body.error.message).toBe('Incorrect email or password');
  });

  test('forgot + reset password revokes sessions and the new password works', async () => {
    const a = agent();
    await a.post('/api/v1/auth/login').send({ email, password });
    const res = await agent().post('/api/v1/auth/forgot-password').send({ email });
    expect(res.status).toBe(200);
    const code = lastCode(email, 'password_reset');
    expect(code).toMatch(/^\d{6}$/);
    const reset = await agent().post('/api/v1/auth/reset-password').send({ email, code, password: 'New-Trek-Pass-2027' });
    expect(reset.status).toBe(200);
    expect((await a.get('/api/v1/users/me')).status).toBe(401); // old session revoked
    const login = await agent().post('/api/v1/auth/login').send({ email, password: 'New-Trek-Pass-2027' });
    expect(login.status).toBe(200);
  });

  test('forgot password for unknown email responds identically and sends nothing', async () => {
    const before = sent.length;
    const res = await agent().post('/api/v1/auth/forgot-password').send({ email: 'ghost@example.com' });
    expect(res.status).toBe(200);
    expect(sent.length).toBe(before);
  });

  test('state-changing requests without the CSRF header are rejected', async () => {
    const { request, getApp } = require('../helpers');
    const res = await request(getApp()).post('/api/v1/auth/login').send({ email, password });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF');
  });

  test('NoSQL operator injection is stripped', async () => {
    const res = await agent().post('/api/v1/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
    expect(res.status).toBe(422);
  });
});
