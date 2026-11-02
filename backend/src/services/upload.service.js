'use strict';

const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const env = require('../config/env');
const { ApiError } = require('../utils/http');

if (env.cloudinaryConfigured) {
  cloudinary.config({ cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, secure: true });
}

const IMAGE_TYPES = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF....WEBP checked below
  'image/avif': [],
};
const DOC_TYPES = { 'application/pdf': [[0x25, 0x50, 0x44, 0x46]] };
const XLSX_TYPES = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [[0x50, 0x4b, 0x03, 0x04]],
};

/** Check the file's real signature, not just the client-supplied MIME type. */
function sniff(buffer, allowed) {
  for (const [mime, sigs] of Object.entries(allowed)) {
    for (const sig of sigs) {
      if (sig.every((b, i) => buffer[i] === b)) {
        if (mime === 'image/webp' && buffer.slice(8, 12).toString('ascii') !== 'WEBP') continue;
        return mime;
      }
    }
    if (mime === 'image/avif' && buffer.slice(4, 12).toString('ascii').startsWith('ftypavi')) return mime;
  }
  return null;
}

function memoryUpload({ maxMb = 8, maxFiles = 10, allowed = IMAGE_TYPES } = {}) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024, files: maxFiles, fields: 20 },
    fileFilter: (_req, file, cb) => {
      if (!Object.keys(allowed).includes(file.mimetype)) return cb(ApiError.badRequest(`Unsupported file type: ${file.mimetype}`, { code: 'BAD_FILE_TYPE' }));
      return cb(null, true);
    },
  });
}

function assertFile(file, allowed) {
  if (!file?.buffer?.length) throw ApiError.badRequest('No file received');
  const real = sniff(file.buffer, allowed);
  if (!real) throw ApiError.badRequest('The file content does not match an allowed type', { code: 'BAD_FILE_CONTENT' });
  return real;
}

async function uploadImage(file, { folder = 'products', publicIdPrefix } = {}) {
  assertFile(file, IMAGE_TYPES);
  if (!env.cloudinaryConfigured) throw ApiError.unavailable('Image storage (Cloudinary) is not configured. Set CLOUDINARY_* environment variables.', { code: 'UPLOADS_NOT_CONFIGURED' });
  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `${env.CLOUDINARY_FOLDER}/${folder}`, resource_type: 'image', public_id: publicIdPrefix ? `${publicIdPrefix}-${Date.now()}` : undefined, overwrite: false },
      (err, res) => (err ? reject(err) : resolve(res))
    );
    stream.end(file.buffer);
  });
  return { url: result.secure_url, publicId: result.public_id, width: result.width, height: result.height };
}

async function uploadDocument(file, { folder = 'documents' } = {}) {
  assertFile(file, DOC_TYPES);
  if (!env.cloudinaryConfigured) throw ApiError.unavailable('File storage (Cloudinary) is not configured.', { code: 'UPLOADS_NOT_CONFIGURED' });
  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder: `${env.CLOUDINARY_FOLDER}/${folder}`, resource_type: 'raw' }, (err, res) => (err ? reject(err) : resolve(res)));
    stream.end(file.buffer);
  });
  return { url: result.secure_url, publicId: result.public_id };
}

async function destroy(publicId) {
  if (!env.cloudinaryConfigured || !publicId) return;
  await cloudinary.uploader.destroy(publicId).catch(() => {});
}

/** Responsive delivery URL (auto format/quality, width-limited). */
function deliveryUrl(url, width) {
  if (!url || !url.includes('res.cloudinary.com')) return url;
  return url.replace('/upload/', `/upload/f_auto,q_auto${width ? `,w_${width}` : ''}/`);
}

module.exports = { memoryUpload, assertFile, sniff, uploadImage, uploadDocument, destroy, deliveryUrl, IMAGE_TYPES, DOC_TYPES, XLSX_TYPES };
