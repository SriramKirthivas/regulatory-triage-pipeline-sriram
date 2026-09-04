# Deploying

Backend + Postgres on Render, frontend on Vercel. The frontend proxies `/api/*`
to Render through a Vercel rewrite, so the browser only ever talks to one origin
and no CORS configuration is exercised in normal use.

Both platforms deploy from a git repository, so that comes first.

## 0. Repository

Already on GitHub at `SriramKirthivas/regulatory-triage-pipeline-sriram`, with the
backend in `backend/` and the frontend in `frontend/`. Both platforms deploy from
that repo, so a push to `main` is what triggers a redeploy.

```bash
git push origin main
```

## 1. Render — database + API

`render.yaml` at the repo root is a Blueprint describing both the Postgres
instance and the web service.

1. Render dashboard -> **New** -> **Blueprint** -> pick the repo.
2. Render reads `render.yaml` and proposes `artixio-db` (Postgres) and
   `artixio-api` (web service). Apply.
3. `CORS_ORIGINS` is set in `render.yaml` to the Vercel domain. It is not used
   on the proxied path — every browser request goes through Vercel's own origin —
   so it only matters if you open the API directly. Change it there if the
   frontend domain changes.
4. Both the database and the service are pinned to the **frankfurt** region.
   They must match: Render's injected database hostname is internal and internal
   DNS is per-region, so a cross-region service fails to resolve it on boot.

`DATABASE_URL` is wired automatically from the database to the service.

**Seeding is automatic.** `SEED_ON_STARTUP=true` is set in `render.yaml`, so the
service creates the schema on boot and populates it *only if it is empty*. That
check makes redeploys safe: an already-populated database is left alone, so
recorded triage decisions survive. The startup log says which branch it took:

```
Database was empty — schema created and seeded
Database already has data — left untouched
```

This exists because Render's free tier has no shell, so `python seed.py` cannot
be run by hand after a deploy. Locally it still can:

```bash
python seed.py     # drops, recreates and reseeds every table
```

Note the difference: `seed.py` calls `drop_all()` and wipes everything, which is
why it is not what runs on boot. Never put it in the build command.

Check it came up: `https://artixio-api.onrender.com/api/health` -> `{"ok":true}`

## 2. Vercel — frontend

1. Vercel -> **Add New** -> **Project** -> same repo.
2. Set **Root Directory** to `frontend`. This matters: `vercel.json` and
   `package.json` live there, not at the repo root.
3. Framework preset, build command and output directory are read from
   `frontend/vercel.json` (Vite / `npm run build` / `dist`).
4. `frontend/vercel.json` already points the proxy at the live Render service:

   ```json
   { "source": "/api/:path*", "destination": "https://artixio-api.onrender.com/api/:path*" }
   ```

   If the Render service is ever recreated under a different name, update that
   host and push — Vercel redeploys on the commit.

The second rewrite (`/(.*)` -> `/index.html`) is the SPA fallback. Without it,
loading `/triage` or `/directives/2` directly returns 404, because those paths
exist only in React Router, not on disk. Vercel checks the filesystem before
applying rewrites, so hashed assets under `/assets/*` still serve normally.

## 3. Verify

```bash
curl https://regulatory-triage-pipeline-sriram.vercel.app/api/health              # {"ok":true} — proxy works
curl https://regulatory-triage-pipeline-sriram.vercel.app/api/anomalies           # seeded counts
curl -o /dev/null -w '%{http_code}\n' https://regulatory-triage-pipeline-sriram.vercel.app/triage   # 200, not 404
```

Then open the site and confirm the Overview stats are populated rather than
showing `–`, which is what you see when the API is unreachable.

## Notes on the free tiers

- Render free web services **spin down after ~15 minutes idle**. The next
  request cold-starts and can take 50 seconds or so. The first page load after
  a quiet period will look broken but is not.
- Render's free Postgres instance **expires after 30 days**. Re-create it and
  re-run `seed.py` if you need the demo alive longer.
- `api.items()` requests `limit=500`, which is exactly the backend's cap
  (`le=500`). Fine for the 184 seeded rows; it would silently truncate beyond
  500 rather than paginate.

## Why `config.py` rewrites the database URL

Render hands out `DATABASE_URL` as `postgresql://...`. SQLAlchemy resolves that
scheme to psycopg2, which is not in `requirements.txt` — only psycopg 3 is. The
`sqlalchemy_url` property rewrites the scheme to `postgresql+psycopg://` so the
installed driver is used. Without it the service crashes on boot with
`ModuleNotFoundError: No module named 'psycopg2'`.
