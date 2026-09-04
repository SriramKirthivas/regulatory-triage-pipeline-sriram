# Loom script — 5 minutes

*Italics* are what to do, not what to say.
Setup commands are at the bottom. Reseed before you record.

About 740 spoken words — roughly 5:00 at a normal presenting pace. If you run
long, cut these three, in order:

1. "Others: a priority of zero…" — the extra defects (edge cases)
2. "Unknown is also the one status…" (edge cases)
3. The reference-codes half of "Two related decisions" (schema)

Never cut the AI Workflow section — it's one of the three things the brief
explicitly asks for.

---

### 0:00 · What it is (20s)

*Overview page.*

"This is a triage tool for a regulatory compliance officer. Eight medicines
regulators — the FDA, the EMA and so on — publish directives, the rules companies
must follow. Each directive creates action items: the concrete tasks someone has
to complete against a deadline.

The difficulty is that the incoming data is unreliable — misspelled status codes,
missing dates, raw HTML in titles. The system corrects what it can verify,
isolates what it can't, and returns a ranked queue. Currently 44 directives, 184
action items, 60 needing review."

---

### 0:20 · The Schema (70s)

*`backend/app/models.py`.*

"Three tables. An authority — a regulator — issues directives, and each directive
generates action items. Action items belong to a directive rather than one flat
task list, because an item's urgency depends on which regulator issued it and
when the rule takes effect.

The decision I'd most like to explain: **the status column is stored as free
text, rather than a fixed list of values enforced by the database.**

Constraining it looks safer. But if the database accepts only four exact values
and a regulator sends `RESOLVD` with a typo, the import fails outright — and the
officer never learns their data source has a problem. So the system stores what
arrived and interprets it on the way out. The database stays an accurate record
of what was sent; the application decides what it means. Anything written back is
always correct.

Two related decisions. Reference codes aren't unique, because registers do
publish the same code twice — that's a finding, not a reason to reject the
record. And dates may be empty, because a default would mean inventing a
compliance deadline."

---

### 1:30 · The Edge Cases (105s)

*Triage. Press `f` for flagged only.*

"Now what it catches. I introduced fifteen categories of defect, and the system is
never told what to look for — it evaluates every record as it reads it. The
principle: never fail, never accept something incorrect silently, never discard a
record."

*Click item #4.*

"This item's status arrived as `IN_LIMBO`. That isn't a misspelling of any valid
value, so there's no safe interpretation. It's isolated and marked unknown — not
deleted, not guessed at, but held where a person can resolve it."

*Press `2`.*

"Unknown is also the one status the application never assigns itself; it only
comes from incoming data."

*Click #1.*

"Compare that with `RESOLVD` — clearly 'resolved' misspelled, so it's corrected
automatically, and the original value stays visible. Defects it can safely repair
and defects it can't are handled differently, and that distinction is the core of
the design. Others: a priority of zero brought into range, control characters
stripped from a title, a due date in 2099 flagged rather than deleted."

*Data quality → the withdrawn directive HC/PHA/2026/120.*

"This is the case I'd highlight. The directive has been withdrawn, but it still
has open action items against it. Every individual record is valid — the problem
only appears when you view them together, which is why the checks run across the
whole dataset rather than record by record."

*`/docs` tab.*

"Finally, reading is tolerant but writing is strict. A misspelled status is
rejected. Unknown is rejected, because that state is reserved for incoming data.
And an item can't move from Blocked straight to Resolved — it has to be unblocked
first."

---

### 3:15 · The AI Workflow (70s)

"One example of something going wrong. For the page transitions, the AI
recommended a standard animation pattern straight from the library's
documentation. It looked correct.

The symptom: after changing an item's status, navigation stopped working.
Clicking a menu link updated the address bar and the highlighted tab, but the
page content stayed put — permanently, until a reload.

That pattern waits for the outgoing page to finish animating before displaying
the next, so navigation had become dependent on an animation completing. The
confirmation message shown after a status change is removed on a timer, and
navigating while one was visible put the timer and the animation in conflict. The
animation never signalled it had finished, so the page never changed. That
message only appears when you change a status — which is exactly why the fault
surfaced only after doing real work.

I found it by scripting a browser to reproduce the sequence. My first two
hypotheses were wrong; it reproduced only once I forced animations to run,
because the headless browser had been skipping them.

The fix was removing that wrapper. The lesson: the recommended pattern carried a
dependency its documentation doesn't emphasise. A visual transition should never
be able to prevent navigation."

---

### 4:25 · Close (15s)

"It's deployed as well — the API and database on Render, the frontend on Vercel.
Thank you for watching."

---

## Backup AI-workflow stories

- **NUL byte in the seed.** Generated data put a `\x00` in a title; Postgres flat
  out refuses that in text, so it crashed before a single row saved.
- **Duplicate detection blamed the wrong row.** It picked the lowest id as the
  original, so the *clean* record got flagged and the messy one looked fine.
- **An animation overrode the row highlight.** Animating the background colour
  leaves an inline style behind that beats the CSS class, so the selected row
  lost its highlight after the first update.

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
