CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'STAFF');
CREATE TYPE "TransactionType" AS ENUM ('INBOUND', 'OUTBOUND', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT');
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'SNOOZED');

CREATE TABLE "Tenant" (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" timestamp(3)
);

CREATE TABLE "User" (
  id text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "Tenant"(id) ON DELETE RESTRICT,
  email text NOT NULL,
  "passwordHash" text NOT NULL,
  role "Role" NOT NULL DEFAULT 'STAFF',
  "firstName" text NOT NULL,
  "lastName" text NOT NULL,
  "isActive" boolean NOT NULL DEFAULT true,
  "loginAttempts" integer NOT NULL DEFAULT 0,
  "lockedUntil" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" timestamp(3)
);

CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", email);
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");
CREATE INDEX "User_email_idx" ON "User"(email);

CREATE TABLE "Location" (
  id text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "Tenant"(id) ON DELETE RESTRICT,
  name text NOT NULL,
  address text,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" timestamp(3)
);
CREATE UNIQUE INDEX "Location_tenantId_name_key" ON "Location"("tenantId", name);
CREATE INDEX "Location_tenantId_idx" ON "Location"("tenantId");

CREATE TABLE "Product" (
  id text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "Tenant"(id) ON DELETE RESTRICT,
  sku text NOT NULL,
  name text NOT NULL,
  description text,
  category text,
  "unitPrice" numeric(12,2) NOT NULL,
  "reorderThreshold" integer NOT NULL DEFAULT 0,
  "isDecayEnabled" boolean NOT NULL DEFAULT false,
  "decayDaysThreshold" integer NOT NULL DEFAULT 30,
  "decayPercent" numeric(5,2) NOT NULL DEFAULT 10,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" timestamp(3)
);
CREATE UNIQUE INDEX "Product_tenantId_sku_key" ON "Product"("tenantId", sku);
CREATE INDEX "Product_tenantId_idx" ON "Product"("tenantId");
CREATE INDEX "Product_tenantId_category_idx" ON "Product"("tenantId", category);

CREATE TABLE "InventoryItem" (
  id text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "productId" text NOT NULL REFERENCES "Product"(id) ON DELETE RESTRICT,
  "locationId" text NOT NULL REFERENCES "Location"(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 0,
  "currentPrice" numeric(12,2) NOT NULL,
  "originalPrice" numeric(12,2) NOT NULL,
  version integer NOT NULL DEFAULT 0,
  "lastReceivedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "InventoryItem_productId_locationId_key" ON "InventoryItem"("productId", "locationId");
CREATE INDEX "InventoryItem_tenantId_idx" ON "InventoryItem"("tenantId");
CREATE INDEX "InventoryItem_tenantId_locationId_idx" ON "InventoryItem"("tenantId", "locationId");
CREATE INDEX "InventoryItem_lastReceivedAt_idx" ON "InventoryItem"("lastReceivedAt");

CREATE TABLE "StockTransaction" (
  id text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "productId" text NOT NULL,
  "locationId" text NOT NULL,
  "inventoryItemId" text REFERENCES "InventoryItem"(id) ON DELETE SET NULL,
  "userId" text NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  type "TransactionType" NOT NULL,
  "quantityDelta" integer NOT NULL,
  note text,
  "supplierRef" text,
  "relatedTxId" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "StockTransaction_tenantId_idx" ON "StockTransaction"("tenantId");
CREATE INDEX "StockTransaction_tenantId_productId_idx" ON "StockTransaction"("tenantId", "productId");
CREATE INDEX "StockTransaction_tenantId_createdAt_idx" ON "StockTransaction"("tenantId", "createdAt");

CREATE TABLE "StockAlert" (
  id text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "inventoryItemId" text NOT NULL REFERENCES "InventoryItem"(id) ON DELETE RESTRICT,
  status "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" timestamp(3)
);
CREATE INDEX "StockAlert_tenantId_status_idx" ON "StockAlert"("tenantId", status);

CREATE TABLE "DecayLog" (
  id text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "inventoryItemId" text NOT NULL REFERENCES "InventoryItem"(id) ON DELETE RESTRICT,
  "priceBeforeDecay" numeric(12,2) NOT NULL,
  "priceAfterDecay" numeric(12,2) NOT NULL,
  "appliedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "DecayLog_tenantId_appliedAt_idx" ON "DecayLog"("tenantId", "appliedAt");

CREATE TABLE "AuditLog" (
  id text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "Tenant"(id) ON DELETE RESTRICT,
  "userId" text NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  action text NOT NULL,
  "entityType" text NOT NULL,
  "entityId" text NOT NULL,
  "oldValue" jsonb,
  "newValue" jsonb,
  "ipAddress" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");
CREATE INDEX "AuditLog_tenantId_entityType_entityId_idx" ON "AuditLog"("tenantId", "entityType", "entityId");

CREATE TABLE "RefreshToken" (
  id text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  "tokenHash" text NOT NULL UNIQUE,
  "expiresAt" timestamp(3) NOT NULL,
  "revokedAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
