# LeanStock API

Express.js + Prisma backend for multi-tenant inventory management.

## What is included

- JWT authentication with access + refresh tokens
- Refresh token revocation and access-token blacklist
- RBAC for `ADMIN`, `MANAGER`, and `STAFF`
- Redis-based rate limiting on `/auth/register` and `/auth/login`
- Multi-tenant product, location, and inventory endpoints
- Atomic inventory transfer and receive flows
- Dead stock decay cron job
- Swagger UI at `/docs`
- Jest tests
- Docker Compose for PostgreSQL + Redis + app

## Setup

1. Copy `.env.example` to `.env`
2. Fill in real secrets:
   - `DATABASE_URL`
   - `REDIS_URL`
   - `JWT_SECRET`
   - `JWT_REFRESH_SECRET`
3. Start the stack:

```bash
docker compose up --build
```

4. Open:
   - API: `http://localhost:8000`
   - Docs: `http://localhost:8000/docs`

## Migrations

Apply schema:

```bash
npx prisma migrate deploy
```

For development:

```bash
npx prisma migrate dev --name init
```

## Test commands

```bash
npm test
npm run lint
```

## Notes

- Every tenant-scoped route filters by `tenantId` from the verified JWT.
- Refresh tokens are stored hashed in the database and can be revoked on logout.
- Transfer logic uses a Redis lock plus a serializable Prisma transaction.
