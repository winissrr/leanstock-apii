const router = require('express').Router();
const { z } = require('zod');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenantScope');
const { requireRoles } = require('../middleware/rbac');
const { createLocation, getLocations } = require('../controllers/locationController');

const locationSchema = z.object({
  name: z.string().min(1),
  address: z.string().max(300).optional().nullable()
});

router.use(authenticate, requireTenant);

router.get('/', getLocations);
router.post('/', requireRoles('ADMIN', 'MANAGER'), validate(locationSchema), createLocation);

module.exports = router;
