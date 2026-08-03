# Extension bug-fix round 4 — closing out the pinned-bug tests

Date: 2026-08-02. Scope: `src/shared/__tests__/extension*`, `extension/*.js`, the bundled mirror.

Starting point: 19 failing / 219 passing. Finishing point: **248 passing / 0 failing** (the count
grew because eleven new tests were added for behaviour that had none).

**Four of the nineteen were real regressions**, all in the retry queue, and one of them was severe
enough to defeat the queue's entire purpose. They are first, because they are the part worth
reading.

---

## 1. Regressions found and fixed

### R1 (severe) — `MAX_QUEUE_ATTEMPTS` counted *offline* retries, so a closed app emptied the queue after ten minutes

`ensureFlushAlarm()` arms `chrome.alarms.create(ALARM_FLUSH, { periodInMinutes: 1 })`, and the alarm
runs `flushQueue()`. In the shipped-to-me version, every failure — including "nothing is listening on
127.0.0.1" — incremented `attempts`, and `attempts >= 10` dropped the item.

So: close GrammarX, mine ten words, go make coffee. Ten minutes later the alarm has fired ten times,
every item has hit the bound, and **the whole backlog is gone** — for the one failure mode the queue
was built to survive. "Saving works even when GrammarX is closed" was true for exactly nine minutes.

This also made `MAX_QUEUE_AGE_MS` (7 days) unreachable dead code: at one attempt per minute, the
attempt bound always won, ~1000x over.

The comment on the constants had the right idea and the code crossed the axes:

> *an app left closed over a weekend is age, a payload the app keeps refusing is attempts*

That is exactly right. `attempts` now counts **only failures where the app answered**; the closed-app
case is bounded by age alone.

```js
const attempts = (typeof item.attempts === 'number' ? item.attempts : 0) + (err.offline ? 0 : 1);
```

Covered by `gives up on a 5xx after MAX_QUEUE_ATTEMPTS, counting only answered failures`, which
flushes fifteen times against a closed app first and asserts `attempts` is still 0.

### R2 — a queued item was discarded on a 5xx, after one attempt

`flushQueue` reused `shouldQueue(err)` (i.e. `err.offline` only) to decide whether to keep an item.
That is the right rule at the *save* site and the wrong one at the *flush* site, and the difference
is who is watching:

- At the save site a user is looking at a toast. Reporting "GrammarX said: database is locked" beats
  silently promising a sync. Your decision #1 is correct there, and I did not touch it.
- At the flush site nobody is watching, and we have **already told the user it would sync**. A 5xx —
  a locked SQLite file, a model still warming up, the app mid-restart — clears on its own within
  seconds. Throwing the save away because the app was busy for one second is data loss.

Added `shouldRetryQueued(err)`: `offline || (status >= 500 && !auth)`. A 4xx and a rejected token
still drop immediately, which was the point of your change. This is also what gives
`MAX_QUEUE_ATTEMPTS` a real job again after R1 — the two fixes are coupled; fixing R1 alone would
have left the constant unreachable.

### R3 — `flushQueue` drops everything, and the popup says "Nothing to retry."

`extension/popup.js`'s Retry button reads `res.flushed` and `res.left` and knows nothing about
`res.dropped`. After the new drop paths, a user with three queued saves could press Retry, have all
three discarded on a stale token, and read **"Nothing to retry."** — the queue's worst outcome
reported as its most boring one, which is the exact failure mode change #1 was meant to end.

The button now says how many were discarded and points at the recent-activity list, and stops
painting the result green when anything was dropped.

### R4 (accounting) — an unrecognised `kind` was invisible in all three counters

`if (!endpoint) continue;` skipped the item without counting it as flushed, left *or* dropped, so
`flushed + left + dropped` did not equal what went in — the exact complaint the old
`silently drops an item whose kind it no longer recognises` test filed. It is now a
`reason: 'unknown-kind'` drop, so the tallies add up and the drop reaches the activity list.

### Bonus: undated legacy items were exempt from every bound

`if (typeof item.at === 'number' && now - item.at > MAX_QUEUE_AGE_MS)` skips the age check entirely
for items an older build stored without an `at`. Combined with the R1 fix (which stops attempts from
bounding offline failures) those items would have been **immortal by omission**. `at` is now
backfilled on write-back. Covered by
`gives an undated legacy item an 'at', so the age bound covers it too`.

---

## 2. Things in your ten I think are wrong

1. **Change #3's claim that "the ordering assertions inside them still hold" is not true for
   `keeps the survivors of a partial flush in their original order`.** That test rejects two of four
   items with a 400 and asserts the survivors are still `['b', 'd']` in order — but under the new
   code there *were* no survivors, so the assertion the test exists for stopped being exercised
   rather than merely changing shape. It now uses a 503 (which survives, per R2) so the ordering
   claim is still actually tested, and a separate test covers the 400 drop.

2. **`err.serverError` is written and never read.** `apiFetch` stashes it, and nothing in
   `background.js`, `popup.js`, `options.js` or `content.js` ever looks at it — the same write-only
   pattern the `at` field sat in for a year, which change #3 rightly called out. What actually
   survives to a caller is `err.payload`, and only through two paths (the `api` passthrough and the
   listener's outer `.catch`). `serverError` adds something over `payload` only when the error body
   was not JSON. Either forward it from the `api` handler or delete the field; I left it alone
   because adding keys to a response shape that `content.js` consumes is your call. Pinned by
   `AUDIT: err.serverError records the original text but nothing ever reads it`, which fails if it
   ever gains a second reference (i.e. when you wire it up).

3. **Your rewrite of `extensionApiErrors.test.ts` referenced an undeclared `AUTH_MSG`** — that alone
   was 3 of the 19 failures (`ReferenceError`, not a behaviour mismatch). Declared it at the top.

4. **In that same file, `keeps what the app actually said` asserted `res.payload` on a `lookup`.**
   The `lookup` handler catches its own error and responds `{ ok, entries, offline, error }` — it
   drops `payload` on the floor, so that expectation could never pass. Retargeted at the `api`
   passthrough, which does forward it. This is the same unevenness the file's own taxonomy table is
   about; it now bites the payload column too, not just `offline`.

5. **`enqueue`'s overflow drop is still silent, and is now inconsistent with the flush drops.**
   `while (queue.length > MAX_QUEUE) queue.shift()` discards the oldest saves with no
   `recordActivity` call, while every `flushQueue` drop now gets one. Still pinned as
   `AUDIT: the drop is silent — nothing tells the user 5 saves were lost`. One line to fix and it
   would make the two drop paths agree; I left it because it is outside your ten.

6. **Minor, not new:** on the capture-throw path, the `jp-show-ocr` send is not wrapped in
   `try/catch` while `restoreOnce()` is. If the content script is gone, that throws past the handler
   and the caller gets the generic outer-catch response instead of the specific error. The
   pre-existing crop-failure path immediately below has the same shape, so this is consistent rather
   than a new hole — worth a `try` on both if you touch that function again.

Everything else in the ten checks out. #5 (`restoreOnce`), #6 (per-axis DPR), #7 (`APP_UPDATE_PATHS`
anchoring), #8 (`send-to-reader`), #9 (`sentenceAt` cap) and #10 (`ocr-status` / `playlist-status`)
are all correct and are now asserted rather than pinned.

---

## 3. The nineteen, one line each

| # | Test | Verdict |
|---|---|---|
| 1 | apiErrors · `reports the app being closed like this` | Fixed-behaviour update — `ocr-status` now forwards `offline: true` |
| 2 | apiErrors · `reports a stale pairing token…` | Test bug — undeclared `AUTH_MSG` |
| 3 | apiErrors · `keeps what the app actually said…` | Test bug — asserted `payload` on a handler that drops it (see §2.4) |
| 4 | apiErrors · `ocr-status only claims the models are missing…` | Test bug — undeclared `AUTH_MSG` |
| 5 | apiErrors · `AUDIT: a second, shorter offline string` | Shape update; **still an AUDIT** — the two strings remain, but `running` now carries the diagnosis |
| 6 | apiErrors · `AUDIT: reports a 401 as "not running"` | Fixed → renamed; +2 new tests for the 500 and 200 rows |
| 7 | commandRegistry · `DIVERGES: no 200-character cap` | Fixed → renamed to a parity test, incl. the `maxLen` override |
| 8 | manifestAudit · `AUDIT: send-to-reader handled but not declared` | Fixed → renamed. Note: the id survives in your explanatory comment, so the test strips comments before asserting absence |
| 9 | manifestAudit · `matches every file hash` | Mirror was stale — `sync-extension-mirror.cjs` |
| 10 | ocrCrop · `AUDIT: one bad axis resets the other` | Fixed → renamed. X keeps its measurement; Y still falls back to dpr, which is the only guess left once the height reading is known bad — asserted explicitly so it is a choice, not an accident |
| 11 | ocrCrop · `AUDIT: a failed capture leaves the UI hidden` | Fixed → renamed; + `restores exactly once` so the idempotence guard cannot start double-sending on the success path |
| 12 | retryQueue · `replays the backlog in order` | `dropped` key only |
| 13 | retryQueue · `replays by array position, not the timestamp` | Test fixture — used `at: 2000` (i.e. Jan 1970), now expired by the age bound. Made now-relative |
| 14 | retryQueue · `keeps the survivors of a partial flush in order` | **R2** — see §1 |
| 15 | retryQueue · `AUDIT: retries a rejected payload forever` | Fixed → renamed; asserts the drop reaches recent-activity |
| 16 | retryQueue · `AUDIT: a wrong token keeps every save queued` | Fixed → renamed; asserts `reason: 'auth'` |
| 17 | retryQueue · `replays every declared kind` | `dropped` key only |
| 18 | retryQueue · `silently drops an unrecognised kind` | **R4** — see §1 |
| 19 | retryQueue · `AUDIT: three of ten kinds are unreachable` | Test bug — it scrapes `await enqueue('…')` out of the source, and every call site is now `enqueueIfRetryable`, so it read zero kinds. Regex widened to match both, so a direct `enqueue()` reappearing is still caught |

Note on #13: it is a fixture artifact, not a product bug — real items carry `Date.now()`. It does
imply that a system clock jumped forward and then back can expire a queue, which is acceptable and
not worth guarding.

## 4. New coverage added

- **Attempts bound** — fifteen offline flushes leave `attempts` at 0, then nine 503s keep the item
  and the tenth drops it with `reason: 'attempts'`.
- **Age bound** — an 8-day-old item is dropped *without a request being made*, while a 1-day-old
  sibling flushes; drop lands in recent-activity as `expired`.
- **Undated legacy item** — gets an `at` backfilled on write-back.
- **5xx survives a flush** and then succeeds on the next one.
- **Quota rejection** — `storage.local.set` rejecting makes the save fail loudly with the quota
  message and `queued` unset, and (second test) leaves the badge matching what is actually stored
  rather than what was attempted.
- **Drop accounting** — `flushed + left + dropped` equals what went in.
- **`err.serverError`** — pinned as write-only (see §2.2); the observable half of the substitution
  is asserted through `err.payload` on the `api` passthrough.
- **health probe** — all four rows (closed / 401 / 500 / 200) rather than just the two.
- **OCR restore** — fires exactly once on the success path.

## 5. Files changed

- `extension/background.js` — `shouldRetryQueued()`; `attempts` counts answered failures only; `at`
  backfilled; unknown-kind counted as a drop.
- `extension/popup.js` — the Retry button reports drops.
- `src/main/chrome-extension/{background,popup}.js` — mirror, synced.
- `src/shared/__tests__/extension{ApiErrors,CommandRegistry,ManifestAudit,OcrCrop,RetryQueue}.test.ts`
- `src/shared/__tests__/extensionHarness.ts` — `QueuedItem.attempts`, `sentenceAt`'s `maxLen`.

## 6. Gates

| Gate | Result |
|---|---|
| `npx vitest run src/shared/__tests__/extension` | **248 passed / 0 failed** (9 files) |
| `node tools/sync-extension-mirror.cjs` | `mirror already up to date (12/12 files match)`, exit 0 |
| `npx eslint <touched files>` | 3 errors, **all pre-existing `'globalThis' is not defined`** (`background.js:20,30`, `popup.js:323`) — none on a line from this session, and `popup.js:323` (`const SETTINGS = globalThis.jpStudySettings`) is from your uncommitted branch work. The extension folder is linted without a `globalThis` global; fixing it means touching the root eslint config, which `CLAUDE.md` puts out of scope. |
| `npx tsc --noEmit` | 314 pre-existing project errors, **none in `src/shared/__tests__/extension*`** |

Also re-ran `extensionCaptureParity`, `analysisPanelRender` and `inboxMeta` (the other suites that
read the extension sources): 41 passed.
