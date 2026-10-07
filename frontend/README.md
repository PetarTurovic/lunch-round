# LunchRound — Frontend

React + TypeScript + Vite. This package is a **blueprint**: the build and type
checker are wired up, the folder layout is decided, and there is no application
code in it yet. No styling, no data fetching, no routing.

The Express/Mongoose backend lives in the sibling directory `../backend`.

## Structure

```
frontend/
├── index.html            # Vite entry document
├── vite.config.ts        # React plugin, @/* path alias, dev server
├── tsconfig.json         # strict, @/* paths
├── .env.example
└── src/
    ├── main.tsx          # mounts <App> into #root
    ├── App.tsx           # app shell — currently returns null
    ├── pages/            # one file per route (empty)
    ├── components/       # shared UI (empty)
    ├── hooks/            # reusable stateful logic (empty)
    ├── services/         # API/data access (empty)
    ├── types/            # shared type definitions (empty)
    └── styles/           # global CSS entry (empty)
```

The empty folders each hold a `.gitkeep`, because git does not track empty
directories and the layout is the point of this package.

## Conventions already set

- `@/` resolves to `src/` (both in Vite and in `tsconfig.json`)
- `tsc` runs in `strict` mode with `noUnusedLocals` and `noUnusedParameters`
- The `@/*` alias is configured in both places, so imports work identically in
  the editor, the type checker, and the bundler

## Run environment

```bash
npm install
npm run dev       # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | typecheck, then bundle to `dist/` |
| `npm run preview` | serve the built bundle |
| `npm run type-check` | `tsc -b` only |

From the repo root, `npm run dev` starts this alongside the API.

## What is deliberately not here yet

Nothing in this package talks to the backend yet, so there is no dev proxy in
`vite.config.ts` and no `services/` client. When the first real request lands,
add both together — the proxy in `vite.config.ts` keeps the browser on a single
origin in development, which avoids needing CORS on the API.
