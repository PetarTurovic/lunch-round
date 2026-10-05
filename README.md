# LunchRound

Group lunch bookkeeping. Somebody organises it, everyone orders from a link, and
the organizer ends up knowing exactly what to buy and what to collect.

```
LunchRound/
├── backend/     Express 5 + Mongoose — schemas and the stores API
└── frontend/    React 19 + Vite — skeleton (:5173)
```

## What the app does

The organizer picks a shortlist of restaurants, creates a **round**, and shares
its link. Friends open it, type a name — no account — pick a restaurant and
choose what they want. The organizer then locks the round, orders, adjusts
prices if the restaurant charged differently or they paid a tip, and the app
tells everyone what they owe.

That workflow is modelled in five collections: `rounds`, `participants`,
`orders`, `selections` and (optionally) `users`. It is documented in
[backend/docs/order-domain.md](backend/docs/order-domain.md).

The restaurants and their menus are harvested from delivery platforms into the
`stores` collection. That is documented in
[backend/docs/database-design.md](backend/docs/database-design.md).

## State

**backend/** — The catalogue was audited, redesigned and migrated in place: the
menu is embedded in the store document, ratings are normalised onto a single
0-5 scale, cities and cuisines are normalised, and the schema is now enforced
by `$jsonSchema` validators rather than TypeScript alone. The order domain has
its schemas, validators, indexes and settlement logic in place and tested; it
has no HTTP surface yet. The frontend is still a skeleton.

## Commands

```bash
npm run setup   # first time: installs the root tool and both packages
npm run dev     # both packages in watch mode, one Ctrl+C stops both
```

| Root script | What it does |
| --- | --- |
| `npm run dev` | both packages, prefixed output, one Ctrl+C stops both |
| `npm run dev:api` / `npm run dev:web` | just one side |
| `npm run build` | build both |
| `npm run type-check` | typecheck both |

The two packages are independent: separate `package.json`, separate
`node_modules`, separate lifecycles. The root only fans scripts out.

## Database

MongoDB at `MONGODB_URI` (default `mongodb://localhost:27017/lunchround`).

| Collection | Local | Atlas | What it is |
| --- | --- | --- | --- |
| `stores` | 1,306 | **1,439** | Store header with its **menu embedded** |
| — sections | 13,377 | 14,459 | nested under `stores.menu` |
| — items | 96,888 | **104,033** | nested under `stores.menu` |
| `platforms` | 2 | 2 | Per-platform rating scale and currency |
| ~~`harvest_runs`~~ | — | 21 | **Dropped locally.** Run lifecycle, nothing read it |
| `order_events` | 0 | 0 | Audit trail for order and price edits |
| `migrations` | 1 | 1 | Applied migration ledger |
| `rounds`, `participants`, `orders`, `selections`, `users` | 0 | 0 | The order domain, schema ready |

The Atlas copy holds 133 more stores and 7,145 more items than the local one —
see "Known data gap" below. It also still has `harvest_runs`, which was dropped
locally; the two databases are otherwise identical in collections, indexes and
validators.

The previous shape — `items`, `menu_sections`, `change_logs` — was migrated in
place and dropped. That was a one-time rebuild and its script has been removed;
what follows in `backend/docs/database-design.md` is the record of what it did
and why, not something you re-run.

## Known data gap

The local database is **missing 133 stores** that Atlas has, and with them
7,145 items. Those items were previously counted as "orphans" locally and
deleted on the user's instruction — but their parent stores had simply never
been copied to the local database. The Atlas copy is therefore the complete
harvest and is now the more authoritative of the two.

To close the gap, restore local from the Atlas backup rather than the reverse:

```bash
mongodump --uri="$MONGODB_REMOTE_URI" --db=lunchround --out=.backups/atlas
mongorestore --uri="mongodb://localhost:27017/lunchround" --db=lunchround --drop .backups/atlas/lunchround
```

There are no checked-in or on-disk backups; take your own before running this.
Note it restores Atlas over local wholesale, which will also bring back
`harvest_runs` — drop it again afterwards if you want the two to match.