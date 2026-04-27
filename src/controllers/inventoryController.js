const asyncHandler = require('../utils/asyncHandler');
const { receiveInventory, transferInventory, adjustInventory, listInventory } = require('../services/inventoryService');

const receive = asyncHandler(async (req, res) => {
  const result = await receiveInventory({
    tenantId: req.tenantId,
    userId: req.user.id,
    ...req.body
  });
  res.status(201).json(result);
});

const transfer = asyncHandler(async (req, res) => {
  const result = await transferInventory({
    tenantId: req.tenantId,
    userId: req.user.id,
    ...req.body
  });
  res.json(result);
});

const adjust = asyncHandler(async (req, res) => {
  const result = await adjustInventory({
    tenantId: req.tenantId,
    userId: req.user.id,
    ...req.body
  });
  res.json(result);
});

const getInventory = asyncHandler(async (req, res) => {
  const result = await listInventory({
    tenantId: req.tenantId,
    cursor: req.query.cursor || undefined,
    limit: req.query.limit ? Number(req.query.limit) : 20,
    sort: req.query.sort || 'desc'
  });
  res.json(result);
});

module.exports = { receive, transfer, adjust, getInventory };
