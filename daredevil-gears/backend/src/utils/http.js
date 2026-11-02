'use strict';

class ApiError extends Error {
  constructor(status, message, { code, details, expose = true } = {}) {
    super(message);
    this.status = status;
    this.code = code || defaultCode(status);
    this.details = details;
    this.expose = expose;
  }
  static badRequest(msg = 'Bad request', opts) { return new ApiError(400, msg, opts); }
  static unauthorized(msg = 'Authentication required', opts) { return new ApiError(401, msg, opts); }
  static forbidden(msg = 'You do not have permission to perform this action', opts) { return new ApiError(403, msg, opts); }
  static notFound(msg = 'Not found', opts) { return new ApiError(404, msg, opts); }
  static conflict(msg = 'Conflict', opts) { return new ApiError(409, msg, opts); }
  static unprocessable(msg = 'Validation failed', opts) { return new ApiError(422, msg, opts); }
  static tooMany(msg = 'Too many requests. Please try again later.', opts) { return new ApiError(429, msg, opts); }
  static unavailable(msg = 'Service temporarily unavailable', opts) { return new ApiError(503, msg, opts); }
}

function defaultCode(status) {
  return (
    {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'VALIDATION_ERROR',
      429: 'RATE_LIMITED',
      503: 'UNAVAILABLE',
    }[status] || 'ERROR'
  );
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Uniform success envelope: { success: true, data, meta? } */
function ok(res, data, meta, status = 200) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

function created(res, data) {
  return ok(res, data, undefined, 201);
}

function parsePagination(query, { defaultLimit = 24, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

function pageMeta({ page, limit }, total) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

module.exports = { ApiError, asyncHandler, ok, created, parsePagination, pageMeta };
