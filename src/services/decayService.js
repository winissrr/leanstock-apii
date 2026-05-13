const prisma = require('../config/database');

const PRICE_FLOOR_RATIO = 0.30;

async function applyDecay() {
  console.log('[Decay] Starting dead stock decay job...');
  const now = new Date();

  const items = await prisma.inventoryItem.findMany({
    where: { quantity: { gt: 0 } },
    include: { product: true, location: true },
  });

  let processed = 0;
  for (const item of items) {
    const product = item.product;
    if (!product.isDecayEnabled || product.deletedAt) continue;

    const daysSinceReceived = (now - item.lastReceivedAt) / (1000 * 60 * 60 * 24);
    if (daysSinceReceived < product.decayDaysThreshold) continue;

    const floor = parseFloat(item.originalPrice) * PRICE_FLOOR_RATIO;
    const current = parseFloat(item.currentPrice);
    if (current <= floor) continue;

    const decayFactor = 1 - parseFloat(product.decayPercent) / 100;
    const newPrice = Math.max(current * decayFactor, floor);

    await prisma.$transaction([
      prisma.inventoryItem.update({
        where: { id: item.id },
        data: { currentPrice: newPrice },
      }),
      prisma.decayLog.create({
        data: {
          tenantId: item.tenantId,
          inventoryItemId: item.id,
          priceBeforeDecay: current,
          priceAfterDecay: newPrice,
        },
      }),
    ]);
    processed++;
  }

  console.log(`[Decay] Done. Applied decay to ${processed} inventory items.`);
  return processed;
}

module.exports = { applyDecay };
