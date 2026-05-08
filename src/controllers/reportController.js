const prisma = require('../config/database');
const { parsePaginationParams } = require('../utils/pagination');
const decayService = require('../services/decayService');

async function getValuationReport(req, res) {
  const { tenantId } = req.user;
  const { cursor, limit } = parsePaginationParams(req.query);

  const rows = await prisma.$queryRaw`
    SELECT
      p.id                                                          AS "productId",
      p.sku                                                         AS "sku",
      p.name                                                        AS "name",
      p.category                                                    AS "category",
      SUM(i.quantity)::int                                          AS "totalQty",
      SUM(i.quantity * i.current_price)::numeric(14,2)              AS "currentValue",
      SUM(i.quantity * i.original_price)::numeric(14,2)             AS "originalValue",
      SUM(i.quantity * (i.original_price - i.current_price))::numeric(14,2) AS "valueLostToDecay",
      COUNT(DISTINCT i.location_id)::int                            AS "locationCount"
    FROM inventory_items i
    JOIN products p ON p.id = i.product_id
    WHERE i.tenant_id = ${tenantId}
      AND i.quantity > 0
      AND p.deleted_at IS NULL
    GROUP BY p.id, p.sku, p.name, p.category
    ORDER BY "currentValue" DESC
    LIMIT ${limit}
    OFFSET ${cursor ? parseInt(cursor, 10) : 0}
  `;

  return res.status(200).json({
    data: rows,
   
    nextOffset: rows.length === limit ? (cursor ? parseInt(cursor, 10) : 0) + limit : null,
  });
}

async function getDecayHistory(req, res) {
  const { tenantId } = req.user;
  const { cursor, limit } = parsePaginationParams(req.query);

  const result = await decayService.getDecayHistory({
    tenantId,
    inventoryItemId: req.params.inventoryItemId,
    cursor,
    limit,
  });

  return res.status(200).json(result);
}

async function triggerDecay(req, res) {
  const result = await decayService.runDecay();
  return res.status(200).json({
    message: 'Decay job executed.',
    ...result,
  });
}

async function getAuditLog(req, res) {
  const { tenantId } = req.user;
  const { cursor, limit } = parsePaginationParams(req.query);
  const { entityType, entityId } = req.query;

  const where = { tenantId };
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;

  const rows = await prisma.auditLog.findMany({
    where,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  return res.status(200).json({ data, nextCursor: hasMore ? data[data.length - 1].id : null, hasMore });
}

module.exports = { getValuationReport, getDecayHistory, triggerDecay, getAuditLog };
