const { prisma } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const { redlock } = require('../utils/redlock');

function toNumber(v) {
  return typeof v === 'number' ? v : Number(v);
}

async function upsertAlert(tx, { tenantId, inventoryItemId, quantity, threshold }) {
  const active = await tx.stockAlert.findFirst({
    where: { tenantId, inventoryItemId, status: 'ACTIVE' }
  });

  if (quantity <= threshold) {
    if (!active) {
      await tx.stockAlert.create({
        data: { tenantId, inventoryItemId, status: 'ACTIVE' }
      });
    }
  } else if (active) {
    await tx.stockAlert.update({
      where: { id: active.id },
      data: { status: 'RESOLVED', resolvedAt: new Date() }
    });
  }
}

async function receiveInventory({ tenantId, userId, productId, locationId, quantity, supplierRef, note }) {
  const lock = await redlock.acquire([`lock:receive:${tenantId}:${productId}:${locationId}`], 5000);
  try {
    return await prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id: productId, tenantId, deletedAt: null } });
      const location = await tx.location.findFirst({ where: { id: locationId, tenantId, deletedAt: null } });

      if (!product) throw new ApiError(404, 'Not Found', 'Product not found');
      if (!location) throw new ApiError(404, 'Not Found', 'Location not found');
      if (quantity <= 0) throw new ApiError(422, 'Validation Error', 'Quantity must be positive');

      const existing = await tx.inventoryItem.findUnique({
        where: { productId_locationId: { productId, locationId } }
      });

      const item = existing
        ? await tx.inventoryItem.update({
            where: { id: existing.id },
            data: {
              quantity: { increment: quantity },
              lastReceivedAt: new Date(),
              version: { increment: 1 }
            }
          })
        : await tx.inventoryItem.create({
            data: {
              tenantId,
              productId,
              locationId,
              quantity,
              currentPrice: product.unitPrice,
              originalPrice: product.unitPrice
            }
          });

      const txRecord = await tx.stockTransaction.create({
        data: {
          tenantId,
          productId,
          locationId,
          inventoryItemId: item.id,
          userId,
          type: 'INBOUND',
          quantityDelta: quantity,
          supplierRef: supplierRef || null,
          note: note || null
        }
      });

      await upsertAlert(tx, {
        tenantId,
        inventoryItemId: item.id,
        quantity: item.quantity,
        threshold: product.reorderThreshold
      });

      return { item, txRecord };
    }, { isolationLevel: 'Serializable' });
  } finally {
    await lock.release().catch(() => {});
  }
}

async function transferInventory({ tenantId, userId, productId, fromLocationId, toLocationId, quantity, note }) {
  if (fromLocationId === toLocationId) {
    throw new ApiError(422, 'Validation Error', 'Source and destination locations must differ');
  }
  if (quantity <= 0) {
    throw new ApiError(422, 'Validation Error', 'Quantity must be positive');
  }

  const lockKeys = [
    `lock:transfer:${tenantId}:${productId}:${fromLocationId}`,
    `lock:transfer:${tenantId}:${productId}:${toLocationId}`
  ].sort();

  const lock = await redlock.acquire(lockKeys, 5000);

  try {
    return await prisma.$transaction(async (tx) => {
      const [sourceLocation, destLocation, product] = await Promise.all([
        tx.location.findFirst({ where: { id: fromLocationId, tenantId, deletedAt: null } }),
        tx.location.findFirst({ where: { id: toLocationId, tenantId, deletedAt: null } }),
        tx.product.findFirst({ where: { id: productId, tenantId, deletedAt: null } })
      ]);

      if (!sourceLocation || !destLocation) throw new ApiError(404, 'Not Found', 'Location not found');
      if (!product) throw new ApiError(404, 'Not Found', 'Product not found');

      let source = await tx.inventoryItem.findUnique({
        where: { productId_locationId: { productId, locationId: fromLocationId } }
      });

      if (!source || source.quantity < quantity) {
        throw new ApiError(409, 'Conflict', 'Insufficient stock at source location');
      }

      let destination = await tx.inventoryItem.findUnique({
        where: { productId_locationId: { productId, locationId: toLocationId } }
      });

      if (!destination) {
        destination = await tx.inventoryItem.create({
          data: {
            tenantId,
            productId,
            locationId: toLocationId,
            quantity: 0,
            currentPrice: source.currentPrice,
            originalPrice: source.originalPrice
          }
        });
      }

      source = await tx.inventoryItem.update({
        where: { id: source.id },
        data: { quantity: { decrement: quantity }, version: { increment: 1 } }
      });

      destination = await tx.inventoryItem.update({
        where: { id: destination.id },
        data: { quantity: { increment: quantity }, version: { increment: 1 } }
      });

      const outTx = await tx.stockTransaction.create({
        data: {
          tenantId,
          productId,
          locationId: fromLocationId,
          inventoryItemId: source.id,
          userId,
          type: 'TRANSFER_OUT',
          quantityDelta: -quantity,
          note: note || null,
          relatedTxId: null
        }
      });

      const inTx = await tx.stockTransaction.create({
        data: {
          tenantId,
          productId,
          locationId: toLocationId,
          inventoryItemId: destination.id,
          userId,
          type: 'TRANSFER_IN',
          quantityDelta: quantity,
          note: note || null,
          relatedTxId: outTx.id
        }
      });

      await upsertAlert(tx, {
        tenantId,
        inventoryItemId: source.id,
        quantity: source.quantity,
        threshold: product.reorderThreshold
      });

      await upsertAlert(tx, {
        tenantId,
        inventoryItemId: destination.id,
        quantity: destination.quantity,
        threshold: product.reorderThreshold
      });

      return { source, destination, outTx, inTx };
    }, { isolationLevel: 'Serializable' });
  } finally {
    await lock.release().catch(() => {});
  }
}

async function adjustInventory({ tenantId, userId, productId, locationId, quantityDelta, note }) {
  if (quantityDelta === 0) {
    throw new ApiError(422, 'Validation Error', 'quantityDelta cannot be zero');
  }

  const lock = await redlock.acquire([`lock:adjust:${tenantId}:${productId}:${locationId}`], 5000);
  try {
    return await prisma.$transaction(async (tx) => {
      const [location, product] = await Promise.all([
        tx.location.findFirst({ where: { id: locationId, tenantId, deletedAt: null } }),
        tx.product.findFirst({ where: { id: productId, tenantId, deletedAt: null } })
      ]);

      if (!location || !product) throw new ApiError(404, 'Not Found', 'Product or location not found');

      const item = await tx.inventoryItem.findUnique({
        where: { productId_locationId: { productId, locationId } }
      });

      if (!item) throw new ApiError(404, 'Not Found', 'Inventory item not found');

      const newQuantity = item.quantity + quantityDelta;
      if (newQuantity < 0) {
        throw new ApiError(409, 'Conflict', 'Inventory cannot go below zero');
      }

      const updated = await tx.inventoryItem.update({
        where: { id: item.id },
        data: { quantity: newQuantity, version: { increment: 1 } }
      });

      const txRecord = await tx.stockTransaction.create({
        data: {
          tenantId,
          productId,
          locationId,
          inventoryItemId: item.id,
          userId,
          type: 'ADJUSTMENT',
          quantityDelta,
          note: note || null
        }
      });

      await upsertAlert(tx, {
        tenantId,
        inventoryItemId: item.id,
        quantity: updated.quantity,
        threshold: product.reorderThreshold
      });

      return { item: updated, txRecord };
    }, { isolationLevel: 'Serializable' });
  } finally {
    await lock.release().catch(() => {});
  }
}

async function listInventory({ tenantId, cursor, limit = 20, sort = 'desc' }) {
  const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const orderBy = [{ createdAt: sort === 'asc' ? 'asc' : 'desc' }, { id: sort === 'asc' ? 'asc' : 'desc' }];
  const items = await prisma.inventoryItem.findMany({
    where: { tenantId },
    orderBy,
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      product: true,
      location: true,
      alerts: { where: { status: 'ACTIVE' }, take: 1 }
    }
  });

  const hasNextPage = items.length > take;
  const pageItems = hasNextPage ? items.slice(0, take) : items;
  return {
    items: pageItems,
    nextCursor: hasNextPage ? pageItems[pageItems.length - 1].id : null
  };
}

async function listProducts({ tenantId, cursor, limit = 20, sort = 'desc' }) {
  const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const orderBy = [{ createdAt: sort === 'asc' ? 'asc' : 'desc' }, { id: sort === 'asc' ? 'asc' : 'desc' }];
  const items = await prisma.product.findMany({
    where: { tenantId, deletedAt: null },
    orderBy,
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  });
  const hasNextPage = items.length > take;
  const pageItems = hasNextPage ? items.slice(0, take) : items;
  return {
    items: pageItems,
    nextCursor: hasNextPage ? pageItems[pageItems.length - 1].id : null
  };
}

async function listLocations({ tenantId }) {
  return prisma.location.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: { createdAt: 'desc' }
  });
}

module.exports = {
  receiveInventory,
  transferInventory,
  adjustInventory,
  listInventory,
  listProducts,
  listLocations
};
