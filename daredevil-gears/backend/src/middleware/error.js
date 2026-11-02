'use strict';

const mongoose = require('mongoose');
const env = require('../config/env');
const logger = require('../config/logger');
const { ApiError } = require('../utils/http');
const monitoring = require('../services/monitoring.service');

function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl.split('?')[0]}`));
}

function errorHandler(err, req, res, _next) {
  let error = err;

  if (err instanceof mongoose.Error.ValidationError) {
    error = ApiError.unprocessable('Validation failed', {
      details: Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })),
    });
  } else if (err instanceof mongoose.Error.CastError) {
    error = ApiError.badRequest(`Invalid value for ${err.path}`);
  } else if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'field';
    error = ApiError.conflict(`A record with this ${field} already exists`, { code: 'DUPLICATE' });
  } else if (err?.type === 'entity.too.large') {
    error = new ApiError(413, 'Request is too large');
  } else if (err?.type === 'entity.parse.failed') {
    error = ApiError.badRequest('Malformed JSON body');
  } else if (err?.name === 'MulterError') {
    error = ApiError.badRequest(err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : 'Upload failed');
  } else if (!(err instanceof ApiError)) {
    error = new ApiError(500, 'Something went wrong. Please try again.', { expose: false, code: 'INTERNAL' });
  }

  if (error.status >= 500) {
    logger.error({ err, reqId: req.id, url: req.originalUrl }, 'Unhandled error');
    monitoring.capture(err, { url: req.originalUrl, reqId: req.id });
  } else if (error.status !== 404 && error.status !== 401) {
    logger.warn({ status: error.status, code: error.code, url: req.originalUrl }, error.message);
  }

  const body = { success: false, error: { code: error.code, message: error.message } };
  if (error.details) body.error.details = error.details;
  if (!env.isProd && error.status >= 500 && err?.message) body.error.debug = err.message;
  res.status(error.status).json(body);
}

module.exports = { notFound, errorHandler };
