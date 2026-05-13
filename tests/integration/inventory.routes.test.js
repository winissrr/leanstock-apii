const request = require('supertest');

jest.mock('../../src/config/database', () => ({
  $connect: jest.fn().mockResolvedValue(undefined),
  $transaction: jest.fn(),
  product: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  location: { findFirst: jest.fn() },
  inventoryItem: { findMany: jest.fn(), upsert: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  stockTransaction: { create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
  auditLog: { create: jest.fn() },
  stockAlert: { findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn(), findMany: jest.fn() },
  user: { findMany: jest.fn() },
  refreshToken: { create: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
}));
jest.mock('../../src/utils/redisClient', () => ({
  set: jest.fn().mockResolvedValue('OK'),
  get: jest.fn().mockResolvedValue(null),
  del: jest.fn().mockResolvedValue(1),
  on: jest.fn(),
}));
jest.mock('../../src/services/emailService', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendStaffInviteEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/jobs/decayCron', () => ({ startDecayCron: jest.fn() }));

process.env.JWT_SECRET = 'test_secret_that_is_at_least_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_at_least_32_characters_long';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.SMTP_USER = 'test@test.com';
process.env.SMTP_PASS = 'testpass';
process.env.ACCESS_TOKEN_TTL = '15m';
process.env.REFRESH_TOKEN_TTL = '7d';

const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const prisma = require('../../src/config/database');

function makeToken(overrides = {}) {
  return jwt.sign(
    { sub: 'user-1', tenantId: 'tenant-1', role: 'MANAGER', email: 'mgr@test.com', ...overrides },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
}

describe('GET /health', () => {
  it('returns 200 ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('GET /inventory', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/inventory');
    expect(res.status).toBe(401);
  });

  it('returns paginated inventory with valid token', async () => {
    prisma.inventoryItem.findMany.mockResolvedValue([
      { id: 'inv-1', productId: 'p-1', locationId: 'l-1', quantity: 50, product: { name: 'Widget' }, location: { name: 'WH A' } },
    ]);
    const res = await request(app)
      .get('/inventory')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });
});

describe('POST /inventory/receive', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post('/inventory/receive').send({});
    expect(res.status).toBe(401);
  });

  it('returns 422 with invalid body', async () => {
    const res = await request(app)
      .post('/inventory/receive')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ productId: 'p-1' }); // missing required fields
    expect(res.status).toBe(422);
  });
});

describe('POST /inventory/transfer', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post('/inventory/transfer').send({});
    expect(res.status).toBe(401);
  });
});

describe('GET /products', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/products');
    expect(res.status).toBe(401);
  });

  it('returns products list for authenticated user', async () => {
    prisma.product.findMany.mockResolvedValue([
      { id: 'p-1', sku: 'SKU-001', name: 'Test Product', tenantId: 'tenant-1' },
    ]);
    const res = await request(app)
      .get('/products')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });
});

describe('GET /reports/valuation', () => {
  it('returns 403 for STAFF role', async () => {
    const res = await request(app)
      .get('/reports/valuation')
      .set('Authorization', `Bearer ${makeToken({ role: 'STAFF' })}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 for MANAGER role', async () => {
    prisma.inventoryItem.findMany.mockResolvedValue([]);
    const res = await request(app)
      .get('/reports/valuation')
      .set('Authorization', `Bearer ${makeToken({ role: 'MANAGER' })}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });
});

describe('GET /alerts', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/alerts');
    expect(res.status).toBe(401);
  });
});

describe('RBAC enforcement', () => {
  it('POST /products returns 403 for STAFF', async () => {
    const res = await request(app)
      .post('/products')
      .set('Authorization', `Bearer ${makeToken({ role: 'STAFF' })}`)
      .send({ sku: 'X', name: 'Y', unitPrice: 10 });
    expect(res.status).toBe(403);
  });

  it('DELETE /locations/:id returns 403 for STAFF', async () => {
    const res = await request(app)
      .delete('/locations/some-id')
      .set('Authorization', `Bearer ${makeToken({ role: 'STAFF' })}`);
    expect(res.status).toBe(403);
  });
});
