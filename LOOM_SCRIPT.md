# Loom script — max 5 minutes

The brief asks the video to address exactly three things: **the Schema**, **the
Edge Cases**, **the AI Workflow**. That's all this covers.

~480 spoken words, about 3:30 talking — roughly 4:30 of video once you allow for
clicking. *Italics* are what to do, not what to say.

Setup is at the bottom. Reseed before you record.

---

### 1 · The Schema (60s)

*`backend/app/models.py`.*

"Three tables: an authority issues directives, and each directive generates
action items. Items hang off the directive rather than sitting in one flat task
list, because urgency depends on who issued it and when the rule takes effect.

The main decision is that status is stored as free text, not a fixed list the
database enforces. If the database only accepted valid values, a regulator
sending `RESOLVD` would fail the import outright — and the officer would never
learn their feed has a problem. So I store what arrived and interpret it on read.
The database is an accurate record of what was sent; the application decides what
it means.

Same reasoning twice more. Reference codes aren't unique, because registers do
publish duplicates — that's a finding, not a crash. And dates can be empty,
because defaulting one would invent a compliance deadline."

---

### 2 · The Edge Cases (100s)

*Triage. Search `HPRA/GMP/2025/100` — six rows.*

"I seeded fifteen categories of defect. Nothing tells the app what to look for —
it checks every record as it reads it.

These six action items are all one directive. Five are flagged 'code normalised':
that regulator sent five different spellings of a status — `closed`, `wip`,
`RESOLVD`, `Pending` with a trailing space, `In-Progress` with a hyphen. All
recognisable, so all repaired."

*Click row #1.*

"And you can still see what actually arrived — stored as `RESOLVD`."

*Click row #4, marked Quarantined.*

"This one arrived as `IN_LIMBO`. That's not a misspelling of anything valid, so
there's no safe interpretation. It's quarantined — not deleted, not guessed at,
held for a person to resolve."

*Press `2`.*

"Which I can do here."

*Directives → search `HC/PHA/2026/120` → open it.*

"And this directive is withdrawn, but still has three open action items. Every
record is individually valid — only the combination is wrong, which is why the
checks run across the whole dataset rather than record by record."

*`/docs` tab.*

"Reading is tolerant; writing is strict. A misspelled status is rejected, and
Blocked can't jump straight to Resolved."

---

### 3 · The AI Workflow (60s)

"For the page transitions, the AI suggested a standard animation pattern straight
from the library's documentation. It looked right.

Then: after changing an item's status, navigation stopped working. The URL
changed, the tab highlighted, but the page didn't move — permanently, until a
reload.

That pattern waits for the outgoing page to finish animating before showing the
next one. The confirmation message is removed on a timer, so navigating while one
was visible put the timer and the animation in conflict. The animation never
reported finishing, so the page never changed. A message only appears after a
status change — which is why it only broke once you'd done real work.

I found it by scripting a browser to reproduce the sequence. My first two guesses
were wrong; it only reproduced once I forced animations on, which headless had
been skipping.

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
