const { Router } = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const { rbac } = require('../middleware/rbac');
const ctrl = require('../controllers/productController');

const router = Router();

router.use(authenticate, tenantScope);

router.get('/', asyncHandler(ctrl.listProducts));
router.get('/:id', asyncHandler(ctrl.getProduct));

router.post('/', rbac('ADMIN', 'MANAGER'), asyncHandler(ctrl.createProduct));
router.patch('/:id', rbac('ADMIN', 'MANAGER'), asyncHandler(ctrl.updateProduct));
router.delete('/:id', rbac('ADMIN'), asyncHandler(ctrl.deleteProduct));

module.exports = router;
