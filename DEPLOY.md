# Deploy: Belmo game server + Vercel client

The static client stays on **Vercel**. The authoritative WebSocket server runs on **Belmo** (free Starter: 0.5 vCPU / 512 MB, always-on).

SQLite world saves live on the container disk and are **ephemeral** on free Belmo — redeploys can wipe `worlds.sqlite`. Fine for playtests.

## 1. Deploy the server on Belmo

1. Push this repo to GitHub (Belmo deploys from GitHub).
2. Sign up at [belmo.io](https://belmo.io) (no credit card on Starter).
3. **New service → API** (or Docker if the UI offers a Dockerfile path).
4. Connect this repo and branch (usually `main`).
5. Belmo (Coolify) usually builds with **Nixpacks**, not the root `Dockerfile`. Repo root has [`nixpacks.toml`](nixpacks.toml) so install/build/start are correct.
6. In the service settings, leave custom build/start **empty** to use `nixpacks.toml`, **or** set explicitly:
   - **Root directory:** repo root (not `packages/server`)
   - **Build command:** `npm run build -w @coop/shared && npm run build -w @coop/server`  
     (do **not** put `npm ci` here — Nixpacks already installs; a second `npm ci` fails with `EBUSY` on `node_modules/.cache`)
   - **Start command:** `npm run start -w @coop/server`
7. If the UI lets you pick a pack: prefer **Nixpacks**. Only switch to **Dockerfile** if Nixpacks cannot compile `better-sqlite3`.
8. Deploy. Belmo injects `PORT`; the server already binds to `process.env.PORT`.
9. Copy the public URL, e.g. `https://coop-browser-game-xxxx.onbelmo.uk`.

### Health check

```bash
curl -sS https://coop-browser-game-xxxx.onbelmo.uk/
# expect: {"ok":true,"milestone":...}
```

WebSocket URL for the client (same host, `wss://` scheme):

```text
wss://coop-browser-game-xxxx.onbelmo.uk
```

### Belmo build failure: `EBUSY ... rmdir '/app/node_modules/.cache'`

Cause: custom **Build** still includes `npm ci`. Nixpacks already ran `npm ci` in install and mounts a cache on `node_modules/.cache`.

Fix: set Build to only:

```text
npm run build -w @coop/shared && npm run build -w @coop/server
```

Then redeploy (after pushing `nixpacks.toml` if you rely on the file instead of the UI).

### Local Docker smoke (optional)

```bash
docker build -t coop-game-server .
docker run --rm -p 2567:2567 coop-game-server
curl -sS http://localhost:2567/
```

Non-Docker local/prod-like start from the repo root:

```bash
npm run start:server
```

## 2. Point the Vercel client at Belmo

`VITE_WS_URL` is baked in at **build** time ([`packages/client/src/net/ClientSocket.ts`](packages/client/src/net/ClientSocket.ts)).

1. Vercel → Project → **Settings → Environment Variables**
2. Add for Production (and Preview if you want):

   | Name | Value |
   |------|--------|
   | `VITE_WS_URL` | `wss://your-service.app.belmo.io` |

3. **Redeploy** the Vercel project so the client rebuilds with the new URL.
4. Locally, copy [`packages/client/.env.example`](packages/client/.env.example) to `packages/client/.env.local` only if you want to hit Belmo from `npm run dev`; otherwise leave unset for `ws://localhost:2567`.

## 3. Smoke test

1. Open the Vercel site, create a room, join from a second browser/tab.
2. Confirm lobby shows Connected and gameplay ticks smoothly.
3. Leave idle 15–60 minutes, reconnect — should stay instant (no Render-style cold start).
4. Check Belmo logs for OOM/crash loops with a full 4-player room.

## 4. Retire Render

After the smoke test passes:

1. Open the [Render dashboard](https://dashboard.render.com).
2. Open the old free web service for this game server.
3. **Suspend** or **Delete** it so nothing still points at the old host.
4. Remove any leftover Render URL from Vercel env vars / docs / bookmarks.
5. Confirm `VITE_WS_URL` is only the Belmo `wss://` host, then redeploy Vercel if you changed env again.

## Fallback

If Belmo shared CPU still feels tight, try **Northflank Sandbox** with the same root `Dockerfile`, then update `VITE_WS_URL` again.
