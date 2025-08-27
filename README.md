# LaneHarbor (Bun + Hono)

Minimal server to serve downloads and update feed for apps.

## Run locally

Prereqs: Bun installed.

```powershell
# From repo root
# Install deps
bun install --cwd servers/laneharbor

# Start server (uses PORT or defaults to 3000)
$env:LH_DATA_DIR="./servers/laneharbor/storage"; bun run servers/laneharbor/src/app.ts
```

Test:
- http://localhost:3000/healthz -> `{ status: "ok" }`
- http://localhost:3000/v1/apps -> `{ apps: [] }` (until you create `storage/apps/...`)

## Structure
- `src/app.ts` — Hono app + Bun.serve
- `src/routes.ts` — API routes (start with `/healthz` and `/v1/apps`)
- `src/storage.ts` — file helpers
- `src/config.ts` — env config
- `storage/` — local dev artifact root (prod uses volume `/data`)

## Railway
- Attach a volume mounted at `/data`.
- Important env vars:
  - `LH_DATA_DIR=/data`
  - `LH_BASE_URL=https://laneharbor.yourdomain.com`
  - `LH_DEFAULT_CHANNEL=stable`
- Docker deploy supported via provided Dockerfile.
