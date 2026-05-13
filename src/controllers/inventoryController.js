const inventoryService = require('../services/inventoryService');
const asyncHandler = require('../utils/asyncHandler');
const { z } = require('zod');

exports.list = asyncHandler(async (req, res) => {
  const { cursor, limit, productId, locationId } = req.query;
  const result = await inventoryService.getInventory(req.tenantId, { productId, locationId, cursor, limit });
  res.json(result);
});

exports.receive = asyncHandler(async (req, res) => {
  const data = z.object({
    productId: z.string(),
    locationId: z.string(),
    quantity: z.number().int().positive(),
    note: z.string().optional(),
    supplierRef: z.string().optional(),
  }).parse(req.body);
  const result = await inventoryService.receiveStock({ ...data, tenantId: req.tenantId, userId: req.user.sub });
  res.status(201).json(result);
});

exports.transfer = asyncHandler(async (req, res) => {
  const data = z.object({
    productId: z.string(),
    fromLocationId: z.string(),
    toLocationId: z.string(),
    quantity: z.number().int().positive(),
    note: z.string().optional(),
  }).parse(req.body);
  const result = await inventoryService.transferStock({ ...data, tenantId: req.tenantId, userId: req.user.sub });
  res.status(201).json(result);
});

exports.adjust = asyncHandler(async (req, res) => {
  const data = z.object({
    productId: z.string(),
    locationId: z.string(),
    quantityDelta: z.number().int(),
    note: z.string().min(1, 'Note required for adjustments'),
  }).parse(req.body);
  const result = await inventoryService.adjustStock({ ...data, tenantId: req.tenantId, userId: req.user.sub });
  res.status(201).json(result);
});
