const prisma = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const { buildCursorPage, paginateResult } = require('../utils/pagination');

exports.list = asyncHandler(async (req, res) => {
  const { cursor, limit, type, productId, locationId, startDate, endDate } = req.query;
  const page = buildCursorPage(cursor, limit);
  const where = {
    tenantId: req.tenantId,
    ...(type && { type }),
    ...(productId && { productId }),
    ...(locationId && { locationId }),
    ...(startDate || endDate) && {
      createdAt: {
        ...(startDate && { gte: new Date(startDate) }),
        ...(endDate && { lte: new Date(endDate) }),
      },
    },
  };
  const items = await prisma.stockTransaction.findMany({
    where, ...page, orderBy: { createdAt: 'desc' },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });
  res.json(paginateResult(items, limit));
});
