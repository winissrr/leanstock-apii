const router = require('express').Router();
const { z } = require('zod');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenantScope');
const { requireRoles } = require('../middleware/rbac');
const { createProduct, getProducts } = require('../controllers/productController');

const createProductSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string().max(500).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  unitPrice: z.coerce.number().positive(),
  reorderThreshold: z.coerce.number().int().min(0).default(0),
  isDecayEnabled: z.boolean().optional().default(false),
  decayDaysThreshold: z.coerce.number().int().min(1).default(30),
  decayPercent: z.coerce.number().positive().default(10)
});

router.use(authenticate, requireTenant);

router.get('/', getProducts);
router.post('/', requireRoles('ADMIN', 'MANAGER'), validate(createProductSchema), createProduct);

module.exports = router;
