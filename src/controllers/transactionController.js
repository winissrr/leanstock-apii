const { z } = require('zod');
const prisma = require('../config/database');
const { parsePaginationParams, paginateResult } = require('../utils/pagination');

const VALID_TYPES = ['INBOUND', 'OUTBOUND', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT'];

async function listTransactions(req, res) {
  const { tenantId } = req.user;
  const { cursor, limit } = parsePaginationParams(req.query);

  // Optional filters
  const filterSchema = z.object({
    productId: z.string().cuid().optional(),
    locationId: z.string().cuid().optional(),
    type: z.enum(VALID_TYPES).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  });
  const filters = filterSchema.parse(req.query);

  const where = { tenantId };
  if (filters.productId) where.productId = filters.productId;
  if (filters.locationId) where.locationId = filters.locationId;
  if (filters.type) where.type = filters.type;
  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) where.createdAt.gte = new Date(filters.from);
    if (filters.to) where.createdAt.lte = new Date(filters.to);
  }

  const rows = await prisma.stockTransaction.findMany({
    where,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  const { data, nextCursor, hasMore } = paginateResult(rows, limit);
  return res.status(200).json({ data, nextCursor, hasMore });
}

async function getTransaction(req, res) {
  const { tenantId } = req.user;
  const tx = await prisma.stockTransaction.findFirst({
    where: { id: req.params.id, tenantId },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
  if (!tx) {
    const { createError } = require('../middleware/errorHandler');
    throw createError(404, 'Transaction not found.');
  }
  return res.status(200).json({ data: tx });
}

module.exports = { listTransactions, getTransaction };
