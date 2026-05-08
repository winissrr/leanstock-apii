const { Router } = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const ctrl = require('../controllers/transactionController');

const router = Router();

router.use(authenticate, tenantScope);

router.get('/', asyncHandler(ctrl.listTransactions));
router.get('/:id', asyncHandler(ctrl.getTransaction));

module.exports = router;
