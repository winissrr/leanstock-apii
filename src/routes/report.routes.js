const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenantScope');
const { requireRoles } = require('../middleware/rbac');
const { getValuation } = require('../controllers/reportController');

router.use(authenticate, requireTenant, requireRoles('ADMIN', 'MANAGER'));

router.get('/valuation', getValuation);

module.exports = router;
