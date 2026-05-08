const prisma = require('../config/database');
const { createError } = require('../middleware/errorHandler');
const alertService = require('./alertService');
const { sendStockReceivedEmail } = require('./emailService');

async function receiveStock({
  tenantId,
  productId,
  locationId,
  quantity,
  supplierRef,
  note,
  userId,
  notifyEmail,
}) {
  if (quantity <= 0) {
    throw createError(400, 'Quantity must be greater than zero.', {
      code: 'invalid-quantity',
      title: 'Bad Request',
    });
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, tenantId, deletedAt: null },
      });
      if (!product) throw createError(404, 'Product not found.');

      const location = await tx.location.findFirst({
        where: { id: locationId, tenantId, deletedAt: null, isActive: true },
      });
      if (!location) throw createError(404, 'Location not found.');

      const existing = await tx.inventoryItem.findUnique({
        where: { productId_locationId: { productId, locationId } },
      });

      let item;
      if (existing) {
        item = await tx.inventoryItem.update({
          where: { id: existing.id },
          data: {
            quantity: existing.quantity + quantity,
            currentPrice: product.unitPrice,
            originalPrice: product.unitPrice,
            lastReceivedAt: new Date(),
            version: { increment: 1 },
          },
        });
      } else {
        item = await tx.inventoryItem.create({
          data: {
            tenantId,
            productId,
            locationId,
            quantity,
            currentPrice: product.unitPrice,
            originalPrice: product.unitPrice,
          },
        });
      }

      const transaction = await tx.stockTransaction.create({
        data: {
          tenantId,
          productId,
          locationId,
          userId,
          type: 'INBOUND',
          quantityDelta: quantity,
          supplierRef,
          note,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'inventory.receive',
          entityType: 'InventoryItem',
          entityId: item.id,
          newValue: { quantity: item.quantity, productId, locationId },
        },
      });

      return { item, transaction, product, location };
    },
    { isolationLevel: 'Serializable' },
  );

  await alertService
    .checkAndResolveAlert(result.item.id, result.item.quantity, result.item.tenantId)
    .catch(() => {});

  if (notifyEmail) {
    sendStockReceivedEmail({
      to: notifyEmail,
      productName: result.product.name,
      sku: result.product.sku,
      locationName: result.location.name,
      quantity,
      supplierRef,
    }).catch(() => {});
  }

  return result;
}

async function transferStock({
  tenantId,
  productId,
  fromLocationId,
  toLocationId,
  quantity,
  note,
  userId,
}) {
  if (quantity <= 0) {
    throw createError(400, 'Quantity must be greater than zero.', {
      code: 'invalid-quantity',
      title: 'Bad Request',
    });
  }

  if (fromLocationId === toLocationId) {
    throw createError(400, 'Source and destination locations must differ.', {
      code: 'same-location',
      title: 'Bad Request',
    });
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, tenantId, deletedAt: null },
      });
      if (!product) throw createError(404, 'Product not found.');

      const [fromLoc, toLoc] = await Promise.all([
        tx.location.findFirst({ where: { id: fromLocationId, tenantId, isActive: true, deletedAt: null } }),
        tx.location.findFirst({ where: { id: toLocationId, tenantId, isActive: true, deletedAt: null } }),
      ]);
      if (!fromLoc) throw createError(404, 'Source location not found.');
      if (!toLoc) throw createError(404, 'Destination location not found.');

      const sourceItem = await tx.inventoryItem.findUnique({
        where: { productId_locationId: { productId, locationId: fromLocationId } },
      });
      if (!sourceItem || sourceItem.quantity < quantity) {
        throw createError(422, `Insufficient stock. Available: ${sourceItem?.quantity ?? 0}.`, {
          code: 'insufficient-stock',
          title: 'Unprocessable Entity',
        });
      }

      const updatedSource = await tx.inventoryItem.update({
        where: { id: sourceItem.id },
        data: {
          quantity: { decrement: quantity },
          version: { increment: 1 },
        },
      });

      const destExisting = await tx.inventoryItem.findUnique({
        where: { productId_locationId: { productId, locationId: toLocationId } },
      });

      let destItem;
      if (destExisting) {
        destItem = await tx.inventoryItem.update({
          where: { id: destExisting.id },
          data: { quantity: { increment: quantity }, version: { increment: 1 } },
        });
      } else {
        destItem = await tx.inventoryItem.create({
          data: {
            tenantId,
            productId,
            locationId: toLocationId,
            quantity,
            currentPrice: sourceItem.currentPrice,
            originalPrice: sourceItem.originalPrice,
          },
        });
      }

      const outTx = await tx.stockTransaction.create({
        data: { tenantId, productId, locationId: fromLocationId, userId, type: 'TRANSFER_OUT', quantityDelta: -quantity, note },
      });
      const inTx = await tx.stockTransaction.create({
        data: { tenantId, productId, locationId: toLocationId, userId, type: 'TRANSFER_IN', quantityDelta: quantity, note, relatedTxId: outTx.id },
      });
      await tx.stockTransaction.update({ where: { id: outTx.id }, data: { relatedTxId: inTx.id } });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'inventory.transfer',
          entityType: 'InventoryItem',
          entityId: sourceItem.id,
          oldValue: { quantity: sourceItem.quantity },
          newValue: { quantity: updatedSource.quantity, toLocationId, transferQty: quantity },
        },
      });

      return { sourceItem: updatedSource, destItem, outTransaction: outTx, inTransaction: inTx };
    },
    { isolationLevel: 'Serializable' },
  );

  await alertService
    .checkAndCreateAlert({
      tenantId,
      inventoryItemId: result.sourceItem.id,
      quantity: result.sourceItem.quantity,
      productId,
    })
    .catch(() => {});

  return result;
}

async function adjustStock({ tenantId, productId, locationId, quantityDelta, note, userId }) {
  if (quantityDelta === 0) {
    throw createError(400, 'Quantity delta must not be zero.', {
      code: 'invalid-delta',
      title: 'Bad Request',
    });
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, tenantId, deletedAt: null },
      });
      if (!product) throw createError(404, 'Product not found.');

      const item = await tx.inventoryItem.findUnique({
        where: { productId_locationId: { productId, locationId } },
      });
      if (!item) throw createError(404, 'Inventory item not found at this location.');

      const newQty = item.quantity + quantityDelta;
      if (newQty < 0) {
        throw createError(422, `Adjustment would result in negative stock (${newQty}).`, {
          code: 'negative-stock',
          title: 'Unprocessable Entity',
        });
      }

      const updatedItem = await tx.inventoryItem.update({
        where: { id: item.id },
        data: { quantity: newQty, version: { increment: 1 } },
      });

      const transaction = await tx.stockTransaction.create({
        data: {
          tenantId,
          productId,
          locationId,
          userId,
          type: 'ADJUSTMENT',
          quantityDelta,
          note,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'inventory.adjust',
          entityType: 'InventoryItem',
          entityId: item.id,
          oldValue: { quantity: item.quantity },
          newValue: { quantity: newQty, delta: quantityDelta },
        },
      });

      return { item: updatedItem, transaction, product };
    },
    { isolationLevel: 'Serializable' },
  );

  await alertService
    .checkAndCreateAlert({
      tenantId,
      inventoryItemId: result.item.id,
      quantity: result.item.quantity,
      productId,
    })
    .catch(() => {});

  return result;
}

async function listInventory({ tenantId, locationId, cursor, limit }) {
  const where = { tenantId };
  if (locationId) where.locationId = locationId;

  const items = await prisma.inventoryItem.findMany({
    where,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { updatedAt: 'desc' },
    include: {
      product: { select: { id: true, sku: true, name: true, category: true, unitPrice: true } },
      location: { select: { id: true, name: true } },
    },
  });

  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  return { data, nextCursor: hasMore ? data[data.length - 1].id : null, hasMore };
}

module.exports = { receiveStock, transferStock, adjustStock, listInventory };