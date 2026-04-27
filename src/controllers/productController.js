const asyncHandler = require('../utils/asyncHandler');
const { prisma } = require('../config/database');
const { listProducts } = require('../services/inventoryService');

const createProduct = asyncHandler(async (req, res) => {
  const product = await prisma.product.create({
    data: {
      tenantId: req.tenantId,
      ...req.body
    }
  });
  res.status(201).json({ product });
});

const getProducts = asyncHandler(async (req, res) => {
  const result = await listProducts({
    tenantId: req.tenantId,
    cursor: req.query.cursor || undefined,
    limit: req.query.limit ? Number(req.query.limit) : 20,
    sort: req.query.sort || 'desc'
  });
  res.json(result);
});

module.exports = { createProduct, getProducts };
