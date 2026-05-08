const prisma = require('../config/database');
const { sendLowStockAlert } = require('./emailService');

async function checkAndCreateAlert({ tenantId, inventoryItemId, quantity, productId }) {
  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId, deletedAt: null },
  });
  if (!product || product.reorderThreshold === 0) return null;

  if (quantity > product.reorderThreshold) return null;

  const existing = await prisma.stockAlert.findFirst({
    where: { inventoryItemId, status: 'ACTIVE' },
  });
  if (existing) return existing;

  const alert = await prisma.stockAlert.create({
    data: { tenantId, inventoryItemId, status: 'ACTIVE' },
  });

  const item = await prisma.inventoryItem.findUnique({
    where: { id: inventoryItemId },
    include: { location: { select: { name: true } } },
  });

  const admins = await prisma.user.findMany({
    where: { tenantId, role: { in: ['ADMIN', 'MANAGER'] }, isActive: true, isVerified: true },
    select: { email: true },
  });

  for (const admin of admins) {
    sendLowStockAlert({
      to: admin.email,
      productName: product.name,
      sku: product.sku,
      locationName: item?.location?.name || 'Unknown',
      currentQty: quantity,
      threshold: product.reorderThreshold,
    }).catch(() => {});
  }

  return alert;
}

async function checkAndResolveAlert(inventoryItemId, quantity, tenantId) {
  const item = await prisma.inventoryItem.findUnique({
    where: { id: inventoryItemId },
    include: { product: true },
  });
  if (!item) return;

  if (quantity > item.product.reorderThreshold) {
    await prisma.stockAlert.updateMany({
      where: { inventoryItemId, status: 'ACTIVE' },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
  }
}

async function listAlerts({ tenantId, status, cursor, limit }) {
  const where = { tenantId };
  if (status) where.status = status;

  const alerts = await prisma.stockAlert.findMany({
    where,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    include: {
      inventoryItem: {
        include: {
          product: { select: { id: true, sku: true, name: true, reorderThreshold: true } },
          location: { select: { id: true, name: true } },
        },
      },
    },
  });

  const hasMore = alerts.length > limit;
  const data = hasMore ? alerts.slice(0, limit) : alerts;
  return { data, nextCursor: hasMore ? data[data.length - 1].id : null, hasMore };
}

async function updateAlertStatus({ alertId, tenantId, status }) {
  const alert = await prisma.stockAlert.findFirst({
    where: { id: alertId, tenantId },
  });
  if (!alert) {
    const { createError } = require('../middleware/errorHandler');
    throw createError(404, 'Alert not found.');
  }

  const data = { status };
  if (status === 'RESOLVED') data.resolvedAt = new Date();

  return prisma.stockAlert.update({ where: { id: alertId }, data });
}

module.exports = { checkAndCreateAlert, checkAndResolveAlert, listAlerts, updateAlertStatus };
