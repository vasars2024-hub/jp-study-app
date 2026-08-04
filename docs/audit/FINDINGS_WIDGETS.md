# Widget system — driven live

**Run:** 2026-08-04 06:43 by the orchestrator, fresh scratch profile. App shut down cleanly;
`%APPDATA%\jp-study-app` never opened.

## Verdict: `LIVE`. The widget system works.

This probe existed to distinguish three states, because `TASKS.md` records the Home Workspace
framework as four completed phases while the first-run measurement found **zero** widgets on the
desktop. Both can be true if widgets are opt-in.

| Hypothesis | Result |
|---|---|
| **Opt-in and working** | **CONFIRMED** |
| Built but unreachable (`SHIPPED-DEAD`) | refuted — entry point exists |
| Reachable but inert (Probe A) | refuted — survives reload |

### What was measured

| | |
|---|---|
| Entry point | **`Widgets` button in the taskbar tray**, with an accessible name. Discoverable |
| Catalogue | **27 `widget-card` entries** in **6 groups**, **9 tabs** (All / Favorites / Recent / …), 77 buttons |
| Add | `Digital Clock` → **1 widget frame on the desktop** |
| **Persistence across reload** | **SURVIVED** — after `location.reload()` the frame renders `Digital Clock ⋯ 06:43:34 Tuesday, Aug 4`, a live ticking clock |
| Gallery state | `jp-widget-gallery={"favorites":[],"recent":["clock-digital"]}` |
| Placement state | **not** in `localStorage` — the only widget key is the gallery's. Placement persists through main-process state, so a `localStorage`-only probe would wrongly report it unsaved |

**27 catalogue entries measured**, against the 25 `TASKS.md` describes. Stated as measured; the
delta is not investigated here.

### Consequence for the first-run finding

`FINDINGS_SHELL_FIRSTRUN.md` records **0 widgets** on a new profile. That is **by design, not a
defect** — widgets are opt-in and the tray button is present and labelled. It belongs in the
discoverability discussion with the empty desktop, not in the FIX register.

---

## A third near-false finding, caught — and now a pattern worth naming

Querying `.widget-gallery-backdrop` and walking its subtree returned **0 buttons, 0 classed
children, empty text**. Read alone, that is "the widget gallery opens empty" — a clean, credible,
publishable defect.

It is wrong. The DOM node count went **87 → 367** when the gallery opened, so ~280 elements
rendered *somewhere*. Sweeping the whole document found them: **`.widget-gallery` is a sibling of
`.widget-gallery-backdrop`, not a child.**

**That is the third time this session a "missing / empty / broken" reading turned out to be a
scope error, all in this app:**

1. **P1** read a surface one round-trip after navigating — twice — and saw lists that were merely
   still loading.
2. **The Grammar window** appeared unopenable after a click; `/health` showed it had popped out
   into a **second Electron window** and the shell was correctly refusing to duplicate it.
3. **This gallery**, whose content is a sibling of the container queried.

> **Standing rule for this app: an "empty" or "absent" result is a scope hypothesis, not a
> finding.** Before reporting absence, confirm three things — that render has settled, that you
> are in the right *window* (`/health` enumerates them), and that you are in the right *container*
> (a node-count delta tells you whether something rendered elsewhere).
>
> This is the practical form of the rule the track already had: *a refusal has no positive
> observable.* An absence needs a positive control before it means anything — here, the node-count
> delta was that control, and it is cheap.

## Method notes

- Consent dismissed with **No thanks**; no telemetry sent on the user's behalf.
- Persistence was tested by reload, not by reading state back from the same page — an "Add" that
  vanishes on reload never happened, and only the reload distinguishes the two.
