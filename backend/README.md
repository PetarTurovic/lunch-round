# LunchRound — Backend

Node + TypeScript + [Express 5](https://expressjs.com/) + Mongoose.

Two domains live in this database:

- **Catalogue** — stores and their menus, harvested from delivery platforms.
  See [docs/database-design.md](docs/database-design.md).
- **Orders** — rounds, participants, orders, selections and the settlement
  split. This is the part the product is for. See
  [docs/order-domain.md](docs/order-domain.md).

## Structure

```
backend/
├── docs/
│   ├── database-design.md   # catalogue schema, v1 problems, index plan
│   └── order-domain.md      # rounds/orders/settlement, the cents rule
├── scripts/
│   ├── verify-settlement.ts     # settlement maths assertions
│   └── smoke-order-domain.ts    # end-to-end run through the models
└── src/
    ├── server.ts
    ├── app.ts
    ├── config/
    ├── shared/
    │   ├── db/connection.ts
    │   ├── errors.ts
    │   ├── middleware.ts
    │   └── health.routes.ts
    └── features/
        ├── stores/           # catalogue, menu embedded in the document
        ├── platforms/        # per-platform rating scale and currency
        
        ├── rounds/           # the share link
        ├── participants/     # who is in a round
        ├── orders/           # one restaurant's order + settlement maths
        ├── selections/       # what a person ordered
        ├── order-events/     # audit trail for order and price edits
        └── users/            # optional accounts
```

Each feature folder follows `*.routes.ts` (router), `*.controller.ts`
(handlers), `*.service.ts` (data access), `*.model.ts` (schema and indexes)
and `*.types.ts` where the shapes are worth naming.

## Express 5 notes

- Handlers are plain `async` functions. Express 5 forwards rejected promises to
  the error middleware, so controllers `throw new NotFoundError(...)` directly.
- The error handler in [src/shared/middleware.ts](src/shared/middleware.ts)
  maps `AppError` to its status, Mongoose `ValidationError` to 400, everything
  else to 500.

## API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Liveness probe |
| GET | `/api/stores` | List stores |
| GET | `/api/stores/:idOrSlug` | Single store by `_id` or `slug` |
| GET | `/api/stores/:idOrSlug/menu` | Store with its embedded menu |
| GET | `/api/stores/:idOrSlug/menu/summary` | Section headings + a few sample items (`?items=`, max 10) |

`GET /api/stores` filters: `platform`, `city`, `country`, `cuisine`, `category`,
`search`, `status`, `minRating`, `lat` + `lon` + `radius` (km), plus `page`,
`limit` (capped at 100), `sortBy` (`name`, `rating`, `itemCount`, `createdAt`,
`updatedAt`) and `sortOrder`.

Notes:

- `city` takes the **normalised key** (`alicante`), not a spelling. 188
  raw spellings in the source collapsed to 151 keys.
- `minRating` works **across platforms** — ratings are normalised onto 0-5, so
  glovo's `96%` and Uber Eats' `4.3` are now comparable. They were not in v1.
- `search` uses a real text index, which v1 documented but never had.
- A geo search returns a `distanceMeters` field and skips the sort. `$near`
  cannot be combined with another sort, and `countDocuments` rejects it
  entirely, so that path runs through `$geoNear` aggregation instead of the
  paginate plugin.
- List responses project out `menu`. A full menu is up to ~400 KB; a page of
  100 stores is ~63 KB.
- `/menu/summary` is what shortlist browsing should call. It returns every
  section with its true `itemCount` plus the first N items, sliced **in the
  database** — ~78% smaller than the full menu for McDonald's, and it preserves
  the order the organizer arranged the shortlist in.

The order domain has no HTTP surface yet — the schemas, validators and
settlement logic are in place and tested, the routes are not written.

## Participant access tokens

A name alone proves nothing — anyone with a share link could claim to be Sam and
edit his basket. Joining a round issues a random 24-byte token, returned once,
stored only as a SHA-256 digest and looked up by digest. Tokens are compared in
constant time, are **scoped to one round** so a leaked link cannot be replayed
against another, and `participants.tokenHash` is unique.

The raw token is never persisted. It goes into the participant's own URL, which
is how a phone browser regains its basket after the tab closes.

## Order audit trail

`order_events` records every mutation to an order, with a before/after and a
signed `deltaCents`. When the organizer edits a price or adds a tip, what
someone owes changes — without a record, "you owe me €12.40" is unfalsifiable,
and the organizer is the one making the edits. Restoring a price is recorded as
`price_restored`, not a second override, so the timeline reads as a story rather
than an end state.

`getRoundMoneyTimelineService` turns that into a running total, which is what
answers "why does the total say X?".

## Money

Every amount in `rounds`, `orders`, `selections` and `order_events` is an
**integer number of cents** (`subtotalCents`, `unitPriceCents`, …). No floats,
and the `$jsonSchema` validators use `bsonType: 'int'` so a fractional cent
cannot be written even by code that skips the types.

The reason is in [docs/order-domain.md](docs/order-domain.md) §4 — in short,
shares of a split bill must add up to the total exactly.

## Commands

All of these run from `backend/`. From the repo root, add
`--prefix backend` (as the root README does for its own scripts).

```bash
npm install
npm run dev              # tsx watch
npm run build            # tsc
npm run type-check       # tsc --noEmit
npm run format           # prettier
```

Checks:

```bash
npm run verify:settlement         # settlement maths assertions
npm run smoke:orders              # end-to-end through the models
```

Both are read-mostly: `smoke:orders` writes a throwaway round and cleans up
after itself. The one-time v1 -> v2 migration script has been removed, along with
its staging machinery and the `migrations` ledger; `docs/database-design.md` is
the record of what it did.

## Environment

See [.env.example](.env.example). `MONGODB_URI` is the database.