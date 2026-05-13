# LeanStock API

Production-grade multi-tenant inventory management backend built with **Express.js**, **Prisma ORM**, **PostgreSQL**, and **Redis**.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Express.js 4.x |
| ORM | Prisma 5.x (no raw SQL) |
| Database | PostgreSQL 15+ |
| Cache / Locks | Redis (ioredis) |
| Auth | JWT (access 15m + refresh 7d) |
| Email | Nodemailer (SMTP) |
| Background Jobs | node-cron |
| Validation | Zod |
| Testing | Jest + Supertest |
| Docs | Swagger UI (/docs) |

---

## Prerequisites

- Node.js >= 18
- PostgreSQL 15+
- Redis 7+

---

## Setup Instructions

### 1. Clone and install

```bash
git clone <your-repo-url>
cd leanstock-api
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your real values:

```env
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/leanstock
REDIS_URL=redis://localhost:6379
JWT_SECRET=<at least 32 random characters>
JWT_REFRESH_SECRET=<at least 32 different random characters>
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_gmail_app_password
```

> **Gmail App Password**: Go to Google Account → Security → 2-Step Verification → App Passwords → generate one for "Mail".

### 3. Run database migrations

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 4. (Optional) Seed demo data

```bash
npm run db:seed
```

This creates a demo tenant with three ready-to-use accounts:

| Email | Password | Role |
|---|---|---|
| admin@demo.com | Admin1234 | ADMIN |
| manager@demo.com | Admin1234 | MANAGER |
| staff@demo.com | Admin1234 | STAFF |

### 5. Start the server

```bash
# Development (with auto-restart)
npm run dev

# Production
npm start
```

Server starts on `http://localhost:8000`  
Swagger UI available at `http://localhost:8000/docs`

---

## Running Tests

```bash
# All tests
npm test

# With coverage report
npm run test:coverage
```

---

## API Overview

### Auth Endpoints

| Method | Path | Description |
|---|---|---|
| POST | /auth/register | Register new tenant + admin |
| GET | /auth/verify-email?token= | Verify email address |
| POST | /auth/login | Login, receive tokens |
| POST | /auth/refresh | Rotate refresh token |
| POST | /auth/logout | Revoke tokens |
| POST | /auth/forgot-password | Request password reset email |
| POST | /auth/reset-password | Set new password with token |
| POST | /auth/invite | Invite staff member (MANAGER+) |
| POST | /auth/accept-invite | Set password from invite link |

### Business Endpoints

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | /products | ALL | List products (paginated) |
| POST | /products | ADMIN, MANAGER | Create product |
| GET | /products/:id | ALL | Get product |
| PATCH | /products/:id | ADMIN, MANAGER | Update product |
| DELETE | /products/:id | ADMIN, MANAGER | Soft-delete product |
| GET | /inventory | ALL | List inventory items |
| POST | /inventory/receive | ALL | Receive inbound stock |
| POST | /inventory/transfer | ALL | Transfer between locations |
| POST | /inventory/adjust | ALL | Adjust stock (shrinkage etc.) |
| GET | /locations | ALL | List locations |
| POST | /locations | ADMIN, MANAGER | Create location |
| GET | /locations/:id | ALL | Get location |
| PATCH | /locations/:id | ADMIN, MANAGER | Update location |
| DELETE | /locations/:id | ADMIN, MANAGER | Soft-delete location |
| GET | /transactions | ALL | List transactions (filtered) |
| GET | /alerts | ALL | List stock alerts |
| PATCH | /alerts/:id | ADMIN, MANAGER | Update alert status |
| GET | /reports/valuation | ADMIN, MANAGER | Inventory valuation report |

---

## Architecture Decisions

### Why cursor-based pagination?
`OFFSET` pagination forces the DB to scan and discard rows on every deep page. Cursor-based pagination uses `WHERE id > :cursor ORDER BY id LIMIT n` — O(log n) with the PK index regardless of page depth.

### Why Prisma transactions with Serializable isolation?
All inventory mutations (receive, transfer, adjust) run inside `prisma.$transaction(..., { isolationLevel: 'Serializable' })`. This prevents phantom reads and lost updates without raw `SELECT FOR UPDATE` (which would violate the ORM-only constraint).

### Why Redis distributed lock?
For high-throughput endpoints, Serializable transactions alone can cause retry storms. A Redis `SET NX EX` lock (Redlock-lite) serializes concurrent requests for the same inventory item before they even reach the DB, reducing transaction aborts.

### Multi-tenancy
Row-level security enforced at the application layer: every service call scopes queries with `WHERE tenantId = :tenantId`. The `tenantScope` middleware injects `req.tenantId` from the verified JWT on every request.

### Background Decay Job
`node-cron` runs `applyDecay()` daily at 02:00 UTC (configurable via `DECAY_CRON` env var). Decay applies a configurable percentage reduction to `currentPrice` per product, down to a 30% floor of `originalPrice`. Every decay action creates a `DecayLog` record for audit.

---

## Email Events (3 required by spec)

1. **Email Verification** — sent on registration, must be clicked before login
2. **Password Reset** — sent on forgot-password request, expires in 1 hour
3. **Low-Stock Alert** — sent to all MANAGER/ADMIN users when stock drops below `reorderThreshold`
4. **Staff Invitation** — sent when Manager invites a new team member

---

## Defense Postman Flow

1. `POST /auth/register` → check email inbox → click verify link
2. `POST /auth/login` → copy `accessToken`
3. Set Bearer token in Postman collection variables
4. `POST /locations` → create Warehouse A
5. `POST /products` → create a product with `reorderThreshold: 10`
6. `POST /inventory/receive` → receive 5 units (triggers low-stock alert + email)
7. `GET /alerts` → see ACTIVE alert
8. `POST /inventory/receive` → receive 20 more units (alert auto-resolves)
9. `POST /inventory/transfer` → move stock between locations
10. `POST /inventory/adjust` → record shrinkage
11. `GET /transactions` → view full history
12. `GET /reports/valuation` → see aggregated report
13. `POST /auth/refresh` → rotate tokens
14. `GET /docs` → show Swagger UI

