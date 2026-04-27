const { prisma } = require('../config/database');

async function valuationReport({ tenantId }) {
  const items = await prisma.inventoryItem.findMany({
    where: { tenantId },
    include: { product: true, location: true }
  });

  const byProduct = new Map();
  for (const item of items) {
    const key = item.productId;
    const current = byProduct.get(key) || {
      productId: item.productId,
      sku: item.product.sku,
      name: item.product.name,
      totalQuantity: 0,
      totalValue: 0
    };
    current.totalQuantity += item.quantity;
    current.totalValue += item.quantity * Number(item.currentPrice);
    byProduct.set(key, current);
  }

  return [...byProduct.values()].sort((a, b) => b.totalValue - a.totalValue);
}

module.exports = { valuationReport };
