const { Router } = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const { rbac } = require('../middleware/rbac');
const ctrl = require('../controllers/reportController');

const router = Router();

router.use(authenticate, tenantScope);

router.get('/valuation', rbac('ADMIN', 'MANAGER'), asyncHandler(ctrl.getValuationReport));
router.get('/audit', rbac('ADMIN'), asyncHandler(ctrl.getAuditLog));
router.get('/decay/:inventoryItemId', rbac('ADMIN', 'MANAGER'), asyncHandler(ctrl.getDecayHistory));
router.post('/decay/trigger', rbac('ADMIN'), asyncHandler(ctrl.triggerDecay));

module.exports = router;
