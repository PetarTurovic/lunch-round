# LunchRound

LunchRound is a group lunch ordering project with a React frontend and an
Express/Mongoose backend.

## Project structure

- `frontend/` — React 19 and Vite. The current prototype supports lunch setup,
  participant ordering, order locking, bill breakdowns, local bill history, and
  light/dark themes. Demo data is stored in the current browser.
- `backend/` — Express 5 and Mongoose API.

## Getting started

Requires Node.js 20 or newer. From the repository root:

```sh
npm run setup
npm run dev
```

The web app runs at `http://localhost:5173`. To run only the frontend:

```sh
npm run dev:web
```

To install dependencies in both packages, build, or type-check:

```sh
npm run install:packages
npm run build
npm run type-check
```

Frontend-only commands can also be run from `frontend/` with `npm run dev`,
`npm run build`, and `npm run type-check`.

## Data and configuration

The frontend prototype persists its demo state in browser `localStorage`;
sharing a link does not synchronize data across browsers or devices.

The backend uses MongoDB. Configure its connection with `MONGODB_URI` using
`backend/.env.example` as a starting point. Backend domain and database notes
are in `backend/docs/`.
