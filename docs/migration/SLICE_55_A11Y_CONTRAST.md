# SLICE 55 — the one-short Tab gap, contrast, and artwork

*(written as the run went, not afterwards — three consecutive slices have died at a usage limit
having done all the work and none of the recording)*

Subject: `out/jp-study-app-win32-x64/` (rebuilt by slice 53 at ~15:30 2026-08-02, carries the
slider fix). No `npm run package` was run this slice. Nothing under `src/` was edited while a
harness run was under measurement.

---

## TASK 1 — the one-short Tab gap: **NOT a missing stop. A duplicated element and a miscounting metric.**

### The answer

**Every focusable element on all four surfaces IS reached by Tab.** The "one short" is not a
coverage gap at all — it is `distinctStops` counting *strings* while `focusableVisible` counts
*elements*, and one element being rendered **twice** on every surface.

| surface | slice 50's reading | elements Tab actually reached | the collapsed pair |
|---|---|---|---|
| desktop shell | 10 / 11 | **11 / 11** | `button.os-tray-btn.os-tray-btn-bell` "Notifications" ×2 |
| settings | 43 / 44 | **44 / 44** | same |
| library | 29 / 30 | **30 / 30** | same |
| notebook | 39 / 40 | **40 / 40** | same |

**One cause, on all four surfaces, and it is the shell-level element the brief guessed at — but it
was measured, not assumed.** `src/renderer/components/DesktopShell.tsx` renders
`<NotificationBell />` **twice inside the same `<div className="os-tray">`** — line 2387 and line
2412 in the working tree, lines 2372 and 2397 in committed `HEAD`, so it is not another track's
uncommitted edit. Both instances paint a `<button className="os-tray-btn os-tray-btn-bell">`
carrying the identical `aria-label` (`NotificationBell.tsx:24`), and both dispatch
`shell:toggleNotifications`.

`walkSurface()` computes `distinctStops` as `new Set(order.map(o => o.el + '|' + o.name))`.
`__describe()` renders both bells as the same string and `__name()` returns the same
`aria-label` for both, so **two elements collapse into one Set entry**. `focusableVisible` is an
element count. The two numbers were never commensurable, and their difference on every surface is
exactly the number of duplicate describe+name pairs on it: one.

### The proof, from the tab order itself

The desktop-shell walk (60 presses, `proof/packaged-a11y-deep-20260802slice53fixed/`) cycles with
a period of exactly **11**, and the bell appears **twice per cycle**:

```
i= 0 Start                  i=11 Start                (cycle length 11)
i= 1 Desktop 1
i= 2 Desktop 2
i= 3 Search everything…
i= 4 Widgets
i= 5 os-tray-btn-bell  "Notifications"   <-- bell #1
i= 6 Clipboard history (Ctrl+Shift+V)
i= 7 Settings
i= 8 Quick settings
i= 9 os-tray-btn-bell  "Notifications"   <-- bell #2
i=10 Media workspace
```

Bell stop indices per surface, and the cycle length they imply:

| surface | bell stops at `i=` | period | focusable |
|---|---|---|---|
| desktop shell | 5, 9, 16, 20, 27, 31, 38, 42, 49, 53 | 11 | 11 |
| settings | 0, 4, 45, 49 | 45 (44 elements + 1 `leftDocument` stop) | 44 |
| library | 24, 28, 54, 58 | 30 | 30 |
| notebook | 34, 38 | 40 (only 1.5 cycles fit in 60 presses) | 40 |

The two bells sit 4 stops apart in every cycle, on every surface — the taskbar tray is mounted in
every window, which is why the same off-by-one appeared four times.

### The gate already carried the right answer and nobody read it

`walkSurface()` tags every focusable element with `data-a11y-focusable="i"` and computes
`unreached` from the *indices* Tab landed on, not from strings. In the slice 53 run:

```
surfacesFullyCovered: 4      unreachedByTab: []      surfacesTruncatedByBudget: []
desktop shell   unreachedCount 0
section:settings unreachedCount 0
section:library  unreachedCount 0
section:notebook unreachedCount 0
```

`coveredAllFocusable` is `true` on all four. So the element-level diff slice 50 "ended before
reaching" **had in fact been run by slice 53** — it just sat next to a headline number that
contradicts it, and the contradiction was never resolved. That is the lesson worth carrying:
`distinctStops` and `focusableVisible` were printed side by side as if they were a fraction, and
they are not one.

### Is it a defect? Two answers, and they are different.

1. **The keyboard-coverage claim: NO DEFECT.** There is no unreachable control, no focus trap and
   no skipped stop on any of the four surfaces. Slice 50's "every surface is exactly one short"
   should be retired; it described the instrument, not the app.

2. **The duplicate itself: YES, a real defect — but a UI one, not a keyboard-coverage one.** The
   taskbar tray paints **two identical notification bells**, both visible (they passed
   `__visible`: non-zero rect, not `display:none`, not inside `aria-hidden`), both keyboard
   focusable, both with the same accessible name, both firing the same event. A screen-reader
   user hears "Notifications, button" twice in the tray with nothing to tell them apart, and a
   sighted user sees the bell twice. It is committed, not a working-tree artifact.

**Not fixed here, deliberately.** `src/renderer/components/DesktopShell.tsx` is outside this
slice's file ownership (`docs/migration/tools/**`, `docs/migration/proof/**`, and theme/CSS for a
contrast fix). The fix is a one-line deletion of the second `<NotificationBell />` — but which of
the two to keep is a shell-layout decision, and the shell is being actively edited by another
agent right now. Reported, not touched.

### Instrument change made because of this

`packaged-a11y-deep-gate.mjs` now records, **additively** (every pre-existing field keeps its old
value and its old name, so slice 50/53 numbers stay comparable):

- `stopsReachedByIdentity` — `focusableVisible - unreachedCount`, the honest "stops reached".
- `describeCollisions` — inventory entries that share a `describe|name` key, named. This is what
  makes a future off-by-one self-explaining instead of a four-surface mystery.
- `focusableIndex` on every entry in `order`, so the walk can be re-derived per element.
- `inventory` — the tagged focusable list itself.
- **`A2`**, a step that *resolves* the question rather than restating it: it PASSES only when the
  element-level reading says nothing was missed, so a genuinely unreachable control still fails —
  with a name attached.

### Re-measured live against the packaged build with the extended instrument

Not inferred from slice 53's artifact — driven again, with real CDP `Tab` presses, on
`out/jp-study-app-win32-x64/`:

```
A1  stopsReachedByIdentity: 125   focusableTotal: 125   collapsedByDescribe: 4
    describeCollisions:
      desktop shell:    button.os-tray-btn.os-tray-btn-bell|Notifications x2
      section:settings: button.os-tray-btn.os-tray-btn-bell|Notifications x2
      section:library:  button.os-tray-btn.os-tray-btn-bell|Notifications x2
      section:notebook: button.os-tray-btn.os-tray-btn-bell|Notifications x2

A2  PASS — every focusable element is REACHED BY TAB: 125/125 across 4 surfaces;
    the 4 units by which distinctStops falls short are DUPLICATE describe|name pairs,
    not missing stops.
```

`distinctStops` still reads 10/43/29/39 — unchanged, on purpose, so every slice-50 and slice-53
number stays comparable. **125 = 11 + 44 + 30 + 40, and 125 − 121 = 4 = one duplicate bell per
surface.** The arithmetic closes exactly.

---

## TASK 2 — contrast, measured numerically on the packaged app

**Composited, not declared** — everywhere, and the difference is the whole story on the only
failures found. The gate's `__backdrop()` walks the ancestor chain compositing every
semi-transparent layer and multiplies in every CSS `opacity` between the text and the element
that paints the opaque backdrop; text sitting on a `background-image` is reported UNMEASURABLE
rather than attributed to whatever colour is behind the gradient. Both numbers are now recorded
per sample (`color` = declared, `colorPainted` = composited), so the claim is checkable.

**Both traps the brief names were already closed, and were re-verified in this run:**

- Viewport: `Emulation.setDeviceMetricsOverride` to 1600×1000, then
  `document.documentElement.clientWidth/clientHeight` re-read **in the same probe** →
  `requested 1600x1000, measured 1600x1000`, step **0b PASS**. The run aborts if they disagree.
- Mid-transition opacity: every style read waits `SETTLE_MS = 320`. The focus-ring measurement
  below is taken on the walk's own settled stops rather than immediately after a `focus()`.

**The measurer is self-tested before any app number is believed** (step B0 PASS, exact):
`#000` on `#fff` → **21.00**; `#777` on `#888` → **1.26**; `#fff` on `#000` at `opacity:.5` →
**5.28** (it would be 21.00 if opacity were ignored); text over a gradient → **UNMEASURABLE, as
designed**.

### B1 — text contrast (1.4.3): 335 samples, 8 surfaces, **0 real failures**

The desktop shell itself is now swept — it never had been; every surface in the old list was a
window.

| | |
|---|---|
| surfaces | desktop shell, settings, dictionary, anki, library, reading, notebook, stats |
| samples | **335** |
| below AA | **4** (1.2%) |
| below AA **excluding inactive controls** | **0** |
| unmeasurable | 6 (all `background-image on aside.card-preview`) |

**All four failures are on `disabled` buttons**, which WCAG 1.4.3 exempts outright as "inactive
user interface components". They are the app's `opacity: .45` disabled style, and they are the
exact case where declared and composited part company:

| surface | control | declared | **composited** | on | ratio | if opacity ignored |
|---|---|---|---|---|---|---|
| dictionary | `button.btn.primary` "Search" | `rgb(245,244,247)` | `rgb(117,116,121)` | `rgb(13,12,18)` | **4.22** | 17.77 |
| notebook | `button.btn.ghost` "Clear" | `rgb(245,244,247)` | `rgb(117,116,121)` | `rgb(13,12,18)` | **4.22** | 17.77 |
| anki | `button.btn` "Reset to defaults" | `rgb(245,244,247)` | `rgb(121,120,126)` | `rgb(20,19,27)` | **4.23** | 16.85 |
| anki | `button.btn.primary` "Saved" | `rgb(245,244,247)` | `rgb(132,130,139)` | `rgb(39,36,51)` | **3.98** | 13.82 |

Read the declared colour and every one of these is a comfortable pass at 13–18:1. Read the
painted pixel and they are 3.98–4.23:1. **Nothing was fixed here, because there is nothing to
fix**: an inactive control is exempt, and raising the disabled opacity would make disabled
buttons look enabled.

**The worst ACTIVE sample is 4.60:1** (`span.res-cost.cost-freemium`, `rgb(255,107,129)` on
`rgb(49,48,80)`, on the reading surface) against a 4.5 requirement — a real pass, but a 0.1
margin, worth knowing before anyone darkens that panel.

