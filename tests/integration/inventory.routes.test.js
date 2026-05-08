const request = require('supertest');
const prisma = require('../../src/config/database');
const app = require('../../src/app');
const jwt = require('jsonwebtoken');
const env = require('../../src/config/env');

let tenantId;
let adminUser;
let adminToken;
let productId;
let locationId;

function makeToken(user) {
  return jwt.sign(
    { sub: user.id, tenantId: user.tenantId, role: user.role, email: user.email },
    env.JWT_SECRET,
    { expiresIn: '1h' },
  );
}

beforeAll(async () => {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'integration-test-tenant' },
    update: {},
    create: { name: 'Integration Test Tenant', slug: 'integration-test-tenant' },
  });
  tenantId = tenant.id;
  adminUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email: 'admin@test.com' } },
    update: { isVerified: true, role: 'ADMIN' },
    create: {
      tenantId,
      email: 'admin@test.com',
      passwordHash: '$2a$04$XvzFhAvAW.2r8mW5dZ/Y.OIvl5HcZjjFwLBT4lMiQIX6Hh9KcEVHG',
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      isVerified: true,
    },
  });

  adminToken = makeToken(adminUser);

  const loc = await prisma.location.upsert({
    where: { tenantId_name: { tenantId, name: 'Test Warehouse' } },
    update: {},
    create: { tenantId, name: 'Test Warehouse', address: '123 Test St' },
  });
  locationId = loc.id;

  const prod = await prisma.product.upsert({
    where: { tenantId_sku: { tenantId, sku: 'TEST-SKU-001' } },
    update: {},
    create: {
      tenantId,
      sku: 'TEST-SKU-001',
      name: 'Integration Test Product',
      unitPrice: '99.99',
      reorderThreshold: 5,
    },
  });
  productId = prod.id;
});

afterAll(async () => {
  await prisma.stockAlert.deleteMany({ where: { tenantId } });
  await prisma.decayLog.deleteMany({ where: { tenantId } });
  await prisma.auditLog.deleteMany({ where: { tenantId } });
  await prisma.stockTransaction.deleteMany({ where: { tenantId } });
  await prisma.inventoryItem.deleteMany({ where: { tenantId } });
  await prisma.product.deleteMany({ where: { tenantId } });
  await prisma.location.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('GET /api/inventory', () => {
  test('returns 401 without token', async () => {
    const res = await request(app).get('/api/inventory');
    expect(res.status).toBe(401);
  });

  test('returns 200 with valid token', async () => {
    const res = await request(app)
      .get('/api/inventory')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('supports cursor pagination params', async () => {
    const res = await request(app)
      .get('/api/inventory?limit=5')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('hasMore');
    expect(res.body).toHaveProperty('nextCursor');
  });
});

describe('POST /api/inventory/receive', () => {
  test('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/inventory/receive')
      .send({ productId, locationId, quantity: 10 });
    expect(res.status).toBe(401);
  });

  test('returns 422 on invalid input', async () => {
    const res = await request(app)
      .post('/api/inventory/receive')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, locationId }); 
    expect(res.status).toBe(422);
    expect(res.body.errors).toBeDefined();
  });

  test('returns 201 on valid receive', async () => {
    const res = await request(app)
      .post('/api/inventory/receive')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, locationId, quantity: 20, supplierRef: 'PO-001' });
    expect(res.status).toBe(201);
    expect(res.body.newQuantity).toBe(20);
    expect(res.body.transactionId).toBeDefined();
  });

  test('increments quantity on second receive', async () => {
    const res = await request(app)
      .post('/api/inventory/receive')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, locationId, quantity: 5 });
    expect(res.status).toBe(201);
    expect(res.body.newQuantity).toBe(25); // 20 + 5
  });
});

describe('POST /api/inventory/transfer', () => {
  let toLocationId;

  beforeAll(async () => {
    const loc = await prisma.location.upsert({
      where: { tenantId_name: { tenantId, name: 'Secondary Warehouse' } },
      update: {},
      create: { tenantId, name: 'Secondary Warehouse' },
    });
    toLocationId = loc.id;
  });

  test('returns 400 when same source/dest location', async () => {
    const res = await request(app)
      .post('/api/inventory/transfer')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, fromLocationId: locationId, toLocationId: locationId, quantity: 5 });
    expect(res.status).toBe(400);
  });

  test('returns 422 when insufficient stock', async () => {
    const res = await request(app)
      .post('/api/inventory/transfer')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, fromLocationId: locationId, toLocationId, quantity: 9999 });
    expect(res.status).toBe(422);
  });

  test('transfers stock successfully', async () => {
    const res = await request(app)
      .post('/api/inventory/transfer')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, fromLocationId: locationId, toLocationId, quantity: 5 });
    expect(res.status).toBe(200);
    expect(res.body.outTransactionId).toBeDefined();
    expect(res.body.inTransactionId).toBeDefined();
    expect(res.body.sourceQuantity).toBe(20); // 25 - 5
    expect(res.body.destQuantity).toBe(5);
  });
});

describe('POST /api/inventory/adjust', () => {
  test('returns 422 on negative result', async () => {
    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, locationId, quantityDelta: -9999 });
    expect(res.status).toBe(422);
  });

  test('returns 400 when delta is 0', async () => {
    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, locationId, quantityDelta: 0 });
    expect(res.status).toBe(422); 
  });

  test('adjusts inventory correctly', async () => {
    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, locationId, quantityDelta: -3, note: 'Damaged goods' });
    expect(res.status).toBe(200);
    expect(res.body.newQuantity).toBe(17); 
  });
});

describe('RBAC enforcement', () => {
  let staffToken;

  beforeAll(async () => {
    const staff = await prisma.user.upsert({
      where: { tenantId_email: { tenantId, email: 'staff@test.com' } },
      update: {},
      create: {
        tenantId,
        email: 'staff@test.com',
        passwordHash: 'hash',
        firstName: 'Staff',
        lastName: 'User',
        role: 'STAFF',
        isVerified: true,
      },
    });
    staffToken = makeToken(staff);
  });

  test('STAFF cannot receive stock (403)', async () => {
    const res = await request(app)
      .post('/api/inventory/receive')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ productId, locationId, quantity: 5 });
    expect(res.status).toBe(403);
  });

  test('STAFF can list inventory (200)', async () => {
    const res = await request(app)
      .get('/api/inventory')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
  });
});

describe('GET /health', () => {
  test('returns 200 with ok status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
