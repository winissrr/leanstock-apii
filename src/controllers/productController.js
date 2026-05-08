const { z } = require('zod');
const prisma = require('../config/database');
const { parsePaginationParams, paginateResult } = require('../utils/pagination');
const { createError } = require('../middleware/errorHandler');

const productSchema = z.object({
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  category: z.string().max(100).optional(),
  unitPrice: z.number().positive('Unit price must be positive'),
  reorderThreshold: z.number().int().min(0).default(0),
  isDecayEnabled: z.boolean().default(false),
  decayDaysThreshold: z.number().int().min(1).default(30),
  decayPercent: z.number().min(0.01).max(100).default(10),
});

const updateSchema = productSchema.partial();

async function createProduct(req, res) {
  const body = productSchema.parse(req.body);
  const { tenantId, id: userId } = req.user;

  const product = await prisma.product.create({
    data: { ...body, tenantId },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action: 'product.create',
      entityType: 'Product',
      entityId: product.id,
      newValue: product,
    },
  });

  return res.status(201).json({ data: product });
}

async function listProducts(req, res) {
  const { tenantId } = req.user;
  const { cursor, limit } = parsePaginationParams(req.query);
  const { category } = req.query;

  const where = { tenantId, deletedAt: null };
  if (category) where.category = category;

  const rows = await prisma.product.findMany({
    where,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
  });

  const { data, nextCursor, hasMore } = paginateResult(rows, limit);
  return res.status(200).json({ data, nextCursor, hasMore });
}

async function getProduct(req, res) {
  const { tenantId } = req.user;
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, tenantId, deletedAt: null },
  });
  if (!product) throw createError(404, 'Product not found.');
  return res.status(200).json({ data: product });
}

async function updateProduct(req, res) {
  const { tenantId, id: userId } = req.user;
  const body = updateSchema.parse(req.body);

  const existing = await prisma.product.findFirst({
    where: { id: req.params.id, tenantId, deletedAt: null },
  });
  if (!existing) throw createError(404, 'Product not found.');

  const updated = await prisma.product.update({
    where: { id: req.params.id },
    data: body,
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action: 'product.update',
      entityType: 'Product',
      entityId: updated.id,
      oldValue: existing,
      newValue: updated,
    },
  });

  return res.status(200).json({ data: updated });
}

async function deleteProduct(req, res) {
  const { tenantId, id: userId } = req.user;
  const existing = await prisma.product.findFirst({
    where: { id: req.params.id, tenantId, deletedAt: null },
  });
  if (!existing) throw createError(404, 'Product not found.');

  await prisma.product.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action: 'product.delete',
      entityType: 'Product',
      entityId: existing.id,
      oldValue: existing,
    },
  });

  return res.status(204).send();
}

module.exports = { createProduct, listProducts, getProduct, updateProduct, deleteProduct };
