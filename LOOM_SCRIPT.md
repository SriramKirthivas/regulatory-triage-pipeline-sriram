# Loom script — 5 minutes

Spoken lines only. *Italics* are what to do, not what to say.
Setup commands are at the bottom. Reseed before you record.

---

### 0:00 · What it is (20s)

*Overview page.*

"A regulatory triage pipeline. Directives from eight regulators arrive messy —
typo status codes, missing dates, markup in titles. The backend repairs what it
safely can, quarantines what it can't, and ranks the work that falls out.
44 directives, 184 action items, 60 need review."

---

### 0:20 · The Schema (70s)

*`backend/app/models.py`.*

"Three tables. An Authority issues Directives, each Directive generates Action
Items. Items hang off directives because an item's urgency comes from its
regulatory context — who issued it, and when it takes effect.

The decision I'd defend hardest is at the top of this file: **status columns are
plain TEXT, not Postgres enums.**

An enum rejects `RESOLVD` at insert time. That sounds like a win, but it means
the bad value never reaches the application and the officer never learns their
feed emits typos — the seed just crashes. Storing the raw value and normalising
on read means the database is an honest record of what the regulator actually
sent, and the API is the layer that enforces meaning. Writes only ever store
canonical codes, so the mess never spreads.

Same reasoning twice more. `reference_code` is indexed but not unique — registers
really do emit the same code twice, and a constraint turns a finding into a
crash. And the dates are nullable on purpose: `NOT NULL` with a default would
fabricate a compliance deadline, which is the worst thing this system could do."

---

### 1:30 · The Edge Cases (105s)

*Triage. Press `f` for flagged only.*

"Fifteen classes of defect planted. `triage.py` runs over every row on read.
Three rules: never crash, never silently accept, never drop the row."

*Click item #4.*

"Its stored status is `IN_LIMBO` — not a typo of anything, so there's nothing
safe to map it to. Quarantined as unknown. Not discarded, not guessed at —
parked where a human can repair it."

*Press `2`.*

"And unknown is the one status a client can't write. It's an inbound bucket only."

*Click #1.*

"`RESOLVD` **is** a recognisable typo, so it maps to resolved and gets flagged,
with the raw value still shown. Repairable and unrepairable are treated
differently — that's the whole distinction.

Elsewhere: priority 0 clamped to 1, control characters stripped from a title,
a due date in 2099 flagged rather than deleted."

*Data quality → the withdrawn directive HC/PHA/2026/120.*

"This is the one a per-row validator structurally cannot catch. The directive is
withdrawn, but it still has open action items. Every row is individually valid —
the combination is what's wrong."

*`/docs` tab.*

"The read side is forgiving. The write side isn't. `RESOLVD` on write is a 422.
`unknown` is a 422 — quarantine bucket. And Blocked straight to Resolved is a
422, invalid transition. You have to unblock it first."

---

### 3:15 · The AI Workflow (70s)

"For page transitions the AI suggested Framer Motion's `AnimatePresence` with
`mode="wait"`. It's the documented pattern and it looked right.

The symptom was odd. After triaging an item, clicking any nav link stopped
working. The URL changed, the highlight moved, the content stayed. Permanently,
until a reload.

`mode="wait"` holds the incoming route unmounted until every motion component in
the outgoing one reports its exit finished. So navigation depends on animation
bookkeeping — and one stranded component strands the whole app. The culprit was
the toast: it's dropped on a `setTimeout`, so navigating while one was on screen
raced that timer against the exit. The toast left the list mid-exit, its callback
never fired, the route swap never resumed. A status change is exactly what raises
a toast — which is why it only ever broke *after* triaging something.

I pinned it down by scripting the browser with Playwright. My first two theories
were wrong, and it only reproduced once I forced reduced-motion off, because
headless was skipping the very animations that cause it.

The fix was dropping the wrapper. The lesson: the canonical pattern was
load-bearing in a way its docs don't advertise. A cosmetic transition should
never be able to wedge navigation."

---

### 4:25 · Close (15s)

"Render for the API and Postgres, Vercel for the frontend. Thanks for watching."

---

## Backup AI-workflow stories

- **NUL byte in the seed.** Generated seed put `\x00` in a title; Postgres refuses
  NUL in text columns, so it crashed before a row landed. Swapped to `\x1b`.
- **Duplicate detection flagged the wrong row.** Picked the lowest id as owner of
  a reference code, so the *clean* directive got flagged and the dirty one looked
  fine. Fixed by ranking canonical codes first.
- **Framer Motion row flash beat the selection colour.** `animate={{
  backgroundColor }}` leaves an inline style that outranks the `.active` class.
  Replaced with a CSS keyframe.

---

## Setup

Paste as-is. No `#` comments — interactive zsh here treats them as arguments.

```bash
lsof -ti tcp:8787 | xargs kill -9 2>/dev/null
lsof -ti tcp:5173 | xargs kill -9 2>/dev/null
docker rm -f artixio_db 2>/dev/null
cd ~/Documents/Artixio-Assignment/regulatory-triage-pipeline-sriram
docker compose up -d
until docker exec artixio_db pg_isready -U artixio -d regintel; do sleep 1; done
```

```bash
cd ~/Documents/Artixio-Assignment/regulatory-triage-pipeline-sriram/backend
/opt/homebrew/bin/python3.13 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
.venv/bin/python seed.py
.venv/bin/uvicorn app.main:app --port 8787 --reload
```

Second terminal:

```bash
cd ~/Documents/Artixio-Assignment/regulatory-triage-pipeline-sriram/frontend
npm install
npm run dev
```

`python3` here is 3.14 and psycopg won't install on it — use the 3.13 path above.
Don't run `~/Downloads/artixio-triage`; it still has the navigation bug.

Reseed right before recording, or the numbers below drift:

```bash
cd ~/Documents/Artixio-Assignment/regulatory-triage-pipeline-sriram/backend
.venv/bin/python seed.py
```

Clean numbers: 8 authorities · 44 directives · 184 items · 60 need review ·
31 warnings · 15 anomaly classes. Chips: Pending 58 · In progress 58 ·
Blocked 26 · Resolved 41 · Quarantined 1.

Have open: `localhost:5173` (~1500px wide), `localhost:8787/docs`,
and `backend/app/models.py`.
