# Secret OS — v1.0 Audit tracking

Source: `Untitled document (12).pdf` (2026-08-07) — 25 items in 5 sections, 15 embedded
screenshots. The screenshots are all in the **default `forest-night` theme**
(`data-materials` is null on the live app), so this audit covers the Secret OS shell as it
ships, not the Aero skin.

Branch: `audit/secret-os-v1`, cut from `3910317` on `audit/video-study-clip-mining`
(282 dirty paths carried over from the video-study track — **do not touch those files**).

## Evidence standard

Each row closes on a **measured value**, not a screenshot. Screenshots corroborate.
Screenshot evidence lives in `debug/shots/audit/<item>-<before|after>-<what>.png`.

## Phase 0 — pre-flight (complete 2026-08-07)

| Step | Result |
|---|---|
| userData backup | `%TEMP%\jp-userdata-backup-20260807-111418` — 210 files, 19 JSON, 49.6 MB |
| Backup scope | **Deviation from `jp-bridge` §2.** The directory is now **8.6 GB**; a full copy is impractical. Excluded regenerable/media trees: `downloads` (5.3 GB), `Service Worker` (1.5 GB), `models`, `Code Cache`, `Cache`, `Partitions`, `wallpapers`, `library`, `yomitan`, `artwork`. **Captured** all 19 top-level JSON state files, `Local Storage` (leveldb, 5.8 MB — holds lockscreen/customCss/desktopPrefs), `IndexedDB` (33 files), `Network`, `mining`, `scraper`, `seanime`, `Session Storage`. `Network\Cookies` is locked by the running Chromium and did not copy. **Consequence: do not run anything that deletes media — those trees have no restore point.** |
| Backups **discontinued** | User instruction, 2026-08-07: *"no backup saving, it takes too much space."* No further userData backups are taken in this audit. The one from 11:14 is kept. **Consequence: from here on nothing has a restore point — prefer non-persistent probes (see §1.4) over anything that writes `localStorage` or userData JSON.** |
| tsc baseline | 332 errors → `%TEMP%\claude\...\scratchpad\tsc-baseline.txt`. Prove "no new errors" by set-difference on file+message, never by filename filter. |
| `/logs` foreign-HMR check | Clean — 16 entries, 3 renderers connected, zero `hot updated`, zero errors. Nobody else editing the tree. |
| `eval.ps1` | Works (`-Health` and `-Js`). |
| `click.ps1` | Works, **including its refusal path** — correctly refused a nav-rail click occluded by `.fwin-bar`, then succeeded after scrolling the rail. |
| `shot.ps1` | Works — writes a real PNG, returns `path`/`width`/`height`. |
| Window state | Main window (id 1) was **minimized** at session start; `/focus` restored it. Viewport 1264×821, `.os-taskbar` present, theme `forest-night`. |

### Corrections to the `jp-bridge` skill found in Phase 0

- **`/logs` entries use `message`, not `text`.** Entry keys are `level, message, source, ts`;
  the response envelope is `{ok, total, entries}`. A filter on `.text` returns empty for
  every entry and reads as "no errors, no foreign edits" — a silent false pass. The skill's
  endpoint table does not name the field.
- **Settings nav items are addressable by `title`**, e.g.
  `.os-set-nav-item[title="Desktop background"]`. There is no `data-id`. The rail scrolls
  under `.fwin-bar`, so `scrollIntoView({block:'center'})` is a required pre-step before
  clicking any rail item.

## Section 1 — Personalization & Environment

| # | Item | Verdict | Selector measured | Value | Shots |
|---|---|---|---|---|---|
| 1.1 | Remove Aero wallpaper presets | **DONE** | `.os-wall-grid .os-wall-swatch` | **14 → 9**. `aeroStillListed: []` — zero URL-backed swatches remain. | `1.1-before-wallpaper-grid.png`, `1.1-after-wallpaper-grid.png` |
| 1.1b | Swatch `background-size` override | **FIXED** | same, `getComputedStyle().backgroundSize` | Before: all 5 URL-backed swatches read `auto, auto` / `repeat, repeat`, inline `backgroundSize` = `initial, initial` — the `background` shorthand at `WallpaperPage.tsx:52` reset it, defeating `.os-wall-swatch { background-size: cover }` (`styles.css:15033`); only `.wall-anim` survived via `!important`. After: `anyNotCovered: []` — every swatch resolves `cover`, animated keep `300% 300%`. | both |

### 1.1 — how it was done, and why not the way the plan said

The plan assumed removing the presets meant deleting them, and that
`nostalgicWallpaperPack.test.ts` would have to be rewritten. Measuring first showed that
would have been a silent regression: `WallpaperStage.tsx:23-24` resolves a playlist item of
`kind: 'preset'` through `getWallPreset()`, which **falls back to `CORE_WALL_PRESETS[0]`
(Crimson Veil) for an unknown id**. Deleting the five would have repainted the entire Secret
OS (Aero) rotation as Crimson Veil, with no error anywhere.

Split the two concepts instead:

- `WALL_PRESETS` — the **resolution** set, unchanged, still spreads the Aero pack.
- `SELECTABLE_WALL_PRESETS` — new, core-only; drives the two **pickers**
  (`DesktopShell.tsx:244` → the Settings grid, and `PlaylistEditor.tsx:207` → the
  "add preset" offer list).

`PlaylistEditor`'s three render/resolve paths (`:35`, `:49`, `:93`) deliberately stay on
`WALL_PRESETS` so an already-saved Aero playlist item still resolves its label and css.

`nostalgicWallpaperPack.test.ts` consequently needed **no change** and still passes.

**Gates:** vitest 6/6 pass (`nostalgicWallpaperPack`, `environmentPresets`); tsc
set-difference on file+message vs the 332-error baseline → **0 new, 0 resolved**.

### 1.2 / 1.3 — how they were done

Both cards were extracted into their own components rather than pasted into
`WallpaperPage.tsx`, because each carries state the Wallpaper page has no other use for:

- `pages/WallpaperRotationCard.tsx` — the rotation card. It reads `env.enabled`, the
  living-layer master switch that stays on Atmosphere. On the old page that dependency was
  implicit; here the controls would be dead with no stated reason, so the card now renders
  an explicit hint plus a jump button to Atmosphere when the layer is off (two new i18n
  keys, translated in ja/zh/ru).
- `pages/MiniWallpaperCard.tsx` — the Mini backdrop card, which owns the `MiniWallPreview`
  thumbnail and its own transient status line. `MiniWallPreview` was used nowhere else, so
  it moved wholesale; `MiniModePage.tsx` lost it along with the now-orphaned `useEffect`
  and `MiniWallpaperMode` imports.

Registry: `rotation` retargeted `atmosphere` → `wallpaper`, and a `mini-wallpaper` entry
was **added** — the Mini backdrop had never been searchable at all.

**Gates:** i18n-check exit 0 (8569 keys); `i18n.test.ts` 21/21; tsc set-difference **0 new**.

### Measurement trap hit during 1.2 verification

A first probe queried `[id]` for card ids and returned `{"cards":[]}` — which reads
exactly like "the cards did not render". They had. `SettingsCard` renders its `id` prop as
**`data-setting-id`**, not a DOM `id` (`SettingsCard.tsx:51`); there is no `id` attribute
on a settings card. The correct selector is `.os-set-card[data-setting-id="…"]`. An empty
result from a wrong selector is indistinguishable from a real absence — always assert the
probe finds *something* before reading absence as a finding.
| 1.2 | Move Wallpaper rotation → Wallpaper tab | **DONE** | `.os-set-card[data-setting-id]` | Wallpaper page cards = `wallpaper, rotation, mini-wallpaper` (heights 443/999/267, all non-zero). Atmosphere = `living-layer, environment-preset, lighting, particles, weather, ambient-audio, achievements` — `rotation` gone. Search "rotation" → 1 result → click lands `activeNav: "Wallpaper"`, crumbs `Personalization/Wallpaper`, `highlighted: "rotation"`. | `1.2-1.3-after-wallpaper-page.png` |
| 1.3 | Move Mini wallpaper → Wallpaper tab | **DONE** | same | `mini-wallpaper` present on Wallpaper (h 267). Mini View = `mini-enable, mini-apps, mini-look` — gone. | same |
| 1.4 | Environment blacks out wallpaper | **DONE** | `.os-wall-layer`, `.os-desktop` | Reproduced deterministically on a fresh renderer reload with `enabled/rotationEnabled` both true: **`layerCount: 0`**, `.os-desktop` carried `wall-from-env`, computed bg `rgb(10,10,14)` / `background-image: none` — a black desktop. After the fix, same action: **`layerCount: 1`, `on: true`, `opacity: 1`**, Midday gradient at `background-size: cover`. Crossfade regression across two wall changes: slot 0→1 (0.049 / 0.951) then 1→0 (0.963 / 0.037). | `1.4-after-desktop-wall-paints.png` |
| 1.5 | Particles die during window drag | **DONE** | `.os-particle-canvas` — computed `visibility` + a pixel-alpha checksum sampled twice | Tier **high**, before: idle sum advancing (10382 → 7759); the instant `os-interacting` is set, `visibility: hidden` and the checksum **stops moving** (7759 → 7759, `advanced: false`). After: `visibility: visible`, checksum 11610 → 5927, `advanced: true`. Tier **medium** regression: still `hidden`, still frozen (8443 → 8443) — the cheap tiers keep yielding. | — (motion; the checksum is the evidence) |
| 1.6 | Lockscreen tint follows accent | **DONE** | offscreen `.lock-tint-auto` probe, resolved `backgroundColor` of `var(--lock-win11-bg-a/b)` and `.lockscreen-widget` | New `auto` tint, now the default. Accent `#10b981` → bgA `srgb(0.036 0.154 0.131)` / bgB `srgb(0.047 0.399 0.292)`; `#ff2e4d` → `(0.186 0.067 0.099)` / `(0.535 0.116 0.186)`; `#7c3aed` → `(0.103 0.075 0.199)` / `(0.268 0.140 0.512)`. Theme `classic-light` (`--bg #ffffff`) → `(0.276 0.387 0.368)`; `cyberpunk` (`--bg #12081a`) → `(0.042 0.142 0.141)`. Accent + theme restored, `matchesOriginal: true`. Picker: 5 buttons, `Automatic` carries `primary`, hint renders translated, no raw key. | `1.6-after-lockscreen-auto-tint.png` |

### 1.4 — two separate bugs, both in the first-paint path

The desktop was black **at session start**, not only after toggling — the reported symptom was
live on the running app. `WallpaperStage` (`src/renderer/environment/WallpaperStage.tsx`) is
the only thing painting once the shell hands over, and it had two independent defects that
each produce the identical black desktop. Both are first-paint-only, which is why the app
looks fine once a wall eventually changes.

**Why black at all:** `DesktopShell` sets `wallFromEnv` from `onRotationActive`, and
`wallFromEnv` collapses the desk to a flat `#0a0a0e` and drops the raster/video wall layers
(`DesktopShell.tsx:2005-2013`). The shell gives up its own wallpaper the instant rotation
reports active — so anything that stops the living wall from painting leaves nothing behind it.

**Bug A — a cancelled run claimed the wall key.** `lastKey.current = key` was written
*before* `await hydrateMedia(...)`. `React.StrictMode` (`renderer/main.tsx:275`) runs
mount → cleanup → mount on the same component instance, so refs survive: run 1 claimed the
key and was then torn down (`cancelled = true`) while `layers` was still `[null, null]`;
run 2 resolved the same wall, matched the claimed key, and returned early. Nothing ever
painted. The 30s interval could not recover it either — it re-resolves the *same* wall, so
the desktop stayed black until the time-of-day rule changed (up to six hours).

Fixed with a `pendingKey` ref: the key is claimed synchronously against concurrent ticks,
released by the effect cleanup, and only promoted to `lastKey` after the await survives the
`cancelled` check.

**Bug B — the seed layer promoted the wrong slot.** The first wall is seeded into slot 0,
but `back` was derived from `visibleFrontRef` unconditionally and came out **1**. Under
`cut` the promote ran synchronously and a `queueMicrotask` then forced `front` back to 0, so
it worked by accident. Under `crossfade` — the default day-cycle playlist, `crossfade/1200` —
promote is deferred to `requestAnimationFrame`, which runs *after* microtasks, so it won the
race and made empty slot 1 the front. Measured mid-fix: one committed layer, `on: false`,
`opacity: 0`. Fixed by deriving `back = 0` when seeding and promoting seeds immediately.

**Plus the "wallpaper persists" half.** `onActiveChange` reported active on *intent*
(`enabled && rotationEnabled`), so the shell dropped its wall before the living wall existed
— and kept it dropped forever if rotation could never resolve one (empty playlist, media that
fails to hydrate). It now reports on `enabled && rotationEnabled && hasLayer`, so the shell
wall holds until the living wall is genuinely on screen and never hands over to nothing.

**Gates:** tsc **332 errors, identical to baseline**, zero in `WallpaperStage.tsx`. A
filename check is sound here only because the change is provably local — same default export,
same props, no exported surface touched — so it cannot introduce an error in another file;
that reasoning does not carry to the other items. vitest `src/renderer/environment` 22/22.

**Probe technique used (no persistence):** dispatching a synthetic
`jp-os-environment-changed` `CustomEvent` drives `WallpaperStage`'s React state without
writing `localStorage`, so a wall can be forced and reverted with the user's saved
environment untouched (asserted each time via `storageIntact`). This is how Bug A was
isolated: with `enabled`/`rotationEnabled` unchanged and only the resolved *key* different,
the wall painted instantly — proving the resolver and render path worked and the key guard
alone was blocking them.

### 1.5 — two suppressors, not one

The particles did not *freeze* during a drag, they **disappeared**, because two
independent mechanisms fired together and either alone reproduces the report:

1. **CSS** — `html.os-interacting .os-particle-canvas { visibility: hidden }`
   (`styles.css:12549`) hid the canvas outright.
2. **JS** — `ParticleLayer`'s rAF loop returned before both `stepParticles` and
   `drawParticles` whenever `perfIsInteracting()` was true (`ParticleLayer.tsx:201`).

Fixing only one leaves the symptom. Both are now scoped to the tiers below `high`: the
CSS rule matches `.os-env-stack:not([data-env-tier='high'])`, and the JS yield checks
`envRef.current.performanceTier !== 'high'`. At High the loop keeps running with
`maxSteps` cut from 2 to 1 while interacting, so motion continues at roughly half the
simulation cost. No new heuristic guards it — `perfHub`'s existing adaptive budget
already drops quality to `low` (which halves the draw rate) if frames get expensive.

`os-interacting` is broader than "window drag": `installGlobalInteractionBudget`
(`perfHub.ts:125-145`) also sets it for **850 ms after any pointerdown, keydown or
wheel**, so before this fix the particles also vanished on every click and scroll.

`ParticleLayer` has exactly one render site (`EnvironmentStack.tsx:97`), inside
`.os-env-stack`, so the new descendant selector cannot miss an instance.

### 1.6 — derived in CSS, so there is nothing to keep in sync

`tint` was a closed set of four hardcoded palettes. Added a fifth value, `auto`, and made
it the **default** — `DEFAULTS.tint` was `neutral`. This only affects profiles with no
stored tint; a stored value still wins. (This user had none: `jp-study-lockscreen-v1` was
`null`, so the screenshot is the real default, not a setting I changed.)

The derivation is pure CSS over two live tokens, which is what makes it automatic rather
than merely recomputed: `--accent` is written **inline on `<html>`** by
`applyAccentColors` (`osPersonalization.ts:112-119`) and `--bg` belongs to the active
theme, so a `color-mix` chain re-resolves on any change to either with no listener, no
stored colour, and nothing that can go stale.

The theme contributes **hue, not lightness** — the base is floored toward black
(`color-mix(in srgb, var(--bg) 30%, #06080f 70%)`). The lockscreen surface is dark by
construction: the gradient's third stop `#0a1e38`, the blue radial washes, the vignette
and the light `--lock-win11-text` are all fixed. Feeding a light theme's `--bg` in raw
would wash the panel out and take the clock's contrast with it. Measured on
`classic-light` (`--bg #ffffff`) the floor holds: `srgb(0.276 0.387 0.368)`, still dark
enough for the light text.

**Gates:** tsc set-difference vs the post-1.5 snapshot — **identical, 0 new, 0 resolved**
(332 throughout). vitest `i18n.test.ts` + `src/renderer/environment` 43/43.
`node tools/i18n-check.cjs` exit 0, 8571 keys (was 8569; `settings.lock.tint.auto` and
`.autoHint` in ja/zh/ru).

### Two more corrections to the `jp-bridge` notes, found in Section 1

- **A settings nav item's `title` is its *description*, not its label.** `Lockscreen` is
  `.os-set-nav-item[title="PIN gate on app launch"]`; `Atmosphere` is
  `[title="Living layer, particles, lighting"]`. Selecting on the visible label returns
  nothing, which reads as "the page is missing".
- **Non-persistent probes get clobbered every few seconds.** Driving state by dispatching
  a synthetic `jp-os-environment-changed` is the right way to test without writing
  storage, but `CompanionLayer.tsx:348` calls `saveEnvironment({ companions })` as the pet
  wanders, and that re-dispatches the **persisted** env — silently reverting the probe
  mid-measurement. Re-assert the probe at the top of every eval in a sequence, and treat a
  single "the layer isn't there" reading as a suspected clobber rather than a finding.

## Section 2 — Interface & UI/UX

| # | Item | Verdict | Selector measured | Value | Shots |
|---|---|---|---|---|---|
| 2.1 | Gate App borders on active Aero theme | **DONE** | `.os-set-card[data-setting-id]` | On `forest-night` (`data-materials: null`) the Appearance page lists 13 cards and `app-border` / `pillarbox` are **both absent** (`borderCard: false`, `pillarboxCard: false`). Was gated on `isAeroDiscovered` — ever unlocked — so they showed on every theme forever after one visit to Aero. | |
| 2.2 | Custom CSS sandbox non-functional | **DONE** | `#jp-user-css` sheet + resolved `--accent` / `--radius-md` | Three separate defects, all measured. **A:** `:root { --accent: #ff00ff; --radius-md: 30px }` parsed, passed the sanitizer, entered the DOM — and resolved `--accent` stayed `#10b981`, `--radius-md` stayed `14px`. After: sheet reads `--accent: #ff00ff !important`, resolved `#ff00ff` / `30px`, **with the inline `#10b981` still on `documentElement`** — so the author `!important` genuinely outranks it. **B:** `scroll-behavior` / `overscroll-behavior` / `transition-behavior` all rejected as "Blocked construct: behavior:"; now accepted (`scrollBehavior: smooth` resolved live). **C:** `url('./cat.png')` rejected as "loads something over the network"; now accepted. | `2.2-after-custom-css-root-vars.png` |
| 2.3 | CSS Playground with live demo | **DONE** | `.os-css-playground`, its `iframe.os-preview-stage` | Overlay 1100×739; 5 starter snippets; stage 613×568 with **29 mirrored stylesheets** and a real `.os-taskbar` / `.fwin` / `.os-set-card`. Draft `:root{--accent:#ff8800}` + `.os-taskbar{border-top:3px solid #ff8800}` → **stage** `--accent: #ff8800`, taskbar border `rgb(255,136,0) 3px`; **app** `--accent: #10b981`, no `#jp-user-css`, `storedCss: null`. Blocked draft `.os-taskbar{display:none}` → verdict "Blocked: this would hide part of the app you need to undo it", Apply `disabled: true`, stage taskbar `display:none` while the real one stays `flex`. Cancel → stored CSS still `null`, accent still `#10b981`. | `2.3-css-playground.png` |
| 2.4 | Preview window for Appearance settings | **DONE** | `.os-set-card[data-setting-id="appearance-preview"]` | Card h 478, 7 control rows, 13 themes, 9 accents; Apply/Reset disabled until touched. Draft cyberpunk + violet + spacious → **stage** `cyberpunk / #a855f7 / spacious / 16px`, **app** `forest-night / #10b981 / comfortable / 12px`, stored JSON byte-identical, "Not applied" badge shown. Apply → app `comfortable→spacious`, `--space-md` `12px→16px`, stored JSON updated in exactly one field, badge cleared. Restored: `restoredExactly: true`. Stage is a fixed 1000×680 desktop scaled to fit (measured 467×318 at 0.467), `cardClipped: false`. | `2.4-appearance-preview-draft.png` |

### 2.1 — one condition, and one thing deliberately not measured

`isAeroDiscovered` → `theme === AERO_THEME_ID`. Both cards were inert outside Aero and
always had been: every `[data-app-border]` / `[data-pillarbox]` rule in
`theme/aero-shell.css` is prefixed `:root[data-materials='aero']`, so on any other theme
the controls wrote localStorage, stamped an attribute and changed nothing on screen.

`theme` comes from the settings context (`SettingsApp.tsx:105`, `:135`), which mirrors
`onThemeChanged` — so the condition is exactly the one the stylesheets test and it
re-renders on a theme switch.

**The Aero-on case is argued from source, not measured, and that is a deliberate
choice.** Entering Aero is not a theme switch: `SecretAeroTrigger.toggle()` calls
`armLockscreenOnSecretEntry()` (which can lock the screen behind the PIN),
`applyAeroEnvironment`, `seedAeroDesktopPersonality` and a shell soft-reboot. The
non-persistent shortcut — dispatching a synthetic `jp-theme-changed` — is worse, not
better: the *return* dispatch trips `installAeroEnvironmentBridge`'s
`prev === AERO && id !== AERO` branch and calls `restoreStudyEnvironmentAfterAero()`,
which writes environment state. With backups discontinued there is no restore point for
either, so the negative case is measured and the positive case rests on `applyTheme`
being the single choke point for the value being compared (`engine.ts:144-157`).

### 2.2 — the sandbox was three defects, not one

The happy path already worked (a plain rule applied and survived a reload), which is why
this needed reproducing rather than rewriting.

**A. Root variables were silently discarded — the defect the report is about.**
`osPersonalization.applyPersonalization` writes **44 design tokens as inline styles on
`documentElement`** (`--accent`, `--space-*`, `--radius-*`, `--shadow-*`, `--font-body`,
`--dur-*`, `--motion-*`, measured live). An inline declaration beats every selector in an
author stylesheet, so the single most natural thing to type into a custom-CSS box for
this app — `:root { --accent: … }` — parsed, passed the sanitizer, landed in the DOM and
changed nothing, **with no error and a cheerful "CSS applied."**

`uiCustomization.profileToCss` had already reached this conclusion for the Theme Studio
path and emits `!important` for exactly this reason (`uiCustomization.ts:468-481`); the
raw sandbox was the one path that silently lost. `applyCustomCss` now re-declares
root-scoped custom properties as `!important` **through the CSSOM** — the browser has
already parsed the sheet, so values containing `;` or braces cannot corrupt the rewrite,
and the stored CSS stays byte-for-byte what the user typed. Only `:root` / `html` are
promoted: `body { --x: y }` already wins for everything it contains, because the inline
declaration is on `<html>` and only decides `<html>`'s own computed value.

The count is reported in the UI (`settings.appearance.css.appliedPromoted`, plural, four
languages) — a silent no-op became a stated consequence.

> **The trade this makes, stated plainly:** while custom CSS sets a token, the
> Appearance controls for that token stop having a visible effect. That is the correct
> precedence — the user wrote the override by hand — and it is undone by clearing the
> CSS. It is also the same choice the Theme Studio path already made.

**B. `behavior:` was a substring test.** `scroll-behavior`, `overscroll-behavior` and
`transition-behavior` all contain it, so `html { scroll-behavior: smooth }` was refused
with "Blocked construct: behavior:" — a false accusation, not a bug report. Now a
property-boundary regex (`IE_BEHAVIOR_PATTERN`); IE's real `behavior:` stays blocked.

**C. `remote-url` meant "not a `data:` URI".** So `url('./cat.png')` — a file that ships
with the app — was refused with "this stylesheet loads something over the network",
which was simply false. `isNetworkUrl` now tests what the rule is actually for: an
explicit remote scheme, or the protocol-relative `//host/x` form. Relative, root-relative
and `file:` are local in both dev (`http://localhost:5173`) and packaged (`file://`), so
the offline-first rule this protects is untouched.

### A stub CSSOM caught nothing; the live app caught the real bug

The first implementation tested `rule.cssRules` first and treated any rule that had it as
a grouping rule. **In Chromium every `CSSStyleRule` has `cssRules`** — CSS nesting makes
style rules grouping rules — so it recursed into an empty list and skipped every
top-level rule in the sheet. Nine unit tests passed; the live app reported `promoted: 0`
with all four rules parsed and none carrying `!important`. The stubs now carry the
Chromium shape (`cssRules: []` on ordinary style rules) and a nesting case, so the same
mistake fails in the suite.

A jsdom attempt was abandoned first and is worth recording: **jsdom's cssstyle drops
custom-property declarations outright**, so a parsed `:root { --accent: red }` rule has
`style.length === 0` there. Four assertions failed for a reason unrelated to the code and
three others passed *vacuously* — the worse half of that outcome.

**Gates:** tsc **332 → 332**, set-difference 0 new / 0 resolved. vitest full run
**133 files, 1227 tests, 0 failed**. `i18n-check` exit 0, **8572 keys** (was 8571).

**Cleanup:** the sandbox held a leftover probe from the previous session
(`.os-set-card-title { outline: 3px solid rgb(1,2,3) }`, visible on every settings card
title). Verification ran through the real Apply button, then Clear — `storedCss: null`,
style node gone, `--accent` back to `#10b981`, `--radius-md` back to `14px`,
`jp-os-personalization-v1` untouched.

### 2.3 / 2.4 — one preview surface, two callers

Both items ask for the same missing thing: somewhere to *see* a look change before it
becomes the look. So `settings/PreviewStage.tsx` was built once and is driven by two
callers — the playground feeds it draft CSS, the Appearance card feeds it draft tokens.

**It is an iframe, and that is the whole design.** The stage has to render markup
carrying the app's real class names, because that is what user CSS and the app's own
stylesheets target. In the main document those rules would apply to the preview *and*
the preview's rules would apply to the app — a draft would have escaped before you
looked at it. A same-origin iframe gives real isolation with no selector rewriting: the
app's stylesheets are cloned in (29 nodes, ~700 KB, one parse on mount — draft updates
only rewrite one small `<style>` inside the frame).

`@scope (.preview) { … }` in the live document was considered and rejected: `:root` does
not match inside a scope, so the case that matters most here — a design-token override —
is exactly the one it cannot show.

Two details that are load-bearing rather than incidental:

- **`sandbox="allow-same-origin"`, not `sandbox=""`.** Scripts stay off either way, but
  an empty sandbox gives the frame an opaque origin and `contentDocument` reads `null`
  from the parent — the stage would silently never populate.
- **The stage renders at a fixed 1000×680 and is scaled to fit.** Laying it out at
  container size produced a cramped desktop whose sample window was cut in half; a
  clipped preview reads as a rendering bug. Measured 467×318 at scale 0.467 in the
  Appearance card, `cardClipped: false`.

`PreviewStage` runs the **same** root-variable promotion as `customCss.applyCustomCss`.
Without it the preview would show a token override working where the real app would
ignore it, which is worse than no preview at all.

For 2.4 the settings→tokens mapping was extracted out of `applyPersonalization` into a
pure `personalizationVisuals(s)`, which both now use. The alternative was a second copy
of the DENSITY / RADIUS / SHADOW / FONT tables in the preview, which would have drifted.

Instant-apply on the Appearance page is deliberately **left alone**. The draft card is a
second way to work, not a replacement — the audit asked for a preview, not for the
existing behaviour to be removed.

### The bug the tooling caught, recorded because the class of it recurs

`STAGE_CSS` is a template literal, and a CSS comment inside it referred to
`` `var(--bg)` `` in backticks. That closed the template, and the file stopped parsing —
**the entire renderer failed to mount**: `navs: 0`, no `.fwin`, no `.os-taskbar`. Nothing
appeared in `/logs` beyond a normal-looking `[vite] connected`, so the bridge alone said
only "the app is empty".

`curl http://localhost:5173/<module path>` returned the real answer immediately —
Vite's 500 body carries the Babel error with line and column. **When the renderer mounts
nothing and the logs look clean, fetch the module from the dev server before theorising.**

### Two more corrections to the `jp-bridge` notes

- **A reload needs a readiness poll, not a sleep.** `/reload` returns `{ok:true}`
  immediately and this tree takes 4–8 s to mount; fixed `Start-Sleep` values of 2 s and
  4 s both produced `refuse: 'not ready'` and one spurious `click.ps1` failure that
  looks exactly like a missing control. `debug/wait-ready.ps1` polls a selector count
  and is the reliable form.
- **`/dom` returned nothing** for `.os-set-card[data-setting-id="custom-css"]` while an
  `/eval` reading `outerHTML` on the same selector returned the full markup. Not
  investigated; `/eval` is the dependable channel for markup.

## Section 3 — Desktop Pets & Mini-Apps

| # | Item | Verdict | Selector measured | Value | Shots |
|---|---|---|---|---|---|
| 3.1 | "Show on Windows desktop" non-functional | **DONE** | host window `document.visibilityState`, `requestAnimationFrame`, `setTimeout` | The overlay window opens, shows at 1920×1080 and paints the pet — none of that was ever the defect. **Its document is `hidden` while it is on screen**, so Chromium throttled it to nothing: before — `visibilityState: "hidden"`, `hidden: true`, **`rafRan: 0`** after ~1.6 s (measured twice). The pointer hit-test that turns click-through OFF was deferred to that rAF, so `setIgnoreMouseEvents(false)` was never called and the pet was **permanently click-through — visible and untouchable**. After: `visibilityState: "visible"`, `hidden: false`, **`rafRan: 154`** in 1.5 s, `timerRan: 1`. The handler chain itself was never broken: a DOM click on the pet produced `buddy:run {companionId:"c-bonzi", routineId:"br-miko-climb"}` in the main renderer. | — |
| 3.2 | Pet click conflicts | **DONE** | `buddy:toast` log (the `toast(routine.name)` every depth-0 routine emits), driven by a synthetic pointer sequence on `[data-companion-id="c-bonzi"]` | Two defects, both reproduced before the fix and re-measured after. Same probe, same app, four gestures. **Single click** — before `["Climb show"]` at once; after `["Climb show"]` at **+325 ms**, one run. **Double click** — before **`["Climb show","Cheer"]`** (the primary fires on the way to the secondary); after **`["Cheer"]`** alone, at +1 ms. **Drag 141 px** — before **`["Climb show"]`**: a drag ran the primary routine; after **`[]`**. **Click then drag** — after `[]`, the pending primary is cancelled by the grab. | — (behaviour; the toast log with per-event delays is the evidence) |

### 3.1 — the window was never the problem

Everything the audit doc implies is missing is present: `openCompanionHost` creates the
window, it shows at the full primary work area, the transparent background resolves
`rgba(0,0,0,0)`, and the pet renders at 96×96 with `opacity: 1`. The Settings toggle is
wired straight to `patchEnv({ companionsOnOsDesktop })`, and flipping it opens and closes
the window within a second.

What is broken is **interaction**, and the cause is one line of Chromium policy:

`document.visibilityState` is `"hidden"` in a window that `/health` reports as
`visible: true` and that is painted on the desktop. Electron throttles hidden documents,
so this renderer got **no frames and slow timers**. `CompanionHostView`'s pointer
hit-test — the only thing that ever calls `companionHostSetClickThrough(false)` — was
deferred to `requestAnimationFrame`. rAF never fired, so the window stayed
`setIgnoreMouseEvents(true, { forward: true })` forever. The pet was visible, and no
click could ever reach it. "Non-functional" is exactly right; it just was not the part
of the feature anyone would look at first.

Three changes:

1. **`backgroundThrottling: false`** on the host window (`main/companionHost.ts`). An
   always-on-top desktop overlay is never the foreground window and must keep running
   anyway — this is the case the flag exists for. Measured: it also flips
   `visibilityState` to `visible`, which is the documented side effect.
2. **The hit-test now runs off the `mousemove` event itself**, timestamp-throttled at
   40 ms with a *trailing* run. Frames are no longer part of the interaction path at all,
   which is the property that matters for a surface that can be occluded at any moment.
   The trailing run is not optional: a leading-edge-only throttle drops the last move,
   and the last move is the one that lands on the pet and stops.
3. **`openCompanionHost` now sends `companionHost:wake`** when reusing an existing host.
   `placeHost` re-arms click-through and resets `hostClickThrough`, but the renderer's
   `overRef` does not know that — with the pointer over a pet, it would not re-send
   `setClickThrough(false)` until the pointer left and came back. The other two
   `placeHost` callers already sent `wake`; this one did not.

**What could NOT be verified, stated plainly:** the final OS-level click. `/click` uses
`sendInputEvent`, and **it does not reach this window at all** — a click at empty
coordinates with click-through forced off produced zero DOM `click` events. OS-level
mouse automation is forbidden (§11). So the chain is established by measurement at both
ends (rAF dead → alive; DOM click → `buddy:run`) and by reading the four lines between
them, not by a real click.

### Three measurement traps hit in 3.1, all of which produced false readings

- **`window.api` is a `contextBridge` object and is immutable.** Wrapping
  `window.api.companionHostSetClickThrough` to record calls **silently does nothing** —
  the assignment fails, the property keeps its original value, and every subsequent read
  returns `[]`. Four separate "the IPC was never called" readings were this, not a
  finding. `document.elementFromPoint` *can* be wrapped, and was, which is how the
  hit-test was actually shown to run.
- **A renderer reload drops instrumentation with the preload.** Same symptom, different
  cause. Re-assert the wrapper *after* every reload and check that it is there
  (`String(fn).includes('__marker')`) before trusting a zero.
- **The pet moves.** A `getBoundingClientRect()` read in one `/eval` and a click in the
  next aims at where the pet *was*; positions moved by hundreds of pixels between calls.
  Measure and aim in the same eval.

A fourth, which was mine and not the app's: driving the overlay with a re-asserting
`setInterval` probe fought `CompanionLayer`'s position autosave, so the host window was
destroyed and recreated every cycle (ids 10 → 12 → 14). That churn was **the probe**, not
a product defect. Persisting the flag for the duration of the diagnosis — and restoring
it afterwards — is the correct approach.

**State restored:** `companionsOnOsDesktop` back to `false`. Field-by-field comparison of
`jp-os-environment-v1` against the pre-run snapshot: the only field that differs is
`companions`, and only its `x`/`y` — the app rewrites those as the pet wanders. Every
setting is identical.

**Gates:** tsc **332 → 332**, 0 new. vitest **415 files, 5485 tests, 0 failed**.
The dev app was restarted (standing permission, skill §0) because
`backgroundThrottling` is a `BrowserWindow` construction option and forge does not
hot-reload main.
### 3.2 — the guard against this was already written, and it could never run

`onBuddyClick` opened with `if (dragRef.current?.moved) return;` — twice, in two
spellings. Someone knew a drag ends in a `click` and tried to swallow it. **The guard reads
`null` every single time**, because the DOM fires `click` *after* `pointerup`, and the
window `pointerup` listener sets `dragRef.current = null` on its second line
(`CompanionLayer.tsx`, the `up` handler). Nothing about the code looks wrong; the ordering
is what makes it dead.

Measured consequence: a **141 px drag ran the pet's primary routine on release**. For
`miko-shimeji` that is a mood change, but the primary routine is user-assignable and the
builtin set includes `openApp` and `toggleEnv` steps — dragging a study-buddy across the
desk opened Flashcards.

The second defect is the one the audit names. The primary ran **immediately** on click, so
the first click of a double click always fired it: `["Climb show","Cheer"]` where only
`Cheer` was asked for. The primary now waits out the double-click window (325 ms measured)
and is cancelled by the second click.

**Why a separate module.** The three gestures share one button and the arbitration is
entirely deadlines — 320 ms double-click gap, 600 ms drag-suppression window, per-pet
identity. A live probe is worst at exactly that: it can show one outcome per run, not the
boundary. `environment/companionClickGesture.ts` is a pure reducer over
`{suppress, pending}` with `decideClick` / `noteDragEnd` / `clearPending`, and
`renderer/__tests__/companionClickGesture.test.ts` pins the boundaries (10 tests, incl.
`CLICK_GAP_MS - 1` vs `CLICK_GAP_MS`, and that neither window crosses between two pets).
The component keeps only the `setTimeout`.

The drag outcome is now handed **forward** — `noteDragEnd` is called in the `pointerup`
handler while `d.moved` is still readable, instead of being read back after the ref is
gone. `cancelPending` additionally kills a primary still counting down from an earlier
click, so click-then-grab no longer fires a routine mid-drag (measured `[]`).

**Not changed, deliberately:** `CompanionHostView` (the OS-desktop overlay from 3.1) has
**no drag and no double click** — one `onClick` running the primary. There is no conflict
to resolve there, so it keeps its immediate click. Item 3.1's finding stands.

**Instrumentation limit, stated plainly.** These four gestures are **synthetic**
`PointerEvent`/`MouseEvent` dispatches, not OS input. A real `/click` cross-check was
attempted and `click.ps1` **correctly refused**: the Settings window is maximised
(1264×765, `z-index: 852`) over a companion layer at `z-index: 3`, so `elementFromPoint` at
the pet's centre returns `.os-settings`. Un-maximising it to clear the path writes
`desktop-layout.json`, which has no restore point (§2 of `jp-bridge`), so it was not done.
What the synthetic run does establish is differential and cannot come from a dead probe:
the same four sequences produce four *different* outcomes, and three of them changed across
the fix.

`Element.prototype.setPointerCapture` is stubbed for the duration of each probe and restored
in the same eval — the product calls it with a `pointerId` that no synthetic event owns, and
it throws `NotFoundError` out of the React handler otherwise. Stubbing it models the real
capture case, where `click` is delivered to the capture element.

| 3.3 | "Hold" click interaction | **DONE** | `.os-companion-menu` presence + the `buddy:toast` log, driven by a two-phase press (pointerdown, 900 ms gap, pointerup+click) | Differential pair, both from `menuOpenBefore: false`. **Press and hold, still** (939 ms) → `menuOpen: true`, `toasts: []`, and release adds nothing — the click is swallowed. **Press, move 103 px, hold** (944 ms) → `menuOpen: false`, `toasts: []` — past `DRAG_THRESHOLD` the press is a drag and hold is off. With `br-miko-cheer` assigned through the new control: `menuOpen: false`, **`toasts: ["Cheer"]`** — the routine runs instead of the menu. 3.2's four gestures re-measured after the change and are unchanged (single +322 ms `Climb show`; double `Cheer` alone; drag 130 px → `[]`). | — (behaviour) |
### 3.3 — hold is a third assignable slot, and building it exposed a dead setting

The source line is one clause — *"Add a 'Hold' click interaction for pets."* — and it has two
readings: a third **assignable routine trigger** alongside click and double-click, or a
Shimeji-style pick-up. **The user chose assignable**, so hold is now a slot on the companion
(`holdRoutineId`) with a picker next to the existing Primary and Secondary ones in
Settings › Companions.

`HOLD_MS` is 550 and the unit suite asserts `HOLD_MS > CLICK_GAP_MS` — if hold sat inside the
double-click gap, every deliberate double click would trip it on the way through.

**No per-type default routine was invented.** Each companion type ships exactly two builtins
and both are spoken for; a third would have been fabricated content. An unassigned slot
returns `''`, which the layer reads as *open the buddy menu* — so hold does something real out
of the box, and the picker's first option says so in four languages.

A hold ends the press it grew out of: the drag is dropped (so the pet does not slide out from
under the menu it just opened) and the `click` that release produces is swallowed through the
same `suppress` path 3.2 built for drags. Measured: `afterReleaseToasts` is `[]` on the
unassigned case and stays `["Cheer"]` — no second run — on the assigned one.

### The setting was writing to a value nothing read, and then erasing it

**This is the finding, and it is not about hold.** The first assigned-hold measurement came
back `menuOpen: true, toasts: []` — the menu opened as if nothing had been assigned. The
select had written `holdRoutineId: "br-miko-cheer"` into `jp-os-environment-v1`; **seconds
later the key was gone from the stored blob entirely.**

`CompanionLayer`'s resync effect deliberately does not depend on `env.companions` — it would
re-seed the whole list on every wander autosave — so the layer never picked the assignment
up. Its `persist()` then wrote its own stale list straight back over the setting. Two
failures compounding: the assignment never reached the pet, *and* it was destroyed by the
pet's own position autosave.

**`assignPrimary` and `assignSecondary` go through the identical `patchEnv({ companions })`
path**, so Primary and Secondary have been losing assignments the same way. That is
pre-existing and squarely item 3.4's territory, but it was fixed here because leaving it
would have shipped a picker that does nothing — the exact outcome `jp-dispatch` §6 forbids.
The fix is a narrow effect keyed on an assignment signature that patches only the three
routine ids onto the live list, leaving position and motion state alone.

Measured before: assign → `(absent)` from storage within seconds, pet opens the menu.
After: assign → `storedHold: ["br-miko-cheer"]` still present after 2.5 s, pet runs `Cheer`.
**Restored:** the picker was set back to its default through the same control; the stored
field is now `""` where before the run the key was absent. `resolveHoldRoutineId` treats
those identically, so the behaviour is the pre-run behaviour, but the blob is not
byte-identical and that is stated rather than smoothed over.

### A measurement that looked like a pass and was not

The first hold-then-move run reported `menuOpen: true` and read as "hold fired". It had not
— **the menu from the previous run was still open**, which `menuOpenBefore: true` in the same
payload showed. A boolean that was already true before the gesture cannot report the gesture.
Both cases were re-run from a closed menu, as a differential pair, and only then does
`false` vs `true` mean anything.

| 3.4 | Routines from Shimeji interface | **DONE** | `.os-companion-menu-bind` inside the pet's own menu, then the gesture itself | Menu 140×431, `overflowsViewport: false`, section label "Shortcuts". Three binds render with the live values: **Click** `br-miko-climb`, **Double-click** `br-miko-cheer`, **Hold** `(menu)` — and Hold is the only one offering the empty "Open the buddy menu" option (3 options vs 2). End-to-end through the pet menu alone: bind Hold → `br-miko-climb`, stored `holdRoutineId: "br-miko-climb"` and still there 2 s later, then a hold produced **`toasts: ["Climb show"]`** with `menuOpen: false` — a different routine from the 3.3 run, so the toast is tracking the binding rather than repeating a stale reading. Restored to `(menu)` through the same control. | — (behaviour) |
### 3.4 — the same three slots, bound where the pet is

Settings › Companions already had Primary and Secondary pickers (Hold joined them in 3.3),
but reaching them meant leaving the pet: open Settings, find Companions, pick the buddy type.
The audit asks for it *"directly from the Shimeji interface"*, so the pet's own menu — the one
right-click and now hold both open — carries a **Shortcuts** section with the same three
bindings.

Two differences from the Settings pickers, both deliberate:

- **The pet menu binds this instance; Settings binds every companion of the type.**
  `assignPrimary` maps over `c.typeId === assignType`; the menu maps over `x.id === c.id`.
  With one instance per type they are the same edit, and per-instance is the correct meaning
  of "this pet's shortcut". If a second instance of a type is ever added, the two controls
  will legitimately disagree, and the menu is the more specific one.
- **The offer list is `routinesForType`, not the menu-routine list.** `runBuddyRoutine`
  refuses a routine whose `forType` does not match the companion, so offering anything wider
  would put entries in the picker that silently do nothing when chosen.

**This item was blocked before 3.3.** Routine assignments were being erased seconds after
being made — see the 3.3 notes — so a picker here would have written a value the layer never
read and the autosave then deleted. The fix landed in 3.3; the end-to-end test above is the
proof it holds through the pet menu too.

The menu is anchored to a 96 px sprite, so the section stacks label-above-control and never
side by side; measured 140 px wide with the selects at 122 px, and the menu does not leave
the viewport.

| 3.5 | Mini apps — 3 clickable routines | **DONE** | `.mini-routine-btn[data-routine-id]`, `.mini-routine-status`, `window.innerHeight`, `popoutListOpen()` | **Before: Mini could not run a routine at all** — with Mini active, `buddy:run {c-bonzi, br-miko-cheer}` gave `toasts: []` and no mood change, while the identical dispatch on the desktop gave `["Cheer"]`. Widget DOM had **0** routine controls. After: 2 of the catalog's 11 routines offered (the two the live `miko-shimeji` accepts), pinned through the widget's own drawer → stored `["br-miko-climb","br-miko-cheer"]`, two buttons rendered. Clicking **Climb show** → `toasts: ["Climb show"]`, mini toast `"Climb show"`, and **both** mood steps observed live in order — `["Scaling the desktop frame","Still climbing"]` — with `{curious, Climbing the frame}` → `{happy, Still climbing}` persisted to `env.companions`. Clicking **Cheer** → `["Cheer"]` and `["Secret OS discovered","Climbing the frame"]`: a **different** routine, so each button tracks its own binding. `os:open` from inside the widget moved `popoutListOpen()` `[]` → `["calendar"]`. | — (behaviour) |

### 3.5 — the buttons were the easy half; nothing in Mini could run a routine

The audit asks to *"update 'Mini apps' to include up to 3 clickable routines directly from
the widget"*, which reads like a rendering task. It is not. **While Mini is on there is no
`CompanionLayer` anywhere**: the main window renders `MiniMainBridge` instead of
`DesktopShell` (`App.tsx:717`), and the floating widget is a window of its own that never
mounted the living layer. Measured, with Mini active: `[data-companion-id]` count **0** in
both windows, and a `buddy:run` for a real companion and a real routine produced
`toasts: []` with the stored mood unchanged. The same dispatch on the desktop produced
`["Cheer"]` — so the empty reading is a real absence, not a broken probe.

That rules out the obvious design. The OS pet host relays clicks as `buddy:run` and lets the
main renderer do the work (`companionHost.ts:254-261`); a widget that copied it would be
posting to a listener that is not there. So `miniRoutines.ts` gives the widget its own
`BuddyRunContext` and the engine is untouched.

**Three bridges, because a routine reaches the app through events the desktop shell owns.**
`openApp` dispatches `os:open`, the `clipboard` step dispatches `clipboard:open`, and every
depth-0 routine toasts through `buddy:toast` — and `BuddyToast` is mounted only in
`DesktopShell`. Without listeners for those three, a pinned routine would run its steps into
nothing and read as a dead button. MiniShell now listens for all three and routes them to
what Mini has: `os:open` → the widget's existing pop-out launcher, `clipboard:open` → the
inline stage, `buddy:toast` → the mini toast.

**`setMood` is the step that would have stayed invisible.** Both miko routines are nothing
*but* mood steps, so with only the toast bridged the buttons would look like they did
nothing after the first line. `patchCompanion` therefore drives a `.mini-routine-status`
caption as well as persisting, which is what made the two-step sequences above measurable.
`speechBubble` is deliberately *not* persisted — it is a bubble over a pet Mini does not
draw, and storing one would leave it hanging when the desktop comes back.

Two rules carried over rather than reinvented: the offer list is `routinesForType` per live
companion (3.4's rule — `runBuddyRoutine` refuses a mismatched `forType`, so a wider list
pins buttons that silently do nothing), and `persistCompanionPatch` re-reads `companions`
from storage on every call instead of holding a list from mount, which is the shape that
erased routine assignments before 3.3.

### The 320 px window floor made the layout constant look inert

`ASPECT_ROUTINES` was added so the row does not squeeze the slot grid, and at default scale
it appears to do nothing: the frame measured **318 px tall with and without the row**, and
`clientHeight === scrollHeight` either way. The cause is `MINI_MIN_H = 320` (`main.ts:575`) —
the requested height (`352 × 0.56 + 4 = 201`, or `237` with the row) is below the floor in
both cases, so `mini:setSize` clamps and `.mini-craft`'s `flex: 1` absorbs the slack.

It only starts to matter above `scale ≈ 1.34`, which is where the measurement had to be
taken. At `scale 1.55`: **372 px with the row pinned** — exactly
`352 × (0.56 + 0.115) × 1.55 + 4` — against **320 px** (the floor) with the same scale and the
row removed. Not clipped in either case, nor with the inline clipboard stage open on top of
both (382 px, `scrollHeight === clientHeight`). Reporting the default-scale reading alone
would have said the constant was dead code.

### A stub that was silently rejected, and the pop-outs it opened

Verifying the `os:open` bridge by replacing `window.api.popOut` with a recording stub
returned `calls: []` — which reads exactly like "the listener never fired". It is the
opposite. **`window.api` is a frozen `contextBridge` object, so the assignment was a silent
no-op**, the real `popOut` ran, and `/health` showed three genuine pop-out windows
(`flashcards`, `grammar`, `notebook`) that the probe had opened and not accounted for. They
were closed through `popoutControl('close')`.

The lesson is the general one: **never assert on a stub without proving the stub took.**
The re-measurement used the app's own observable instead — `popoutListOpen()` before and
after a single dispatch, `[]` → `["calendar"]`. `grammar` and `notebook` are not `MiniAppId`s,
so that accident also confirmed the non-pinnable branch reaches the main process.

Both surfaces were driven, not just the widget: Settings › Mini View gained a `mini-routines`
card between `mini-apps` and `mini-look` (984×252, "Routines (2/3)", rows `1. Climb show` /
`2. Cheer`), and its own Remove and Pin buttons were clicked through 2/3 → 1/3 → 0/3 → 1/3
with the stored list agreeing at every step.

**Restoration.** `jp-study-mini-mode-v1` and `jp-mini-frame-scale-v1` were both *absent*
before this run and are absent after. `c-bonzi` is back at `{mood: curious, status: "Climbing
the frame"}` with `primaryRoutineId`/`secondaryRoutineId` unset and `holdRoutineId: ""` —
byte-identical to the pre-run read. 11 routines, 1 companion, env flags unchanged, 0 errors
in `/logs`.

## Section 4 — Icons & Shortcuts

| # | Item | Verdict | Selector measured | Value | Shots |
|---|---|---|---|---|---|
| 4.1 | Recommended icon placements | **DONE** | `.os-set-card[data-setting-id="icon-recommended"]`, `[data-icon-preset]`, then `.os-desk-icon` geometry | Before: Desktop layout listed `icons, taskbar, start-menu, session` — no `icon-recommended`, **0** `[data-icon-preset]`, and **0 desktop icons on both desktops** (layout store `icons: []` for `Study` and `City`). After: card 666×388, 5 presets reading `8 icons / 6 icons / 6 icons / 21 icons / 3 icons`, no raw key and no ICU leak. One click on **Study essentials** → exactly **1** `desktop:apply-icon-preset` and **1** `desktop:icon-preset-applied` (`{presetId:"study",placed:8,kept:0,replaced:0}`), 8 icons at `(16,16) (16,120) (16,224) (16,328) (124,16) (124,120) (124,224) (124,328)` — 2 columns of 4, step **108×104** = `ICON_METRICS.large`. Same preset at `iconSize: small` → step **76×72** = `ICON_METRICS.small`, shape unchanged. Undo → 0 icons, "Restored the previous 0 icons.", button gone. Search "recommended" → 1 result → lands `activeNav: Desktop layout`, `highlighted: icon-recommended`. | `4.1-after-recommended-card.png` |
| 4.2 | Collapse "Types of shortcuts" | **DONE** | `.sc-group`, `.sc-group-toggle[aria-expanded]`, `.sc-row`, card height | Before: 11 groups, **172 rows**, shortcuts card **8142 px** tall in a 548 px viewport (~15 screens), **0** collapsible controls. After, collapsed default: 11 toggles, **0** expanded, **0** rows, card **608 px** — a **13.4×** reduction — with every header carrying its own count (`Navigation 24, Windows 24, Reader 15, Manga 5, Dictionary 4, Flashcards 6, Immersion 5, Music 8, Video 20, Toolbox 54, Utility 7`). Expanding Dictionary: `aria-expanded=true`, 4 rows, card 814 px, caret `matrix(0,1,-1,0,0,0)` (90°), and **only** that group open. Search "volume" → Music alone, 2 rows (`Volume up`, `Volume down`), every shown group expanded, toggles disabled; "next" → 13 rows across 5 groups with the note rendered. Clearing the box returns to 0 rows / 608 px. | `4.2-after-shortcuts-collapsed.png` |

### 4.1 — "placement configuration" had to mean the icon set too

The source line is *"Add a 'Recommended' section in icon settings offering 5 predefined icon placement
configurations."* Read as arrangement-only — five ways to re-position whatever is on the desk —
**all five buttons would have been visible no-ops on this app**: `defaultIcons()` returns `[]`
(`DesktopShell.tsx`), apps are pinned from Start, and the layout store held `icons: []` for *both*
desktops. That is the dead control `jp-dispatch` §6 forbids, so the reading was put to the user,
who chose **curated set + layout**. A preset therefore names both the apps and their positions.

**What a preset does and does not own.** It owns the *app* icons: applying replaces them wholesale.
It does **not** own icons the user made — `kind !== 'app'` (file shortcuts from `pickShortcut`,
action icons) are kept and laid out after the preset's apps in the same flow. Deleting someone's
hand-placed shortcuts to apply a recommendation would be a worse bug than the one being fixed.
`kept` is reported back in the result event and shows in the status line.

**The arrangement is derived, not hardcoded.** `iconPresetPositions` takes the icon box from
`ICON_METRICS` and the grid from `deskPrefs`, so the same preset lays out differently at each icon
size — measured as a differential pair, 108×104 at `large` against 76×72 at `small`, same 2×4
shape. Rows come from the height that actually fits, and columns grow past the preset's preference
rather than place an icon below the desktop; every point still goes through `snapClamp`, so the
snap grid and the bounds have the last word.

`renderer/__tests__/desktopIconPresets.test.ts` (11 tests) pins what a live probe cannot show in one
run: that `columns: 2` over 8 icons is 4+4 and **not** 7+1 (the bug the first draft had — deriving
rows from available height alone ignored the preset's shape), that 21 icons asked to fit one column
become three, that no preset overlaps two icons, that a set grid divides every coordinate, and that
a 300×200 desktop still contains all 21.

**Undo instead of a confirm dialog.** Applying is reversible from the same card: the shell keeps one
level of the previous icon list and `desktop:undo-icon-preset` restores it exactly. This is transient
by design — it is a property of the visit, not something to persist — and the button only exists
while there is something to undo.

**The result event is the status line's only source.** `RecommendedIconsCard` renders the counts the
shell reports back, not the counts the preset intended, so the line cannot claim a placement that
did not happen.

### The apply path was checked for double-firing, and one observation is left unexplained

Mid-run the card showed *"Placed 21 app icons, replacing 21"* with 21 icons on the desk — a preset
applied twice, and **I had not clicked it**. That is exactly the shape of a StrictMode
double-invoke, and the first draft did earn it: the result event was dispatched from **inside** the
`setIcons` updater, which React runs twice. That was fixed before measuring — the updater is pure
and the handler reads `iconsRef`.

Instrumented afterwards with counters on both events, **one click produced exactly one
`desktop:apply-icon-preset` and one `desktop:icon-preset-applied`**, twice over, which also rules
out a double-registered listener (one dispatch, one result). So the mechanism is sound.

**What caused the earlier pair is not established.** It happened in a window that also contained a
full reload and two HMR updates, and I cannot attribute it to a specific action. Recording it
rather than dropping it: a reader who sees it recur has the counter technique above and knows the
1:1 result is what was actually measured.

### The ICU plural shape renders verbatim — and this repo already knew

`'settings.desktop.preset.count'` was first written as `'{count, plural, one {# icon} other {# icons}}'`,
which is the natural ICU form and is **wrong here**. The card rendered the template literally:
`{count, plural, one {# icon} other {# icons}}` next to every preset name. `translate()` resolves
plurals from an *object* and hands a plain string to `interpolate`, whose `/\{(\w+)\}/g` matches
nothing inside an ICU template. `catalogs/en.ts:6489` carries a comment recording this exact trap
from a previous slice — twelve keys still ship broken this way — and I reproduced it anyway. The
correct shape is `{ one: '{count} icon', other: '{count} icons' }`, with Russian carrying the full
`one/few/many/other` set. **A raw template in the UI is what this looks like; there is no error.**

### 4.2 — collapsed by default, and search had to override it

The "types of shortcuts" are `ShortcutSettings`'s category groups, and all 11 shipped expanded:
**172 rows in one 8142 px column**, inside a 548 px viewport. Toolbox alone is 54 rows.

Collapsed is now the default and the count moved onto each header, so a shut group still tells you
what is inside — the page went to **608 px**, one screen, with nothing hidden that is not counted.

**Search overrides the toggles, and that is the load-bearing part.** A query that matches rows
inside a collapsed group would render the user nothing and read as "no results" — collapse would
have broken search. While a query is live every matching group is open and the toggles are disabled,
with a line saying so. Measured both ways: "volume" → Music alone, 2 rows visible; "next" → 13 rows
across 5 groups; clearing returns to the collapsed default.

**Not persisted.** Which groups you had open is a property of the visit; storing the set would
re-open them weeks later, and there is no restore point for renderer storage (§2).

**The rows themselves are untouched** — same markup, same `data-shortcut-*` handles, same handlers;
they are simply not rendered while shut. Proved live rather than argued: expanding Dictionary and
clicking **Type** on `dictionary.playPronunciation` opened `.sc-manual` pre-filled with its real
chord `Ctrl+Alt+P`, with `jp-study-shortcuts-v1` still `null` — a live control, and no write.

The capture (click-to-rebind) path could **not** be armed synthetically: it completes on window-level
`keydown`/`mousedown`, which a dispatched `click` does not produce, so `.capturing` never appeared.
That is an instrumentation limit, not a finding — the manual path exercises the same row.

### A malformed probe took down the whole shell, and the logs said so

`os:open` carries a **bare section id**, not an object. Dispatching
`{ detail: { section: 'settings' } }` put the object where a `WinSection` string was expected and
React tried to render it as a child: *"Objects are not valid as a React child (found: object with
keys {section})"*. The **entire renderer unmounted** — `#root` empty, 4 divs, no taskbar — which
reads exactly like the app crashing on its own. `/logs` had the answer immediately.

Two notes worth keeping: the correct shape is `new CustomEvent('os:open', { detail: 'settings' })`
(`CommandPalette.tsx:77`), and **editing `catalogs/en.ts` triggers a full page reload, not HMR** —
it is eagerly imported. After that reload the Settings window is closed, so a follow-up probe for
`.fwin` / `.os-set-nav-item` returns empty and looks like a second crash. Check `.os-taskbar` before
concluding anything.

## Section 5 — System & Architecture

| # | Item | Verdict | Selector measured | Value | Shots |
|---|---|---|---|---|---|
| 5.1 | Profile & Dictionary switch lag | **DONE** | nav-click → double-`rAF` paint time; a 16 ms `setInterval` gap detector; `PerformanceObserver` `longtask` | Before: **3954 / 3985 ms** to paint, against **43–47 ms** for every other page (Models 25 ms, Reading 30 ms) — a single synchronous **5662 ms** longtask. After: **219 / 214 ms**, worst gap **218 ms**. **18×.** Three causes, each measured separately: the over-encoded deck (5662 → 3665 ms), `slotCoverage` computed twice per report, and an unmemoised tokenizer call per word. | — |
| 5.2 | Consolidate Display + Monitors | **BLOCKED** | `git ls-files` | The premise exists only in another track's **uncommitted** work. `MonitorsPage.tsx` is **untracked** and the `monitors` nav entry lives in a foreign hunk of `settingsRegistry.ts`; at `HEAD` there is no Monitors page and no Monitors nav item, only Display. Consolidating them would mean either committing that track's page or shipping a commit that is broken at `HEAD`. **Do after the multi-monitor track lands.** | |
| 5.3 | Scraper settings → Scraper app | pending | | | |
| 5.4 | Translator + Model + Dictionary | pending | | | |
| 5.5 | Hide Special from normal view | **DONE** | `.os-set-nav-item` | `special` was the only System page without the `advanced: true` its neighbours `scraper` and `visualizer` already carry. After: Advanced **on** → **23** items, Special present; Advanced **off** → **18**, Special absent (it was 19 with Special before). Advanced restored to its original on. | |
### 5.1 — the stated remedy would not have worked, and the cause was three things

The item proposes *"restructuring them into logical sub-groups"*. The measurement says that
could not have helped: the page is **1100 DOM nodes**, the largest card is 132, and the whole
switch is **one synchronous task** — the `setInterval` gap detector saw a single 3689 ms hole
and `PerformanceObserver` reported one `longtask` of 3665 ms. Nothing about how the cards are
grouped changes a blocking computation. The goal ("address lag") is met; the proposed means
was aimed at a cause that was not there.

**Cause 1 — `jp-flashcard-deck` had been JSON-stringified nine times.** See the Section 6
notes below; it is a storage-integrity finding that happened to surface here. Repairing it took
the longtask from **5662 ms to 3665 ms**.

**Cause 2 and 3 — the level meter tokenises every word, twice.** `LevelSettingsSection` calls
`getLevelReport()` **inside a `useState` initializer** (`LevelMeter.tsx:27`), so it runs during
render, before paint. That report walked every word of every slot list through
`listProgress → toLemma → tokenizeSync` — the Japanese morphological tokenizer — and
`getLevelReport` built the same coverage **twice**: once inside `buildInput`, once for its own
`slots` field. Fixes: thread `slots` through instead of recomputing, and memoise `toLemma`.

The memo deliberately does **not** cache the `!tokenizerReady()` fallback. That path returns the
input unchanged, and caching it would pin the un-lemmatised answer for the rest of the session.

**Bisected, not guessed.** Replacing `<LevelSettingsSection />` with a comment took the switch
from 3689 ms to **64 ms**, which is what identified it; the section was restored before the real
fix went in.

**A hypothesis that was wrong, kept because it nearly passed.** The 5.2 s `JSON.parse` of the
37 MB deck looked like the whole answer. After repairing it the switch was still **3809 ms** —
and patching `Storage.prototype.getItem` and `JSON.parse` to log anything over 15 ms during the
switch caught **nothing at all**. Re-measuring after a plausible fix is what stopped this being
reported as solved.

### 5.8 — the tracks were right; the items were not allowed to shrink into them

`.pr-tester-row` is `repeat(auto-fit, minmax(130px, 1fr))` and `.pr-cond-grid` is
`minmax(110px, 1fr)`. Neither track could ever reach its stated minimum, because every control
inside is a `.set-select` carrying **`min-width: 200px`**, and a grid item's default
`min-width: auto` is its content minimum. Four selects plus gaps therefore demand
`4 × 200 + 3 × 10 = 830 px` inside a 680 px card.

So the grid definitions were never the bug and changing them would have been the wrong repair.
`min-width: 0` on the items restores the shrink the tracks already assumed, and `width: 100%`
makes each select fill its own track instead of sitting at its intrinsic width. Scoped to the
mining-rules containers — `.set-select` is used across the whole app and its 200 px floor is
correct everywhere it is not inside one of these grids.

| 5.6 | Help tour + offline assistant | pending | `jp-study.onboarding.v1` | **The tour's state machine is NOT broken** — verified live while doing 1.1. Profile read `{"completedAt":null,"replays":8,"lastStepId":null}`, which looks like a broken tour but is not: clicking `Next` persisted `lastStepId:"start"`, and `Skip tour` persisted `completedAt`. Both writes work. `replays:8` with no completion just means the tour was replayed and abandoned 8 times. **Whatever "broken" means in the audit doc, it is not lost state — re-diagnose before writing code.** The tour also auto-shows on renderer reload while `completedAt` is null. Decided for the assistant: search-and-answer over `searchSettings()`, no model. | |
| 5.7 | Scraper memory persistence | **ROOT CAUSE FIXED** (hardening outstanding) | total `localStorage` size; a non-destructive 64 KB-chunk quota probe; all four `jp-scraper-*` keys | The four scraper keys are structurally **healthy** — `settings` 20,840 chars / 1 layer / 4 fields, `shell` 592 / 1 / 15, `recent-queries` and `advanced` absent (never written). Nothing is wrong with the scraper's own store. What was wrong is that it had nowhere to write: `localStorage` held **51.62 MB**, 49 MB of it the two over-encoded keys from 6.A. After the repair, **1.35 MB** across the same 73 keys, and a probe wrote **12.8 MB** of scratch with no `QuotaExceededError`. | — |
| 5.8 | Mining Rules tab visual error | **DONE** | `.os-set-card[data-setting-id="profile-rules"]` `scrollWidth` vs `clientWidth`, plus every descendant rect against the card rect | The defect the source doc did not name: **the card overflows horizontally**. Before: `scrollWidth` **701** vs `clientWidth` **680**, **5** elements past the right edge, worst a `.set-select` at **+21 px** (the "Page category" control, visibly clipped in the shot). After: `scrollWidth` **680** = `clientWidth`, **0** overflowing elements. | `5.8-before-mining-rules.png`, `5.8-after-mining-rules.png` |

## Section 6 — Storage integrity audit (added 2026-08-07 by user request, not in the source PDF)

> **Scope, in the user's words:** *"for the storage issues i want a whole audit of storage
> and i want byte for byte comparison of what's supposed to be in storage vs not, to see if
> it's missing."* To be run as its own pass — **not** folded into the remaining v1.0 items.

| # | Item | Verdict | Notes |
|---|---|---|---|
### 6.B — the key inventory, derived from source rather than from this document

`localStorage.{get,set,remove}Item` literals plus every `*KEY*` constant with a `jp-`/`blanc`
prefix → **163 keys declared in source**. Live profile → **73 keys**, 63 of them `jp-`/`blanc`
prefixed.

- **Live but not declared: 6**, and all six are explained rather than orphans —
  `jp-annotations:<uuid>` ×3 and `jp-bookmarks-<uuid>` are per-book dynamic suffixes,
  `jp-study-stats-v1-ja` is a per-language suffix. `jp-mooncap-music-v1` is the one worth a
  second look: `catalogs/mooncapLore.ts` is deleted in the working tree, so this may be a
  genuine leftover from a removed feature. **Not chased — it belongs to another track's
  in-flight deletion.**
- **Declared but absent: 106.** This is the *read-but-never-written* class from 6.1 — settings
  sitting on their defaults. Expected for an inventory this size; it is only a defect when a
  control claims to write one and does not, which is 6.1's per-key work and is not finished.

### 6.C — over-encoding scan across every live key (the 6.3 corruption check, completed)

Every one of the 73 live keys was peeled until a parse failed. Exactly **two** were damaged, and
both are the 6.A defect:

| Key | Layers | Size | Outcome |
|---|---|---|---|
| `jp-flashcard-deck` | 9 | 37.25 MB | **repaired** in place → 1.26 MB / 1 layer, 3,221 cards intact |
| `jp-study-csv-editor-v1` | **18** | 12.3 MB | **not recovered — see below** |

17 keys parse as non-JSON, which is correct: they store bare scalars (`jp-app-zoom` = `1.1`).
The remaining 54 are single-layer and healthy. **So the corruption is bounded and now named**,
which is the answer to "see if it's missing" at the whole-store level.

### 6.D — a value was lost during this audit. What happened, and the fix it forced

**Stated plainly because it is the kind of thing an audit exists to surface, not hide.**

`jp-study-csv-editor-v1` was 18 layers and 12.3 MB. I opened the CSV tool to prove the repair
worked on it. It did not: peeling produced an object that did **not** match
`{table:{headers,rows}}`, so `loadStoredEditor` returned `null`, `CsvEditorPanel` fell back to
`defaultEditorSnapshot()`, and the first save wrote a **288-byte empty 4×8 table** over it.

What is and is not known:

- **That overwrite is pre-existing behaviour, not something my change introduced.** Before the
  repair a single `JSON.parse` returned a string and failed the identical guard, so opening the
  CSV tool would always have defaulted it. My change did not make it worse — but **I triggered
  it**, and I cannot now reconstruct what the 12.3 MB held.
- **The durable copy was already the same default.** `db.ts` calls IndexedDB "the app's durable
  store for heavy data … CSV drafts". Its `csv-editor` record holds an 8-row / 4-header table
  with `savedAt: 2026-08-07 17:04` — **before this session began (18:42)** — and is unchanged.
- **The Phase 0 backup does not contain it.** `jp-study-csv-editor-v1` appears only in the
  leveldb `MANIFEST`, with no value in any `.ldb`, while `jp-flashcard-deck` does appear in the
  data files. So there was no restore point for this key at 11:14 either — which is item 6.4,
  demonstrated the hard way.

**The fix this forced:** `quarantineIfUnrepaired` copies a damaged value to
`<key>.corrupt-backup` before a reader returns `null` and lets the owner overwrite it. It keeps
the **first** damaged copy, so re-running cannot replace it with an already-defaulted one. Both
callers now use it. Five tests pin it, including the quota-refusal path.

> **Method correction for the rest of this audit:** do not open a feature to "prove" a repair on
> a key whose recovery is unproven. Peel a copy in an `/eval` first and only drive the real UI
> once the peeled value is known to match the reader's shape.

| 6.1 | Field-level write/read reconciliation for every persisted key | **partial** | For each key, the set of fields **written** by some code path vs the set **present** in the live blob vs the set **read** by some consumer. Three failure classes to name separately: *written-then-erased* (6.2), *read-but-never-written* (a setting that can only ever be its default), *written-but-never-read* (a dead control — the `honesty-probe` verdict vocabulary applies). |
| 6.2 | Last-writer-wins erasure between two owners of one key | pending | **A confirmed instance already exists — see item 3.3.** `jp-os-environment-v1.companions` has two writers: Settings › Companions (`patchEnv`) and `CompanionLayer.persist()`. The layer held a stale list and its position autosave wrote that list back over the setting, so `holdRoutineId` / `primaryRoutineId` / `secondaryRoutineId` vanished from the blob within seconds of being chosen. Fixed for those three fields; **the same shape is untested for every other multi-writer key.** |
| 6.3 | Byte-for-byte round-trip per key | **partial** | Snapshot → change one field through the real control → change it back through the same control → diff the blob against the snapshot. A key that does not return to its exact bytes is either lossy or has a second writer. Note the known-benign case from 3.3: absent vs `""` compare unequal as text and identically in behaviour, so the report must distinguish *textual* from *behavioural* difference. |
| 6.4 | Renderer storage has no restore point | **DEMONSTRATED** | `localStorage` and IndexedDB were never covered even when userData backups were being taken, and backups are now discontinued (§ Phase 0). This item is partly *how to audit safely*, not only *what is broken*. |

### 6.A — CONFIRMED, and repaired: two keys were JSON-stringified once per boot

Found while measuring 5.1, and the most serious storage defect in the audit so far.

`migrationRunner.writeLocal` used to re-stringify what `getItem` had already returned as text,
**adding one escaping layer per boot**. The growth is exponential — roughly 2× per layer.
Measured live on this profile 2026-08-07:

| Key | Stored | Layers | True payload | Bloat |
|---|---|---|---|---|
| `jp-flashcard-deck` | **37.25 MB** | **9** | 1.26 MB — 3,221 cards, 1 folder | **29.6×** |
| `jp-study-csv-editor-v1` | **11.75 MB** | ≥2 | a 6.16 M-char table | — |

Together they were **49 MB of the 51.6 MB** in `localStorage` across 73 keys.

**The data loss is the part that matters.** `flashcardDeck.readStore()` parses **once**, so it
got a `string`; `parsed.folders` and `parsed.cards` were both `undefined`, and its guard returned
`{ folders: [], cards: [] }`. **3,221 flashcards read as an empty deck, silently.** The same
shape applies to `csvEditorStorage.loadStoredEditor`, which returned `null`.

The write-side guard is already in place (`migrationRunner.ts:31-37` carries a comment describing
exactly this failure), **but nothing repaired values that had already accumulated layers** — which
is the general lesson for 6.1: a fixed writer does not fix stored data, and no reader here noticed
it was reading a corpse.

Repair: `shared/overEncodedJson.ts` peels until a parse fails or the value stops being a string,
and both readers self-heal once on first read. Measured live: `jp-flashcard-deck` went
**39,056,392 → 1,320,982 chars, 9 layers → 1**, with all **3,221 cards intact**.

**Stated limit:** peeling is blind, so a payload that is a bare numeric string cannot survive
(`"42"` → `'42'` → `42`). Both current callers store objects; the module says so, and a test pins it.

**Keys seen so far in this audit**, as a starting inventory rather than a complete one:
`jp-os-environment-v1`, `jp-os-personalization-v1`, `jp-study-lockscreen-v1`,
`jp-study.onboarding.v1`, plus the 19 top-level userData JSON files and IndexedDB. Item 6.1
starts by **deriving** the full key list from source, not from this line.

> **Superseded by 6.B** — the list above is no longer the inventory. 163 keys are declared in
> source and 73 are live; the derivation is one `grep` over `localStorage.*Item` literals plus
> `*KEY*` constants.

### 5.7 — "the Scraper doesn't remember" was never about the Scraper

The item names the Scraper *"and other new features"*, and that plural is the tell. Every
scraper key is well-formed and its store parses once, normalises, and stringifies once. The
defect was **the shared resource**: `localStorage` was carrying **51.62 MB**, of which 49 MB was
the two over-encoded keys. Anything trying to write a new or growing value was writing into a
store already far past a normal Chromium origin quota, and *newest* features lose that race
because their keys are the ones not yet present.

**Why it looked like nothing was wrong.** `localStorage.setItem` appears at **194 non-test call
sites**, and **158 of them sit inside a `catch` that swallows the error** — 50 with a comment
explicitly naming quota. So a failed write produces no exception, no log, and no UI signal; the
value simply is not there next time. That is why this reads as "memory persistence issues"
across unrelated features rather than as one storage fault.

Fixing 6.A fixed this: **51.62 MB → 1.35 MB**, same 73 keys, and a chunked probe then wrote
12.8 MB of scratch without a `QuotaExceededError` before being removed.

**Outstanding, and named rather than quietly dropped:** those 158 silent catches are still
silent. The root cause is gone, so the symptom is gone, but the *class* recurs the moment
storage fills again. The hardening — routing quota failures to `logBlanc` / a user-visible
notice instead of `/* ignore */` — is a 158-site change that should be its own pass, not a
rider on this one.

### What Section 6 still owes

- **6.1 per-key field reconciliation is not done.** The whole-store corruption scan (6.C) is
  complete and the inventory (6.B) is derived, but the three-way *written / present / read*
  comparison **per field** has only been done for the keys that other items forced open
  (`jp-os-environment-v1` in 3.3, `jp-os-desktop-prefs-v1` in 4.1). 106 declared-but-absent keys
  are unclassified between "default, never touched" and "dead control".
- **6.2 has one confirmed instance and no systematic sweep.** No key is written by a literal
  `setItem` from two different source files, which is a real negative result — but it does not
  cover the shape that actually bit in 3.3, where two owners both went through one exported
  save function. That needs call-graph work, not grep.
- **6.3 round-trips are measured only where an item required one** — `jp-os-desktop-prefs-v1`
  byte-identical after an icon-size change and restore (4.1), `jp-os-personalization-v1` restored
  (2.2), `jp-study-shortcuts-v1` still `null` throughout 4.2, and the known benign
  absent-vs-`""` case in 3.3. A systematic pass over all 63 live keys was not run.
