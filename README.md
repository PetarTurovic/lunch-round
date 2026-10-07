# LunchRound

A frontend-only React lunch ordering prototype for organizers and their teams. It includes session setup, participant ordering, automatic order locking, and a receipt-based cost breakdown.

## Run locally

Run the frontend locally:

```sh
cd frontend
npm install
npm run dev
```

Vite serves the app from `frontend/src`. Tailwind CSS is compiled locally by the Vite plugin; Google Fonts are loaded from Google Fonts.

The demo starts with sample orders and saves changes in the current browser using `localStorage`. Sharing the generated link does not sync data between different browsers or devices yet.

Build the static frontend with `npm run build` from `frontend`.