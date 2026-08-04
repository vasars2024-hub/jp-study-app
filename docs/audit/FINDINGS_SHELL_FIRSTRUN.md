# Shell, first-run and Game Arena i18n — driven live

**Run:** 2026-08-04 06:32 by the orchestrator, on a fresh scratch profile, while both fleet
accounts were rate-limited. App shut down cleanly afterwards; `%APPDATA%\jp-study-app` never
opened.

---

## 1. The first-run experience, measured

After dismissing the consent gate, a brand-new user's entire screen is **87 DOM nodes**:

| | |
|---|---|
| Floating windows | **0** |
| Desktop icons | **0** |
| Widgets | **0** |
| Taskbar buttons | 9 |

And the complete visible text is:

```
Start  Desktop 1  Desktop 2  06:32 AM Aug 4  Seanime sidecar · stopped  + Media workspace stopped
```

**The most substantive copy on a new user's first screen is two internal subsystems reporting
`stopped`.** There is no welcome, no guidance, no content, and nothing indicating what to do
next. A reasonable new user reads "stopped" as "something is broken".

**The app is not, in fact, empty — it is undiscoverable.** The Start button opens **24 apps in 6
groups** (Study · Library · Media · Progress · System · Shortcuts). Everything is there; nothing
points at it.

This is the concrete cost of `PROMISE_REGISTER.md`'s headline row: **Phase 9.5, the first-boot
guided tour specced as "last phase before release", was never built.** The gap it was meant to
fill is exactly this screen.

**Verdict — Probe F: `BROKEN` (discoverability).** Filed to USER-MUST as well, because whether
this is acceptable is a judgement, not a measurement.

---

## 2. Game Arena renders 100% English under a Japanese UI

`CENSUS_*` established statically that `GAME_ARENA_CHROME` (109 keys) and `MOONCAP_PHASE_LORE`
(200) are **spread** into all four catalogs rather than translated — 309 keys of English present
in `ja`/`zh`/`ru`. This is the live consequence.

Set `localStorage['ui-lang'] = 'ja'` (the key is `STORAGE_KEY` at `renderer/i18n.ts:24`), reloaded,
confirmed `<html lang="ja">`, then opened the Arena from the Start menu:

| measure | value |
|---|---:|
| CJK characters in the Arena window | **0** |
| Latin characters | **872** |
| **Percent Latin** | **100%** |

Window title under Japanese UI: **`Game Arena`**. Sample body text:

> `Game Arena · Fast local drills plus Mirror Writing evaluation, all keyed to your level. · 0 XP
> 0 streak 0 badges · Settings · Sentence Builder — Rebuild the Japanese sentence from shuffled
> pieces. · Speed Type — Type the Japanese answer with…`

### The positive control — this is what makes the number mean anything

An all-English reading would look identical if the language switch had silently failed. So a
second app was opened in the **same session, same `ui-lang=ja`**:

| app | title rendered | CJK | Latin | % Latin |
|---|---|---:|---:|---:|
| **Dictionary** | **辞書** | 7 | 153 | 96% |
| **Game Arena** | `Game Arena` | **0** | 872 | **100%** |

**The mechanism works** — the Start-menu entry and window title both render `辞書`. The Arena does
not translate at all, including its own title.

> **A corroboration nobody was looking for.** Dictionary's *title* translates while its *body* is
> 96% Latin — which independently reproduces P7's finding that `DictionaryView.tsx` (96 lines)
> contains **zero** `useT`/`t()` calls. The shell translates the window title from the app
> registry; the view's own content never adopted the system.

### Why both gates pass

`i18n-check.cjs` compares catalogs against each other. A key spread into all four **is present in
all four**, so the checker is satisfied. The vitest catalog-hygiene suite asserts the same
property. **Neither can distinguish a translated string from an English one**, so 309 keys ship as
English in every language with two green gates behind them.

**Verdict — Probe A/F: `BROKEN`.** Same gate-blindness class as P7's 846 un-adopted lines: a check
that measures presence rather than content.

---

## 3. A development marker in shipped UI

The Arena window renders **`PLAN 3 / 3.5`** in its chrome, visible in both language modes. That is
an internal phase reference from the build plan appearing in the product. Small, but it is
user-visible text that means nothing to a user.

---

## 4. Method notes

- **The first eval after the bridge came up found no consent gate**; a second, two seconds later,
  found it with both buttons. React had not mounted yet. This is the same async trap that produced
  two would-be-fabricated findings in P1 — recorded again because it recurs on every fresh launch.
- Consent was dismissed with **No thanks**; no telemetry was sent on the user's behalf.
- `click.ps1`'s hit test **matched** on `.os-start-btn` this time. On the earlier smoke test it
  **refused**, because the consent overlay covered the same point — the guard distinguishing those
  two situations correctly is what makes this run's clicks trustworthy.
