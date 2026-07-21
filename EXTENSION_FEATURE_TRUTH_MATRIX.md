# Extension Feature Truth Matrix

Status of every feature **before** the v3.0.0 rebuild (verified by reading the
code and the bridge server, not by trusting names), and its state **after**.

Legend for "before": Verified complete · Working but shallow · Partially
implemented · UI-only · Duplicated · Misnamed · Confusing · Broken ·
Unreachable · Obsolete · Missing.

| Feature | Before (v2.4.7) | After (v3.0.0) |
|---|---|---|
| Shift-hover lookup | **Missing** — click/select only | Implemented: configurable key, delay, scan length, prefix-trimmed lookup, popup survives cursor entry |
| Dictionary popup | Working but shallow — flat entry list, no tabs/keyboard | Tabbed reader popup (Meaning/Grammar/Sentence/Kanji/Examples/More), keyboard nav, pin/drag, nested lookup + back |
| Sentence detection | Partially implemented — used only for classify | Sentence tab: detected bounds, extend/contract/reset, manual edit, difficulty + known-coverage stats |
| Grammar analysis | Working but shallow — toast with match count | Grammar tab: patterns with JLPT level + meaning, literal spans underlined, explicit "pattern match" uncertainty labeling |
| Kanji information | Missing | Kanji tab: per-character lookup through the real `/v1/lookup`, nested lookup on tap |
| Examples | Working but shallow — unranked list under button | Examples tab: term-highlighted, per-example play + save sentence |
| Known-word status | Verified complete (N/L/F/K buttons) | Kept; restyled as labeled segmented control, loads for de-inflected base form |
| Pitch / frequency / JLPT badges | Verified complete | Kept; JLPT explicitly labeled as estimate |
| Audio (TTS) | Verified complete (speechSynthesis) | Kept (header + examples) |
| Mine word/sentence | Confusing — "Mine → Anki/App" everywhere | "Save word / Save sentence"; destination from one setting; queued path preserved |
| Add to Anki | Duplicated — per-entry button + prefer-Anki mine | "Create card" with preview (text, type, destination, source); forceAnki path |
| Card field editing | Missing (and impossible via bridge) | Honestly scoped: preview edits the *sent text* only; note explains fields are filled app-side |
| Capture page / inbox | Verified complete | Kept ("Save page"); queued result no longer throws |
| YouTube download | Misnamed ("YT DL") | "Download video", page-aware (disabled off YouTube) |
| YouTube metadata save | Verified complete | Kept ("Save video / Save playlist") |
| Long-strip import | Misnamed ("Scan strip") | "Import manga pages"; shown on manga pages |
| OCR | Working but shallow — read-only result box | Editable result, Look up / Save / Re-select actions, model-missing guidance kept |
| Audio record/save | Verified complete | Kept, under More menu ("Record audio" / "Save audio") |
| Clipboard send | Duplicated (two paths, "GrammarX clipboard" label) | One path: "Add to clipboard history" (input source framing) |
| Radial wheel | Confusing + Duplicated (see decision doc) | Rebuilt — see `EXTENSION_RADIAL_WHEEL_DECISION.md` |
| Bulk tab picker | Working but shallow; bulk "Mine page" was junk | "Reading list": bulk save pages / download videos; junk mine removed |
| Page level badge | Verified complete | Kept, with honest tooltips (estimate/offline/no-JA-text) |
| Comprehensibility % | Verified complete | Kept on panel + popup page card + sentence stats |
| Category · profile badge on FAB | Confusing (leaked profile rules) | Removed from page; profile shown in popup status detail |
| "Mine → Anki" destination badge | Confusing | Removed; destination is a setting with honest two options |
| Page themes / highlight / tint | Verified complete; highlight **Broken** across elements | Kept; highlighter rewritten per-text-node (works on any selection) |
| Immersion logging | Verified complete | Kept (Advanced toggle) |
| Retry queue + badge | Verified complete | Kept; badge amber, popup pending bar with Retry, unknown legacy kinds dropped safely |
| Pairing | Duplicated (popup + options) | Settings → Connection only; popup links there on failure |
| Connection chip | Confusing (single green lie) | Expandable: app / pairing / Anki profile / pending, each separate |
| Context menus | Confusing (7 items, 4 "Mine…") | 6 verbs: Look up selection, Save word, Save sentence, Create flashcard, Save page, OCR capture, Open GrammarX |
| Keyboard commands | Verified complete | Kept (same ids so user bindings survive); descriptions renamed |
| Settings page | Confusing accordion | Categorized app with search + aliases, export/import/reset |
| PDF support | Missing (content script is http/https only) | Unchanged — out of scope; documented limitation |
| Subtitle capture | Missing | Unchanged — not invented; YouTube actions are metadata/download only |
