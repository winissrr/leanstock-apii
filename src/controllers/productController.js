const prisma = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const { buildCursorPage, paginateResult } = require('../utils/pagination');
const { z } = require('zod');

const createError = (s,m) => { const e=new Error(m); e.status=s; e.isOperational=true; return e; };

const productSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  unitPrice: z.number().positive(),
  reorderThreshold: z.number().int().min(0).default(0),
  isDecayEnabled: z.boolean().default(false),
  decayDaysThreshold: z.number().int().positive().default(30),
  decayPercent: z.number().min(0).max(100).default(10),
});

exports.list = asyncHandler(async (req, res) => {
  const { cursor, limit, category, search } = req.query;
  const page = buildCursorPage(cursor, limit);
  const where = {
    tenantId: req.tenantId, deletedAt: null,
    ...(category && { category }),
    ...(search && { OR: [{ name: { contains: search, mode: 'insensitive' } }, { sku: { contains: search, mode: 'insensitive' } }] }),
  };
  const items = await prisma.product.findMany({ where, ...page, orderBy: { id: 'asc' } });
  res.json(paginateResult(items, limit));
});

exports.create = asyncHandler(async (req, res) => {
  const data = productSchema.parse(req.body);
  const product = await prisma.product.create({ data: { ...data, tenantId: req.tenantId } });
  await prisma.auditLog.create({ data: { tenantId: req.tenantId, userId: req.user.sub, action: 'product.create', entityType: 'Product', entityId: product.id, newValue: product } });
  res.status(201).json(product);
});

exports.getOne = asyncHandler(async (req, res) => {
  const product = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: req.tenantId, deletedAt: null } });
  if (!product) throw createError(404, 'Product not found');
  res.json(product);
});

exports.update = asyncHandler(async (req, res) => {
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: req.tenantId, deletedAt: null } });
  if (!existing) throw createError(404, 'Product not found');
  const data = productSchema.partial().parse(req.body);
  const updated = await prisma.product.update({ where: { id: req.params.id }, data });
  await prisma.auditLog.create({ data: { tenantId: req.tenantId, userId: req.user.sub, action: 'product.update', entityType: 'Product', entityId: updated.id, oldValue: existing, newValue: updated } });
  res.json(updated);
});

exports.remove = asyncHandler(async (req, res) => {
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: req.tenantId, deletedAt: null } });
  if (!existing) throw createError(404, 'Product not found');
  await prisma.product.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
  await prisma.auditLog.create({ data: { tenantId: req.tenantId, userId: req.user.sub, action: 'product.delete', entityType: 'Product', entityId: req.params.id, oldValue: existing } });
  res.status(204).send();
});
