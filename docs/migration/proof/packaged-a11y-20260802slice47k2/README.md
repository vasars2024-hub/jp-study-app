# Accessibility baseline on the packaged app — Phase 9 / slice 47k

```
node docs/migration/tools/packaged-a11y-gate.mjs
```

**This is a floor, not a conformance claim.** An automated DOM audit catches the mechanical
third of accessibility problems at best. It cannot see contrast, focus order in practice,
motion, screen-reader phrasing, or whether a surface is actually operable.

## The result

Nine surfaces, opened the way the app opens them (`os:open` with a section id — the command
palette's own route, `DesktopShell.tsx:1091`):

| surface | controls | fields | elements |
|---|---:|---:|---:|
| first-launch consent gate | 13 | 0 | 102 |
| desktop shell | 11 | 0 | 80 |
| media workspace | 15 | 0 | 106 |
| settings | 48 | 1 | 296 |
| dictionary | 57 | 2 | 326 |
| anki | 75 | 9 | 574 |
| library | 93 | 11 | 648 |
| reading | 117 | 15 | 799 |
| notebook | **148** | **15** | **893** |

*(Sections stay mounted once opened, so the counts accumulate and the last row is effectively
the union.)*

| check | count | ceiling |
|---|---:|---:|
| controls with no accessible name | **0** | 0 |
| form fields with no label | **0** | 0 |
| positive `tabindex` | **0** | 0 |
| duplicate `id`s | **0** | 0 |
| `<html>` without `lang` | **0** | 0 |
| `<img>` without `alt` | 0 | 0 |

**148 visible controls and 15 form fields, every one of them named.** That is a real result,
not an empty one — which is worth saying explicitly, because the *first* run of this gate
returned the same clean sweep having examined only 39 controls and **zero** fields. A PASS on
"no unlabelled fields" from a run that saw no field is not a pass. The gate opens the
form-bearing sections now, and every surface records its own coverage so a future clean sweep
can be read against how much it actually looked at.

## One check is structurally vacuous here, and should be read that way

`imagesWithoutAlt` is **0 out of 0**. This app renders its iconography as inline `<svg>`, not
`<img>` — there is not a single `<img>` element across all nine surfaces. The check is kept
because artwork surfaces (discovery posters, banners) do use images and were not reachable in
this run: the sidecar was not started and the library was empty, so nothing with a poster ever
rendered. **It is untested, not passing.**

## What else this run does not cover

- **Only visible elements.** Hidden panels are excluded on purpose — this app keeps whole
  surfaces mounted and CSS-hidden, and counting their controls would bury the reachable faults
  under unreachable ones. It also means a fault that only appears in an expanded state is
  invisible here.
- **No keyboard walk.** Nothing tabbed through the UI; `positiveTabindex: 0` says the sequence
  was not *globally reordered*, not that focus order is sensible.
- **No player.** The study overlay, mining panel and video controls need a running sidecar and
  a library item; none were present.
- **Placeholder counts as a name.** A field with only a `placeholder` is not flagged, which is
  weaker than the WCAG position — it is a name a screen reader will read, but it disappears on
  input. Tightening this is a deliberate future decision, not an oversight.
