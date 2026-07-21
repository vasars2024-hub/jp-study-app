# Extension Command Model

One registry in `extension/shared.js` (`COMMANDS`) drives every surface.

```js
{ id, label, shortLabel, description, category,        // read|save|card|capture|page|app
  contexts,          // ['page'] | ['selection'] | ['page:youtube'] | ['page:manga']
  wheel,             // assignable to a wheel position
  contextMenu }      // eligible for the browser context menu
```

## Commands

| id | label | notes |
|---|---|---|
| lookup.selection | Look up | page-side (opens reader popup) |
| save.word | Save word | background `/v1/mine` mode=word |
| save.sentence | Save sentence | background `/v1/mine` mode=sentence |
| card.create | Create card | forceAnki; preview by default |
| capture.page | Save page | page-aware: article→inbox, YouTube→metadata/download per setting |
| capture.ocr | OCR capture | page-side region select |
| capture.audio.record | Record audio | page-side MediaRecorder |
| capture.audio.save | Save audio | background `/v1/audio/save` |
| capture.manga | Import manga pages | `page:manga` |
| media.download | Download video | `page:youtube` |
| clipboard.send | Send to clipboard history | |
| translate.selection | Translate | page-side |
| grammar.match | Match grammar | page-side (opens popup Grammar tab) |
| reader.theme / reader.highlight / reader.knownTint | page tools | page-side |
| tabs.picker | Reading list | |
| app.open | Open GrammarX | `/v1/ui/open` |
| wheel.more | More… | opens secondary action menu |

## Aliases (migration + stored layouts)

`COMMAND_ALIASES` maps every v1 id (`mine`, `save`, `download`, `dictionary`,
`clipboard`, `ocr`, `bulk-tabs`, `record`, `audio-save`, `theme`, `highlight`,
`learn`, `epub`, `grammar`, `translate`, …) to a v3 command id.
`resolveCommandId()` accepts both; `settings.js` uses it when normalizing
stored wheel layouts.

## Dispatch

- Background owns `runCommand(id, tab, opts)`; the `run-command` message is
  the single entry point for popup/menus. Page-side commands are forwarded to
  the content script over a fixed message map.
- The content script owns `runLocalOrRemoteCommand(id)` for wheel/More-menu
  invocations: page-side commands run locally; everything else goes through
  `run-command`.
- Availability: `commandAvailableOnPage(id, pageKind, category)` — page-
  restricted commands (`media.download`, `capture.manga`) render disabled on
  the wheel and are filtered from the More menu.
- Every save funnels through one `saveText()` in the background (destination
  resolution, queueing, activity log, result shape) — no per-surface
  reimplementations.
