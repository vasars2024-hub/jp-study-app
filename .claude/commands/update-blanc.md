---
description: Find where Blanc has fallen behind Study OS and port the next gap Blanc-native.
---

Bring Blanc up to date with Study OS. Work from the drift report, not from a
fresh audit.

## 1. Get the work-list

Run:

```
node tools/blanc-drift.cjs
```

Read the output before touching anything. It reports, in order of severity:

- **UNCLASSIFIED** — a Study OS surface that nobody has triaged. This is the
  actual drift alarm. Classify each one in `blanc-coverage.json` as `covered`,
  `deliberately-excluded` (with a `reason`), or `pending` (with a `note` saying
  which pillar it belongs to). Do this first — it is cheap and it is what keeps
  the alarm meaningful.
- **BROKEN CLAIMS** — marked `covered` but naming no real `BLANC_TOOL_IDS` entry
  and no Blanc tab surface. Either fix the claim or demote it to `pending`.
- **PILLAR 0 VIOLATIONS** — `renderBlancTool` returning a Study OS `*View`, or a
  Blanc file importing `AppChrome`/`MenuBar`/`StatusBar`. These block everything
  else; fix before porting anything new.
- **TAB BAIL-OUTS** — tools that switch to a Study OS tab instead of rendering a
  panel. Not coverage.
- **PENDING** — the tracked gap list. Pick from here once the above are clean.

## 2. Pick one gap

Prefer, in this order: Pillar 0 violations → tab bail-outs → the study-native
toolbox track in `BLANC_REFINEMENT_PLAN.md` → Pillar 2 parity ports. Do not
build the deferred generic PowerToys-shaped adapters ahead of the study-native
list; that ordering is deliberate and documented in the plan.

## 3. Port it under the Pillar 0 rule

Never mount a Study OS `*View` inside Blanc. Instead:

1. **Share the data layer, never the view.** Stores, IPC, and pure helpers are
   reused as-is.
2. **Compose the inner content component** inside Blanc chrome
   (`blanc-tool-detail` + `fieldset`/`legend`). If the `*View` has no extracted
   inner component, extract one into `components/<area>/<Area>Content.tsx` —
   typically a state hook plus presentational pieces — and leave Study OS
   consuming it through its own view, so there is still one implementation with
   two presentations.
3. **Never import `AppChrome`, `MenuBar`, or `StatusBar`** into a Blanc panel,
   and never import a `*View` module from Blanc either — that drags the chrome
   in through the import graph and undoes Pillar 1's bundle work.

Follow the existing examples in
`src/renderer/components/blanc/BlancStudyPanels.tsx` (dictionary, grammar,
clipboard, reading finder, resources, calendar) and their paired
`*Content.tsx` extractions.

Register the panel with a `lazy()` import in `BlancShell.tsx` so it stays out of
the initial chunk.

## 4. Verify, then record

- `npx vitest run` — must stay green.
- `node tools/blanc-drift.cjs` — the surface you ported should no longer appear
  as a violation.
- Render it: start the `renderer` dev server, open `/blanc-harness.html`, open
  the tool, and assert `document.querySelectorAll('.ui-app-chrome').length === 0`
  with exactly one `.blanc-tool-detail`. A port that only typechecks is not done.
- Update the surface's entry in `blanc-coverage.json` to `covered`, naming the
  `blancToolId` and a dated note.

Do not mark something covered because a file exists, and do not count a
tab-routed bail-out as coverage.
