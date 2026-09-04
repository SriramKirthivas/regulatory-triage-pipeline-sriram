# Loom script — max 5 minutes

The brief asks the video to address three things: **the Schema**, **the Edge
Cases**, **the AI Workflow**. That's all this covers.

~480 spoken words, about 3:30 talking — roughly 4:30 of video with clicking.

## Before you start: four tabs, in this order

| | Tab | Showing |
|---|---|---|
| A | Editor | `backend/app/models.py`, scrolled to the top |
| B | Browser | `localhost:5173/triage` |
| C | Browser | `localhost:8787/docs` |
| D | Editor | `frontend/src/App.tsx`, scrolled to line 10 |

**The path is A → B → C → D.** You move five times in total; each move is marked
**MOVE** below. Everything else you say from where you already are.

---

### 1 · The Schema (60s) — tab A, `models.py`

*Top of the file. Scroll slowly past each `class` as you name it — line 20, 32,
51.*

"Three tables: an authority issues directives, and each directive generates
action items. Items hang off the directive rather than sitting in one flat task
list, because urgency depends on who issued it and when the rule takes effect."

*Stop with line 42 — the Directive `status` column — in view.*

"The main decision is that status is stored as free text, not a fixed list the
database enforces. If the database only accepted valid values, a regulator
sending `RESOLVD` would fail the import outright — and the officer would never
learn their feed has a problem. So I store what arrived and interpret it on read.
The database is an accurate record of what was sent; the application decides what
it means."

*Point at line 37, then lines 43 to 45.*

"Same reasoning twice more. Reference codes are indexed but not unique, because
registers do publish duplicates — that's a finding, not a crash. And these three
dates are nullable, because defaulting one would invent a compliance deadline."

---

### 2 · The Edge Cases (100s) — tab B, the app

> **MOVE 1 → tab B.** Triage. Type `HPRA/GMP/2025/100` in the search box.
> Six rows appear. Stay here for the next three paragraphs.

"I seeded fifteen categories of defect. Nothing tells the app what to look for —
it checks every record as it reads it.

These six action items are all one directive. Five are flagged 'code normalised':
that regulator sent five different spellings of a status — `closed`, `wip`,
`RESOLVD`, `Pending` with a trailing space, `In-Progress` with a hyphen. All
recognisable, so all repaired."

*Click row #1. The panel opens on the right — you stay on this screen.*

"And you can still see what actually arrived — stored as `RESOLVD`."

*Click row #4, the one marked Quarantined. Same screen, panel just updates.*

"This one arrived as `IN_LIMBO`. That's not a misspelling of anything valid, so
there's no safe interpretation. It's quarantined — not deleted, not guessed at,
held for a person to resolve."

*Press `2`. A confirmation appears bottom-right.*

"Which I can do here."

> **MOVE 2** → click **Directives** in the top nav, search `HC/PHA/2026/120`,
> open the one card that remains.

"And this directive is withdrawn, but still has three open action items. Every
record is individually valid — only the combination is wrong, which is why the
checks run across the whole dataset rather than record by record."

> **MOVE 3 → tab C**, the API docs.

"Reading is tolerant; writing is strict. A misspelled status is rejected, and
Blocked can't jump straight to Resolved."

---

### 3 · The AI Workflow (60s) — tab D, `App.tsx`

> **MOVE 4 → tab D.** The comment at line 10 is this bug, written up.

"For the page transitions, the AI suggested a standard animation pattern straight
from the library's documentation. It looked right.

Then: after changing an item's status, navigation stopped working. The URL
changed, the tab highlighted, but the page didn't move — permanently, until a
reload.

That pattern waits for the outgoing page to finish animating before showing the
next one. The confirmation message is removed on a timer, so navigating while one
was visible put the timer and the animation in conflict. The animation never
reported finishing, so the page never changed. A message only appears after a
status change — which is why it only broke once you'd done real work."

> **MOVE 5 → tab B** for the last two lines, so you finish on the app.

"That's the exact sequence I did a minute ago — set a status, then click through
to Directives. I found it by scripting a browser to reproduce it. My first two
guesses were wrong; it only reproduced once I forced animations on, which
headless had been skipping.

The fix was removing that wrapper. The lesson: the recommended pattern quietly
made navigation depend on an animation finishing."

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

Reseed right before recording, or the numbers drift:

```bash
cd ~/Documents/Artixio-Assignment/regulatory-triage-pipeline-sriram/backend
.venv/bin/python seed.py
```

Clean numbers: 8 regulators · 44 rules · 184 tasks · 60 need review ·
31 warnings · 15 kinds of bad data. Chips: Pending 58 · In progress 58 ·
Blocked 26 · Resolved 41 · Quarantined 1.

Have open: `localhost:5173` (~1500px wide), `localhost:8787/docs`,
and `backend/app/models.py`.
