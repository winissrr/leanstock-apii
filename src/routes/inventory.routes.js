const router = require('express').Router();
const { z } = require('zod');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenantScope');
const { requireRoles } = require('../middleware/rbac');
const { receive, transfer, adjust, getInventory } = require('../controllers/inventoryController');

const receiveSchema = z.object({
  productId: z.string().min(1),
  locationId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  supplierRef: z.string().max(120).optional().nullable(),
  note: z.string().max(500).optional().nullable()
});

const transferSchema = z.object({
  productId: z.string().min(1),
  fromLocationId: z.string().min(1),
  toLocationId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  note: z.string().max(500).optional().nullable()
});

const adjustSchema = z.object({
  productId: z.string().min(1),
  locationId: z.string().min(1),
  quantityDelta: z.coerce.number().int(),
  note: z.string().max(500).optional().nullable()
});

router.use(authenticate, requireTenant);

router.get('/', getInventory);
router.post('/receive', requireRoles('ADMIN', 'MANAGER', 'STAFF'), validate(receiveSchema), receive);
router.post('/transfer', requireRoles('ADMIN', 'MANAGER', 'STAFF'), validate(transferSchema), transfer);
router.post('/adjust', requireRoles('ADMIN', 'MANAGER', 'STAFF'), validate(adjustSchema), adjust);

module.exports = router;
