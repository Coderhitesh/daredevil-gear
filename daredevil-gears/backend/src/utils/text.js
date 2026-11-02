'use strict';

const sanitizeHtml = require('sanitize-html');

function slugify(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

/** Collapse whitespace and trim. */
function clean(input) {
  if (input === null || input === undefined) return '';
  return String(input).replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

/** Normalized comparison key for names (case/space/punctuation-insensitive). */
function nameKey(input) {
  return slugify(String(input || '').replace(/\(remove\)/gi, ''));
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Allow a small, safe subset of HTML for CMS/product rich text. */
function sanitizeRich(html) {
  return sanitizeHtml(String(html || ''), {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'blockquote', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'span'],
    allowedAttributes: { a: ['href', 'title', 'rel', 'target'], span: ['class'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }) },
  });
}

function stripHtml(html) {
  return sanitizeHtml(String(html || ''), { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
}

function truncate(s, n) {
  const str = String(s || '');
  if (str.length <= n) return str;
  return str.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
}

/** Damerau-free Levenshtein for typo tolerance on short tokens. */
function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

module.exports = { slugify, clean, nameKey, escapeRegex, sanitizeRich, stripHtml, truncate, levenshtein };
