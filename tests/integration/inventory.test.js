const request = require('supertest');
const app = require('../../src/app');
const { prisma } = require('../../src/config/database');

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function bootstrapAdmin() {
  const slug = unique('tenant');
  const email = `${unique('admin')}@test.local`;

  const registerResponse = await request(app)
    .post('/auth/register')
    .send({
      tenantName: 'Inventory Tenant',
      tenantSlug: slug,
      firstName: 'Mira',
      lastName: 'K',
      email,
      password: 'StrongPass1',
      role: 'ADMIN'
    });

  return {
    slug,
    email,
    token: registerResponse.body.accessToken
  };
}

describe('inventory integration', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('receive and transfer stock atomically', async () => {
    const admin = await bootstrapAdmin();

    const productResponse = await request(app)
      .post('/products')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        sku: `SKU-${Date.now()}`,
        name: 'Rice Bag',
        unitPrice: 12.5,
        reorderThreshold: 4,
        isDecayEnabled: true,
        decayDaysThreshold: 7,
        decayPercent: 10
      });

    expect(productResponse.statusCode).toBe(201);

    const locationA = await request(app)
      .post('/locations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Warehouse A', address: 'A street' });

    const locationB = await request(app)
      .post('/locations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Warehouse B', address: 'B street' });

    const productId = productResponse.body.product.id;
    const fromLocationId = locationA.body.location.id;
    const toLocationId = locationB.body.location.id;

    const receiveResponse = await request(app)
      .post('/inventory/receive')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        productId,
        locationId: fromLocationId,
        quantity: 10,
        supplierRef: 'SUP-1'
      });

    expect(receiveResponse.statusCode).toBe(201);

    const transferResponse = await request(app)
      .post('/inventory/transfer')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        productId,
        fromLocationId,
        toLocationId,
        quantity: 4,
        note: 'Move stock'
      });

    expect(transferResponse.statusCode).toBe(200);

    const inventory = await prisma.inventoryItem.findMany({
      where: { productId }
    });

    const source = inventory.find((i) => i.locationId === fromLocationId);
    const destination = inventory.find((i) => i.locationId === toLocationId);

    expect(source.quantity).toBe(6);
    expect(destination.quantity).toBe(4);
  });
});
