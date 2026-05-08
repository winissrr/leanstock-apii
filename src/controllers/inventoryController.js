const { z } = require('zod');
const inventoryService = require('../services/inventoryService');
const { parsePaginationParams } = require('../utils/pagination');

const receiveSchema = z.object({
  productId: z.string().cuid(),
  locationId: z.string().cuid(),
  quantity: z.number().int().positive(),
  supplierRef: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
});

const transferSchema = z.object({
  productId: z.string().cuid(),
  fromLocationId: z.string().cuid(),
  toLocationId: z.string().cuid(),
  quantity: z.number().int().positive(),
  note: z.string().max(500).optional(),
});

const adjustSchema = z.object({
  productId: z.string().cuid(),
  locationId: z.string().cuid(),
  quantityDelta: z.number().int().refine((v) => v !== 0, { message: 'quantityDelta must not be zero' }),
  note: z.string().max(500).optional(),
});

async function receiveStock(req, res) {
  const body = receiveSchema.parse(req.body);
  const { tenantId, id: userId, email } = req.user;

  const result = await inventoryService.receiveStock({
    ...body,
    tenantId,
    userId,
    notifyEmail: email,
  });

  return res.status(201).json({
    message: 'Stock received successfully.',
    inventoryItemId: result.item.id,
    newQuantity: result.item.quantity,
    transactionId: result.transaction.id,
  });
}

async function transferStock(req, res) {
  const body = transferSchema.parse(req.body);
  const { tenantId, id: userId } = req.user;

  const result = await inventoryService.transferStock({ ...body, tenantId, userId });

  return res.status(200).json({
    message: 'Stock transferred successfully.',
    outTransactionId: result.outTransaction.id,
    inTransactionId: result.inTransaction.id,
    sourceQuantity: result.sourceItem.quantity,
    destQuantity: result.destItem.quantity,
  });
}

async function adjustStock(req, res) {
  const body = adjustSchema.parse(req.body);
  const { tenantId, id: userId } = req.user;

  const result = await inventoryService.adjustStock({ ...body, tenantId, userId });

  return res.status(200).json({
    message: 'Stock adjusted successfully.',
    inventoryItemId: result.item.id,
    newQuantity: result.item.quantity,
    transactionId: result.transaction.id,
  });
}

async function listInventory(req, res) {
  const { tenantId } = req.user;
  const { cursor, limit } = parsePaginationParams(req.query);
  const { locationId } = req.query;

  const result = await inventoryService.listInventory({ tenantId, locationId, cursor, limit });

  return res.status(200).json(result);
}

module.exports = { receiveStock, transferStock, adjustStock, listInventory };
