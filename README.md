# LunchRound

Group lunch bookkeeping. Somebody organises it, everyone orders from a link, and
the organizer ends up knowing exactly what to buy and what to collect.

This repository is currently **two blueprints**. The tooling, folder layout, and
database schemas are in place; the application code is not written yet.

```
LunchRound/
├── backend/     Express + Mongoose package — schemas only   (no HTTP yet)
└── frontend/    React 19 + Vite package — skeleton only      (:5173)
```

## State of each package

**backend/** — MongoDB schemas for `stores`, `items`, and `menu_sections`, plus a
startup entry point that connects and exits. There is no HTTP layer, no routes,
no services, and no tests. The database connection is a single
`mongoose.connect()` call — as a monolith there is one connection for the
process and no pool to manage.

**frontend/** — Vite + React with the folder layout decided (`pages/`,
`components/`, `hooks/`, `services/`, `types/`, `styles/`), all empty. No
styling, no data fetching, no routing.

## Commands

```bash
npm run setup   # first time: installs the root tool and both packages
npm run dev     # runs both packages side by side
```

| Root script | What it does |
| --- | --- |
| `npm run dev` | both packages in watch mode, prefixed output, one Ctrl+C stops both |
| `npm run dev:api` / `npm run dev:web` | just one side |
| `npm run build` | build both |
| `npm run type-check` | typecheck both |
| `npm run migrate` | data migration, see below |

The two packages are independent: separate `package.json`, separate
`node_modules`, separate lifecycles. The root only fans scripts out.

## Database

MongoDB at `MONGODB_URI` (default `mongodb://localhost:27017/lunchround`).

Current contents, imported from an existing `menue` database:

| Collection | Documents |
| --- | --- |
| `items` | 43,527 |
| `menu_sections` | 3,092 |
| `change_logs` | 1,816 |
| `stores` | 662 |
| `harvest_runs` | 18 |

Collection names are pinned in the schemas rather than left to Mongoose's
pluralizer — `MenuSection` would otherwise resolve to `menusections` and quietly
miss the real `menu_sections` collection.

The one-off migration script lives in `backend/scripts/` and is gitignored, so it
stays a local operator tool rather than something the repo promises to keep
working:

```bash
npm run migrate -- --dry-run   # count what would move
npm run migrate                # write it across
```
