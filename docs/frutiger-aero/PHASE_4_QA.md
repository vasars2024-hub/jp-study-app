# Phase 4 QA & Consolidation

Verification record, workflow check (M12), authenticity review (M13), and the
consolidated QA/handoff (M14) for the XP–Aero application transformation.
Read `PHASE_4_AUDIT.md` and `PHASE_4_IMPLEMENTATION_PLAN.md` first.

## Delivered this phase

| Milestone | Commit | Summary |
|---|---|---|
| M0 | `66600f5` | Audit + implementation plan |
| M1 | `c567925` | Shared grammar: MenuBar/StatusBar/SplitPane/FormRow/AppChrome + `aero-apps.css` |
| M2 | `2098ef2` | Promise dialogs; all 29 native confirm/alert/prompt replaced |
| M3 | `3b368f1` | Aero shell polish + original glass-leaf Start emblem (CSS-only) |
| M4 | `0d2af97` | Startup sequence (aurora → welcome) + sound-event routing |
| M6 | `eabf153` | Flashcards → Study Deck Studio |
| M8 | `f2e01aa` | CSV Editor → spreadsheet chrome |
| M9 | `f34591a` | Calendar → Life Organizer |
| M11 | `9bf2346` | Dictionary + Anki light chrome; remaining-app triage |

Second pass (concurrent work resolved — resumed):

| Milestone | Commit | Summary |
|---|---|---|
| Interior grammar | `0bd8c72` | Flat compact groupboxes — the core interior fix behind every app |
| M5 | `6d27c34` | Settings XP Control-Center density (glassy rail, dense nav) |
| M7 | `8334b68` | EPUB Digital Library (LibraryView) + reader glass chrome |
| M2 tail | `de0772f` | DesktopShell native dialogs → dialogService (staged by hunk) |
| M10 | `e672152` | Aero sticky-note glass-paper skin |

**Correction recorded (was the key gap):** M6/M8/M9/M11 originally shipped
*chrome only* — menu/status bars over unchanged SaaS card bodies. A menu bar is
**not** a transformation. The interior density grammar (`0bd8c72`) fixed that by
re-casting the shared body containers into flat compact groupboxes across every
app at once. See the guide.

Still deferred to Phase 5: the **Native-Fill toggle** (a viewport display
option, not an app transformation; needs the concurrent-work-entangled
`App.tsx`). The concurrent Lockscreen/viewport work itself remains uncommitted
in the working tree by design — Phase 4 never staged it (DesktopShell dialog
edits were staged by filtered hunk, verified 0 concurrent markers).

## Verification method (every milestone)

- `npx vite build --config vite.renderer.config.ts` — passes (tsc is broken
  repo-wide: TS 4.5 vs `satisfies`; not a Phase 4 regression).
- `npx vitest run` — **19 files / 151 tests pass** throughout.
- `eslint` on touched files — no new errors (2 pre-existing non-null-assertion
  warnings in CsvEditorPanel; one pre-existing `react-hooks/exhaustive-deps`
  config error in DesktopShell — both predate Phase 4).
- CSS scope gate — an `awk` check confirms **every** selector in
  `aero-apps.css` and the M3 block of `aero-shell.css` carries
  `:root[data-materials='aero']`. Default Study OS is unaffected by construction.

### Gate coverage per app milestone (M6/M8/M9/M11)

- **Functional** ✔ — all wrapped views wire existing handlers only; storage,
  import/export, virtualization, calendar engine, dictionary/anki logic
  untouched.
- **Theme boundary** ✔ — AppChrome is pass-through in the default theme (returns
  children with no wrapper), so default DOM is byte-identical; all Aero-only
  hiding is scoped CSS.
- **4:3 / Native Display** ✔ (by construction) — no display-mode branches added;
  chrome is flex-column (`ui-app-chrome`) that fills its container at any scale.
- **Floating / pop-out** ✔ (by construction) — AppChrome lives inside
  AppSection's children, so it inherits host-agnosticism; the MenuBar Alt-scope
  check keys off `[data-app-chrome]/.fwin/.popout-root`.
- **Accessibility** ✔ — MenuBar (WAI-ARIA menubar, roving tabindex), SplitPane
  (separator + arrows), dialogs (focus trap, Escape, Enter) verified in code;
  a11y.css (reduced motion/transparency, high contrast, large text) applies
  unchanged.
- **Performance** ✔ — no new always-on work; CSV virtualization intact.
- **Owed:** a manual visual pass in the running Electron app (it can't be driven
  headlessly in this environment) — confirm menu/status render and commands fire
  in the Aero window, and a large-dataset CSV scroll. Carry into Phase 5 sign-off.

## M12 — cross-app workflow check (existing buses)

No new workflow code was needed; the existing buses already carry these:
- **Mining → Flashcards refresh**: FlashcardsView subscribes to `onDeckChanged`
  and the mining panels call `onDeckSaved` → the deck strip updates. ✔
- **`os:open`**: Start/taskbar/palette routing unchanged and still fires the UI
  sound (M4). ✔
- **Reader → Dictionary / Dictionary → Anki**: unchanged, still functional. ✔
- **Deferred**: surfacing *recent documents* in the Start menu needs
  `DesktopShell` changes (entangled) — carry with M5/M7.

## M13 — authenticity review (against vision §8)

- *Desktop software, not a website?* The transformed apps now open with a menu
  bar and close with a status bar, and redundant SaaS headers are hidden under
  Aero — a clear shift toward native desktop grammar. ✔ (Music/Media already
  read as players.)
- *Compact but readable?* Density tokens keep rows ≥ 24px; no historical
  usability regressions. ✔
- *One operating system?* All apps share MenuBar/StatusBar/dialog primitives and
  the glass-chrome/solid-work-surface material split. ✔
- *Wallpaper supports, not overpowers?* Work surfaces are solid `--panel`; glass
  is confined to chrome. ✔
- *Secret Mode meaningfully different?* Menu bars, status bars, the glass-leaf
  Start emblem, the aurora startup — all absent from default Study OS. ✔
- **Follow-ups (not blockers):** Settings + EPUB are the two remaining apps that
  still read as modern React interiors; until M5/M7 land, the suite is not yet
  fully cohesive. Toolbar restyling of bespoke app toolbars (e.g.
  `csv-editor-toolbar`, `cal-toolbar`) to the `ui-toolbar` glass grammar is a
  worthwhile Phase 5 polish.

## Phase 5 handoff

Unblock and finish **M5 (Settings Control Center)**, **M7 (EPUB library +
reader)**, **M10 (Notes sticky skin)**, the **Native-Fill toggle**, and
**DesktopShell's dialog migration** once the concurrent Lockscreen/viewport work
commits (stage those by hunk). Then: authored system-sound pack, original
icon/wallpaper assets, Anime Edition pack, bespoke-toolbar → glass-grammar
restyle, deeper cross-app workflows (Start recents), and the manual in-app QA
sign-off across 4:3 / native / pop-out / reduced-motion.

**Phase 4 recommendation:** the shared interaction language and the clean-path
application suite are in place and verified; approve for continued execution,
resuming at M5/M7 when unblocked.
