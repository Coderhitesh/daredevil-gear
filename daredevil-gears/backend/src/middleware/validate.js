'use strict';

const { ApiError } = require('../utils/http');

/**
 * validate({ body, query, params }) — Zod schemas. Parsed values replace the raw input
 * (req.body / req.validQuery / req.params) so controllers only see validated data.
 */
function validate(schemas) {
  return (req, _res, next) => {
    const details = [];
    for (const part of ['params', 'query', 'body']) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (!result.success) {
        for (const issue of result.error.issues) {
          details.push({ field: [part, ...issue.path].join('.'), message: issue.message });
        }
      } else if (part === 'query') {
        req.validQuery = result.data;
      } else {
        req[part] = result.data;
      }
    }
    if (details.length) return next(ApiError.unprocessable('Please check the highlighted fields', { details }));
    return next();
  };
}

module.exports = { validate };
