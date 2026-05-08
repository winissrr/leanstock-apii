const { z } = require('zod');
const prisma = require('../config/database');
const { parsePaginationParams, paginateResult } = require('../utils/pagination');
const { createError } = require('../middleware/errorHandler');

const locationSchema = z.object({
  name: z.string().min(1).max(255),
  address: z.string().max(500).optional(),
});

const updateSchema = locationSchema.partial();

async function createLocation(req, res) {
  const body = locationSchema.parse(req.body);
  const { tenantId, id: userId } = req.user;

  const location = await prisma.location.create({
    data: { ...body, tenantId },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action: 'location.create',
      entityType: 'Location',
      entityId: location.id,
      newValue: location,
    },
  });

  return res.status(201).json({ data: location });
}

async function listLocations(req, res) {
  const { tenantId } = req.user;
  const { cursor, limit } = parsePaginationParams(req.query);

  const rows = await prisma.location.findMany({
    where: { tenantId, deletedAt: null },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
  });

  const { data, nextCursor, hasMore } = paginateResult(rows, limit);
  return res.status(200).json({ data, nextCursor, hasMore });
}

async function getLocation(req, res) {
  const { tenantId } = req.user;
  const location = await prisma.location.findFirst({
    where: { id: req.params.id, tenantId, deletedAt: null },
  });
  if (!location) throw createError(404, 'Location not found.');
  return res.status(200).json({ data: location });
}

async function updateLocation(req, res) {
  const { tenantId, id: userId } = req.user;
  const body = updateSchema.parse(req.body);

  const existing = await prisma.location.findFirst({
    where: { id: req.params.id, tenantId, deletedAt: null },
  });
  if (!existing) throw createError(404, 'Location not found.');

  const updated = await prisma.location.update({
    where: { id: req.params.id },
    data: body,
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action: 'location.update',
      entityType: 'Location',
      entityId: updated.id,
      oldValue: existing,
      newValue: updated,
    },
  });

  return res.status(200).json({ data: updated });
}

async function deleteLocation(req, res) {
  const { tenantId, id: userId } = req.user;
  const existing = await prisma.location.findFirst({
    where: { id: req.params.id, tenantId, deletedAt: null },
  });
  if (!existing) throw createError(404, 'Location not found.');

  const itemCount = await prisma.inventoryItem.count({
    where: { locationId: req.params.id, quantity: { gt: 0 } },
  });
  if (itemCount > 0) {
    throw createError(409, 'Cannot delete location with active inventory. Transfer or adjust stock first.', {
      code: 'location-has-inventory',
      title: 'Conflict',
    });
  }

  await prisma.location.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date(), isActive: false },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action: 'location.delete',
      entityType: 'Location',
      entityId: existing.id,
      oldValue: existing,
    },
  });

  return res.status(204).send();
}

module.exports = { createLocation, listLocations, getLocation, updateLocation, deleteLocation };
