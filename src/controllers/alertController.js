const asyncHandler = require('../utils/asyncHandler');
const { prisma } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');

const getAlerts = asyncHandler(async (req, res) => {
  const items = await prisma.stockAlert.findMany({
    where: { tenantId: req.tenantId },
    orderBy: { createdAt: 'desc' },
    include: { inventoryItem: { include: { product: true, location: true } } }
  });
  res.json({ items });
});

const resolveAlert = asyncHandler(async (req, res) => {
  const existing = await prisma.stockAlert.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId }
  });

  if (!existing) {
    throw new ApiError(404, 'Not Found', 'Alert not found');
  }

  const updated = await prisma.stockAlert.update({
    where: { id: existing.id },
    data: { status: 'RESOLVED', resolvedAt: new Date() }
  });
  res.json({ alert: updated });
});

module.exports = { getAlerts, resolveAlert };
