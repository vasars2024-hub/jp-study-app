---
name: honesty-probe
description: >
  Decide whether a surface, feature or control in jp-study-app is real, and
  report it in the one shape every audit agent emits. Use when asked to audit
  this surface, check whether a page is honest, work out if a feature is real or
  a shell, find dead controls or fabricated data, check whether a setting
  actually does anything, verify a control does what it says, report coverage of
  a surface, reconcile a plan document against what shipped, or classify what a
  feature actually is. Covers the six probes, the verdict vocabulary, the row
  schema all findings use, and how a finding resolves.
---

# Deciding whether a feature is real, and reporting it in one shape

`jp-bridge` is **how you drive**. This is **what you conclude**. Read `jp-dispatch` first for
ownership, git and gate rules; it is not repeated here.

**Why one shape matters more than good prose:** six agents audit six surfaces concurrently and
their tables are concatenated into one master audit. Six invented formats cost a whole session to
normalise. Emit §5's row schema exactly, with §4's vocabulary, or your table cannot be merged.

Facts here were verified against source on 2026-08-03 at `1d30324`. Re-measure anything numeric
before quoting it.

---

## 1. The governing rule

**A document saying "done" is a hypothesis. The verdict comes from driving the app and observing a
side effect.**

`ready` in a registry, a green test, and a tick in a plan can all be true while the feature is
dead. Each of the three is evidence that someone *intended* the feature to work. None is evidence
that it does.

Corollary, and it is the one that catches people: **an "update" that vanishes on reload never
happened.** State that survives only in a React tree is not persistence, and a success toast is not
a side effect — it is a string.

## 2. Coverage is a ratio, not an impression

**Every table you emit reports `visited / enumerated`.**

Enumerate first, from something machine-readable — a registry, a route table, a directory listing,
the `os:open` cases — then drive, then divide. "I checked the settings panel" is not a coverage
claim. `<driven> / <enumerated> controls` is, with the enumeration command beside it.

An audit that does not state its denominator is claiming completeness it did not measure. **The
ones you did not reach go in the table as `NOT-REACHABLE` rows with the reason — not as silence.**
Silence is what makes a partial pass read as a complete one.

---

## 3. The six probes

Every row you emit names exactly one probe letter. If a finding needs two letters, it is two rows.

### A — Dead controls

**The shape:** a handler whose only effect is `setState` plus a success message.

**Static pass.** Diff the IPC a surface *claims* against the real surface in **`src/preload.ts`**,
which exposes one object — `api` — via `contextBridge.exposeInMainWorld('api', api)`
(`src/preload.ts:2209`) and declares **374 distinct `invoke('…')` channels**
(`grep -oE "invoke\('[^']+'" src/preload.ts | sort -u | wc -l` → 374, measured 2026-08-03). A
handler calling `window.api.x.y()` where no such channel exists is dead before you click anything.

**Live pass.** Click it, then assert an **observable side effect**, in this order of strength:

1. a persisted file changed on disk (strongest — you can diff it),
2. an IPC call was made (instrument it, don't infer it),
3. state survives a reload.

A re-render is not a side effect. A toast is not a side effect. `setState` followed by a message
that says the thing worked is the exact pattern this probe exists to catch.

### B — Fabricated data

**The rule:** on an **empty scratch profile**, rendered content is fabricated **unless it traces to
a shipped data file that is legitimately bundled study content.** Bundled dictionaries, grammar
tables, seed decks and preset lists are real content and pass.

**Content traced to a module-level constant *inside a view file* is fabricated regardless** — of
how plausible it looks, of whether a real version of it exists elsewhere, of whether someone
intended to wire it later.

The shipped precedent: Sources & tracking rendered `Connected`, `Ready`, `Available` and
`Configured` as four string literals under four identical green dots. Nothing checked anything —
and the same session showed "Connected" beside MyAnimeList while Discover, one click away,
reported `MyAnimeList — unreachable` from the same failure (`UI_UX_AUDIT.md:203-221`). Every one of
those now reads from something the app knows, and the dot's resting state is neutral rather than
green.

**Test it on the empty profile, not the populated one.** Real data on a populated profile and a
hardcoded constant look identical.

### C — Dead handoffs

**The shape:** `openX(id)` where the id shape does not match the target's id space. It navigates,
the target opens, and nothing is selected — which reads to a user as "the app lost my place".

Cross-surface navigation here runs on a `window` `CustomEvent` bus named **`os:open`**: the shell
listens at `src/renderer/components/DesktopShell.tsx:1091`, the command palette dispatches at
`src/renderer/components/CommandPalette.tsx:77`, and other surfaces dispatch it directly
(`GameArenaContent.tsx:111`, `VisualNovelSentenceAssist.tsx:166`, `MediaContent.tsx:935`,
`BlancReadyToolPanels.tsx:144`).

**Live:** click **every** cross-app navigation and assert the target **actually selected
something** — not that it opened. Opening is the cheap half and it always works.

### D — Silent failures

Two shapes, both reportable:

- **Renders nothing and says nothing.** Mounted, no content, no empty state, no affordance.
- **Surfaces a raw transport string with no way forward.** The shipped example:
  `Could not open the local video (HTTP 500): {"message":"Internal Server Error"}` as the headline
  of an error screen — a JSON body where a sentence belongs (`UI_UX_AUDIT.md:223-229`).

**And the third, which is yours to catch: any `NOT-REACHABLE` recorded as `PASS`.** That is a
silent failure in the *audit*, and it is a D row against the instrument.

> **Calibrate before you file a D row.** A gate run here classified five surfaces as EMPTY-SILENT
> and every one was the instrument's fault: `dictionary` had 205 characters of real UI and missed a
> 220-character threshold by 15; `translate` and `note` were awaiting input; `player` and `video`
> rendered a deliberate prose handoff with a button, missed only because the element carrying it
> had no class matching the empty-state selector (`SLICE_76_PRACTICAL_SWEEP.md:394-416`).
> **EMPTY-SILENT means mounted, said nothing, offered nothing to do.** Read what the surface
> actually rendered before you bucket it.

### E — Settings

**A setting must be *persisted* AND *consumed*.** Three separable failures, and they need different
evidence:

| Failure | How it fails | How to detect |
|---|---|---|
| Writes nothing | flip it, nothing changes on disk | diff the persisted file across the flip |
| **Orphan** | writes, but **no code reads the key** | **static, cheap:** grep the key, count read sites, **zero = orphan** |
| Startup-only | read once at boot while the UI implies live effect | flip it, observe no change; restart, observe the change |

**The full test:** flip → assert the persisted file changed → **restart on a copied profile** →
assert behaviour differs.

Two persistence channels exist and **a row must name which one it tested**:

- main-process JSON under `%APPDATA%\jp-study-app` (18 `.json` state files),
- renderer `localStorage` — e.g. `loadExternalPlayerPreferences()` and
  `loadVideoServerProfilesDocument()` read "the same localStorage the owning Settings panels write
  to" (`UI_UX_AUDIT.md:218-220`).

A live orphan example to calibrate against: `RETAINED_LS` seeds five keys and **not**
`jp-media-study-database-v1` — carried as
`media-study-localstorage-half-never-round-tripped`, still OPEN
(`SLICE_76_PRACTICAL_SWEEP.md:378-380`).

### F — Availability and integration

**A feature can be real and still not reach the user.** F is the probe for that, and it is
deliberately restricted to **measurable proxies** — no taste, no ranking:

| Proxy | What counts | The reading |
|---|---|---|
| **Entry-point count** | how many places can open it | **zero = exists only in code** |
| **Discovery depth** | clicks from root to reach it | a number, per surface |
| **Launcher / palette registration** | is it dispatchable via `os:open` from `CommandPalette.tsx`? | present / absent |
| **Empty / loading / error states** | does each exist? | **a feature with no empty state was wired, not designed** |
| **Control-type histogram** | counts by control type | overwhelmingly checkboxes with **no primary action** = the "settings page pretending to be a feature" pattern |
| **Lazy-CSS proxies** | see below | count them, don't judge them |
| **Structural conformance** | does it render `AppChrome`? | **19 files render it at 23 sites** — see below |

**Lazy-CSS proxies**, all countable:

- elements with **no design-system class**,
- inline `style=`,
- hardcoded hex / px **instead of tokens**,
- **class families used exactly once** (a name invented for one element),
- **native unstyled `<input>` / `<select>` / `<button>` with no app class.**

**Structural conformance.** `AppChrome` (`src/renderer/components/ui/AppChrome.tsx:60`) is rendered
by **19 files at 23 sites** — `rg -c "<AppChrome" src`, measured 2026-08-03.

> **The dispatch that commissioned this skill said 42 consumers. It is 19.** `index.ts` line **42**
> is `export * from './AppChrome';` — a line number that reads like a count. Quote 19, and quote
> the command. Non-adoption is still a measurement rather than a matter of taste at 19 out of ~24
> driveable surfaces, but the argument is made with the real number or not at all.

---

## 4. Verdict vocabulary

Exactly these six. No synonyms, no "partially working", no "mostly fine".

| Verdict | Means |
|---|---|
| `LIVE` | Driven, and a side effect was observed that survives a reload. The feature does what it says. |
| `MIXED` | Driven. Some paths produce a real side effect and some do not. The row must name which. |
| `FIXTURE` | Renders content that does not trace to real data — a module-level constant, a placeholder, a hardcoded status. Probe B's verdict. |
| `DEAD` | Driven, and no observable side effect at all. The control exists and does nothing. |
| `BROKEN` | Driven, and it errored or produced a wrong side effect. Distinct from `DEAD`: something happened, and it was wrong. |
| `NOT-REACHABLE` | Could not be driven — needs a human, needs real media, needs an OAuth completion, needs a device you do not have, or is disabled in the build under test. |

**`NOT-REACHABLE` is never to be reported as `PASS`.** It is not a pass, it is an absence of
measurement, and the two are only distinguishable if you say so. This repo already holds the line —
two disabled sliders are reported as NOT-REACHABLE rather than as passes
(`NEXT_SESSION.md:1436-1437`), and its sweep docs state that "anything marked UNTESTED or
NOT-REACHABLE was not measured, and that is a result, not an omission"
(`SLICE_76_PRACTICAL_SWEEP.md:6`).

Recording a `NOT-REACHABLE` as a `PASS` is itself a probe-D finding, filed against the instrument.

---

## 5. The row schema — defined here, referenced everywhere

**This is the single definition. `css-measure` and `claim-check` point at this section. Do not
restate it, do not extend it, do not reorder the columns.**

| id | area | surface | probe | claim | what was measured | verdict | evidence path | severity | owner |
|---|---|---|---|---|---|---|---|---|---|

| Column | Contents |
|---|---|
| **id** | `<package>-<probe><n>`, e.g. `S3-E2`. Unique across the whole wave — your package prefix guarantees it. |
| **area** | The package/track this belongs to. One token, stable across your table. |
| **surface** | The user-visible thing: window title, panel name, or route. What a user would call it. |
| **probe** | One letter, `A`–`F`. One row, one probe. |
| **claim** | What the app, the doc or the plan asserts — quoted where it is UI copy. |
| **what was measured** | The command or interaction and its result. **A row without this is an opinion.** |
| **verdict** | One of §4's six. Nothing else. |
| **evidence path** | Repo-relative path to the proof — a JSON record, a shot, a diff, a `file:line`. |
| **severity** | `blocker` / `major` / `minor`. `blocker` = the user is told something false in shipping UI. |
| **owner** | The package or directory that would fix it. Not a person. |

**Template row — every value below is a `<placeholder>`, not a finding.** No real key, count or
surface appears here on purpose: an illustrative example in a skill about fabricated data is the
one place an invented number gets quoted as real.

```
| <PKG>-E<n> | <area> | <Surface ▸ Panel> | E | "<the UI copy you are testing, quoted>" |
  flipped to <value>; <persisted-file> unchanged across the flip;
  `rg <the-storage-key> src` -> <W> write sites, <R> read sites | DEAD |
  docs/audit/proof/<pkg>-e<n>/ | major | src/<owning-dir>/** |
```

Note the *shape* of the measured column, which is the part to copy: the exact command, its counts,
and the fact that `R = 0` is what makes it an orphan. Someone re-running that one command
reproduces the verdict without asking you anything.

---

## 6. Two resolution ladders, and they differ

### Probes A–E: document, don't fix

**Default: disable the control, label it honestly, add a row to the known-issues file.**

Do not build the missing backend. A half-built mutation IPC is a new bug surface: it *looks*
implemented, so the next audit passes it, and the dishonesty is buried one layer deeper instead of
being visible at the surface. Build the backend only when the dispatch explicitly scopes it.

> **`KNOWN_ISSUES.md` does not exist in this repo** (`git ls-files | grep -i known_issues` → no
> output, re-verified 2026-08-03). The first run that needs it creates it, and **agrees the
> location with the user** rather than guessing.

### Probe F: relocate/promote · polish · hide

**The A–E ladder does not work for F.** Labelling an unfinished feature honestly does not make it
usable — it just documents that the user cannot get to it. So F rows resolve as:

- **relocate / promote** — it is real, it needs an entry point or a shallower path,
- **polish** — it is reachable and real, and its treatment is below the app's line,
- **hide** — it is not ready to be seen.

**`hide` is the default consideration before publication**, not the last resort. A feature with no
empty state and one entry point three levels deep is a liability at release and an asset after one
more pass.

## 7. Craft is not machine-decidable

F's proxies are **evidence**. Ranking polish — which of two reachable, functional surfaces looks
unfinished — is a **human judgement and goes to the user**. Never score it, never rank it, never
present a "polish score". Count the proxies, report the counts, and let the user decide what they
mean.

---

## 8. The promise register — reconciling plan docs against the tree

Used when a task is "does what we said we shipped actually exist". Each promise gets exactly one:

| Classification | Means |
|---|---|
| `SHIPPED-VERIFIED` | Built, driven, side effect observed. |
| `SHIPPED-PARTIAL` | Built; some of the promise is real and some is not. Name which. |
| `SHIPPED-DEAD` | **Code exists, driving says no.** The most expensive class — the work was done and does not reach the user. |
| `NOT-SHIPPED` | Planned, not built, and the doc says so. Honest. |
| `SILENTLY-DROPPED` | **Planned, never built, never marked abandoned — the doc still reads as a commitment.** |
| `RENAMED/SUPERSEDED` | Built under a different name or replaced by a different design. Not a failure; needs the mapping recorded so the next reader stops looking. |

### Rank promises by exposure

1. **Claims in shipping UI copy** — the user reads these.
2. **Public docs** — a prospective user reads these.
3. **Internal plans** — only we read these.

**A lie the user reads in the app outranks a stale tick in a planning file.** A `SILENTLY-DROPPED`
item in an internal plan is housekeeping. The same item asserted in a settings panel's help text is
a blocker.

### The highest-value row shape

**A feature with zero entry points that a plan marks done** is simultaneously an **F row** (zero
entry points = exists only in code) and a **commitment failure** (`SHIPPED-DEAD`). It is worth
finding above everything else because **the expensive part is already built** — the resolution is
usually one entry point, not a feature.

File it as both: an F row in the findings table and a `SHIPPED-DEAD` line in the promise register,
cross-referenced by `id`.
