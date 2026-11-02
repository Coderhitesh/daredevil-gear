'use strict';

const express = require('express');
const { asyncHandler: h, ok, ApiError, parsePagination, pageMeta } = require('../../utils/http');
const { validate } = require('../../middleware/validate');
const { requirePermission } = require('../../middleware/auth');
const { audit } = require('../../services/audit.service');
const { escapeRegex } = require('../../utils/text');
const { z, objectId } = require('../../validators/schemas');

/**
 * Generic admin CRUD router for simple models.
 * opts: { Model, schema (zod object), entity, read, write, searchFields, sort, populate, beforeSave(data, req, doc), afterChange(doc), canDelete(doc) }
 */
function crud(opts) {
  const router = express.Router();
  const { Model, schema, entity, read, write, searchFields = ['name'], sort = { createdAt: -1 }, populate } = opts;
  const idParams = z.object({ id: objectId });

  router.get(
    '/',
    requirePermission(read),
    h(async (req, res) => {
      const pg = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
      const filter = {};
      if (req.query.q) filter.$or = searchFields.map((f) => ({ [f]: { $regex: escapeRegex(String(req.query.q).slice(0, 80)), $options: 'i' } }));
      for (const [k, v] of Object.entries(opts.filters || {})) if (req.query[k] !== undefined && req.query[k] !== '') filter[v] = req.query[k] === 'true' ? true : req.query[k] === 'false' ? false : String(req.query[k]);
      let q = Model.find(filter).sort(sort).skip(pg.skip).limit(pg.limit);
      if (populate) q = q.populate(populate);
      const [items, total] = await Promise.all([q.lean(), Model.countDocuments(filter)]);
      return ok(res, items, pageMeta(pg, total));
    })
  );

  router.get(
    '/:id',
    requirePermission(read),
    validate({ params: idParams }),
    h(async (req, res) => {
      let q = Model.findById(req.params.id);
      if (populate) q = q.populate(populate);
      const doc = await q.lean();
      if (!doc) throw ApiError.notFound(`${entity} not found`);
      return ok(res, doc);
    })
  );

  router.post(
    '/',
    requirePermission(write),
    validate({ body: schema }),
    h(async (req, res) => {
      const data = opts.beforeSave ? await opts.beforeSave(req.body, req, null) : req.body;
      const doc = await Model.create(data);
      await audit(req, { action: `${entity.toLowerCase()}.create`, entity, entityId: doc._id, after: data });
      if (opts.afterChange) await opts.afterChange(doc);
      return ok(res, doc, undefined, 201);
    })
  );

  router.patch(
    '/:id',
    requirePermission(write),
    validate({ params: idParams, body: schema.partial() }),
    h(async (req, res) => {
      const doc = await Model.findById(req.params.id);
      if (!doc) throw ApiError.notFound(`${entity} not found`);
      const before = doc.toObject();
      const data = opts.beforeSave ? await opts.beforeSave(req.body, req, doc) : req.body;
      doc.set(data);
      await doc.save();
      await audit(req, { action: `${entity.toLowerCase()}.update`, entity, entityId: doc._id, before, after: doc.toObject() });
      if (opts.afterChange) await opts.afterChange(doc);
      return ok(res, doc);
    })
  );

  router.delete(
    '/:id',
    requirePermission(write),
    validate({ params: idParams }),
    h(async (req, res) => {
      const doc = await Model.findById(req.params.id);
      if (!doc) throw ApiError.notFound(`${entity} not found`);
      if (opts.canDelete) {
        const reason = await opts.canDelete(doc);
        if (reason) throw ApiError.conflict(reason);
      }
      await doc.deleteOne();
      await audit(req, { action: `${entity.toLowerCase()}.delete`, entity, entityId: doc._id, before: doc.toObject() });
      if (opts.afterChange) await opts.afterChange(doc);
      return ok(res, { deleted: true });
    })
  );

  return router;
}

module.exports = { crud };
