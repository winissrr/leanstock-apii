const prisma = require('../config/database');
const { sendDecayNotificationEmail } = require('./emailService');
const PRICE_FLOOR_PERCENT = 0.30; 

async function runDecay() {
  const now = new Date();
  let processed = 0;
  let skipped = 0;
  let errors = 0;

  const candidateItems = await prisma.inventoryItem.findMany({
    where: {
      quantity: { gt: 0 },
      product: { isDecayEnabled: true, deletedAt: null },
    },
    include: {
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          tenantId: true,
          decayDaysThreshold: true,
          decayPercent: true,
        },
      },
    },
  });

  for (const item of candidateItems) {
    try {
      const { product } = item;
      const daysSinceReceived = (now - item.lastReceivedAt) / (1000 * 60 * 60 * 24);

      if (daysSinceReceived < product.decayDaysThreshold) {
        skipped++;
        continue;
      }

      const currentPrice = parseFloat(item.currentPrice);
      const originalPrice = parseFloat(item.originalPrice);
      const decayPct = parseFloat(product.decayPercent) / 100;
      const floor = originalPrice * PRICE_FLOOR_PERCENT;

      if (currentPrice <= floor) {
        skipped++;
        continue;
      }

      const newPrice = Math.max(currentPrice * (1 - decayPct), floor);
      const newPriceRounded = Math.round(newPrice * 100) / 100;

      await prisma.$transaction(async (tx) => {
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { currentPrice: newPriceRounded, version: { increment: 1 } },
        });

        await tx.decayLog.create({
          data: {
            tenantId: item.tenantId,
            inventoryItemId: item.id,
            priceBeforeDecay: currentPrice,
            priceAfterDecay: newPriceRounded,
          },
        });
      });

      const admins = await prisma.user.findMany({
        where: { tenantId: item.tenantId, role: { in: ['ADMIN', 'MANAGER'] }, isActive: true, isVerified: true },
        select: { email: true },
      });

      for (const admin of admins) {
        sendDecayNotificationEmail({
          to: admin.email,
          productName: product.name,
          sku: product.sku,
          oldPrice: currentPrice.toFixed(2),
          newPrice: newPriceRounded.toFixed(2),
          decayPercent: product.decayPercent,
        }).catch(() => {});
      }

      processed++;
    } catch (err) {
      console.error(`[decayService] Error processing item ${item.id}:`, err.message);
      errors++;
    }
  }

  console.log(`[decayService] Decay run complete — processed: ${processed}, skipped: ${skipped}, errors: ${errors}`);
  return { processed, skipped, errors };
}

async function getDecayHistory({ tenantId, inventoryItemId, cursor, limit }) {
  const logs = await prisma.decayLog.findMany({
    where: { tenantId, inventoryItemId },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { appliedAt: 'desc' },
  });

  const hasMore = logs.length > limit;
  const data = hasMore ? logs.slice(0, limit) : logs;
  return { data, nextCursor: hasMore ? data[data.length - 1].id : null, hasMore };
}

module.exports = { runDecay, getDecayHistory, PRICE_FLOOR_PERCENT };