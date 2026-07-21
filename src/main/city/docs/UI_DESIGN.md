---
doc_id: noctis.ui_design
tier: 8
authority: production_pipeline
role: study_os_interface_specification
status: approved
depends_on:
  - VISION.md
  - ART_DIRECTION.md
  - GAME_DESIGN.md
  - ARCHITECTURE.md
  - SIMULATION_SYSTEMS.md
---

# Noctis UI Design

## Document Status And Authority

This document binds the human-facing Study OS interface that surrounds the Noctis diorama. It is Tier 8 production authority: subordinate to Tiers 1–7, downstream of committed simulation state, and forbidden from inventing or mutating simulation facts.

The interface is the desk. The diorama is the window. Study actions remain the light source. Noctae-facing instruments remain diegetic and non-textual; normal readable text belongs only to the human workspace.

## 1. Product Surface

Noctis opens as one practical workspace with a living world, not as a launcher or game lobby. The first frame must communicate both layers:

- a calm, native desktop tool that can be understood immediately;
- an illustrated civilization visible behind or beside the work surface;
- no tutorial interruption, fantasy title card, quest list, or reward modal;
- no duplicated outer and inner application titles;
- no decorative emoji.

The default surface is the **Observatory Workspace**. It contains a dominant civilization viewport, a compact utility rail, a narrow status strip, and optional inspection glass. The viewport always receives the largest continuous area.

## 2. Responsive Layout Contract

The design target is the current 960 × 640 desktop window, with graceful behavior from 720 × 520 through full-screen displays.

| Region | Default contract | Narrow behavior |
|---|---|---|
| Civilization viewport | At least 65% of usable area; never below 560 × 360 at default size | Becomes full-bleed behind compact glass controls |
| Utility rail | 280–320 px, right side by default | Collapses to a bottom sheet or icon rail |
| Status strip | 28–32 px | Remains one line; low-priority fields disappear |
| Inspection glass | 280–360 px overlay or dock | Opens as a dismissible sheet |
| Window controls | Existing shell-owned controls | Never duplicated inside Noctis |

The viewport may crop atmosphere and distant scenery, but it must never crop the selected civic focus, the central spore-hearth in the first-opening composition, or required human controls.

## 3. Viewing States

### Glance View

The default during study. Motion and contrast are reduced, controls retreat, and the world remains readable as one calm luminous composition. No inspection panel opens automatically. The user can begin or resume study without interacting with the civilization.

### District View

The default when Noctis is opened for observation. Paths, citizens, ecological systems, and recent committed changes are legible. The user may pan with pointer drag or keyboard and zoom with the wheel, keyboard, or explicit controls within the currently revealed world bounds. A compact rail offers Overview, Archive, Ecology, Civic Life, and Discoveries. These are observation categories, never management categories.

### Detail View

Frames one institution, route, memory, organism, citizen, or transition. Detail is a real semantic camera level, not a renamed sidebar state. It may load approved higher-detail art and show a concise readable explanation grounded in committed state. It must provide a clear return to District View and may not trap the user in nested panels.

Authored scene objects are directly inspectable. Selecting visible geometry—such as a shelter, organism, route, current, citizen gathering, instrument, or terrain feature—softly illuminates that geometry, moves to its semantic detail frame, and opens a compact card containing the canonical name and committed-state description. The highlight is a restrained teal/silver bloom, never a hard strategy-game selection outline. Dragging remains camera movement and must not trigger inspection when the pointer is released.

### Strata View

Moves below civic ground into authored root, vault, and deep-fluid cross-sections. In Era I it frames only the surveyed root mouth and dark preview strata, preserving the sense that depth exists before it is fully understood. Later eras reveal connected lower regions without moving the ancestral basin. The toolbar labels this level `Below` in compact windows.

### Stellar View

Appears only when the Cosmic Stellar era has revealed the upper chasm. It travels upward through the same stable world coordinates to rift observatories and tethered orbital gardens; it is not a disconnected space screen or free-flight mode. Earlier surface and lower strata remain reachable through District, Strata, Night Drift, or Whole Civilization views.

### Night Drift

An explicitly started auto-explorer that visits only currently revealed focus targets. It slowly alternates district and detail framing, follows connected routes, and presents one compact observation card at a time. Cards describe committed facts; they are not modal tutorials, fictional rewards, or notifications. Any pointer, wheel, keyboard, visibility, or study-priority interruption pauses the drift. Reduced-motion mode uses immediate camera changes and calm card fades.

### Whole Civilization View

Fits the complete revealed world bounds into the viewport with margin. This is the only mode allowed to present the civilization as one complete rectangle. It provides orientation and era-scale comparison, not inspection; selecting a region leaves the overview and enters District View. Earlier regions remain visible as later horizontal, downward, and upward regions are revealed.

## 4. Information Architecture

### Overview

Shows the living viewport and a concise natural-language summary of the current condition. It may surface civilization status, current era name, recent change, and a quiet invitation to resume study. It must not expose internal formulas or percentage-to-next-era information.

### Archive

Shows permanent Memory records as dated, readable entries. The visual hierarchy favors chronology and intimacy over completion. Records are immutable; the UI offers inspection and filtering, never editing of historical facts.

### Ecology

Explains visible conditions: circulation, ecological succession, major networks, and active/dormant expression. It uses qualitative language and small instruments. It never turns reservoirs into spendable resources.

### Civic Life

Shows aggregate Noctae activity, institutions, cultural expression, and observed routines. It never exposes job assignment, housing controls, population optimization, or per-citizen command surfaces.

### Discoveries

Shows committed ecological, technological, cultural, or era transitions. A discovery is evidence and context, not a collectible badge wall.

## 5. State Presentation Rules

Presentation consumes a dedicated renderer view model derived from committed state. Components never interpret raw engine fields independently.

Allowed human-facing outputs include:

- qualitative state labels such as quiet, circulating, resonant, or hibernating;
- current era designation translated into natural language;
- dated Memory entries;
- recent transition explanations derived from before/after committed state;
- small instruments for immediately meaningful renewable conditions;
- state-driven highlighting of an ecology, district, or archive entry.

Forbidden outputs include:

- XP, levels, currency, or a percentage to the next era;
- raw coefficient values or debug state in production UI;
- red failure banners for ordinary absence;
- optimization recommendations framed as civic obligation;
- controls that directly mutate citizens, districts, resources, eras, or ecology;
- invented copy that claims a transition not present in committed state.

## 6. First-Opening Sequence

The first opening has no modal tutorial.

1. The practical workspace is immediately usable.
2. The viewport shows deep violet ridges, layered night, and one ancestral spore-hearth.
3. Before the first completed study session, advanced inspection categories remain quiet rather than locked behind game language.
4. After the first qualifying session, two compact glass instruments may surface: Brine and Glucans. They are described as environmental readings, not balances to spend.
5. The first permanent Memory entry appears only when the Memory contract qualifies it.

## 7. Materials, Typography, And Controls

- Use the application's existing dark Fluent-inspired primitives and deep-red accent system.
- Text remains normal desktop typography; fantasy display faces are forbidden in controls and body copy.
- Use compact density, thin separators, restrained acrylic-like translucency, and small-radius surfaces.
- Prefer existing vector icons. Do not embed text or icons in generated raster art.
- Keep a minimum 4.5:1 contrast ratio for body text and 3:1 for large text and essential graphical controls.
- Every interactive element must have keyboard focus, an accessible name, and a non-color-only selected state.
- Tooltips supplement visible affordances; they never carry essential information alone.

## 8. Interaction And Motion

UI motion follows the application motion system. It uses opacity and transform where possible, respects reduced-motion preferences, and never starts a high-salience loop while the user is actively studying.

- Selection: 120–180 ms, small fade or refractive outline.
- Panel transition: 180–260 ms, short eased translation and fade.
- District focus: 300–600 ms, calm camera interpolation owned by rendering.
- Manual camera: wheel or `+`/`-` zoom; pointer drag or arrow-key pan; `Home` enters Whole Civilization; `Escape` returns from Detail or pauses Night Drift.
- Night Drift travel: 4–8 seconds between focus targets with a readable dwell; never active during Glance View or while the document is hidden.
- Era metamorphosis: staged across reopening or a deliberate return to Noctis, never a blocking modal.
- Reduced motion: immediate state changes with static emphasis; no lost information.

## 9. Copy Voice

Copy is calm, concrete, and dignified. It welcomes return without guilt.

Preferred: “The currents are quiet. The archive remains intact.”

Rejected: streak-loss threats, failure language, urgent timers, victory fanfare, or claims that citizens suffered because the user was absent.

## 10. Loading, Empty, And Error States

- Initial load shows the night field and a quiet local shimmer, not a spinner over blank white.
- A newborn civilization is a valid authored state, not an empty-state card.
- Missing optional art falls back to code-native silhouettes and gradients while preserving layout.
- A state-load error must not fabricate a new civilization silently. It presents a recoverable local error and preserves the last valid envelope when possible.
- Renderer disconnection shows “Observation paused” and retries the read-only mirror; it never implies the civilization has been damaged.

## 11. Performance And Window Safety

- UI updates subscribe to the renderer mirror and select only the fields they render.
- Ambient animation must not trigger broad React rerenders.
- Large archives require virtualization.
- Pointer movement may adjust presentation transforms without committing window layout on every frame.
- Camera position, selected target, and Night Drift timing are renderer-local presentation state. They never invoke simulation IPC or write the civilization save.
- Off-camera regions and higher semantic-detail layers load lazily. Whole Civilization uses overview LODs rather than decoding every detail asset.
- No Noctis component may interfere with desktop dragging, resizing, pop-out ownership, or taskbar focus behavior.

## 12. Acceptance Checklist

- [x] The default window is usable at 960 × 640 without clipped controls.
- [ ] The viewport occupies at least 65% of the default surface.
- [ ] Study can begin without interacting with the city.
- [ ] No user-facing era percentage, currency, assignment control, or failure loop exists.
- [ ] Newborn, active, dimmed, hibernating, and returning states have authored copy and layout.
- [ ] Keyboard navigation, screen-reader labels, contrast, 200% zoom, and reduced motion pass.
- [x] District View pans and zooms without exposing unrevealed regions or moving simulation state.
- [x] Detail View visibly changes camera scale and identifies the selected committed target.
- [x] Visible authored objects open a named description and receive a soft, non-destructive highlight when selected.
- [x] Night Drift pauses on user input, hidden windows, Glance View, and reduced-motion requirements.
- [x] Whole Civilization is the only rectangular full-world framing and includes every revealed horizontal and vertical region.
- [ ] Desktop and pop-out windows render the same committed state.
- [x] The UI writes no simulation state.

## Closing Validation Statement

Noctis UI is a practical Study OS surface with a civilization soul. It gives the user clarity first, wonder second, and control over their study without control over the lives beyond the glass.
