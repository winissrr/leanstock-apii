const alertService = require('../services/alertService');
const asyncHandler = require('../utils/asyncHandler');
const { z } = require('zod');

exports.list = asyncHandler(async (req, res) => {
  const { cursor, limit, status } = req.query;
  const result = await alertService.getAlerts(req.tenantId, status, cursor, limit);
  res.json(result);
});

exports.update = asyncHandler(async (req, res) => {
  const { status } = z.object({ status: z.enum(['RESOLVED', 'SNOOZED', 'ACTIVE']) }).parse(req.body);
  const result = await alertService.updateAlertStatus(req.tenantId, req.params.id, status);
  res.json(result);
});
