'use strict';

const { Product, SearchQuery } = require('../models');
const catalog = require('./catalog.service');
const { escapeRegex, levenshtein } = require('../utils/text');

let vocab = { at: 0, words: [] };

/** Vocabulary of words from published products — used for typo correction. */
async function vocabulary() {
  if (vocab.words.length && Date.now() - vocab.at < 5 * 60_000) return vocab.words;
  const docs = await Product.find({ status: 'published' }).select('+searchText').lean();
  const set = new Set();
  for (const d of docs) for (const w of String(d.searchText || '').split(/\s+/)) if (w.length >= 3 && !/^\d+$/.test(w)) set.add(w);
  vocab = { at: Date.now(), words: [...set] };
  return vocab.words;
}

function normalise(q) {
  return String(q || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/** Correct each token to the nearest vocabulary word when it has no exact match. */
async function correct(q) {
  const words = await vocabulary();
  let changed = false;
  const tokens = normalise(q)
    .split(' ')
    .map((t) => {
      if (t.length < 3 || words.some((w) => w.includes(t))) return t;
      const maxDist = t.length <= 4 ? 1 : 2;
      let best = null;
      let bestD = Infinity;
      for (const w of words) {
        if (Math.abs(w.length - t.length) > maxDist) continue;
        const d = levenshtein(t, w);
        if (d < bestD) {
          bestD = d;
          best = w;
        }
      }
      if (best && bestD <= maxDist) {
        changed = true;
        return best;
      }
      return t;
    });
  return changed ? tokens.join(' ') : null;
}

async function suggest(q) {
  const term = normalise(q);
  if (term.length < 2) return { products: [], categories: [], correctedQuery: null };
  let used = term;
  let { items } = await catalog.listProducts({ q: used, limit: 6, sort: 'popular' });
  let correctedQuery = null;
  if (!items.length) {
    correctedQuery = await correct(term);
    if (correctedQuery) {
      used = correctedQuery;
      ({ items } = await catalog.listProducts({ q: used, limit: 6, sort: 'popular' }));
    }
  }
  const cats = (await catalog.activeCategories()).filter((c) => c.productCount > 0 && new RegExp(escapeRegex(used.split(' ')[0]), 'i').test(c.name)).slice(0, 4);
  return { products: items, categories: cats.map((c) => ({ name: c.name, slug: c.slug, productCount: c.productCount })), correctedQuery };
}

async function search(params, { userId } = {}) {
  const term = normalise(params.q);
  let result = await catalog.listProducts({ ...params, q: term });
  let correctedQuery = null;
  if (!result.total && term) {
    correctedQuery = await correct(term);
    if (correctedQuery) result = await catalog.listProducts({ ...params, q: correctedQuery });
  }
  if (term && params.page === 1) {
    SearchQuery.create({ term: String(params.q).slice(0, 120), normalized: term, resultCount: result.total, user: userId }).catch(() => {});
  }
  return { ...result, correctedQuery };
}

async function analytics({ days = 30, limit = 20 } = {}) {
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await SearchQuery.find({ createdAt: { $gte: since } }).select('normalized resultCount').lean();
  const map = new Map();
  for (const r of rows) {
    const cur = map.get(r.normalized) || { term: r.normalized, searches: 0, zeroResults: 0 };
    cur.searches += 1;
    if (!r.resultCount) cur.zeroResults += 1;
    map.set(r.normalized, cur);
  }
  const all = [...map.values()];
  return {
    totalSearches: rows.length,
    top: all.sort((a, b) => b.searches - a.searches).slice(0, limit),
    zeroResults: all.filter((x) => x.zeroResults).sort((a, b) => b.zeroResults - a.zeroResults).slice(0, limit),
  };
}

function resetVocabulary() {
  vocab = { at: 0, words: [] };
}

module.exports = { suggest, search, correct, analytics, normalise, resetVocabulary };
