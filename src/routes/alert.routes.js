const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenantScope');
const { requireRoles } = require('../middleware/rbac');
const { getAlerts, resolveAlert } = require('../controllers/alertController');

router.use(authenticate, requireTenant, requireRoles('ADMIN', 'MANAGER'));

router.get('/', getAlerts);
router.patch('/:id', resolveAlert);

module.exports = router;
