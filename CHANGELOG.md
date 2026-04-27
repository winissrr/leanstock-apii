# Changelog

## 1.0.0
- Implemented Express + Prisma LeanStock backend scaffold.
- Auth flow includes register, login, refresh, logout, JWT access tokens, refresh tokens, blacklisting, and RBAC.
- Inventory transfer uses Redis lock + serializable Prisma transaction to provide atomicity without raw SQL.
- Cursor-based pagination added to list endpoints.
- Swagger UI mounted at `/docs`.

## Notes on blueprint wording
- The inventory transfer requirement mentions `SELECT FOR UPDATE`. The implementation uses Prisma transactions at `Serializable` isolation level plus Redis locking because the application layer is restricted to Prisma ORM access.
- The register endpoint is tenant-creating for first-time bootstrap so the project is runnable without manual DB seeding.
