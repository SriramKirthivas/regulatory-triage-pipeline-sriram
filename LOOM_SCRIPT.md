# Loom script — 5 minutes

Say it in your own words. *Italics* are what to do, not what to say.
Setup commands are at the bottom. Reseed before you record.

---

### 0:00 · What it is (20s)

*Overview page.*

"This is a triage tool for a compliance officer. Eight regulators publish rules,
and those rules turn into actual work — things someone has to do, with deadlines.

The catch is the data arrives messy: statuses spelled wrong, dates missing, HTML
in the titles. So the app fixes what it safely can, sets aside what it can't, and
hands back a ranked list. Right now, 44 rules, 184 tasks, 60 needing a human."

---

### 0:20 · The Schema (70s)

*`backend/app/models.py`.*

"Three tables — a regulator issues rules, each rule creates tasks. Tasks hang
off the rule rather than sitting in one flat to-do list, because how urgent a
task is depends on who issued it and when it kicks in.

The choice I'd most want to explain: **the status column is just text, not a
fixed list of allowed values.**

Locking it down feels safer. But if the database only accepts four perfect values
and the regulator sends `RESOLVD` with a typo, the import fails. Nobody learns
the feed has a problem — you just get an error and no data. So I store exactly
what they sent and clean it up on the way out. The database stays an honest
record of what arrived; the app decides what it means. Anything we save back is
clean.

Two more like that. Reference codes aren't forced to be unique, because real
registers do send the same code twice — worth flagging, not crashing over. And
dates can be empty, because a default would mean inventing a compliance deadline.
That's the most dangerous thing this could do."

---

### 1:30 · The Edge Cases (105s)

*Triage. Press `f` for flagged only.*

"Let me show you what it catches. I planted fifteen kinds of bad data, and
nothing tells the app what to look for. The rule is: never crash, never quietly
accept something wrong, never throw a row away."

*Click item #4.*

"This one came in as `IN_LIMBO`. That's not a misspelling of anything — I can't
tell what they meant. So it's set aside and marked unknown. Not deleted, not
guessed at, just parked where a person can fix it."

*Press `2`.*

"And unknown is the one state the app will never set itself. It only ever comes
from bad input."

*Click #1.*

"Compare that to `RESOLVD`. That obviously is 'resolved', misspelled — so it's
fixed automatically, but you can still see what arrived. Things it can safely fix
and things it can't are treated completely differently. That's the whole idea.

A few others: a priority of zero pulled back into range, junk characters stripped
from a title, a due date in 2099 flagged rather than deleted."

*Data quality → the withdrawn rule HC/PHA/2026/120.*

"My favourite. This rule was withdrawn — cancelled — but people are still
working on tasks from it. Any single row looks completely fine. It's only wrong
when you see them together, which is why the checking runs across the whole
picture instead of row by row."

*`/docs` tab.*

"Reading is forgiving; writing isn't. Save a misspelled status, it refuses. Mark
something unknown, it refuses — that's only for bad data coming in. And you can't
jump from Blocked straight to Resolved. Unblock it first."

---

### 3:15 · The AI Workflow (70s)

"For the page transitions the AI suggested a standard, straight-out-of-the-docs
animation setup. Looked completely fine.

Then this bug: after you changed a task's status, the menu stopped working. You'd
click, the address bar would change, the tab would highlight — and the page just
sat there. Permanently, until you reloaded.

That setting waits for the old page to finish fading out before showing the new
one. So navigation quietly depended on an animation finishing. And the little
confirmation popup disappears on a timer — navigate while it's still up, and the
timer and the fade collide, the animation never reports back, and the page swap
never happens. A popup only appears when you change a status, which is exactly
why it only broke after you'd done some work.

I found it by scripting the browser to click through automatically. My first two
guesses were wrong — it only showed up once I forced animations on, because
headless had been skipping them.

The fix was removing that wrapper. The lesson: it was the recommended pattern,
and it was quietly holding up something important. A visual effect should never
be able to break navigation."

---

### 4:25 · Close (15s)

"It's deployed as well — API and database on Render, frontend on Vercel. Thanks
for watching."

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
