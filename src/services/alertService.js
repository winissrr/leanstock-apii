const prisma = require('../config/database');
const emailService = require('./emailService');

async function checkAndCreateAlert(tenantId, inventoryItem, product, location) {
  try {
    if (inventoryItem.quantity <= product.reorderThreshold) {
      const existing = await prisma.stockAlert.findFirst({
        where: { tenantId, inventoryItemId: inventoryItem.id, status: 'ACTIVE' },
      });
      if (!existing) {
        await prisma.stockAlert.create({
          data: { tenantId, inventoryItemId: inventoryItem.id, status: 'ACTIVE' },
        });
        const managers = await prisma.user.findMany({
          where: { tenantId, role: { in: ['MANAGER', 'ADMIN'] }, isActive: true, deletedAt: null },
        });
        for (const mgr of managers) {
          emailService.sendLowStockAlertEmail(
            mgr.email, product.name, product.sku,
            inventoryItem.quantity, product.reorderThreshold, location.name
          ).catch(console.error);
        }
      }
    } else {
      await prisma.stockAlert.updateMany({
        where: { tenantId, inventoryItemId: inventoryItem.id, status: 'ACTIVE' },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });
    }
  } catch (err) {
    console.error('[Alert] Failed:', err.message);
  }
}

async function getAlerts(tenantId, status, cursor, limit) {
  const { buildCursorPage, paginateResult } = require('../utils/pagination');
  const page = buildCursorPage(cursor, limit);
  const where = { tenantId, ...(status && { status }) };
  const items = await prisma.stockAlert.findMany({
    where,
    ...page,
    orderBy: { createdAt: 'desc' },
    include: {
      inventoryItem: { include: { product: true, location: true } },
    },
  });
  return paginateResult(items, limit);
}

async function updateAlertStatus(tenantId, alertId, status) {
  const alert = await prisma.stockAlert.findFirst({ where: { id: alertId, tenantId } });
  if (!alert) { const e = new Error('Alert not found'); e.status = 404; e.isOperational = true; throw e; }
  return prisma.stockAlert.update({
    where: { id: alertId },
    data: { status, ...(status === 'RESOLVED' && { resolvedAt: new Date() }) },
  });
}

module.exports = { checkAndCreateAlert, getAlerts, updateAlertStatus };