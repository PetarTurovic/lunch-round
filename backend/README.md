# LunchRound — Backend

Node + TypeScript + [Express 5](https://expressjs.com/) + Mongoose.

Two domains live in this database:

- **Catalogue** — stores and their menus, harvested from delivery platforms.
  See [docs/database-design.md](docs/database-design.md).
- **Rounds** — the share link, who joined, what they ordered and the split bill.
  This is the part the product is for. See [docs/order-domain.md](docs/order-domain.md).

## Structure

```
backend/
├── docs/
│   ├── database-design.md   # catalogue schema, v1 problems, index plan
│   └── order-domain.md      # the round aggregate, the cents rule, allocation
├── tests/
│   └── settlement.test.ts   # money rules, including the reconciliation invariant
└── src/
    ├── server.ts            # bootstrap, Mongo connect, graceful shutdown
    ├── app.ts               # middleware, probes, routers, SPA static fallback
    ├── config.ts            # env; fails fast if JWT_SECRET is missing in production
    ├── errors.ts            # AppError hierarchy + error middleware
    ├── auth.middleware.ts   # JWT auth, round resolution, participant session
    ├── rate-limit.ts        # dependency-free fixed-window limiter
    └── features/
        ├── stores/          # catalogue: model, controller, routes
        ├── rounds/          # model, service (atomic writes), controller,
        │                    # routes, settlement (pure maths)
        └── users/           # optional accounts
```

Each feature folder is `*.model.ts` (schema and indexes), `*.controller.ts`
(handlers), `*.routes.ts` (router), and — where there is real data access —
`*.service.ts`. The round feature splits its money maths into `settlement.ts`,
a pure module with no database access, so it can be tested directly.

## Express 5 notes

- Handlers are plain `async` functions. Express 5 forwards rejected promises to
  the error middleware, so controllers `throw new NotFoundError(...)` directly.
- The error handler in [src/errors.ts](src/errors.ts) maps `AppError` to its
  status, Zod and Mongoose `ValidationError` to 400, a Mongo `$jsonSchema`
  rejection (code 121) to 400, and everything else to 500.

## API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health/live` | Liveness probe — process only |
| GET | `/health` | Readiness probe — 503 while Mongo is unreachable |
| POST | `/api/auth/register` | Create an account |
| POST | `/api/auth/login` | Sign in, returns a bearer token |
| GET | `/api/auth/me` | Current user (auth) |
| PATCH | `/api/auth/me` | Update name/location (auth) |
| POST | `/api/auth/claim` | Link a participant token to an account (auth) |
| GET | `/api/stores` | List/filter stores |
| GET | `/api/stores/:idOrSlug` | Single store by `_id` or `slug` |
| GET | `/api/stores/:idOrSlug/menu` | Store with its full embedded menu |
| GET | `/api/stores/:idOrSlug/menu/summary` | Section headings + first N items (`?items=`, max 10) |
| POST | `/api/stores/:idOrSlug/favorite` | Toggle a favourite (auth) |
| GET | `/api/rounds` | Rounds I organize or joined (auth) |
| POST | `/api/rounds` | Create a round (auth) |
| GET | `/api/rounds/:idOrSlug` | A round, with its live bill |
| PATCH | `/api/rounds/:idOrSlug` | Update a round (organizer) |
| DELETE | `/api/rounds/:idOrSlug` | Delete a round (organizer) |
| POST | `/api/rounds/:idOrSlug/join` | Join, returns the participant token |
| GET | `/api/rounds/:idOrSlug/me` | My participant row and organizer flag |
| PUT | `/api/rounds/:idOrSlug/items` | Replace the item list (organizer) |
| POST | `/api/rounds/:idOrSlug/order` | Save my basket (participant) |
| POST | `/api/rounds/:idOrSlug/lock` | Lock the round (organizer) |
| POST | `/api/rounds/:idOrSlug/settle` | Settle and freeze the bill (organizer) |

`GET /api/stores` filters: `platform`, `city`, `country`, `cuisine`,
`category`/`kind`, `search`, `status`, `minRating`, `lat` + `lon` + `radius`
(km), plus `page`, `limit` (capped at 100), `sortBy` (`name`, `rating`,
`itemCount`, `createdAt`, `updatedAt`) and `sortOrder`. Responses carry
`pagination.{page,limit,total,totalPages,hasNextPage}`.

Notes:

- `city` takes the **normalised key** (`alicante`), not a spelling. 188 raw
  spellings in the source collapsed to 151 keys.
- `minRating` works **across platforms** — ratings are normalised onto 0-5, so
  glovo's `96%` and Uber Eats' `4.3` are comparable.
- `search` uses a real text index.
- A geo query returns a `distanceMeters` field. Without `search` it is ordered
  by distance (`$near`, which cannot take another sort); with `search` it
  filters by `$geoWithin` and sorts by the requested key, because `$text`
  cannot be combined with `$near`.
- List responses project out `menu`. A full menu is up to ~400 KB.
- `/menu/summary` is what shortlist browsing should call: every section with
  its true `itemCount` plus the first N items, sliced **in the database**.

## The round aggregate

A round is **one document**. Its shortlist, its item list, its roster and each
person's basket all live inside it, which keeps a lunch atomic and cheap to
read: opening a share link is a single document fetch.

Money is stored as an **integer number of cents** everywhere (`priceCents`,
`feeCents`, `totalCents`). No floats — see
[docs/order-domain.md](docs/order-domain.md) §4 for why.

The bill is computed by `calculateRoundBill` in
[src/features/rounds/settlement.ts](src/features/rounds/settlement.ts). It
allocates the fee across participants in proportion to what they ordered, using
the **largest-remainder method**, so the per-person amounts always add up to the
total exactly. `totalCents` is defined as that sum, so the two can never
disagree. A round whose shortlist mixes currencies is rejected at creation: one
bill cannot add pesos to euros.

## Writes are atomic

Mutations go through [src/features/rounds/rounds.service.ts](src/features/rounds/rounds.service.ts)
and use targeted `$push`/`$set` updates with a positional filter, never a
whole-document `save()`. A read-modify-write would let a participant joining
from the shared link clobber the organizer's concurrent edit, or vice versa —
last writer wins and one change silently disappears.

## Participant access tokens

A name alone proves nothing — anyone with a share link could claim to be Sam and
edit his basket. Joining a round issues a random 24-byte token, returned once,
stored only as a SHA-256 digest and looked up by digest. The digest is unique,
so two participant rows cannot share one. Tokens are scoped to one round and
sent in the **`X-Participant-Token` header** — never a query string, which lands
in access logs and browser history.

A participant's name must be unique within a round; two "Alex" rows would make
"what does Alex owe" unanswerable.

## Hardening and operations

- `JWT_SECRET` is required in production — the process refuses to boot without
  it rather than falling back to a source-visible default.
- Sign-in, registration and joining a round are rate limited (`/health` and
  normal reads are not).
- `/health` reports readiness and returns 503 while Mongo is down; `/health/live`
  is the process-only liveness probe.
- `SIGTERM`/`SIGINT` stop new connections, drain in-flight requests, then close
  Mongo.

## Commands

All of these run from `backend/`. From the repo root, add `--prefix backend`.

```bash
npm install
npm run dev              # tsx watch
npm run build            # tsc
npm run start            # node dist/server.js
npm run type-check       # tsc --noEmit
npm run test             # node:test via tsx
npm run verify:settlement # the money rules, including reconciliation
npm run format           # prettier
```

## Environment

See [.env.example](.env.example). `MONGODB_URI` is the database; `JWT_SECRET` is
required in production; `CORS_ORIGIN` is a comma-separated allow-list (omit to
allow all).
