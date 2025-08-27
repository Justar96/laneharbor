# LaneHarbor — Minimal Update/Download Server Plan

## 1) Goal & Scope (Phase 1)
- Serve installers/bundles for your apps (start with `apps/desktop` Tauri app).
- Provide an update feed endpoint compatible with Tauri v2 Updater plugin to enable in-app updates.
- Support downgrade by exposing older versions via API and direct download.
- Deploy on Railway with a persistent volume for release artifacts.

Out of scope for Phase 1: CI auto-publish, user auth/roles, admin UI. We’ll add these later.

---

## 2) Tech Stack (proposed)
- Server: Bun + Hono (fast, minimal, TypeScript-first).
- Storage: Railway Volume mount at `/data` for release artifacts and JSON indices.
- Optional DB (later): Railway Postgres for richer release metadata. Phase 1 will be file-based JSON.
- Container: Dockerfile for reproducible deploys on Railway.

Alternatives: Node.js/Express or FastAPI/Go/Fiber are possible; Bun + Hono chosen for performance and simplicity with Railway.

---

## 3) Directory & Data Layout
```
servers/
  laneharbor/
    src/
      app.ts                 # Hono app entry
      routes.ts              # Routes
      storage.ts             # File/JSON helpers
      config.ts              # Settings (env-driven)
    storage/                 # For local dev only (prod uses Railway volume)
      apps/
        sangthian-client/
          index.json         # Release index for this app
          0.1.0/
            Sangthian-Client-0.1.0-x64-setup.exe
            checksums.json
    package.json
    bun.lockb
    Dockerfile
    README.md
```

- Prod volume mount: `/data` (mirror of `storage/` tree). App will read/write under `/data/apps/...`.
- `index.json` (per app) minimal schema (file-based):
```json
{
  "app": "sangthian-client",
  "channels": ["stable"],
  "releases": [
    {
      "version": "0.1.0",
      "channel": "stable",
      "pub_date": "2025-08-27T12:00:00Z",
      "notes": "Initial release",
      "assets": [
        {
          "platform": "windows-x86_64",
          "filename": "Sangthian-Client-0.1.0-x64-setup.exe",
          "sha256": "<sha256>",
          "size": 12345678
        }
      ]
    }
  ]
}
```

---

## 4) API Design (v1)
- GET `/healthz`
  - Returns 200 with `{ status: "ok" }`.

- GET `/v1/apps`
  - Lists known apps from `/data/apps/*`.

- GET `/v1/apps/{app}/releases`
  - Returns the app’s `index.json` with all versions.
  - Query params: `channel` (optional, default all).

- GET `/v1/apps/{app}/releases/latest`
  - Params: `channel` (default: `stable`), `platform` (e.g., `windows-x86_64`).
  - Returns latest release metadata for that channel/platform.

- GET `/v1/apps/{app}/releases/{version}`
  - Returns metadata for the specific version (for any version = enables downgrade awareness).

- GET `/v1/apps/{app}/releases/{version}/download`
  - Params: `platform` (required). Streams file or 302 redirects to the asset URL.
  - Supports Range requests for resumable downloads.

- GET `/v1/tauri/{app}/update`
  - Returns a minimal update feed compatible with Tauri v2 Updater plugin for the caller platform.
  - Inputs: header/user-agent detection or query `platform`, optional `current_version`.
  - Note: We will implement shape following official plugin docs (see References). Exact manifest structure will be verified and implemented during development.

Security: Phase 1 endpoints are read-only and public. Admin endpoints (upload/publish) come in Phase 2 with API key.

---

## 5) Tauri Updater Integration (Phase 1)
- Client: Install and use Tauri v2 Updater plugin in `apps/desktop`.
  - JS: `@tauri-apps/plugin-updater`
  - Rust: `tauri-plugin-updater`
- Basic flow (per official docs):
  ```ts
  import { check } from '@tauri-apps/plugin-updater'
  import { relaunch } from '@tauri-apps/plugin-process'
  const update = await check()
  if (update) {
    await update.downloadAndInstall()
    await relaunch()
  }
  ```
- Configure the plugin to point to our LaneHarbor update endpoint (either via plugin config or API usage as per docs). We’ll confirm the exact configuration shape during implementation.
- Downgrade: The built-in updater typically applies newer versions. For downgrades, the app can present a “Choose version” UI retrieving `/releases`, then open or download the selected installer. Server fully supports serving older versions.

---

## 6) Release Process (Phase 1)
- Manual to start:
  1) Build installers for `apps/desktop` (Windows first) via Tauri bundling.
  2) Upload files to Railway volume under `/data/apps/sangthian-client/{version}/...`.
  3) Update `/data/apps/sangthian-client/index.json` (append release entry).
- Optional later: CI (GitHub Actions) to publish to LaneHarbor via authenticated admin API.

---

## 7) Deployment on Railway
- Runtime: Bun (+ Hono). Use Railway's Bun runtime or Docker. Expose `$PORT`.
- Volume: attach to `/data` for artifacts and indices.
- Env vars:
  - `LH_DATA_DIR=/data` (default fallback to `./storage` for local dev)
  - `LH_BASE_URL=https://laneharbor.yourdomain.com` (used to generate absolute asset URLs when redirecting)
  - `LH_DEFAULT_CHANNEL=stable`
- Domain: configure custom domain and HTTPS in Railway for consistent download links.

---

## 8) Implementation Steps (Roadmap)
1) Bootstrap Bun + Hono app with `/healthz`.
2) Implement file/JSON helpers to read `/data/apps/*/index.json` (fallback `./storage`).
3) Endpoints: list apps, list releases, latest release, release by version.
4) Static/streaming download endpoint with Range support.
5) Tauri update feed endpoint that returns latest version for platform/channel.
6) Dockerfile + local run (`docker run -v ./storage:/data ...`).
7) Deploy to Railway, attach volume, set env vars, verify endpoints.
8) Manually upload `0.1.0` installers and craft `index.json`. Test download + updater check from `apps/desktop`.
9) Document usage in `servers/laneharbor/README.md`.

Phase 2 (later): Admin API (create/upload release), token auth, Postgres backing store, CI publishing, metrics/logging, multi-channel policies, rate limiting, CDN in front (Cloudflare).

---

## 9) Open Questions for You
- Artifact storage: OK to start with Railway Volume, or would you rather use GitHub Releases/object storage and let LaneHarbor 302-redirect?
- Channels needed beyond `stable` (e.g., `beta`)?
- Platforms for initial support (Windows first, then macOS/Linux)?

---

## 10) References
- Tauri Updater plugin (v2):
  - JS API and usage: https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/updater/README.md
  - Permissions reference: https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/updater/permissions/autogenerated/reference.md

We will verify the exact update feed/manifest structure against the official docs during the implementation step.
