const { Router } = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const { rbac } = require('../middleware/rbac');
const ctrl = require('../controllers/locationController');

const router = Router();

router.use(authenticate, tenantScope);

router.get('/', asyncHandler(ctrl.listLocations));
router.get('/:id', asyncHandler(ctrl.getLocation));
router.post('/', rbac('ADMIN', 'MANAGER'), asyncHandler(ctrl.createLocation));
router.patch('/:id', rbac('ADMIN', 'MANAGER'), asyncHandler(ctrl.updateLocation));
router.delete('/:id', rbac('ADMIN'), asyncHandler(ctrl.deleteLocation));

module.exports = router;
