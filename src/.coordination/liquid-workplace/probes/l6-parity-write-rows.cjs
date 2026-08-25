/**
 * Append category-6 rows to `parity-ledger.json` from the numbers the harness
 * actually produced. Idempotent by `app|feature`, so re-running adds only what
 * is new — which is why the L6 block below lives here rather than in a second
 * writer. RULE 1 applies to ledger writers as much as to probes.
 *
 * Every `observed` string below is a literal copy of a `check()` row's `evidence`
 * from a live drive — no prose, no adjectives, no rounding.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const LEDGER = path.join(__dirname, '..', 'parity-ledger.json');
const j = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));

const PROOF = 'probes/l6-parity.js (`__LQP.check(app)`), the surface-parameterised category-6 harness; calibrated against `probes/l6-parity-dictionary.js` — both instruments returned dictionary 7/7 with identical per-row evidence';
const VISUAL = 'live bridge drive, 2026-08-25 (L5 gate, §5.3)';
/** Latest milestone this file writes. Update with the newest block, not per row. */
const MILESTONE = 'L6-reading-and-immersion';

const liquidDest = (sel) =>
  `Same in-window ${sel}, on the liquid material — \`.fwin-liquid\` + \`data-presentation="liquid"\`, dense work kept on an opaque anchor (L3.2, \`20462e3a\`)`;

const rows = [];
const add = (app, feature, currentRoute, dest, keyboardRoute, owner, observed, visual) =>
  rows.push({
    app,
    feature,
    currentRoute,
    standardDestination: dest.standard,
    liquidDestination: dest.liquid,
    keyboardRoute,
    dataStateOwner: owner,
    automatedProof: PROOF,
    visualProof: visual || VISUAL,
    observed,
    status: 'both',
  });

// ---------------------------------------------------------------- grammar (8)
const G = { standard: 'GrammarContent in-window (`.gram-view`)', liquid: liquidDest('`.gram-view`') };
add('grammar', 'Switch between the four sections (Grammar points / Practice / Guides & hacks / Review)',
  'Grammar window > `.gram-mode-btn` segmented control', G,
  'buttons are real `<button>`s in tab order; exclusivity is carried by the `active` class, not by focus',
  'renderer-local view state (GrammarView)',
  'standard: modeButtons=4 active=1 || liquid: modeButtons=4 active=1 || negative control `modeSwitch` (active added to 3 of 4) -> 7/8, this row alone false at active=4, restored 8/8');
add('grammar', 'Browse the grammar catalogue with level badges',
  'Grammar window > `.gram-x-list` rows', G,
  'each row is a focusable `.gram-x-row-main` button',
  'bundled grammar dataset (renderer)',
  'standard: rows=2410 badged=2410 || liquid: rows=1 badged=1 after the search step; every rendered row carried a `.gram-badge`, both presentations');
add('grammar', 'Search/filter the catalogue',
  'Grammar window > `.gram-search` input', G,
  'text input, real keystrokes via the native value setter + `input` event',
  'renderer-local filter state',
  'typed あとで: rows 2410 -> 1 and the head count moved "2,410 points" -> "1 point"; count and rendered rows agree in both presentations');
add('grammar', 'Open a pattern\'s detail (structure, gloss, examples)',
  'Grammar window > click a `.gram-x-row-main`', G,
  'row is a button; the detail pane renders below it in the same window',
  'bundled grammar dataset (renderer)',
  'standard: detailChars=339 focusedTitle="〜あとで" and the detail pane contains that exact title || liquid: identical');
add('grammar', 'Grade a pattern (the study-state band control)',
  'Grammar window > `.gram-x-band .wk-grade-btn`', G,
  'four buttons in tab order',
  'persisted study state (grammar band store)',
  'standard: bandButtons=4 active=1 || liquid: bandButtons=4 active=1 — exactly one grade active in both');
add('grammar', 'Filter presets (select + save)',
  'Grammar window > `.gram-x-preset-select` + `Save`', G,
  'select and button, both focusable',
  'persisted preset store',
  'standard: presetOptions=1 saveControl=true || liquid: same || negative control `presets` (select detached) -> 7/8 with presetOptions=0, restored 8/8');
add('grammar', 'Hand the focused pattern to the Agent (L5 bullet 1)',
  'Grammar window > `.gram-ask-agent` in `GrammarDetail` (Blanc composes the same component)', G,
  'button, 209x31, contrast 7.9:1 (measured 2026-08-25, `d49d53cf`)',
  'agent conversation context store (session + persisted split by sensitivity)',
  'standard: label="Ask the Agent about this pattern" enabled || liquid: identical. Retention proven separately the same day: `dictionary-entry:grammar/pattern/n5-ato-de` retained true in one conversation alongside two other apps\' items');
add('grammar', 'Window lifecycle — Liquid on/off is reversible',
  'Grammar window > `.fwin-b-liquid`', G,
  '`aria-pressed` is a real boolean on the toggle',
  'per-window presentation state (L3)',
  'standard aria-pressed=false -> liquid aria-pressed=true -> standard. Round trip: rect identical, all four field values identical (`gram-search`="あとで" preserved), chars/nodes/controls unchanged, diff {} || negative control `windowLifecycle` (aria-pressed stripped) -> 7/8, restored 8/8');

// -------------------------------------------------------------- translate (7)
const T = { standard: 'TranslateView in-window (`.tr-view`)', liquid: liquidDest('`.tr-view`') };
add('translate', 'Switch between Translate and History',
  'Translate window > `.tr-tabs .gram-mode-btn`', T,
  'real buttons in tab order',
  'renderer-local view state',
  'standard: tabs=2 active=1 || liquid: tabs=2 active=1. TRAP for the next worker: this tab is ALSO labelled "Translate", so a `/^Translate$/` text match hits the tab and not the action button — a click that produces nothing and reads like a broken translate');
add('translate', 'Choose source and target language',
  'Translate window > two `.tr-dir .dict-lang-toggle` groups + `.tr-swap`', T,
  'buttons in tab order; swap is its own button',
  'persisted translate preferences',
  'standard: activePerGroup=[1,1] active=[日本語,English] || liquid: same || swap drive: [日本語,English] -> [English,日本語] -> [日本語,English] || negative control `direction` (a second button forced active in group 0) -> 6/7 at activePerGroup=[3,1], restored 7/7');
add('translate', 'Enter source text',
  'Translate window > `.tr-textarea`', T,
  'textarea, Ctrl+Enter runs the translation',
  'renderer-local input state',
  'standard: chars=6 (猫が好きです) survives re-render || liquid: chars=6 || negative control `input` (cleared) -> 5/7 — TWO rows moved, and that coupling is correct product behaviour: with no input the Agent handoff is legitimately disabled');
add('translate', 'Run a translation and read the output',
  'Translate window > `.tr-actions .btn.primary`', T,
  'button; Ctrl+Enter in the textarea is the keyboard route',
  'main-process translate service (local Qwen3-1.7B by profile)',
  'standard: output "Translation appears here." -> "I like cats." (outputChars 25 -> 12) for 猫が好きです. Cold model load took ~50 s and the surface stated it honestly throughout — "Working…" plus "Loading model: Qwen3-1.7B.gguf — 45%". || liquid: same output rendered. HARNESS NOTE: the empty state is the SENTENCE "Translation appears here.", so a row scored on "the pane has text" passes with nothing translated; this row requires the text to have CHANGED from the pre-click value');
add('translate', 'Swap the translation direction',
  'Translate window > `.tr-swap`', T,
  'button in tab order',
  'persisted translate preferences',
  'standard: before=[English,日本語] after=[日本語,English] || liquid: same control, same exchange');
add('translate', 'Hand the highlighted range (or the whole input) to the Agent (L5 bullet 1)',
  'Translate window > `.tr-ask-agent`, and the Aero toolbar copy', T,
  'button; the highlight itself is a real selection made with focus + keyup',
  'agent conversation context store — a `selected-text` span is `personal`, held in session memory and never written to disk',
  'standard: label "Ask the Agent" -> "Ask the Agent about the selection" when 猫が is highlighted, and back to "Ask the Agent" when the caret collapses || liquid: identical. TRAP, refined 2026-08-25: "focus then keyup" is necessary but NOT sufficient — with `document.hasFocus() === false` the identical keyup changes nothing and the live feature reads as DEAD. POST `/focus` first');
add('translate', 'Window lifecycle — Liquid on/off is reversible',
  'Translate window > `.fwin-b-liquid`', T,
  '`aria-pressed` is a real boolean on the toggle',
  'per-window presentation state (L3)',
  'standard -> liquid -> standard. Round trip: rect identical, `.tr-textarea` value identical, chars 3688 = 3688, controls 29 = 29 || negative control `windowLifecycle` -> aria-pressed=null and the row alone false, restored');

// ------------------------------------------------------------------ agent (8)
const A = { standard: 'AgentWorkspaceShell in-window (`.agent-root`)', liquid: liquidDest('`.agent-root`') };
add('agent', 'Browse and select a conversation',
  'Agent window > `.agent-rail-entry` rows', A,
  'rail entries are real buttons',
  'persisted agent conversation store',
  'standard: conversations=4 selected=1 || liquid: conversations=4 selected=1 || negative control `conversationRail` (selection class removed) -> 7/8 at selected=0, restored 8/8');
add('agent', 'The rail head count tracks the store',
  'Agent window > `.agent-rail-count`', A,
  'text, not interactive',
  'persisted agent conversation store',
  'standard: headCount="4 conversations" rows=4 || liquid: same — the head count and the rendered rows agree, so the list is not showing a stale total');
add('agent', 'Read the selected conversation',
  'Agent window > `.agent-conversation` canvas', A,
  'scrollable region; messages are static content on an opaque anchor, deliberately not glass',
  'persisted agent conversation store',
  'standard: title="What does this word mean?" rail="What does this word mean?" messages=4 — the canvas title and the selected rail row are the same conversation || liquid: identical');
add('agent', 'Compose a message',
  'Agent window > the composer textarea', A,
  'textarea; Send is a button beside it',
  'renderer-local draft state',
  'standard: chars=17 survives re-render || liquid: chars=17 preserved ACROSS the presentation round trip, along with all seven other field values');
add('agent', 'Remove a context item (the reverse of every surface\'s "Ask the Agent")',
  'Agent window > `Remove <name> from context` controls on the context shelf', A,
  'each item carries its own remove button, so every add has an intentional reverse (CLAUDE.md\'s enable/disable rule)',
  'agent conversation context store',
  'standard: removeControls=7 || liquid: 7 || negative control `contextShelf` (all seven detached) -> 7/8 at removeControls=0, all seven restored, 8/8');
add('agent', 'Switch the conversation view (Simple / Full)',
  'Agent window > `.agent-view-toggle-button`', A,
  'two buttons in tab order',
  'renderer-local view state',
  'standard: views=2 selected=1 || liquid: views=2 selected=1 || negative control `viewToggle` -> 7/8 at selected=0, restored 8/8');
add('agent', 'Reach the four side panels (Reusable prompts, Capabilities, Permissions and profile, Pipeline)',
  'Agent window > the workspace\'s docked panel controls', A,
  'all four are real buttons',
  'mixed: prompt library and capability registry are persisted; pipeline is main-process state',
  'standard: panels=4/4 || liquid: panels=4/4');
add('agent', 'Window lifecycle — Liquid on/off is reversible',
  'Agent window > `.fwin-b-liquid`', A,
  '`aria-pressed` is a real boolean on the toggle',
  'per-window presentation state (L3)',
  'standard -> liquid -> standard. Round trip: rect identical, all 8 field values identical, nodes 351 = 351, controls 52 = 52. NOTE: the Agent\'s POP-OUT destination (`?popout=agent`) mounts outside `.fwin` — no window chrome, no `Make Liquid`, no `data-presentation` — so that host has no Liquid destination at all, the same fact already recorded for the seanime media workspace');

// --------------------------------------------------------------- captures (6)
// L6's first surface. Same harness, one SPEC — no new probe file.
const C = {
  standard: 'ReadingCapturesView inside the Reading workspace (`.reading-captures` > `.lq-reading`)',
  liquid: liquidDest('`.reading-captures`'),
};
const CV = 'live bridge drive, 2026-08-25 (L6 bullet 1, §5.3)';
add('captures', 'Browse the persisted capture history with its source badge',
  'Reading window > Captures tab > the capture list tool', C,
  'each row is a real `<button>`; the list is reachable whether docked or a sheet',
  'main-process lens history (`lens:history:list`)',
  'standard: rows=42 withSource=42 || liquid: rows=42 withSource=42 || negative control `captureList` (ONE row\'s `.reading-captures-row-meta` detached) -> 5/6, this row alone false at withSource=41, restored 6/6',
  CV);
add('captures', 'Select a capture and read it in the passage pane',
  'Reading window > Captures tab > click a row', C,
  'row buttons carry `aria-current`; the heading is an `<h2>` in the reader landmark',
  'main-process lens history + renderer selection state',
  'standard: selected="clipboard" heading="clipboard" || liquid: identical — the selected row and the reader heading are the same capture in both',
  CV);
add('captures', 'The capture list never partially covers the passage',
  'Reading window > Captures tab > `.lq-reading` resolves placement from its own width', C,
  'placement changes nothing about tab order — DOM order is document then tool at every width',
  'pure geometry (`shared/liquidReadingCanvas.ts`); no persisted state',
  'standard: canvas=762 doc=490 docked=1 sheets=0 sum=762 covered=false || liquid: identical || narrowed to a 562px pane: sheet 562, doc 562, `inert` + `aria-hidden` set, role="dialog"; `window.innerWidth`=1264 and `matchMedia(\'(max-width: 720px)\')`=false, so the OLD grid would have left the passage 292px',
  CV);
add('captures', 'The passage stays at a legible measure at any pane width',
  'Reading window > Captures tab > `--lq-reading-measure` on the document region', C,
  'not a control; a rendered constraint',
  'pure geometry (`READING_CANVAS_POLICY.maxContentWidth` = 760)',
  'standard: measure="490px" passage=454 || liquid: measure="490px" passage=454 — the rendered passage is inside the declared clamp in both presentations',
  CV);
add('captures', 'Hide and restore the capture list',
  'Reading window > Captures tab > `.reading-captures-list-toggle`', C,
  '`aria-pressed` is a real boolean and agrees with whether the tool is mounted',
  'renderer-local view state (ReadingCapturesView)',
  'standard: toggle=true ariaPressed=true listOpen=true || liquid: identical || live: dismissed the sheet -> document back at 562px with its 69 characters, reopened from the toggle -> 42 rows again || negative control `listReversibility` (`aria-pressed` stripped) -> 5/6, this row alone false, restored 6/6',
  CV);
add('captures', 'Window lifecycle — Liquid on/off is reversible',
  'Reading window > `.fwin-b-liquid`', C,
  '`aria-pressed` is a real boolean on the toggle',
  'per-window presentation state (L3)',
  'standard -> liquid -> standard. Round trip identical on every field: rect 94/54/820x580, maximized=false, focused=true, zIndex=264, chars 843 = 843, nodes 284 = 284, controls 58 = 58 || negative control `windowLifecycle` -> 5/6, this row alone false, restored 6/6',
  CV);

const have = new Set(j.rows.map((r) => `${r.app}|${r.feature}`));
const fresh = rows.filter((r) => !have.has(`${r.app}|${r.feature}`));
if (!fresh.length) {
  console.log('nothing to add — all rows already present');
  process.exit(0);
}
j.rows.push(...fresh);
j.milestone = MILESTONE;
fs.writeFileSync(LEDGER, `${JSON.stringify(j, null, 2)}\n`, 'utf8');
const byApp = j.rows.reduce((a, r) => ((a[r.app] = (a[r.app] || 0) + 1), a), {});
console.log(`added ${fresh.length}; total ${j.rows.length}`, JSON.stringify(byApp));
