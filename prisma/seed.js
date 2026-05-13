require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const passwordHash = await bcrypt.hash('Admin1234', 10);

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-tenant' },
    update: {},
    create: {
      name: 'Demo Company',
      slug: 'demo-tenant',
      users: {
        create: [
          { email: 'admin@demo.com', passwordHash, role: 'ADMIN', firstName: 'Alice', lastName: 'Admin', emailVerified: true },
          { email: 'manager@demo.com', passwordHash, role: 'MANAGER', firstName: 'Bob', lastName: 'Manager', emailVerified: true },
          { email: 'staff@demo.com', passwordHash, role: 'STAFF', firstName: 'Carol', lastName: 'Staff', emailVerified: true },
        ],
        
      },
      locations: {
        create: [
          { name: 'Warehouse A', address: '123 Main St' },
          { name: 'Warehouse B', address: '456 Side Ave' },
        ],
      },
      products: {
        create: [
          { sku: 'PROD-001', name: 'Widget Alpha', category: 'Electronics', unitPrice: 29.99, reorderThreshold: 10, isDecayEnabled: true, decayDaysThreshold: 30, decayPercent: 10 },
          { sku: 'PROD-002', name: 'Gadget Beta', category: 'Electronics', unitPrice: 49.99, reorderThreshold: 5 },
          { sku: 'PROD-003', name: 'Component Gamma', category: 'Parts', unitPrice: 9.99, reorderThreshold: 20 },
        ],
      },
    },
  });

  console.log('✅ Seed complete! Demo accounts:');
  console.log('   admin@demo.com   / Admin1234  (ADMIN)');
  console.log('   manager@demo.com / Admin1234  (MANAGER)');
  console.log('   staff@demo.com   / Admin1234  (STAFF)');
}

main().catch(console.error).finally(() => prisma.$disconnect());
