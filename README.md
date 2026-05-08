# LeanStock API

Production-grade multi-tenant inventory management backend built with **Express.js**, **Prisma ORM**, **PostgreSQL 15**, and **Redis**.

---

## Tech Stack

| Layer | Technology | Justification |
|---|---|---|
| Framework | Express.js (Node.js) | Non-blocking I/O; ideal for many concurrent short-lived inventory queries |
| ORM | Prisma | Type-safe queries, migration history, no raw SQL in app code |
| Database | PostgreSQL 15 | ACID transactions, row-level security, advanced indexing |
| Cache / Queue | Redis (ioredis) | JWT blacklist, rate limiter counters |
| Background Jobs | node-cron | Lightweight cron scheduler for daily decay job |
| Validation | Zod | Runtime schema validation with TypeScript-level safety |
| Email | Nodemailer | SMTP-agnostic email delivery (Gmail, SendGrid, Mailgun) |
| Auth | JWT (RS256-style) | Stateless, scalable, with refresh token rotation |

---

## Quick Start

### Prerequisites

- Node.js ≥ 18
- PostgreSQL 15
- Redis 7

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/leanstock-api.git
cd leanstock-api
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your real values
# Generate secrets: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Required `.env` keys:

| Key | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | ≥32 chars — access token signing |
| `JWT_REFRESH_SECRET` | ≥32 chars — refresh token signing |
| `SMTP_HOST/PORT/USER/PASS` | Email delivery |
| `EMAIL_FROM` | Sender address |
| `APP_URL` | Base URL for email verification links |

### 3. Run database migrations

```bash
npx prisma migrate deploy   # production
# or
npx prisma migrate dev      # development (creates migration files)
npx prisma generate         # regenerate Prisma client
```

### 4. Start the server

```bash
npm run dev     # development (node --watch)
npm start       # production
```

API docs available at: **http://localhost:8000/docs**

---

## Docker Compose

```bash
docker-compose up --build
```

The compose file starts PostgreSQL 15, Redis 7, and the app container. Migrations run automatically on app startup.

---

## Running Tests

```bash
npm test                  # all tests
npm run test:coverage     # with coverage report
```

Unit tests mock Prisma and Redis — no external services needed.  
Integration tests require a running PostgreSQL and Redis instance (see `.env` for `DATABASE_URL`).

---

## API Overview

All API routes are prefixed with `/api`. Full documentation at `/docs` (Swagger UI).

| Resource | Endpoint | Roles |
|---|---|---|
| Auth | `POST /api/auth/register` | Public |
| Auth | `POST /api/auth/login` | Public |
| Auth | `POST /api/auth/refresh` | Public |
| Auth | `POST /api/auth/logout` | Authenticated |
| Auth | `GET /api/auth/verify-email` | Public |
| Auth | `POST /api/auth/forgot-password` | Public |
| Auth | `POST /api/auth/reset-password` | Public |
| Products | `GET/POST /api/products` | All / ADMIN+MANAGER |
| Products | `GET/PATCH/DELETE /api/products/:id` | All / ADMIN+MANAGER / ADMIN |
| Inventory | `GET /api/inventory` | All |
| Inventory | `POST /api/inventory/receive` | ADMIN, MANAGER |
| Inventory | `POST /api/inventory/transfer` | All |
| Inventory | `POST /api/inventory/adjust` | ADMIN, MANAGER |
| Locations | `GET/POST /api/locations` | All / ADMIN+MANAGER |
| Transactions | `GET /api/transactions` | All |
| Alerts | `GET /api/alerts` | All |
| Alerts | `PATCH /api/alerts/:id` | ADMIN, MANAGER |
| Reports | `GET /api/reports/valuation` | ADMIN, MANAGER |
| Reports | `POST /api/reports/decay/trigger` | ADMIN |
| Reports | `GET /api/reports/audit` | ADMIN |

---

## Architecture Decisions

### Multi-tenancy
Row-Level Security at the application layer: every Prisma query includes `WHERE tenantId = :tenantId` derived from the JWT. Indexes on `tenantId` columns ensure O(log n) lookups.

### Cursor-based Pagination
OFFSET pagination degrades on large tables (O(n) scan to skip rows). All list endpoints use keyset pagination: `WHERE id > :cursor ORDER BY id LIMIT :n`, which is O(log n) with the PK index.

### ACID Transactions
All inventory mutations (receive, transfer, adjust) are wrapped in `prisma.$transaction({ isolationLevel: 'Serializable' })`. This prevents race conditions (double-spend, over-transfer) without raw `SELECT FOR UPDATE` SQL.

### Dead Stock Decay
The `decayCron` job runs daily at 02:00 UTC (configurable via `DECAY_CRON`). It:
1. Finds inventory items where `isDecayEnabled = true` AND `lastReceivedAt < now - decayDaysThreshold`
2. Applies `currentPrice = MAX(currentPrice × (1 - decayPercent/100), originalPrice × 0.30)`
3. Records each event in `DecayLog`
4. Notifies ADMIN/MANAGER users via email

The 30% price floor prevents unlimited decay.

### Email Queue
All email sends are fire-and-forget (`async fn().catch(() => {})`). The API endpoint responds immediately without blocking on SMTP. In production, you can replace the direct Nodemailer call with a BullMQ/Redis job queue for guaranteed delivery.

### JWT Security
- Access tokens expire in 15 minutes (configurable)
- Refresh tokens are stored hashed in PostgreSQL with expiry
- On logout, access tokens are blacklisted in Redis until natural expiry
- On password reset, all refresh tokens for the user are purged
- Account lockout: 5 failed attempts → 15-minute lock

---

## Business Workflows

### 1. Onboarding a Tenant
```
POST /api/auth/register (first user on slug → ADMIN role, tenant created)
→ Receive verification email
GET /api/auth/verify-email?token=...
POST /api/auth/login
```

### 2. Receiving Stock
```
POST /api/inventory/receive { productId, locationId, quantity, supplierRef }
→ InventoryItem upserted (ACID)
→ StockTransaction (INBOUND) created
→ AuditLog entry created
→ Low-stock alert resolved if applicable
→ Email confirmation sent
```

### 3. Transferring Between Warehouses
```
POST /api/inventory/transfer { productId, fromLocationId, toLocationId, quantity }
→ Source decremented, destination incremented (Serializable tx)
→ Paired TRANSFER_OUT / TRANSFER_IN transactions linked by relatedTxId
→ Low-stock alert triggered on source if below threshold
```

### 4. Dead Stock Decay (Background)
```
Daily cron at 02:00 UTC
→ Find items: isDecayEnabled=true AND lastReceivedAt < now - decayDaysThreshold
→ Apply: currentPrice = MAX(currentPrice × 0.9, originalPrice × 0.30)
→ Record DecayLog entry
→ Email ADMIN/MANAGER notification
```

---

## Environment Variables Reference

See `.env.example` for the complete list with descriptions.

---

## Migration History

Migrations are in `prisma/migrations/`. Run `npx prisma migrate status` to check applied migrations.

```bash
npx prisma migrate dev --name <description>  # create new migration
npx prisma migrate deploy                     # apply in production
npx prisma migrate reset                      # reset (dev only — destroys data)
```
