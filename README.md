# LaneHarbor (Bun + Hono)

Minimal server to serve downloads and update feed for apps.

## Run locally

Prereqs: Bun installed.

```powershell
# From repo root
# Install deps
bun install

# Start server (uses PORT or defaults to 3000)
$env:LH_DATA_DIR="./storage"; bun run src/app.ts
```

Test:
- http://localhost:3000/healthz -> `{ status: "ok" }`
- http://localhost:3000/v1/apps -> `{ apps: [...] }`

Frontend:
- http://localhost:3000/ -> static UI that lists apps and releases
- Served from `public/` via Hono `serveStatic` in `src/app.ts`

Quick test commands (PowerShell):

```powershell
irm http://localhost:3000/healthz | ConvertTo-Json
irm http://localhost:3000/v1/apps | ConvertTo-Json
irm "http://localhost:3000/v1/apps/sangthian-client/releases" | ConvertTo-Json
irm "http://localhost:3000/v1/apps/sangthian-client/releases/latest?platform=windows-x86_64" | ConvertTo-Json
```

## Structure
- `src/app.ts` — Hono app + Bun.serve
- `src/routes.ts` — API routes (healthz, apps, releases, downloads, tauri update)
- `src/storage.ts` — file helpers
- `src/config.ts` — env config
- `src/types.ts` — shared types
- `storage/` — local dev artifact root (prod uses volume `/data`)
- `public/` — static frontend (`index.html`, `assets/app.js`, `assets/styles.css`)

## Railway
- Attach a volume mounted at `/data`.
- Important env vars:
  - `LH_DATA_DIR=/data`
  - `LH_BASE_URL=https://laneharbor.yourdomain.com`
  - `LH_DEFAULT_CHANNEL=stable`
- Docker deploy supported via provided Dockerfile.

## Tauri Updater endpoint

- Dynamic endpoint: `GET /v1/tauri/:app/update?current_version=...&platform=windows-x86_64`
- Returns `204` if no update; otherwise JSON with `version`, `pub_date`, `url`, `signature`, `notes`.
- See official docs: https://v2.tauri.app/plugin/updater/
