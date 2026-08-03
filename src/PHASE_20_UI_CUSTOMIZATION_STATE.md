# §20 — AI-Powered UI Customization (state report)

Tracks `docs/MASTER_PLAN.md` §20. Built 2026-07-25 on `grammarx/phase-1-5`, alongside
§2 in the same run.

**Run status: completed.**

## Why this slice

§20 was the last section of Part V with no implementation — nothing in the tree matched
`uiCustomization` / `themeAgent` before this run. Two things made it look done from a
distance:

- **Blanc already has its own theme editor** (Pillar 4: per-token colours, presets,
  import/export, raw custom-CSS escape hatch with a lockout guard). That is Blanc's
  `--blanc-*` namespace, a separate system with its own plan, and it does not touch
  Study OS.
- **Study OS already had a custom-CSS box** in Settings → Appearance
  (`renderer/customCss.ts`). Its own header comment said *"this is not a full CSS
  sanitizer"*, and it was not: it blocked `@import` / `javascript:` / `expression()`
  but happily accepted `.os-taskbar { display: none }`, which leaves a user unable to
  reach Settings and undo it. There was no theme profile model, no preview, no undo, no
  version history, and no component-level settings.

## What shipped

| File | Role |
| --- | --- |
| `src/shared/uiCustomization.ts` | The Theme/UI API: token allow-list, theme profiles, component settings, CSS review, CSS generation, request interpreter, history/undo, portability |
| `src/shared/__tests__/uiCustomization.test.ts` | 44 tests |
| `src/renderer/uiCustomizationStore.ts` | The impure boundary — clock, ids, localStorage, and the one owned `<style>` element |
| `src/renderer/components/settings/pages/ThemeStudioPanel.tsx` | Six settings cards: assistant, profiles, tokens, components, stylesheet, developer |
| `src/renderer/__tests__/themeStudioPanel.test.ts` | 6 render + sandbox-regression tests |
| `src/renderer/components/settings/pages/AppearancePage.tsx` | Mounts the panel after the existing personalization cards |
| `src/renderer/customCss.ts` | **Rewired** onto the shared reviewer — this is where the shipped sandbox gains its lockout guard |
| `src/shared/i18n/catalogs/{en,ja,zh,ru}.ts` | 107 `theme.*` keys in all four languages |

**Verification:** full suite 2,161/2,161. `node tools/i18n-check.cjs` exit 0 (4,591
keys). ESLint clean on every touched file. `tsc --noEmit` zero errors in them.
`vite build` clean.

**Verified live in the running app, not only by tests.** Settings → Appearance shows all
six cards; typing *"make the app look more like macOS and use pure black"* resolved to
two intents and a nine-token diff, the preview reached the DOM
(`--bg: #000000`, visibly rounder corners on screen), and Discard restored the original
values with an empty stylesheet. That session is also what surfaced the cascade bug
below — the unit tests could not have.

## The architecture §20 actually asks for

§20 ends with a diagram and an explicit negation:

```
AI Assistant → Theme/UI API → CSS variables + component settings → Application UI
```

*Not:* `AI → directly edits app files → potentially breaks everything.`

`shared/uiCustomization.ts` **is** that Theme/UI API, and the negation is structural
rather than a convention:

- A change can only name a token in `UI_TOKENS` (35 entries, each an existing custom
  property) or a key in `COMPONENT_SETTING_SPECS`. Anything else is reported, not
  applied.
- Every value is validated by kind and clamped to declared bounds, and a value
  containing `;`, `{`, `}`, a comment, `url(`, `expression(` or `@import` is rejected
  outright — those are the ways "set a colour" becomes "write arbitrary CSS".
- The only path from a theme to the document is one `<style id="jp-ui-customization">`
  element owned by the store. No file is written.

## The "AI" is a deterministic interpreter, not a model call

`interpretUiRequest(text, currentTokens)` resolves phrasing to a token patch locally
and returns a `UiChangePlan` that must be previewed and confirmed. It handles every
example §20 spells out — *"Make the sidebar smaller"*, *"Use a darker glass style"*,
*"Make the app look more like macOS"*, *"Increase subtitle size"*, *"Change card
spacing"* — plus 13 more intents.

This was a deliberate call. The app is offline-first (CLAUDE.md), and a customization
feature that needed a local LLM loaded would be dead whenever the model was absent,
which is most of the time. When a model *is* installed, §17's tool layer produces the
same `UiChangePlan` shape and goes through the same allow-list — it does not get a
second path to the DOM.

The interpreter reports what it could not understand (`plan.unmatched`) instead of
guessing. `"make the app look like Blender with neon wireframes"` changes nothing and
says which words it did not recognise.

## Design decisions worth remembering

- **Relative nudges resolve against the current value, not a fixed table.** "Rounder"
  on a 10px radius gives 16px; on a 4px radius it gives 6px. Then it clamps — "bigger
  text" on a 100px font still lands at the token's 28px ceiling.
- **Specific phrases are matched before generic ones.** "Make the sidebar smaller" also
  contains "smaller"; the rule list is ordered so the sidebar rule wins alone, and a
  matched phrase is removed from the text before the unmatched-words pass so a
  successful match is never reported back as a failure.
- **Unsafe CSS is refused at store time, not at render time.** `setUiCustomCss` returns
  the document unchanged when the review fails. Refusing only to *render* it would let
  it become active later through an import or a rule change. `profileToCss` re-checks
  anyway, as a second line for a hand-edited store.
- **The lockout guard is the point.** `PROTECTED_UI_SELECTORS` covers the taskbar, start
  button, window controls, Settings, the launcher, the command palette, and
  `body`/`html`/`:root`; `display:none`, `visibility:hidden`, `opacity:0`,
  `pointer-events:none` and `content-visibility:hidden` on any of them (or a descendant)
  are refused. Styling them is still allowed — only hiding is not.
- **`data:` urls pass, network urls do not.** A stylesheet that phones home breaks the
  offline-first rule and leaks browsing.
- **Undo is itself reversible.** `undoUiChange` snapshots the state it is undoing, so
  undo → undo returns you to where you started. §20 lists Undo and Version history side
  by side; a one-way undo would satisfy neither.
- **"Restore defaults" restores a built-in theme's *own* baseline**, not emptiness — the
  macOS theme goes back to its own corner radii, not to the stock ones.
- **A preview is never persisted.** `normalizeUiCustomizationDocument` always returns
  `preview: null`, so a stale plan cannot be confirmed weeks later against a theme it
  was not computed for. The panel previews by writing to the live `<style>` element and
  rolls that back on unmount.
- **An imported theme is never built-in and never overwrites an existing profile**,
  whatever id it claims — it arrives as a new profile the user can compare and discard.

## The cascade bug this would have shipped with

`renderer/osPersonalization.ts` writes about twenty of the same tokens — `--space-*`,
`--radius-*`, `--shadow-card`, `--shadow-toolbar`, `--font-body`, `--accent`,
`--accent-2`, `--motion-duration`, `--dur-*` — as **inline styles on
`documentElement`**. An inline declaration beats any selector in a stylesheet, so the
first live run applied a theme, reported success, and changed nothing for the majority
of its tokens: the panel said `--radius-md: 12px`, `getComputedStyle` said `8px`.

`profileToCss` now emits `!important` on the `:root` token declarations, which is the
one thing that does beat a normal inline declaration. The scope stays narrow because
only tokens the user explicitly set are emitted at all — the stock "Default" theme has
no overrides and produces an empty stylesheet, so nothing changes for anyone who never
opens this panel. Two tests pin both halves of that.

Worth remembering because it generalises: **every token in `UI_TOKENS` has to be checked
against `osPersonalization` before it is trusted.** Compilation and unit tests both
passed while the feature was half-inert.

## The change to already-shipped code

`renderer/customCss.ts`'s `sanitizeUserCss` now delegates to `reviewCustomCss`. Two
sanitizers guarding the same document would drift, and the weaker one would be the one
that mattered (§21's "no duplicate systems", applied early). Practical effects:

- The Appearance-page CSS box **gains the lockout guard** it did not have.
- It also gains the remote-`url()` and unbalanced-brace checks.
- It keeps every construct it already blocked (`-moz-binding`, `behavior:`, `vbscript:`,
  `</style`, `<script`), which were folded into the shared reviewer as a
  `blocked-construct` violation kind.
- `UI_CUSTOM_CSS_LIMIT` was set to 24,000 to match the limit that box already enforced,
  so no existing stylesheet becomes too long.

Covered by four regression tests in `themeStudioPanel.test.ts`.

## Roadmap coverage

| §20 roadmap piece | Status | Where / note |
| --- | --- | --- |
| Safe CSS and UI editor: understand → identify → generate → preview → confirm → apply | **Finished** | `interpretUiRequest` → `stageUiPlan` → `applyUiPlan` |
| Theme engine: colours, fonts, spacing, borders, shadows, animations, layout density | **Finished** | `UI_TOKENS`, seven groups |
| Theme profiles (Default, macOS inspired, Minimal, Japanese study mode, Dark OLED, custom) | **Finished** | `BUILT_IN_UI_THEMES` + user themes |
| Custom CSS: editor, live preview, enable/disable, import/export | **Finished** | Stylesheet card; "live preview" is the enable toggle plus the assistant preview |
| Custom CSS: syntax highlighting | **Not started** | Needs an editor component; the textarea uses the mono font only |
| AI CSS generation | **Partial, by design** | The interpreter generates *token and component* changes, never raw CSS — generating CSS would reintroduce the arbitrary-rule surface the allow-list exists to remove |
| Component-level customization (media cards, subtitle panel, vocabulary cards) | **Finished (model + editor)** | `COMPONENT_SETTING_SPECS`; emitted as `--ui-*` variables |
| Component settings consumed by those components | **Not started** | The variables are emitted; `MediaContent`/subtitle/vocab components do not read them yet |
| Safety: preview, undo, version history, restore defaults | **Finished** | 20-deep history per profile |
| Safety: never break core UI / remove essential components | **Finished** | `PROTECTED_UI_SELECTORS` + the value validator |
| Developer mode: edit CSS variables, view generated code, export/share themes | **Finished** | Developer card |
| Developer mode: inspect the component tree | **Not started** | A devtools-grade surface; out of scope for a theme API |
| Visual customization mode (move/resize/hide panels, create dashboards) | **Not started** | That is the widget/desktop layer, which already has its own system (`WidgetFrame`, desktop layouts) — building a second one here would be the duplicate §21 warns about |

## Next milestone for §20

Have the three named components actually read their variables — `--ui-media-card-size`,
`--ui-subtitle-panel-font-scale`, `--ui-vocabulary-card-density` and the rest are
emitted and editable today but nothing consumes them, so those settings are inert. That
is a small, mechanical change in `MediaContent.tsx`, the subtitle bar, and the flashcard
card, and it is what turns the component half of §20 from a model into a feature.
