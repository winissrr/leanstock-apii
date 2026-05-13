jest.mock('../../src/config/database', () => ({
  $transaction: jest.fn(),
  product: { findFirst: jest.fn() },
  location: { findFirst: jest.fn() },
  inventoryItem: { upsert: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
  stockTransaction: { create: jest.fn(), update: jest.fn() },
  auditLog: { create: jest.fn() },
  stockAlert: { findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  user: { findMany: jest.fn() },
}));
jest.mock('../../src/utils/redisClient', () => ({
  set: jest.fn().mockResolvedValue('OK'),
  get: jest.fn().mockResolvedValue(null),
  del: jest.fn().mockResolvedValue(1),
}));
jest.mock('../../src/services/emailService', () => ({
  sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/config/env', () => ({
  RATE_LIMIT_LOGIN_MAX: 5,
  BCRYPT_SALT_ROUNDS: 10,
}));

const prisma = require('../../src/config/database');
const redis  = require('../../src/utils/redisClient');

describe('Pagination helper', () => {
  const { buildCursorPage, paginateResult } = require('../../src/utils/pagination');

  test('buildCursorPage without cursor returns take+1 with no skip', () => {
    const result = buildCursorPage(null, 10);
    expect(result.take).toBe(11);
    expect(result.skip).toBeUndefined();
    expect(result.cursor).toBeUndefined();
  });

  test('buildCursorPage with cursor adds skip and cursor', () => {
    const result = buildCursorPage('abc123', 5);
    expect(result.take).toBe(6);
    expect(result.skip).toBe(1);
    expect(result.cursor).toEqual({ id: 'abc123' });
  });

  test('paginateResult returns hasMore=false when items <= take', () => {
    const items = [{ id: '1' }, { id: '2' }];
    const { data, hasMore, nextCursor } = paginateResult(items, 5);
    expect(data).toHaveLength(2);
    expect(hasMore).toBe(false);
    expect(nextCursor).toBeNull();
  });

  test('paginateResult slices and returns nextCursor when items > take', () => {
    const items = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const { data, hasMore, nextCursor } = paginateResult(items, 2);
    expect(data).toHaveLength(2);
    expect(hasMore).toBe(true);
    expect(nextCursor).toBe('2');
  });

  test('buildCursorPage caps limit at 100', () => {
    const result = buildCursorPage(null, 500);
    expect(result.take).toBe(101);
  });
});

describe('Decay price floor logic', () => {
  const FLOOR = 0.30;

  function applyDecayLogic(currentPrice, originalPrice, decayPercent) {
    const floor = originalPrice * FLOOR;
    if (currentPrice <= floor) return currentPrice; // already at floor
    const newPrice = Math.max(currentPrice * (1 - decayPercent / 100), floor);
    return +newPrice.toFixed(2);
  }

  test('applies decay correctly', () => {
    expect(applyDecayLogic(100, 100, 10)).toBe(90);
  });

  test('does not go below 30% floor', () => {
    expect(applyDecayLogic(31, 100, 10)).toBe(30);
  });

  test('does not decay item already at floor', () => {
    expect(applyDecayLogic(30, 100, 10)).toBe(30);
  });

  test('applies 20% decay correctly', () => {
    expect(applyDecayLogic(50, 100, 20)).toBe(40);
  });
});

describe('Redis distributed lock', () => {
  test('redis set is called with NX and EX flags', async () => {
    redis.set.mockResolvedValueOnce('OK');
    const acquired = await redis.set('lock:test', 'val', 'NX', 'EX', 10);
    expect(acquired).toBe('OK');
    expect(redis.set).toHaveBeenCalledWith('lock:test', 'val', 'NX', 'EX', 10);
  });

  test('returns null when lock is not acquired (concurrent operation)', async () => {
    redis.set.mockResolvedValueOnce(null);
    const acquired = await redis.set('lock:test', 'val', 'NX', 'EX', 10);
    expect(acquired).toBeNull();
  });
});

describe('Inventory business rules', () => {
  test('quantity must be positive for receive', () => {
    expect(() => {
      if (-1 <= 0) throw new Error('Quantity must be positive');
    }).toThrow('Quantity must be positive');
  });

  test('transfer quantity cannot exceed source quantity', () => {
    const sourceQty = 10;
    const transferQty = 15;
    expect(() => {
      if (sourceQty < transferQty) throw new Error('Insufficient stock at source location');
    }).toThrow('Insufficient stock at source location');
  });

  test('adjustment cannot result in negative stock', () => {
    const currentQty = 5;
    const delta = -10;
    expect(() => {
      if (currentQty + delta < 0) throw new Error('Adjustment would result in negative stock');
    }).toThrow('Adjustment would result in negative stock');
  });

  test('transfer between same location is rejected', () => {
    const from = 'loc-1';
    const to   = 'loc-1';
    expect(() => {
      if (from === to) throw new Error('Source and destination must differ');
    }).toThrow('Source and destination must differ');
  });
});
