# Notes for the 5-minute walkthrough

Not part of the deliverable. Talking points, plus the real bugs hit during this build that you can use for the AI-workflow question.

## 1. Schema (about 90s)

- Three entities in a strict 1..n chain: Authority -> Directive -> Action item. Show `app/models.py`.
- Statuses are TEXT not enums. Say why: a Postgres enum rejects `RESOLVD` at insert time, so the "messy data" never reaches the app and the officer never sees it. Storing raw + normalising on read means the DB is an honest record of what the regulator sent and the API is the layer that enforces meaning. Writes only ever store canonical codes.
- `reference_code` not UNIQUE for the same reason: duplicates are a finding, not a crash.
- Nullable dates: a missing effective date is the single most dangerous gap in regulatory data. Represent it, flag it, never default it.

## 2. Edge cases (about 2 min)

Open the UI, press `f` for flagged only, then click through:

- Item with `stored as "IN_LIMBO"` in the panel: quarantined as `unknown`, red left bar, status control lets a human repair it. Press a number key to show the transition.
- Directive with `<script>` in the title: stripped, raw preserved under the flag.
- HC/GMP directive: `missing_date` on effective date.
- MHRA/LAB/2025/119 pair: `code_format` + `duplicate_reference`, panel shows "duplicate of #N".
- The withdrawn directive: `status_conflict`, a cross-entity check.
- Show the write side in `/docs`: PUT status with `"RESOLVD"` -> 422 listing allowed values; blocked -> resolved -> 422 `invalid_transition`; extra JSON key -> 422 `Extra inputs are not permitted`.

## 3. AI workflow: real mistakes from this build (pick one, about 60s)

1. **NUL byte in seed data.** The AI-generated seed put `\x00` inside a title to simulate control-character junk. Postgres refuses NUL bytes in text columns outright (`psycopg.DataError: PostgreSQL text fields cannot contain NUL`), so the seed crashed before a single row landed. Recognised it from the traceback, swapped to `\x07`/`\x1f`, and added a comment in `seed.py`. Lesson: the AI reasoned about "messy text" generically without knowing the one control character Postgres will not store.

2. **Duplicate detection flagged the wrong row.** The first version of `duplicate_index()` picked the lowest id as the owner of a reference code. In the seed, the badly formatted copy (` mhra/lab/2025/119 `) had the lower id, so the clean directive got flagged as the duplicate and the dirty one looked fine. Caught it in the UI (the row with the lowercase code had no flag). Fixed by ranking rows whose stored code is already canonical first, then by id.

3. **Framer Motion row flash overrode the selection colour.** The suggested approach was `animate={{ backgroundColor: [...] }}` on the table row. It works once, but Framer leaves the final `background-color` as an inline style, which beats the `.active` CSS class, so the selected row lost its highlight after the first update. Replaced with a CSS keyframe class triggered by a key change.

Any of these is honest, specific, and shows you understood the stack rather than pasting output.

4. **Flex column collapsed a progress bar to 0px.** The status bar on the overview page had `flex: 1` inside a column flex container with auto height, so its basis resolved to 0 and it rendered invisible even though width and children were correct. Caught it by inspecting `getBoundingClientRect` in the browser, not by reading the CSS. Removed `flex: 1` and gave it an explicit height.

## Recording checklist

- `docker compose up -d`, `python seed.py`, backend and frontend running before you hit record.
- 1500px-wide window so the table and panel both fit.
- Keep the /docs tab open for the 422 examples.
