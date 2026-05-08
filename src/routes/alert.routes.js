const { Router } = require('express');
const { z } = require('zod');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const { rbac } = require('../middleware/rbac');
const alertService = require('../services/alertService');
const { parsePaginationParams } = require('../utils/pagination');

const router = Router();

router.use(authenticate, tenantScope);

router.get('/', asyncHandler(async (req, res) => {
  const { tenantId } = req.user;
  const { cursor, limit } = parsePaginationParams(req.query);
  const { status } = req.query;
  const result = await alertService.listAlerts({ tenantId, status, cursor, limit });
  return res.status(200).json(result);
}));

router.patch('/:id', rbac('ADMIN', 'MANAGER'), asyncHandler(async (req, res) => {
  const { tenantId } = req.user;
  const { status } = z.object({
    status: z.enum(['RESOLVED', 'SNOOZED']),
  }).parse(req.body);

  const alert = await alertService.updateAlertStatus({ alertId: req.params.id, tenantId, status });
  return res.status(200).json({ data: alert });
}));

module.exports = router;
