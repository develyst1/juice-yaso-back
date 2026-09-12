# juice-yaso-back

Juice Yaso API v1.1 — Bun + Hono + TypeScript + PostgreSQL + Drizzle ORM.

Implements locked contracts from [juice-yaso-spec](https://github.com/develyst1/juice-yaso-spec):
`docs/contracts/api.md`, `docs/contracts/db.md`, `docs/statuses.md`, `docs/domain.md`.

## Stack

- Runtime: [Bun](https://bun.sh)
- HTTP: [Hono](https://hono.dev)
- DB: PostgreSQL + [Drizzle ORM](https://orm.drizzle.team)

## Quick start (local)

### 1. Postgres

```bash
docker compose up -d
```

Or point `DATABASE_URL` at any Postgres 14+.

### 2. Env

```bash
cp .env.example .env
# edit ADMIN_TOKEN / DATABASE_URL / PORT as needed
```

### 3. Install, migrate, seed

```bash
bun install
bun run db:setup
```

Seed creates:
- 5 flavors (orange / grape / cocoa / lychee / blueberry + `name_th`)
- pricing `5` / threshold `100` / bulk `4.5`
- editable payment-channel defaults

Deposit map (domain lock, not a config table): `30→50`, `50→90`, `60→90`, `100→150`.

### 4. Run

```bash
bun run dev
# → http://localhost:3000
curl http://localhost:3000/health
```

### 5. Smoke (optional)

```bash
bun run smoke
```

## Auth

Admin routes under `/api/v1/admin/*` require header:

```
X-Admin-Token: <ADMIN_TOKEN from env>
```

No customer login in v1.

## API (summary)

Public:
- `GET /api/v1/catalog`
- `POST /api/v1/orders`
- `GET /api/v1/queue/:queueCode`
- `POST /api/v1/queue/:queueCode/slips` (multipart `file`)
- `POST /api/v1/queue/:queueCode/cancel`

Admin (`X-Admin-Token`):
- `POST /api/v1/admin/slips/:slipId/approve|reject`
- `PATCH /api/v1/admin/orders/:orderId/status`
- `GET|PUT /api/v1/admin/config/pricing`
- `GET|PUT /api/v1/admin/config/payment-channel`
- `POST /api/v1/admin/orders/:orderId/deposit-returns`
- `GET /api/v1/admin/orders?status=`

Status enums & transitions: English codes from `statuses.md`, enforced in the service layer.

Uploaded slips / QR images are stored under `uploads/` (gitignored). Served at `/uploads/*`.

## Scripts

| Script | Purpose |
|--------|---------|
| `bun run dev` | Hot-reload server |
| `bun run start` | Production-style start |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run db:generate` | Generate Drizzle migrations |
| `bun run db:migrate` | Apply migrations |
| `bun run db:seed` | Seed flavors / pricing / payment |
| `bun run db:setup` | migrate + seed |
| `bun run smoke` | Happy-path HTTP smoke |

## Non-goals (v1)

No UI, no customer auth, no shipping, no auto-refund, no invented endpoints/tables/statuses. POST /orders uses crates[].fills[] (v1.1); legacy lines rejected.
