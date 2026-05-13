const prisma = require('../config/database');
const redis = require('../utils/redisClient');
const alertService = require('./alertService');
const { buildCursorPage, paginateResult } = require('../utils/pagination');

const createError = (status, msg) => { const e = new Error(msg); e.status = status; e.isOperational = true; return e; };

async function withRedisLock(key, fn) {
  const lockKey = `lock:${key}`;
  const lockVal = Date.now().toString();
  const acquired = await redis.set(lockKey, lockVal, 'NX', 'EX', 10);
  if (!acquired) throw createError(423, 'Another operation is in progress. Please retry.');
  try {
    return await fn();
  } finally {
    const val = await redis.get(lockKey);
    if (val === lockVal) await redis.del(lockKey);
  }
}

async function receiveStock({ tenantId, userId, productId, locationId, quantity, note, supplierRef }) {
  if (quantity <= 0) throw createError(400, 'Quantity must be positive');
  return withRedisLock(`inv:${productId}:${locationId}`, async () => {
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id: productId, tenantId, deletedAt: null } });
      if (!product) throw createError(404, 'Product not found');
      const location = await tx.location.findFirst({ where: { id: locationId, tenantId, deletedAt: null } });
      if (!location) throw createError(404, 'Location not found');

      const item = await tx.inventoryItem.upsert({
        where: { productId_locationId: { productId, locationId } },
        update: {
          quantity: { increment: quantity },
          currentPrice: product.unitPrice,
          lastReceivedAt: new Date(),
          version: { increment: 1 },
        },
        create: {
          tenantId, productId, locationId,
          quantity, currentPrice: product.unitPrice, originalPrice: product.unitPrice,
        },
      });

      const txRecord = await tx.stockTransaction.create({
        data: { tenantId, productId, locationId, userId, type: 'INBOUND', quantityDelta: quantity, note, supplierRef },
      });

      await tx.auditLog.create({
        data: {
          tenantId, userId, action: 'inventory.receive', entityType: 'InventoryItem',
          entityId: item.id, newValue: { quantity: item.quantity, productId, locationId },
        },
      });

      return { inventoryItem: item, transaction: txRecord };
    }, { isolationLevel: 'Serializable' });

    const updated = await prisma.inventoryItem.findUnique({
      where: { id: result.inventoryItem.id },
      include: { product: true, location: true }
    });
    await alertService.checkAndCreateAlert(tenantId, updated, updated.product, updated.location);

    return result;
  });
}

async function transferStock({ tenantId, userId, productId, fromLocationId, toLocationId, quantity, note }) {
  if (quantity <= 0) throw createError(400, 'Quantity must be positive');
  if (fromLocationId === toLocationId) throw createError(400, 'Source and destination must differ');

  const lockKey = [productId, fromLocationId, toLocationId].sort().join(':');
  return withRedisLock(lockKey, async () => {
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id: productId, tenantId, deletedAt: null } });
      if (!product) throw createError(404, 'Product not found');

      const fromLoc = await tx.location.findFirst({ where: { id: fromLocationId, tenantId } });
      const toLoc   = await tx.location.findFirst({ where: { id: toLocationId, tenantId } });
      if (!fromLoc || !toLoc) throw createError(404, 'One or both locations not found in your tenant');

      const source = await tx.inventoryItem.findUnique({
        where: { productId_locationId: { productId, locationId: fromLocationId } },
      });
      if (!source || source.quantity < quantity) throw createError(409, 'Insufficient stock at source location');

      const updatedSource = await tx.inventoryItem.update({
        where: { id: source.id },
        data: { quantity: { decrement: quantity }, version: { increment: 1 } },
      });

      const dest = await tx.inventoryItem.upsert({
        where: { productId_locationId: { productId, locationId: toLocationId } },
        update: { quantity: { increment: quantity }, version: { increment: 1 } },
        create: { tenantId, productId, locationId: toLocationId, quantity, currentPrice: source.currentPrice, originalPrice: source.originalPrice },
      });

      const [txOut, txIn] = await Promise.all([
        tx.stockTransaction.create({
          data: { tenantId, productId, locationId: fromLocationId, userId, type: 'TRANSFER_OUT', quantityDelta: -quantity, note },
        }),
        tx.stockTransaction.create({
          data: { tenantId, productId, locationId: toLocationId, userId, type: 'TRANSFER_IN', quantityDelta: quantity, note },
        }),
      ]);

      await Promise.all([
        tx.stockTransaction.update({ where: { id: txOut.id }, data: { relatedTxId: txIn.id } }),
        tx.stockTransaction.update({ where: { id: txIn.id }, data: { relatedTxId: txOut.id } }),
      ]);

      await tx.auditLog.create({
        data: {
          tenantId, userId, action: 'inventory.transfer', entityType: 'InventoryItem',
          entityId: source.id,
          oldValue: { quantity: source.quantity, locationId: fromLocationId },
          newValue: { quantity: updatedSource.quantity, toLocationId, transferred: quantity },
        },
      });

      return { from: updatedSource, to: dest, transactions: [txOut, txIn], product, fromLoc };
    }, { isolationLevel: 'Serializable' });

    const updatedSource = await prisma.inventoryItem.findUnique({
      where: { id: result.from.id },
      include: { product: true, location: true }
    });
    await alertService.checkAndCreateAlert(tenantId, updatedSource, updatedSource.product, updatedSource.location);

    return result;
  });
}

async function adjustStock({ tenantId, userId, productId, locationId, quantityDelta, note }) {
  return withRedisLock(`inv:${productId}:${locationId}`, async () => {
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id: productId, tenantId, deletedAt: null } });
      if (!product) throw createError(404, 'Product not found');
      const location = await tx.location.findFirst({ where: { id: locationId, tenantId } });
      if (!location) throw createError(404, 'Location not found');

      const item = await tx.inventoryItem.findUnique({
        where: { productId_locationId: { productId, locationId } },
      });
      const currentQty = item ? item.quantity : 0;
      if (currentQty + quantityDelta < 0) throw createError(409, 'Adjustment would result in negative stock');

      const updated = await tx.inventoryItem.upsert({
        where: { productId_locationId: { productId, locationId } },
        update: { quantity: { increment: quantityDelta }, version: { increment: 1 } },
        create: { tenantId, productId, locationId, quantity: quantityDelta, currentPrice: product.unitPrice, originalPrice: product.unitPrice },
      });

      const txRecord = await tx.stockTransaction.create({
        data: { tenantId, productId, locationId, userId, type: 'ADJUSTMENT', quantityDelta, note },
      });

      await tx.auditLog.create({
        data: {
          tenantId, userId, action: 'inventory.adjust', entityType: 'InventoryItem',
          entityId: updated.id,
          oldValue: { quantity: currentQty },
          newValue: { quantity: updated.quantity, delta: quantityDelta },
        },
      });

      return { inventoryItem: updated, transaction: txRecord };
    }, { isolationLevel: 'Serializable' });

    const updated = await prisma.inventoryItem.findUnique({
      where: { id: result.inventoryItem.id },
      include: { product: true, location: true }
    });
    await alertService.checkAndCreateAlert(tenantId, updated, updated.product, updated.location);

    return result;
  });
}

async function getInventory(tenantId, { productId, locationId, cursor, limit }) {
  const page = buildCursorPage(cursor, limit);
  const where = { tenantId, ...(productId && { productId }), ...(locationId && { locationId }) };
  const items = await prisma.inventoryItem.findMany({
    where,
    ...page,
    orderBy: { id: 'asc' },
    include: { product: true, location: true },
  });
  return paginateResult(items, limit);
}

module.exports = { receiveStock, transferStock, adjustStock, getInventory };