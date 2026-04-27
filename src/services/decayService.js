const { prisma } = require('../config/database');
 
function applyDecayPrice(originalPrice, currentPrice, decayPercent) {
  const floor = Number(originalPrice) * 0.3;
  const next = Math.min(Number(currentPrice), Number(originalPrice) * (1 - Number(decayPercent) / 100));
  return Math.max(floor, Number(next.toFixed(2)));
}
 
async function runDecayCycle({ tenantId } = {}) {
  const now = new Date();
  const inventories = await prisma.inventoryItem.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      product: {
        is: { isDecayEnabled: true }
      }
    },
    include: { product: true }
  });
 
  const decayed = [];
  for (const item of inventories) {
    const thresholdDays = item.product.decayDaysThreshold;
    const thresholdDate = new Date(now.getTime() - thresholdDays * 24 * 60 * 60 * 1000);
    if (item.lastReceivedAt >= thresholdDate) continue;
 
    const before = Number(item.currentPrice);
    const after = applyDecayPrice(item.originalPrice, item.currentPrice, item.product.decayPercent);
    if (after >= before) continue;
 
    const updated = await prisma.inventoryItem.update({
      where: { id: item.id },
      data: { currentPrice: after, version: { increment: 1 } }
    });
 
    await prisma.decayLog.create({
      data: {
        tenantId: item.tenantId,
        inventoryItemId: item.id,
        priceBeforeDecay: before,
        priceAfterDecay: after
      }
    });
 
    decayed.push(updated);
  }
 
  return decayed;
}
 
module.exports = { applyDecayPrice, runDecayCycle };