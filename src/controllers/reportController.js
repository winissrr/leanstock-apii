const asyncHandler = require('../utils/asyncHandler');
const { valuationReport } = require('../services/reportService');

const getValuation = asyncHandler(async (req, res) => {
  const report = await valuationReport({ tenantId: req.tenantId });
  res.json({ items: report });
});

module.exports = { getValuation };
