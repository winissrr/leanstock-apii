const prisma = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const { buildCursorPage, paginateResult } = require('../utils/pagination');
const { z } = require('zod');

const createError = (s,m) => { const e=new Error(m); e.status=s; e.isOperational=true; return e; };
const schema = z.object({ name: z.string().min(1), address: z.string().optional() });

exports.list = asyncHandler(async (req, res) => {
  const { cursor, limit } = req.query;
  const page = buildCursorPage(cursor, limit);
  const items = await prisma.location.findMany({ where: { tenantId: req.tenantId, deletedAt: null }, ...page, orderBy: { id: 'asc' } });
  res.json(paginateResult(items, limit));
});

exports.create = asyncHandler(async (req, res) => {
  const data = schema.parse(req.body);
  const loc = await prisma.location.create({ data: { ...data, tenantId: req.tenantId } });
  res.status(201).json(loc);
});

exports.getOne = asyncHandler(async (req, res) => {
  const loc = await prisma.location.findFirst({ where: { id: req.params.id, tenantId: req.tenantId, deletedAt: null } });
  if (!loc) throw createError(404, 'Location not found');
  res.json(loc);
});

exports.update = asyncHandler(async (req, res) => {
  const existing = await prisma.location.findFirst({ where: { id: req.params.id, tenantId: req.tenantId, deletedAt: null } });
  if (!existing) throw createError(404, 'Location not found');
  const data = schema.partial().parse(req.body);
  const updated = await prisma.location.update({ where: { id: req.params.id }, data });
  res.json(updated);
});

exports.remove = asyncHandler(async (req, res) => {
  const existing = await prisma.location.findFirst({ where: { id: req.params.id, tenantId: req.tenantId, deletedAt: null } });
  if (!existing) throw createError(404, 'Location not found');
  await prisma.location.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
  res.status(204).send();
});
