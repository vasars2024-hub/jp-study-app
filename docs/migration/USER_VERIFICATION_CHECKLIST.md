# What the user must verify — and why a machine could not

**Produced by:** slice 76, the scheduled sweep of 2026-08-03 (`SLICE_76_PRACTICAL_SWEEP.md`).
**Build measured:** `out/jp-study-app-win32-x64/jp-study-app.exe`, packaged 2026-08-03 12:11 and
verified current (no `src` file newer than the exe).

Every item below is here for one of exactly three reasons:

- it needs **credentials, hardware or data that do not exist on this machine**;
- it needs a **human judgement** a contrast ratio cannot make; or
- it would **mutate something real** — a MyAnimeList list, an 82-deck Anki collection, a live
  profile — and every harness in this track deliberately uses a throwaway.

Ranked by risk. **Items 1–3 would ship a defect if skipped.** Items 4–7 are lower but real.
Items 8–10 are hygiene.

---

## 1. The default theme fails WCAG 1.4.11 when measured from painted pixels — DECIDE WHAT TO DO

**Risk: HIGHEST. This is a live accessibility defect on the theme every user starts on, and it is
the one finding in this sweep that is measured, reproducible, and NOT fixed.**

**What to do.** Read the B2 vs B2p table in `SLICE_76_PRACTICAL_SWEEP.md`, then look at the app
yourself — specifically the taskbar (`button.os-start-btn`, `button.os-tray-btn`) and the settings
nav (`button.os-set-nav-item`).

**What you should see.** Controls whose *boundary* is nearly invisible against what sits behind it,
even though the label on them is perfectly readable.

**What was measured.**

| theme | CSS-derived **B2** | painted-pixel **B2p** |
|---|---|---|
| default (`study-os`) | PASS — 107 scored of 234, **0 load-bearing** | **FAIL — 206 scored of 234, 184 below 3:1, 66 LOAD-BEARING** (`identity` 48, `state` 18) |
| `frutiger-aero` | "PASS" — only **8 scored of 251** | **FAIL — 231 of 251, 207 below, 8 load-bearing** |
| `wired-archive` | FAIL — only **18 scored of 248** | **FAIL — 216 of 248, 179 below, 57 load-bearing** |

| `soft-sepia` (worst light theme) | FAIL — 107 scored of 234, 16 load-bearing | **FAIL — 206 of 234, 174 below, 67 load-bearing** |

**Read that last row against the first one.** Measured from painted pixels, the **dark default (66)**
and the **worst light theme (67)** fail almost identically — the same `identity: 48`, the same
`state: 18`. `identity: 48` shows up in `wired-archive` too, a third unrelated palette.

**So this is one structural problem in the same chrome controls (taskbar, tray, nav) on every theme,
not a light-palette problem** — and the neat light-fails/dark-passes split in item 3 below is
largely an artifact of which controls happen to declare a CSS boundary.

> **The practical consequence, and the reason this is item 1:** fixing only the light palettes would
> make the CSS number go green and leave most of the real defect in place — on every theme,
> including the default one you are looking at right now.

**Why a machine could not settle it.** It measured it fine — the problem is that **two instruments
disagree and the machine cannot decide which loss you would rather take.** The pixel sampler is the
more trustworthy of the two (it self-tested 29/29 offline first, and it scores 206 of 234 controls
where the CSS path scores 107 and skips 126 as "declares no boundary"), but the fix is a
token/palette change across identity and state roles, and this track has learned four separate times
that *a token is advisory until proven* — a change must be rebuilt and re-measured before it means
anything. Doing that blind, unattended, on the default palette of a shipping app is not a decision
an autonomous run should make for you.

**If skipped:** the app ships with 66 load-bearing control boundaries below 3:1 on the default theme.

---

## 2. MAL sync against your real MyAnimeList account

**Risk: HIGHEST-user-impact. The reason changed today: it is no longer "unconfigured", it is
"configured but never once executed against a real account."**

**What to do.** Open the MAL panel, start the authorize flow, approve it in the browser, and paste
the `code` and `state` back into the app. Then do a **read** (`fetchList`) before any write.

**What you should see.** The browser lands on `http://localhost/oauth/callback` showing a **dead
page — that is expected and correct.** The app runs no server there; the `code` is read out of the
address bar by hand. After pasting, status should flip to connected with your username.

**What was measured, and what was not.** A new gate
(`docs/migration/tools/packaged-mal-config-gate.mjs`, proof
`docs/migration/proof/packaged-mal-config-sweep-mal/`, exit 0) ran the packaged app twice, differing
only in whether `JP_STUDY_MAL_CLIENT_ID` was in the environment:

- unconfigured arm → `configured: false`, `beginAuth` refused with `not-configured`
- configured arm → `configured: true`, `beginAuth` succeeds
- the authorize URL has the right **shape**: `response_type=code`, `code_challenge_method=plain`
  (correct for MAL — hashing it breaks the exchange), an 86-char challenge, a 32-char `state` that
  matches the one handed back, and a `client_id` **asserted by length only, never by value**

**36 tests cover this client over a fake transport with zero network calls. Not one byte has ever
gone to MyAnimeList.** The first real request will be yours.

**Why a machine could not do it.** `completeAuth(code, state)` requires a human to approve in a
browser and paste two values back. There is no loopback listener and no protocol handler, so an
automated run cannot complete OAuth and this one did not try.

**Two specific things to watch:**
- **`redirect_uri` is not sent in the authorize URL**, so MAL will use whatever is registered
  against the app (`http://localhost/oauth/callback`). That registered value is now load-bearing and
  has never been exercised. If authorize fails, this is the first thing to check.
- **Do a read before any write.** `mal:updateEntry` mutates your real list. There is no auto-sync by
  design — keep it that way.

**If skipped:** the entire authenticated-MAL feature is unproven against the real service.

---

## 3. The light themes — six of them are badly broken, and the fixes are yours to judge

**Risk: HIGH.** Accessibility had only ever been measured on 2 of the app's **15** registered themes
(the brief said twelve; there are 13 in `BASE_THEMES` plus `frutiger-aero` and `wired-archive`).

**What to do.** Switch to **`soft-sepia`** and read a page of text. Then `classic-light`.

**What you should see — and this is the part a machine cannot score.** On `soft-sepia`, more than
half the painted text is below WCAG AA. Whether that reads as "warm and low-contrast by design" or
"broken" is a **taste and intent judgement**, and it is exactly the call that should not be made
unattended.

| theme | | B1 text: real / below AA / samples | B2 non-text (load-bearing) | B3 focus ring |
|---|---|---|---|---|
| `study-os` (default) | dark | **0** / 4 / 336 | PASS (0) | PASS 0/52, 4.8–5.4:1 |
| `dark-nebula` | dark | 7 / 11 / 346 | PASS (0) | PASS 0/54 |
| `high-contrast` | dark | **0** / 4 / 314 | PASS (0) | PASS 0/52 |
| `classic-light` | light | **16** / 20 / 344 | **FAIL (16)** | PASS but **marginal: 3.41:1** |
| `ocean-blue` | light | **23** / 27 / 343 | **FAIL (16)** | PASS 0/52 |
| `paper` | light | **64** / 68 / 346 | **FAIL (16)** | PASS 0/54 |
| `mint-green` | light | **90** / 94 / 335 | **FAIL (16)** | PASS 0/52 |
| `rose-pine` | light | **166** / 170 / 309 | **FAIL (16)** | PASS 0/54 |
| `soft-sepia` | light | **174** / 178 / 343 | **FAIL (16)** | PASS 0/52 |
| `wired-archive` | dark | 1 / 3 / 90 † | **FAIL (5)** | PASS 0/5 † |

**Six light themes, six failures, and `16` load-bearing boundaries in every single one** — against
every dark theme's 0. That is **one palette decision that does not survive a light background, not
six separate bugs**, which is good news for the size of the fix.

† `wired-archive` is not a good result — it is an **unmeasurable** one. It paints almost everything
on a `background-image` (a CRT/texture aesthetic), and the CSS contrast measurer cannot resolve a
backdrop behind one: **303 of its 393 text samples and 223 of its 246 controls came back
unmeasurable.** Re-measured with the pixel sampler it scores **216 of 248** controls and fails with
**57 load-bearing**. Judge it by eye, not by its CSS row.

The focus ring is the same `rgb(255,46,77)` on every theme. On the dark default it sits at
4.8–5.4:1; on white it drops to **3.41:1** — still passing, with almost no margin.

**Why a machine could not settle it.** Contrast is measured; *taste* is not. A deliberately soft
sepia palette and a broken one produce the same number.

**If skipped:** two shipped light themes have serious text-contrast defects.

---

## 4. Anything visual or aesthetic, especially the Frutiger Aero colour changes

**Risk: MEDIUM-HIGH.** Slice 72 landed **four colour changes** in the aero theme to fix 24 text
failures and four broken focus rings. This sweep confirms the fixes took (aero B1 is now **0 real
of 129 samples**, B3 **0 of 4 below 3:1**) — but "passes contrast" and "still looks like Frutiger
Aero" are different claims.

**What to do.** Switch to `frutiger-aero` and look at it as a design, not as a number.

**Why a machine could not:** a palette can satisfy every ratio in WCAG and still have lost the
aesthetic it existed for. Nothing here can tell you that.

---

## 5. Clean-machine smoke test

**Risk: MEDIUM.** Every measurement in this track runs on a box that has run the app hundreds of
times, with a warm `%APPDATA%`, an installed Whisper model, a built sidecar and a populated library.

**What to do.** Run the packaged app on a machine that has **never** run it, and go through first
launch, consent, and the first study action.

**Why a machine could not:** no clean machine exists here. Deliberately deferred by you previously,
and still correct to defer.

---

## 6. Upgrade from representative old data

**Risk: MEDIUM.** The storage migration has been measured (`rawSnapshot=true doubleWrite=false`, the
media-study database is enumerated and retained), but only against synthetic fixtures.

**What to do.** Take a **backup** of a genuinely old-format profile, point the app at it, and check
nothing is dropped — decks, resume positions, mined cards, the media-study database.

**Why a machine could not:** no old-format profile exists on this box, and the carried item
`media-study-localstorage-half-never-round-tripped` is still **OPEN** for exactly this reason — the
localStorage half of the media-study fix seeds 5 keys and *not*
`jp-media-study-database-v1`, so it remains unexercised at runtime.

---

## 7. Whisper first-use model download

**Risk: MEDIUM.** The model is loaded in a renderer worker
(`src/renderer/whisperTranscribePcm.ts`, a fresh worker per call, cached by the browser). On a
machine without it, first use is a **multi-hundred-megabyte fetch**.

**What to do.** On a machine with no cached model, trigger a transcription and watch what the UI
does *during* the download — progress, cancellability, and what happens if it fails midway.

**Why a machine could not:** deliberately never triggered. Pulling hundreds of megabytes unattended
is not something an autonomous run should do, and the model is already installed here so the
first-use path cannot be observed at all.

---

## 8. Anything touching your real profile or your ~82-deck Anki collection

**Risk: MEDIUM, but unbounded if it goes wrong.** Every harness in this track uses an
`os.tmpdir()` scratch profile, on purpose. **Nothing in this sweep touched
`%APPDATA%/jp-study-app` or your real collection.**

**What to do.** With Anki open on your real collection, mine one card and confirm it lands in the
right deck with the right note type — then check the interval/rollup behaviour on a card you do not
mind touching.

**Why a machine could not:** pointing an automated run at a live 82-deck collection is the one
mistake that is not undoable. It was not done and should not be.

---

## 9. The surfaces this sweep could not reach on a throwaway profile

**Risk: LOW-MEDIUM, but they are genuinely unmeasured — `NOT-REACHABLE`, not `PASS`.**

- **The player study overlay** (`D0`) — not reachable on a profile with no library.
- **Two sliders** (`E2`) — skipped by sequential navigation because they are disabled with no media
  loaded; their names were read from the DOM, not from a keyboard stop.
- **MAL list read/write** — needs the OAuth completion in item 2.

**What to do.** Repeat the keyboard walk on **your** profile, which has a real library, and Tab
through the player with media actually playing.

**Why a machine could not:** a scratch profile has no library by construction. `--fixture` seeds
artwork, which is why C0 has real subjects, but it does not seed a playable media session.

---

## 10. Confirm the checkpoint commit is what you wanted

**Risk: LOW, but it is the one irreversible thing this run did.**

Commit **`8acf172`** on `grammarx/phase-1-5` staged **1346 files** (`+532,590 / −42,903`) under the
one-time `git add -A` you authorised. **Not pushed.** No stash was touched. The other two worktrees
were not touched.

**Look specifically at:** the **11 `NOCTIS`/`noctis` deletions** plus the new
`noctisRetirement.test.ts`. These are a Noctis retirement performed *in this worktree*, which is a
different thing from the `codex/noctis-beta` branch (a separate worktree this commit cannot reach).
Excluding them would have left the tree half-committed — but if that is not what you meant, this is
the commit to amend, and it is easiest to do before anything is built on top of it.

**Scanned and clean:** no `.env`/`.pem`/key files, no tokens, and **0 occurrences of your MAL client
id** anywhere in the staged tree. Its value was never printed, logged or written to any file by this
run.

---

## Not on this list, and why

These were **measured** this run and need nothing from you: the CSP is delivered *and enforced* in
the packaged build; the Phase 7 allow-list refusal passes in its strong two-arm form against a plan
from the real local model; the offline-first behaviour of the packaged artifact; the carried-items
audit (exit 0); `vitest` 374 files / 4815 tests; i18n exit 0 across 6688 keys; and the
architecture audit ("Nothing new"). Proof paths for all of them are in
`SLICE_76_PRACTICAL_SWEEP.md`.
