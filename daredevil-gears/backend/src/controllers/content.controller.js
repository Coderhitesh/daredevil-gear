'use strict';

const { ok, ApiError } = require('../utils/http');
const content = require('../services/content.service');
const email = require('../services/email.service');
const upload = require('../services/upload.service');
const { NewsletterSubscriber, ContactMessage, GrievanceComplaint, SeoRedirect, nextSequence } = require('../models');
const { randomToken, sha256 } = require('../utils/crypto');
const settings = require('../services/settings.service');
const env = require('../config/env');
const { publicCache, noStore } = require('./helpers');

module.exports = {
  shell: async (_req, res) => {
    publicCache(res, 60);
    return ok(res, await content.shell());
  },

  home: async (_req, res) => {
    publicCache(res, 60);
    return ok(res, await content.homepage());
  },

  pages: async (_req, res) => {
    publicCache(res, 300);
    return ok(res, await content.pagesIndex());
  },

  page: async (req, res) => {
    publicCache(res, 120);
    const page = await content.page(req.params.slug);
    if (req.params.slug === 'grievance-redressal') page.officer = await settings.get('grievanceOfficer');
    return ok(res, page);
  },

  sitemap: async (_req, res) => {
    publicCache(res, 600);
    return ok(res, await content.sitemapEntries());
  },

  resolveRedirect: async (req, res) => {
    const path = String(req.validQuery.path || '').split('?')[0].replace(/\/+$/, '') || '/';
    const r = await SeoRedirect.findOne({ from: path, isActive: true }).lean();
    publicCache(res, 300);
    if (!r) return ok(res, null);
    SeoRedirect.updateOne({ _id: r._id }, { $inc: { hits: 1 } }).catch(() => {});
    return ok(res, { to: r.to, statusCode: r.statusCode });
  },

  redirects: async (_req, res) => {
    publicCache(res, 300);
    const list = await SeoRedirect.find({ isActive: true }).select('from to statusCode').lean();
    return ok(res, list.map((r) => ({ from: r.from, to: r.to, statusCode: r.statusCode })));
  },

  subscribe: async (req, res) => {
    const token = randomToken(24);
    const existing = await NewsletterSubscriber.findOne({ email: req.body.email });
    if (!existing) {
      await NewsletterSubscriber.create({ email: req.body.email, status: 'subscribed', source: req.body.source || 'footer', consentAt: new Date(), unsubscribeTokenHash: sha256(token), ip: req.ip });
    } else if (existing.status === 'unsubscribed') {
      existing.status = 'subscribed';
      existing.consentAt = new Date();
      existing.unsubscribeTokenHash = sha256(token);
      await existing.save();
    }
    // same response whether or not already subscribed
    return ok(res, { message: 'Thanks — you are on the list. You can unsubscribe at any time.' });
  },

  unsubscribe: async (req, res) => {
    const sub = await NewsletterSubscriber.findOne({ unsubscribeTokenHash: sha256(req.validQuery.token) });
    if (sub && sub.status !== 'unsubscribed') {
      sub.status = 'unsubscribed';
      sub.unsubscribedAt = new Date();
      await sub.save();
    }
    return ok(res, { message: 'You have been unsubscribed.' });
  },

  contact: async (req, res) => {
    const msg = await ContactMessage.create({ ...req.body, type: req.body.bulk ? 'bulk_order' : 'contact', ip: req.ip });
    await email
      .notifyAdmins(msg.type === 'bulk_order' ? `Bulk/institutional enquiry from ${msg.name}` : `Contact message from ${msg.name}`, [msg.email, msg.phone || '', msg.subject || '', msg.message.slice(0, 500), msg.bulk?.organisation ? `Organisation: ${msg.bulk.organisation}` : ''].filter(Boolean), `${env.ADMIN_URL}/messages`)
      .catch(() => {});
    return ok(res, { message: 'Thank you. Our team will get back to you within one working day.' }, undefined, 201);
  },

  createGrievance: async (req, res) => {
    const seq = await nextSequence('grievance');
    const now = Date.now();
    const officer = await settings.get('grievanceOfficer');
    const ticket = await GrievanceComplaint.create({
      ...req.body,
      user: req.user?._id,
      ticketNumber: `GRV${new Date().getFullYear()}${String(seq).padStart(5, '0')}`,
      dueAcknowledgeBy: new Date(now + (officer.acknowledgeHours || 48) * 3600_000),
      dueResolveBy: new Date(now + (officer.resolveDays || 30) * 86400_000),
      history: [{ status: 'open', note: 'Complaint submitted' }],
    });
    await email.send('grievance_ack', ticket.email, { ticket: ticket.toObject() });
    await email.notifyAdmins(`Grievance ${ticket.ticketNumber}: ${ticket.subject}`, [`${ticket.name} · ${ticket.email}`, ticket.description.slice(0, 500)], `${env.ADMIN_URL}/grievances`).catch(() => {});
    return ok(res, { ticketNumber: ticket.ticketNumber, dueAcknowledgeBy: ticket.dueAcknowledgeBy, dueResolveBy: ticket.dueResolveBy }, undefined, 201);
  },

  grievanceStatus: async (req, res) => {
    noStore(res);
    const t = await GrievanceComplaint.findOne({ ticketNumber: req.body.ticketNumber.toUpperCase(), email: req.body.email.toLowerCase() }).lean();
    if (!t) throw ApiError.notFound('No complaint found with those details');
    return ok(res, { ticketNumber: t.ticketNumber, status: t.status, subject: t.subject, createdAt: t.createdAt, acknowledgedAt: t.acknowledgedAt, resolvedAt: t.resolvedAt, resolution: t.status === 'resolved' || t.status === 'closed' ? t.resolution : undefined });
  },

  uploadReturnPhoto: async (req, res) => {
    const result = await upload.uploadImage(req.file, { folder: 'returns' });
    return ok(res, { url: result.url, publicId: result.publicId }, undefined, 201);
  },
};
