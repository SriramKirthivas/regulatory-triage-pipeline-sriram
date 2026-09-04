# Loom walkthrough script — local run, 5 minutes

Every command, number, item ID and API response below was run against this repo
on 4 Sep 2026 and is accurate as written. Don't read it word for word — these are
the points to hit and what to have on screen while you hit them.

The brief requires you to explicitly cover three things. They are sections 2, 3
and 4 below: **the Schema**, **the Edge Cases**, **the AI Workflow**.

---

## 0 · Before you hit record

### Four things that will bite you on camera

**1. Do not paste `#` comments into your shell.** This machine's interactive zsh
has `interactive_comments` off, so a trailing `# like this` is passed along as
arguments rather than ignored. `docker compose up -d  # Postgres` becomes
`docker compose up -d '#' Postgres …` and fails with **`no such service: #`** —
Postgres never starts, and everything after it fails with `connection refused`.
Every block below is therefore comment-free. Paste them as they are.

**2. `python3` on this machine is 3.14, and the install fails on it.**
`psycopg[binary]==3.2.3` has no 3.14 wheel — `pip install` dies with
`No matching distribution found`. Use 3.13 explicitly. Render pins 3.13.4, so
this is a local-only trap.

**3. Free the ports first.** If a previous run is still alive, uvicorn exits with
**`[Errno 48] Address already in use`** and you end up recording against a stale
server. `pkill -f 'Downloads/artixio-triage'` does *not* catch a server started
from the repo, so kill by port instead — that is what step 0 does.

**4. Don't run the copy in `~/Downloads/artixio-triage`.** That was the source
folder; the repo is now ahead of it and the Downloads copy still has the
navigation bug (change a status, click any nav link, the app wedges).

### Bring the stack up

Step 0 — clear anything already running:

```bash
lsof -ti tcp:8787 | xargs kill -9 2>/dev/null
lsof -ti tcp:5173 | xargs kill -9 2>/dev/null
pkill -f 'Downloads/artixio-triage' 2>/dev/null
docker rm -f artixio_db 2>/dev/null
```

Step 1 — Postgres 16 on `:5432`:

```bash
cd ~/Documents/Artixio-Assignment/regulatory-triage-pipeline-sriram
docker compose up -d
until docker exec artixio_db pg_isready -U artixio -d regintel; do sleep 1; done
```

Step 2 — backend on `:8787`. `seed.py` drops, recreates and seeds:

```bash
cd backend
/opt/homebrew/bin/python3.13 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
.venv/bin/python seed.py
.venv/bin/uvicorn app.main:app --port 8787 --reload
```

Step 3 — frontend on `:5173`, in a second terminal. Vite proxies `/api` to
`:8787`:

```bash
cd ~/Documents/Artixio-Assignment/regulatory-triage-pipeline-sriram/frontend
npm install
npm run dev
```

Step 4 — check both before recording. Each should print `{"ok":true}`; the
second one proves the proxy works:

```bash
curl localhost:8787/api/health
curl localhost:5173/api/health
```

**Reseed immediately before you record.** Clicking around changes the data and
the numbers below stop matching:

```bash
cd ~/Documents/Artixio-Assignment/regulatory-triage-pipeline-sriram/backend
.venv/bin/python seed.py
```

### On screen

- Browser at `http://localhost:5173`, window ~1500px wide so the table and the
  detail panel both fit.
- Second tab on `http://localhost:8787/docs` for the API error demos.
- Editor with `backend/app/models.py` and `backend/app/triage.py` open.

### The numbers after a clean seed

8 authorities · 44 directives · 184 action items · 60 need review · 31 with
warnings · 12 directives with errors · **15 distinct anomaly classes**.
Status chips: Pending 58 · In progress 58 · Blocked 26 · Resolved 41 ·
Quarantined 1.

---

## 1 · 0:00–0:25 · What it is

*On screen: Overview.*

"This is a regulatory triage pipeline. A compliance officer sees directives
issued by eight regulators, and works down the action items that fall out of
them. Postgres and FastAPI on the back, React with TanStack Query and Table on
the front.

The data is fabricated and deliberately messy — 44 directives, 184 action items.
The backend repairs what it can safely repair, quarantines what it can't, and
the UI shows you exactly what it did. 60 of those 184 items need review."

---

## 2 · 0:25–1:40 · The Schema

*On screen: `backend/app/models.py`.*

"Three tables in a strict chain: an Authority issues Directives, and each
Directive generates the Action Items a team actually works. Action items hang
off directives rather than sitting in a flat task table, because an item's
urgency comes from its regulatory context — who issued it, and when it takes
effect.

The design decision I'd defend hardest is at the top of this file: **the status
columns are plain TEXT, not Postgres enums.**

A Postgres enum rejects `RESOLVD` at insert time. That sounds like a win, but it
means the bad value never reaches the application, and the officer never finds
out their feed is emitting typos — the seed just crashes. Storing the raw value
and normalising on read means the database is an honest record of what the
regulator actually sent, and the API is the layer that enforces meaning. Writes
only ever store canonical codes, so the mess never grows.

Same reasoning twice more:

**`reference_code` is indexed but not unique.** Source registers really do emit
the same code twice. A unique constraint turns a data-quality finding into an
insert failure.

**The dates are nullable on purpose.** A missing effective date is the single
most dangerous gap in regulatory data. `NOT NULL` with a default would fabricate
a compliance deadline — the worst thing this system could do. Represent it, flag
it, never guess it."

---

## 3 · 1:40–3:15 · The Edge Cases

*On screen: Triage. Press `f` to filter to flagged only.*

"I planted 15 classes of defect. The pipeline is never told what to look for —
`triage.py` runs over every row on read. Its contract is three rules: **never
crash, never silently accept, never drop the row.**

Everything gets through. Nothing gets through unlabelled."

*Click item **#4** — "Validate PV database export for HPRA/GMP/2025/100".*

"This is the one I'd point at. Its stored status is `IN_LIMBO` — not a typo of
anything, so there's nothing safe to map it to. It's quarantined as `unknown`,
which is the single Quarantined item in the queue. It isn't discarded and it
isn't guessed at; it's parked where a human can see it and repair it."

*Press `2` to set it to In progress.*

"And `unknown` is the one status a client can't write. It's an inbound
quarantine bucket only."

*Now contrast with **#1**, same directive.*

"`RESOLVD` **is** a recognisable typo, so it maps to resolved and gets a
`code_normalised` flag. The panel still shows you the raw value. Repairable and
unrepairable are treated differently — that's the whole distinction."

*Point at a few more in the flagged list:*

- "**#7** — priority `0`, outside 1–5, clamped to 1. **#8** — priority `9`,
  clamped to 5."
- "**#10** — control characters stripped out of the title. **#9** — an HTML
  entity, `&amp;`. Repaired for display, raw preserved under the flag."
- "**#17** — a due date in 2099. Flagged as implausible, not deleted."
- "**#19** — overdue by 109 days. That's not bad data, it's a real finding, and
  it's computed rather than stored."

*Open Data quality, then the withdrawn directive **HC/PHA/2026/120** (d#21).*

"This is the one a per-row validator structurally cannot catch. The directive is
**withdrawn**, but it still has open action items. Every single row here is
individually valid — it's the *combination* that's wrong. Catching it needs a
check that sees the parent and the children together, which is why triage runs
as a layer over the whole graph rather than as field validation."

*If time: **MHRA/LAB/2025/119**.*

"And this pair — the same reference code twice, one of them badly formatted with
stray whitespace and lowercase. Both flagged: `code_format` on the dirty one,
`duplicate_reference` pointing at its twin."

*Switch to the `/docs` tab — the write side.*

"The read side is forgiving. The write side is not."

```
PUT /api/action-items/3/status  {"status": "RESOLVD"}
  422  Input should be 'pending', 'in_progress', 'blocked', 'resolved' or 'unknown'

PUT /api/action-items/3/status  {"status": "unknown"}
  422  'unknown' is a quarantine bucket and cannot be set by clients

PUT /api/action-items/7/status  {"status": "resolved"}     # 7 is blocked
  422  {"error":"invalid_transition","from":"blocked","to":"resolved",
        "allowed":["in_progress","pending"]}
```

"You can't go straight from Blocked to Resolved — you have to unblock it first.
The UI greys those buttons out, but the server is what enforces it."

---

## 4 · 3:15–4:25 · The AI Workflow

*On screen: `frontend/src/App.tsx` — the comment block at the top.*

"The one I'd pick was an architectural suggestion, not a hallucination, and it
took a real hunt to pin down.

For page transitions the AI suggested wrapping the routes in Framer Motion's
`AnimatePresence` with `mode="wait"` — fade the old page out, then the new one
in. It's the documented pattern and it looked right for a long time.

The symptom was bizarre. After triaging an item, clicking any nav link stopped
working. The URL changed, the nav highlight moved, but the page content stayed
on the triage table. Permanently — no further click did anything until a reload.

What `mode="wait"` actually does is hold the incoming route unmounted until every
motion component in the outgoing one reports its exit animation finished. That
makes **navigation depend on animation bookkeeping completing** — and one
stranded component strands the entire app.

The culprit was the toast. `ToastProvider` drops each toast on a `setTimeout`, so
navigating while one was still on screen raced that timer against the exit
animation. The toast left the list mid-exit, its completion callback never fired,
and the route swap never resumed. And a status change is exactly what raises a
toast — which is why it only ever broke *after* triaging something, and why I
couldn't reproduce it by just clicking around the nav.

I pinned it down by scripting the browser with Playwright. Worth saying: my first
two theories were wrong — plain navigation passed, and navigation with the detail
panel open passed. It only reproduced once I forced `reducedMotion:
"no-preference"`, because headless Chrome was skipping the very animations that
cause the deadlock.

The fix was to drop the wrapper. Pages still animate in on mount, which needs no
`AnimatePresence`; only the outgoing fade is lost. Navigation can no longer be
blocked by an animation, whatever components the pages grow later.

The lesson I took: the AI gave me the canonical pattern, and the canonical
pattern was load-bearing in a way its docs don't advertise. `mode="wait"` quietly
couples routing correctness to animation completion. A cosmetic transition should
never be able to wedge navigation — and I'd rather lose the fade than own that
failure mode."

### Backups, if you'd rather tell a different one

- **NUL byte in the seed.** The generated seed put `\x00` in a title to simulate
  control-character junk. Postgres refuses NUL in text columns outright
  (`psycopg.DataError`), so the seed crashed before a single row landed. Swapped
  to `\x1b`. The AI reasoned about "messy text" generically without knowing the
  one control character Postgres won't store.
- **Duplicate detection flagged the wrong row.** The first `duplicate_index()`
  picked the lowest id as the owner of a reference code. The badly formatted copy
  had the lower id, so the *clean* directive got flagged and the dirty one looked
  fine. Caught it in the UI. Fixed by ranking already-canonical codes first.
- **Framer Motion row flash overrode the selection colour.** `animate={{
  backgroundColor: [...] }}` leaves the final colour as an inline style, which
  beats the `.active` class — so the selected row lost its highlight after the
  first update. Replaced with a CSS keyframe class.

---

## 5 · 4:25–4:50 · Close

*Click Overview → Directives → Data quality.*

"Overview for the shape of the backlog, the triage queue with keyboard
navigation — `j`/`k` to move, `1` to `4` to set status, `f` for flagged only —
directives with their action items, and the data-quality register.

It's deployed too: Render for the API and Postgres, Vercel for the frontend, with
the frontend proxying `/api` so everything is same-origin. Thanks for watching."

---

## If you're running long

Cut in this order:

1. The closing screen tour (section 5)
2. The `MHRA/LAB/2025/119` duplicate pair
3. The `reference_code` and nullable-dates detail in the schema section

**Never cut section 4.** It's one of the three things the brief explicitly asks
for, and it's the one most candidates fumble or invent.
