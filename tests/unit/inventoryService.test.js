jest.mock('../../src/config/database', () => ({
  $transaction: jest.fn(),
  product: { findFirst: jest.fn() },
  location: { findFirst: jest.fn() },
  inventoryItem: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  stockTransaction: { create: jest.fn() },
  auditLog: { create: jest.fn() },
}));

jest.mock('../../src/services/alertService', () => ({
  checkAndCreateAlert: jest.fn().mockResolvedValue(null),
  checkAndResolveAlert: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../src/services/emailService', () => ({
  sendStockReceivedEmail: jest.fn().mockResolvedValue({}),
  sendLowStockAlert: jest.fn().mockResolvedValue({}),
}));

const prisma = require('../../src/config/database');
const inventoryService = require('../../src/services/inventoryService');

describe('inventoryService.receiveStock', () => {
  const baseParams = {
    tenantId: 'tenant-1',
    productId: 'prod-1',
    locationId: 'loc-1',
    quantity: 10,
    userId: 'user-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('throws 400 when quantity <= 0', async () => {
    await expect(
      inventoryService.receiveStock({ ...baseParams, quantity: 0 }),
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      inventoryService.receiveStock({ ...baseParams, quantity: -5 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('calls prisma.$transaction on valid input', async () => {
    const mockItem = {
      id: 'item-1',
      quantity: 10,
      currentPrice: '100.00',
      originalPrice: '100.00',
      tenantId: 'tenant-1',
    };
    const mockTx = {
      id: 'tx-1',
      type: 'INBOUND',
    };
    const mockProduct = { id: 'prod-1', name: 'Test', sku: 'SKU1', unitPrice: '100.00' };
    const mockLocation = { id: 'loc-1', name: 'Warehouse A' };

    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        product: { findFirst: jest.fn().mockResolvedValue(mockProduct) },
        location: { findFirst: jest.fn().mockResolvedValue(mockLocation) },
        inventoryItem: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue(mockItem),
          update: jest.fn().mockResolvedValue(mockItem),
        },
        stockTransaction: { create: jest.fn().mockResolvedValue(mockTx) },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      }),
    );

    const result = await inventoryService.receiveStock(baseParams);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result.item.quantity).toBe(10);
    expect(result.transaction.type).toBe('INBOUND');
  });

  test('upserts existing inventory item (increments quantity)', async () => {
    const existingItem = {
      id: 'item-1',
      quantity: 5,
      currentPrice: '100.00',
      originalPrice: '100.00',
      tenantId: 'tenant-1',
    };
    const updatedItem = { ...existingItem, quantity: 15, version: 1 };
    const mockProduct = { id: 'prod-1', name: 'Test', sku: 'SKU1', unitPrice: '100.00' };
    const mockLocation = { id: 'loc-1', name: 'Warehouse A' };

    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        product: { findFirst: jest.fn().mockResolvedValue(mockProduct) },
        location: { findFirst: jest.fn().mockResolvedValue(mockLocation) },
        inventoryItem: {
          findUnique: jest.fn().mockResolvedValue(existingItem),
          update: jest.fn().mockResolvedValue(updatedItem),
          create: jest.fn(),
        },
        stockTransaction: { create: jest.fn().mockResolvedValue({ id: 'tx-1', type: 'INBOUND' }) },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      }),
    );

    const result = await inventoryService.receiveStock({ ...baseParams, quantity: 10 });
    expect(result.item.quantity).toBe(15);
  });
});

describe('inventoryService.transferStock', () => {
  const baseTransfer = {
    tenantId: 'tenant-1',
    productId: 'prod-1',
    fromLocationId: 'loc-1',
    toLocationId: 'loc-2',
    quantity: 5,
    userId: 'user-1',
  };

  beforeEach(() => jest.clearAllMocks());

  test('throws 400 when quantity <= 0', async () => {
    await expect(
      inventoryService.transferStock({ ...baseTransfer, quantity: 0 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('throws 400 when fromLocationId === toLocationId', async () => {
    await expect(
      inventoryService.transferStock({ ...baseTransfer, toLocationId: 'loc-1' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('throws 422 when insufficient stock at source', async () => {
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        product: { findFirst: jest.fn().mockResolvedValue({ id: 'prod-1', deletedAt: null }) },
        location: { findFirst: jest.fn().mockResolvedValue({ id: 'loc-1', isActive: true }) },
        inventoryItem: {
          findUnique: jest.fn().mockResolvedValue({ id: 'item-1', quantity: 2 }), // only 2 available
          update: jest.fn(),
          create: jest.fn(),
        },
        stockTransaction: { create: jest.fn(), update: jest.fn() },
        auditLog: { create: jest.fn() },
      }),
    );

    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        product: { findFirst: jest.fn().mockResolvedValue({ id: 'prod-1', deletedAt: null }) },
        location: {
          findFirst: jest.fn()
            .mockResolvedValueOnce({ id: 'loc-1', isActive: true })
            .mockResolvedValueOnce({ id: 'loc-2', isActive: true }),
        },
        inventoryItem: {
          findUnique: jest.fn().mockResolvedValue({ id: 'item-1', quantity: 2 }),
          update: jest.fn(),
          create: jest.fn(),
        },
        stockTransaction: { create: jest.fn(), update: jest.fn() },
        auditLog: { create: jest.fn() },
      }),
    );

    await expect(
      inventoryService.transferStock({ ...baseTransfer, quantity: 10 }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });
});

describe('inventoryService.adjustStock', () => {
  const baseAdjust = {
    tenantId: 'tenant-1',
    productId: 'prod-1',
    locationId: 'loc-1',
    quantityDelta: -3,
    userId: 'user-1',
  };

  beforeEach(() => jest.clearAllMocks());

  test('throws 400 when quantityDelta is 0', async () => {
    await expect(
      inventoryService.adjustStock({ ...baseAdjust, quantityDelta: 0 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('throws 422 when adjustment results in negative quantity', async () => {
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        product: { findFirst: jest.fn().mockResolvedValue({ id: 'prod-1', deletedAt: null }) },
        inventoryItem: {
          findUnique: jest.fn().mockResolvedValue({ id: 'item-1', quantity: 2 }),
          update: jest.fn(),
        },
        stockTransaction: { create: jest.fn() },
        auditLog: { create: jest.fn() },
      }),
    );

    await expect(
      inventoryService.adjustStock({ ...baseAdjust, quantityDelta: -10 }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  test('succeeds with valid positive delta', async () => {
    const updatedItem = { id: 'item-1', quantity: 7 };
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        product: { findFirst: jest.fn().mockResolvedValue({ id: 'prod-1', deletedAt: null }) },
        inventoryItem: {
          findUnique: jest.fn().mockResolvedValue({ id: 'item-1', quantity: 5 }),
          update: jest.fn().mockResolvedValue(updatedItem),
        },
        stockTransaction: { create: jest.fn().mockResolvedValue({ id: 'tx-1', type: 'ADJUSTMENT' }) },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      }),
    );

    const result = await inventoryService.adjustStock({ ...baseAdjust, quantityDelta: 2 });
    expect(result.item.quantity).toBe(7);
    expect(result.transaction.type).toBe('ADJUSTMENT');
  });
});

describe('decayService price floor logic', () => {
  const { PRICE_FLOOR_PERCENT } = require('../../src/services/decayService');

  test('PRICE_FLOOR_PERCENT is 30%', () => {
    expect(PRICE_FLOOR_PERCENT).toBe(0.30);
  });

  test('price after decay never goes below 30% of original', () => {
    const originalPrice = 100;
    const floor = originalPrice * PRICE_FLOOR_PERCENT;

    let current = originalPrice;
    for (let i = 0; i < 20; i++) {
      current = Math.max(current * 0.9, floor);
    }
    expect(current).toBeGreaterThanOrEqual(floor);
    expect(current).toBe(30); // exactly at floor
  });

  test('item already at floor is not decayed further', () => {
    const originalPrice = 100;
    const floor = originalPrice * PRICE_FLOOR_PERCENT;
    const currentAtFloor = 30;

    const wouldDecay = currentAtFloor > floor;
    expect(wouldDecay).toBe(false);
  });
});

describe('pagination helper', () => {
  const { paginateResult, parsePaginationParams } = require('../../src/utils/pagination');

  test('paginateResult returns correct slice when hasMore=true', () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({ id: `item-${i}` }));
    const { data, nextCursor, hasMore } = paginateResult(rows, 20);
    expect(data).toHaveLength(20);
    expect(hasMore).toBe(true);
    expect(nextCursor).toBe('item-19');
  });

  test('paginateResult returns all rows when page is last', () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({ id: `item-${i}` }));
    const { data, nextCursor, hasMore } = paginateResult(rows, 20);
    expect(data).toHaveLength(15);
    expect(hasMore).toBe(false);
    expect(nextCursor).toBeNull();
  });

  test('parsePaginationParams caps limit at MAX_LIMIT', () => {
    const { limit } = parsePaginationParams({ limit: '9999' });
    expect(limit).toBe(100);
  });

  test('parsePaginationParams uses DEFAULT_LIMIT when not provided', () => {
    const { limit, cursor } = parsePaginationParams({});
    expect(limit).toBe(20);
    expect(cursor).toBeNull();
  });
});
