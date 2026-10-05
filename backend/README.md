# LunchRound — Backend

Node + TypeScript + Mongoose. This package is a **blueprint**: the MongoDB
schemas and the project skeleton are in place, and there is no application code
yet. No HTTP layer, no routes, no services, no tests.

## Structure

```
backend/
├── package.json
├── tsconfig.json
├── .env.example
└── src/
    ├── server.ts        # connects, then exits — the HTTP layer goes here
    ├── config/
    │   └── index.ts     # env config
    ├── shared/
    │   └── db/
    │       ├── connection.ts   # connectDatabase()
    │       └── index.ts
    └── features/
        ├── stores/
        │   ├── stores.model.ts     # schema + indexes
        │   └── stores.types.ts
        ├── items/
        │   ├── items.model.ts
        │   └── items.types.ts
        └── menu-sections/
            ├── menu-sections.model.ts
            └── menu-sections.types.ts
```

## Schemas

Three collections, each in its own feature folder with a `.model.ts` (schema,
indexes, registered model) and a `.types.ts` (document shape).

| Model | Collection | Notes |
| --- | --- | --- |
| `Store` | `stores` | composite `_id` of `platform:storeId`, 2dsphere `geo` index |
| `Item` | `items` | composite `_id` of `storeId:itemKey`, nested option groups |
| `MenuSection` | `menu_sections` | composite `_id` of `storeId:sectionTitle` |

Collection names are set explicitly in each schema's options. Mongoose
pluralizes model names, so `MenuSection` would otherwise resolve to
`menusections` — a different, empty collection from the real `menu_sections`.

## Database connection

One function, called once at startup:

```ts
await mongoose.connect(config.mongodbUri);
```

That is the whole thing. As a monolith there is a single connection for the
process, so there is no pool to configure, no cached connection promise, and no
stale-connection state to check. If you later need a second connection for a
migration or a replica set, add it then.

## Commands

```bash
npm install
npm run dev           # tsx watch, connects and exits
npm run build         # tsc
npm run type-check    # tsc --noEmit
npm run format        # prettier
```

From the repo root, `npm run dev` runs this alongside the frontend.

## Not here yet

No HTTP server, so `express` is not a dependency. Add it — plus whatever
validation and error handling you want — when you build the first route. The
`dev` script currently connects and exits, which is all a schema-only package
can meaningfully do.
