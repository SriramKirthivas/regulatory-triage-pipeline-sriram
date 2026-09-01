# Build notes — AI workflow log

The assignment asks me to name a specific bug or bad suggestion an AI tool produced
during this build and explain how I caught it. Rather than reconstruct that from
memory afterwards, I logged them as they happened.

---

## 1. A shared "null-ish" vocabulary that silently corrupted status fields

**What the AI produced.** Building the ingestion layer, I asked for a helper that
recognises the many ways a feed spells "no value". It generated a single module-level
set used by *every* field:

```python
_NULLISH = {"", "n/a", "na", "none", "null", "nil", "-", "--",
            "tbd", "tba", "unknown", "not specified", "pending", "?"}
```

That reads perfectly sensibly, and every test I would have written for dates passes.

**Why it was wrong.** `"pending"` and `"unknown"` are not absences — they are
*legitimate values* for a status column. `coerce_action_status("Pending")` calls
`is_nullish()` first, so a status that arrived correctly would take the
"value was empty" branch. The stored status happened to still be `PENDING`, so no
test would fail and nothing would look broken in the UI — but the record would carry
a `DataQualityFlag` claiming its status was missing when it was not.

That is the exact failure mode this assignment warns about: not a crash, but
**silently accepting corrupt logic**. It would have polluted the flag table with
false positives, and the flag table is the whole basis of the triage UI's credibility.

**How I caught it.** I noticed it while wiring `coerce_action_status` and reading the
call order aloud: the first thing it does is ask "is this nothing?" using a vocabulary
that contains a word the enum itself defines. Nullness is not a property of a string —
it is a property of a string *in a column*.

**The fix.** Split the vocabulary by column type. `_NULLISH` keeps only the universal
tokens; `_DATE_NULLISH` extends it with the date-only ones (`tbd`, `pending`,
`unknown`, `awaiting publication`). `is_nullish()` takes the vocabulary as a
parameter, and only `parse_date()` passes the date set.

**The lesson.** The AI optimised for deduplication — one set, used everywhere — and
deduplication was the wrong instinct, because the two sets are only coincidentally
similar. Shared constants quietly assert that two things are the same kind of thing.
Here they were not.

---

## 2. A proxy prefix that swallowed a client-side route

**What the AI produced.** The obvious Vite dev-server proxy config:

```ts
proxy: {
  "/api": { target: "http://localhost:8000", changeOrigin: true },
}
```

This is the snippet in every tutorial, and it worked fine for the whole first version
of the app.

**Why it was wrong.** Vite treats a plain string key as a **prefix**, not a path
segment. When the console grew a sidebar route at `/api-health`, that path matched the
`/api` prefix — so navigating to the API Health screen forwarded the *page request* to
FastAPI, which had no such route, and returned 404 instead of the app.

The same config had a second hole: the health endpoint is served at `/health`, outside
`/api` entirely, so it was never proxied. `fetch("/health")` got Vite's `index.html`
back with a 200, and `response.json()` choked on `<!doctype html>`. Both failures live
only in the dev server — the production build and the API itself were fine — which is
exactly the kind of bug that survives to a demo.

**How I caught it.** I curled all nine routes rather than assuming they worked because
the router config looked right. `/api-health` came back 404 while its eight siblings
returned 200. One anomalous line in a list of nine.

**The fix.** Anchored regex patterns, which Vite uses for keys beginning with `^`:

```ts
proxy: {
  "^/api/": { target, changeOrigin: true },
  "^/health$": { target, changeOrigin: true },
}
```

`^/api/` requires the trailing slash, so `/api-health` no longer matches, and `/health`
is proxied explicitly.

**The lesson.** Both of these bugs are the same shape: a rule that looks like it names
a *category* actually matches on a *string*. `_NULLISH` treated "the word pending" as
"an absent value"; `"/api"` treated "starts with these four characters" as "is an API
call". AI-generated code is fluent at the common case and silent about where the
boundary of the pattern actually sits — so the thing worth checking is never whether
the happy path works, it is what else the rule quietly captures.
