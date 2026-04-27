const asyncHandler = require('../utils/asyncHandler');
const { prisma } = require('../config/database');
const { listLocations } = require('../services/inventoryService');

const createLocation = asyncHandler(async (req, res) => {
  const location = await prisma.location.create({
    data: {
      tenantId: req.tenantId,
      ...req.body
    }
  });
  res.status(201).json({ location });
});

const getLocations = asyncHandler(async (req, res) => {
  const items = await listLocations({ tenantId: req.tenantId });
  res.json({ items });
});

module.exports = { createLocation, getLocations };
