# Deploy: Belmo (free) + Vercel client

Belmo **free / Starter** = Nixpacks only. **Dockerfile builds need Pro** — ignore the root `Dockerfile` on free.

## Fix the current failed deploy (Nixpacks)

Your logs still show Belmo forcing:

```text
--build-cmd 'npm ci && npm run build -w @coop/shared && ...'
```

That second `npm ci` causes `EBUSY` on `node_modules/.cache`.

### Option A — edit the existing app (preferred if you find the field)

1. Open **coop-browser-game** → **Configuration** → **General**
2. Find **Build Command** / **Custom Build Command** / Nixpacks build
3. Set it to **exactly** (no `npm ci`):

```text
npm run build -w @coop/shared && npm run build -w @coop/server
```

4. **Start Command:**

```text
npm run start -w @coop/server
```

5. Click **Save**, then **Deploy**
6. In the new log, build must **not** start with `npm ci &&`

### Option B — delete and recreate (if you cannot find Build Command)

1. Delete the current Belmo app
2. Create a new app from the same GitHub repo / `main`
3. Choose Nixpacks (default)
4. Leave **Build Command** and **Start Command** **blank** so [`nixpacks.toml`](nixpacks.toml) applies
5. Deploy

### Verify

```bash
curl -sS https://YOUR-HOST.onbelmo.uk/
# {"ok":true,"milestone":...}
```

Client: Vercel env `VITE_WS_URL=wss://YOUR-HOST.onbelmo.uk`, then redeploy Vercel.
