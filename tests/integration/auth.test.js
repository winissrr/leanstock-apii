const request = require('supertest');
const app = require('../../src/app');
const { prisma } = require('../../src/config/database');

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

describe('auth integration', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('register, login, me, and enforce 403 on wrong role', async () => {
    const slug = unique('tenant');
    const email = `${unique('user')}@test.local`;

    const registerResponse = await request(app)
      .post('/auth/register')
      .send({
        tenantName: 'Test Tenant',
        tenantSlug: slug,
        firstName: 'Ana',
        lastName: 'Lee',
        email,
        password: 'StrongPass1',
        role: 'STAFF'
      });

    expect(registerResponse.statusCode).toBe(201);
    expect(registerResponse.body.accessToken).toBeDefined();

    const meResponse = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${registerResponse.body.accessToken}`);

    expect(meResponse.statusCode).toBe(200);
    expect(meResponse.body.user.email).toBe(email);

    const missingTokenResponse = await request(app).get('/auth/me');
    expect(missingTokenResponse.statusCode).toBe(401);

    const loginResponse = await request(app)
      .post('/auth/login')
      .send({
        tenantSlug: slug,
        email,
        password: 'StrongPass1'
      });

    expect(loginResponse.statusCode).toBe(200);

    const forbiddenResponse = await request(app)
      .post('/products')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .send({
        sku: 'SKU-001',
        name: 'Sample Product',
        unitPrice: 10,
        reorderThreshold: 5
      });

    expect(forbiddenResponse.statusCode).toBe(403);
  });
});
