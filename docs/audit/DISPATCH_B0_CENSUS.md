# DISPATCH B0 — The denominator: enumerate every surface, setting and navigation path

Cold agent, `jp-study-app`. **Static analysis only. Do not start, restart or kill any app.**

---

## 0. Read first

1. **`.claude/skills/jp-dispatch/SKILL.md`** — working rules. Follow it.
2. **`.claude/skills/honesty-probe/SKILL.md`** — the probes, verdict vocabulary and **the
   canonical row schema**. Your output feeds directly into it. Use its schema; do not invent one.

---

## 1. Why this runs before anything is driven

Every later probe is click-driven, so it only reaches what is visible from the top. **A sub-tab
three levels into the Scraper is invisible to a sweep that never states how many sub-tabs
exist.** Your job is to produce the denominator, so that every later table can report
`visited / enumerated` instead of an impression of completeness.

**An audit that does not state its denominator is claiming completeness it did not measure.**
That is the defect this whole audit exists to find; B0 is what stops us committing it.

---

## 2. Ownership

Create/edit **only**:

- `docs/audit/CENSUS_SURFACES.md`
- `docs/audit/CENSUS_SETTINGS.md`
- `docs/audit/CENSUS_NAVIGATION.md`
- `docs/audit/HANDOFF_B0_CENSUS.md`

Everything else read-only. **Do not commit, branch or `git add`** — you are on
`audit/a-evidence`; the orchestrator commits. Every other `jp-dispatch` rule stands.

---

## 3. Four enumerations

### 3.1 Surfaces — `CENSUS_SURFACES.md`

Every distinct thing a user can be looking at. Sources: the desktop app registry
(`shared/desktop.ts` `DesktopWinSection`, `DesktopShell.tsx`, `AppSection.tsx`,
`CommandPalette.tsx`, `main.ts` `POPOUT_SECTIONS`), plus **every nested tab/panel/mode state**:
route registries, `activeTab`-style state unions, mode switchers, drawers, modals.

For each: `id · owning app · nesting depth · how it is selected (tab id / route / state value) ·
defining file:line`.

**Out of scope by ruling — record but mark `EXCLUDED`:** Blanc, Frutiger Aero, Wired /
`wired-archive`, secret-mode surfaces.

Report the total, and report it **by depth** — depth ≥3 is where later probes will under-reach.

### 3.2 Settings — `CENSUS_SETTINGS.md`

Every setting key from the defaults/schema objects. For each: `key · schema file:line · write
sites · read sites`.

**Do the orphan grep now, because it is cheap and static:** grep each key, count read sites,
**zero reads = orphan candidate**. This is Probe E failure mode 2, and it is the one cluster
that can be largely resolved without ever launching the app.

Known precedent to reproduce and extend: `maxParallelDownloads`, `memoryBudgetMb`,
`cpuThrottlePercent`, `reuseBrowserContext`, `prefetchNextPage`, `mergeStrategy` reportedly have
**zero** references in `src/main/`. Verify that, then apply the same method to every other
settings surface — the Scraper's drawer is not the only one.

Report: total keys, orphan candidates, and the per-surface breakdown.

### 3.3 Navigation graph — `CENSUS_NAVIGATION.md`

Every `openX`-style call site plus the launcher / Start-menu / command-palette / keyboard-shortcut
registries. This is the same graph Probe C (dead handoffs) and Probe F (entry points) both need,
so it is built once, here.

For each surface from 3.1: **how many navigation paths reach it**, and from where.

> **This directly produces the audit's highest-value row shape.** A surface with **zero entry
> points** exists only in code. Flag every one — do not resolve it, do not judge it, just
> enumerate. Later waves decide whether it is dead, hidden, or reachable by a route you missed.
> **Say which, if any, you are unsure about** rather than silently resolving.

**Specific case to settle, because a plan doc calls it done:** the visual-novel feature has
`main/immersion/visualNovels.ts`, `shared/visualNovel.ts`, seven renderer panels under
`components/immersion/`, eight test files, i18n keys and a `settingsRegistry` entry. **How many
navigation paths reach any of it?** Report the number and the paths; do not conclude anything
about whether it works.

### 3.4 i18n reachability

Every key in `shared/i18n/catalogs/en.ts` is a string rendered somewhere. **A key with no
reachable render path is a removed feature or an unreachable one.**

Report: total keys, keys whose prefix maps to no surface in 3.1, and the largest such clusters.

> Reuse of a known instrument: this is what caught the Game Arena, where `GAME_ARENA_CHROME` is
> spread into all four catalogs so `i18n-check` passes on English text in every language.
> **Sweep for that same pattern** — a catalog block shared across languages by spreading rather
> than translating. Report every instance you find, with the spreading site.

---

## 4. Method constraints

- **Static only.** Where static analysis genuinely cannot resolve something (a dynamically
  computed tab id, a registry built at runtime), say so and mark it `UNRESOLVED-STATIC` — that
  is a real finding about the codebase, not a gap in your work.
- **Counts are measured totals**, never deltas.
- Enumerating is the job. **Do not audit, judge, fix or rank.** If you notice a defect, record it
  in the handoff's defect section and move on.

## 5. Handoff — `docs/audit/HANDOFF_B0_CENSUS.md`, written as you go

The four totals up front, then: what you could not resolve statically and why; any place a
registry disagrees with another registry (an app in the Start menu but not in the palette, say)
— those disagreements are themselves findings; defects noticed but not fixed.

## 6. Scope

If you finish early, stop. Do not begin probing surfaces — that is wave 3 and it needs the live
queue and a decision you do not have.
