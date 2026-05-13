const prisma = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');

exports.valuation = asyncHandler(async (req, res) => {
  const { category } = req.query;

  const items = await prisma.inventoryItem.findMany({
    where: { tenantId: req.tenantId, quantity: { gt: 0 }, product: { deletedAt: null, ...(category && { category }) } },
    include: { product: true, location: true },
  });

  const grouped = {};
  for (const item of items) {
    const p = item.product;
    if (!grouped[p.id]) {
      grouped[p.id] = { sku: p.sku, name: p.name, category: p.category, totalQty: 0, currentValue: 0, originalValue: 0, valueLostToDecay: 0, locationCount: new Set() };
    }
    const g = grouped[p.id];
    const qty = item.quantity;
    const curr = parseFloat(item.currentPrice);
    const orig = parseFloat(item.originalPrice);
    g.totalQty += qty;
    g.currentValue += qty * curr;
    g.originalValue += qty * orig;
    g.valueLostToDecay += qty * (orig - curr);
    g.locationCount.add(item.locationId);
  }

  const report = Object.values(grouped).map((g) => ({
    ...g,
    currentValue: +g.currentValue.toFixed(2),
    originalValue: +g.originalValue.toFixed(2),
    valueLostToDecay: +g.valueLostToDecay.toFixed(2),
    locationCount: g.locationCount.size,
  })).sort((a, b) => b.currentValue - a.currentValue);

  res.json({ data: report, total: report.length, generatedAt: new Date().toISOString() });
});
