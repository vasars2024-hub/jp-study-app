# Radial Wheel Decision

## Decision: **retained, fully rebuilt** (not preserved as-is)

Evaluation against the keep/remove criteria:

- *Does it save time vs shortcuts?* For mouse/touchpad reading sessions, yes —
  one gesture reaches six commands without memorizing six bindings; keyboard
  users can ignore it entirely (all commands exist as popup/menu/shortcut
  paths).
- *Is it reliable/precise?* The old hold-release angular selection was not.
  The rebuild selects by clicking a labeled button per position (or pressing
  its number), which is exact.
- *Does it obscure content?* Old: full-screen-feeling dark disc. New: 236 px,
  clamped to the viewport, cancel on outside-click/Esc.
- *Does it duplicate other surfaces?* It exposes the same registry commands —
  by design; duplication of *implementations* is gone.

A compact contextual list also exists (the **More** menu); users who dislike
wheels can disable it (`wheelEnabled` off), and the wheel shortcut then opens
the More menu instead. So the wheel is an optional accelerator, not a load-
bearing surface.

## What was removed

- Repeated `Mine→Anki` (sector + center preview duplication).
- `YT DL` and `Save / YT` labels.
- 4-vs-6 slot count and generic `Slot 1..4` settings.
- Alternating dark-red/blue conic slices, hold-release-only selection,
  no-Escape, no-outside-cancel behavior.
- Destination/media/action mixing at one level.

## New design

- **6 fixed positions** (top, upper-right, lower-right, bottom, lower-left,
  upper-left), exactly one registry command per position; duplicates are
  impossible (the settings editor swaps positions instead).
- Defaults: Look up · Save word · Save sentence · Create card · Save page ·
  More…
- **Center = Cancel**, always; it previews the highlighted command's name but
  clicking it never runs anything.
- **Secondary actions** live under **More…**: OCR, Download video (YouTube
  only), Import manga pages (manga only), Record/Save audio, clipboard
  history, Translate, Match grammar, page tools, Reading list, Open GrammarX.
- **Page-aware**: `commandAvailableOnPage` disables inapplicable sectors
  (dimmed + explanatory tooltip) and filters the More menu.
- **Input**: pointer click per sector; keyboard `1`–`6` run, arrows move the
  highlight, `Enter` runs, `Esc` cancels; outside pointer-down cancels;
  30 px center dead-zone; opens at the pointer, clamped to the viewport.
- **Visuals**: compact pill buttons with number-key hints, one accent for
  hover/active, restrained 120 ms scale-in (disabled under
  `prefers-reduced-motion`), `role="menu"` / `menuitem`, `prefers-contrast`
  border boost.

## Settings

`Settings → Radial wheel`: enable toggle, six position selects labeled by
actual position, live circular preview, swap-on-duplicate, and a note about
page-aware disabling and keyboard controls. Old layouts migrate through the
alias map (e.g. `['save','download','mine','ocr']` →
`[capture.page, media.download, save.word, capture.ocr]` + defaults to fill
six).
