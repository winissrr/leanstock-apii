const { Router } = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const { rbac } = require('../middleware/rbac');
const ctrl = require('../controllers/inventoryController');

const router = Router();

router.use(authenticate, tenantScope);

router.get('/', asyncHandler(ctrl.listInventory));

router.post('/receive', rbac('ADMIN', 'MANAGER'), asyncHandler(ctrl.receiveStock));
router.post('/transfer', rbac('ADMIN', 'MANAGER', 'STAFF'), asyncHandler(ctrl.transferStock));
router.post('/adjust', rbac('ADMIN', 'MANAGER'), asyncHandler(ctrl.adjustStock));

module.exports = router;
