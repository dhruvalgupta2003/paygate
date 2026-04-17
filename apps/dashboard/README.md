# paygate-dashboard

> The PayGate admin dashboard.  React 18 + Vite + Tailwind + TanStack
> Query + TanStack Router.

Dev: `pnpm --filter paygate-dashboard dev` → <http://localhost:5173>.

## Env

- `VITE_API_URL` — default `http://localhost:4020`
- `VITE_WS_URL` — default `ws://localhost:4020/ws`

## Architecture

- **Routes** are file-based in `src/routes/`.  `main.tsx` wires
  `RouterProvider` + `QueryClientProvider`.
- **MSW** mocks the admin API during dev so the dashboard runs without
  the backend.  See `src/mocks/`.
- **Design tokens** live in `src/lib/theme.ts` and `src/styles/tokens.css`.
- **Charts** use recharts wrapped in thin `AreaChart` / `SparkLine`
  components so the visual language stays consistent.

## Build

```bash
pnpm --filter paygate-dashboard build
pnpm --filter paygate-dashboard preview  # serve dist/
```

Production image: [`Dockerfile`](./Dockerfile) (multi-stage, nginx).

## License

MIT.
