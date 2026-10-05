# LunchRound — Backend

Node + TypeScript + [Express 5](https://expressjs.com/) + Mongoose. Serves the
menu data harvested into the `lunchround` MongoDB database.

## Structure

```
backend/
├── package.json
├── tsconfig.json
├── .env.example
├── scripts/
│   └── migrate-data.ts    # one-off copy from the source `menue` database
└── src/
    ├── server.ts          # boot: connect, then listen
    ├── app.ts             # createApp(): middleware, routes, error handling
    ├── config/
    │   └── index.ts       # env config
    ├── shared/
    │   ├── db/connection.ts
    │   ├── errors.ts      # AppError, NotFoundError
    │   ├── middleware.ts  # cors, notFound, errorHandler
    │   ├── pagination.ts  # query param parsing helpers
    │   └── health.routes.ts
    └── features/
        ├── stores/        # .controller.ts + .routes.ts + .model.ts + .types.ts
        ├── items/
        └── menu-sections/
```

Each feature folder follows the same layout: `*.routes.ts` wires the router,
`*.controller.ts` holds the handlers, `*.model.ts` the Mongoose schema and
indexes, and `*.types.ts` the document/response shapes.

## Express 5 notes

- Route handlers are plain `async` functions. Express 5 forwards rejected
  promises to the error middleware natively, so there is no `asyncHandler`
  wrapper — controllers `throw new NotFoundError(...)` directly.
- The error handler in [src/shared/middleware.ts](src/shared/middleware.ts)
  maps `AppError` instances to their status code, Mongoose `ValidationError`
  to 400, and everything else to 500.

## API

All routes are mounted under `/` (the dev server proxies `/api` from the
frontend config where applicable):

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Liveness probe |
| GET | `/stores` | List stores; filters `platform`, `city`, `country`, `category`, `search`, `isActive`, `minRating`, `lat`/`lon`/`radius` |
| GET | `/stores/:idOrSlug` | Single store by `_id` or `slug` |
| GET | `/stores/:idOrSlug/menu` | Store with sections and their items |
| GET | `/menu-sections` | List sections; filter `storeId` |
| GET | `/menu-sections/:id` | Single section |
| GET | `/items` | List items; filters `storeId`, `sectionTitle`, `sections`, `search`, `minPrice`/`maxPrice`, `currency`, `isSoldOut`, `hasOptions` |
| GET | `/items/:id` | Single item |

List endpoints accept `page`, `limit` (capped at 100), `sortBy` (allowlisted
per resource) and `sortOrder=asc|desc`.

## Commands

```bash
npm install
npm run dev           # tsx watch
npm run build         # tsc
npm run type-check    # tsc --noEmit
npm run format        # prettier
npm run migrate       # copy data from the source database
```

From the repo root, `npm run dev` runs this alongside the frontend.

## Environment

See [.env.example](.env.example). `MONGODB_URI` is the target database; the
migration script additionally reads `MONGODB_SOURCE_URI` (the old `menue`
database) directly from the environment.
