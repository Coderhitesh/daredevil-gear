'use strict';

/**
 * Tells the storefront (Next.js) to drop its cached pages after admin changes, so new banners,
 * offers and prices show immediately. Optional: without REVALIDATE_SECRET the storefront simply
 * refreshes within a minute on its own.
 */
const env = require('../config/env');
const logger = require('../config/logger');

let timer = null;
const pending = new Set();

function bust(tags = ['home', 'shell']) {
  if (!env.REVALIDATE_SECRET || env.isTest) return;
  tags.forEach((t) => pending.add(t));
  // several saves in a row (e.g. reordering) → one call
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const list = [...pending];
    pending.clear();
    const base = (env.STOREFRONT_INTERNAL_URL || env.STOREFRONT_URL).replace(/\/+$/, '');
    try {
      const res = await fetch(`${base}/revalidate-cache`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-revalidate-secret': env.REVALIDATE_SECRET },
        body: JSON.stringify({ tags: list }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) logger.warn({ status: res.status }, 'Storefront cache refresh was refused — check REVALIDATE_SECRET matches in backend and frontend');
    } catch (err) {
      logger.warn({ err: err.message, base }, 'Could not reach the storefront to refresh its cache (set STOREFRONT_INTERNAL_URL)');
    }
  }, 400);
  timer.unref?.();
}

/** Admin router middleware: after a successful change to storefront-visible data, refresh the storefront. */
const WATCHED = /^\/(banners|home-sections|offers|settings|navigation|pages|products|categories|collections|brands|tax|shipping-data|redirects)\b/;
function afterAdminChange(req, res, next) {
  if (req.method !== 'GET' && WATCHED.test(req.path)) {
    res.on('finish', () => {
      if (res.statusCode < 400) bust(/^\/products/.test(req.path) ? ['home', 'shell', 'products'] : ['home', 'shell']);
    });
  }
  next();
}

module.exports = { bust, afterAdminChange };
