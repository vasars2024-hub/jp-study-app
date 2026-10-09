# Accessibility checklist (a11y3)

What the automated suites prove, what they cannot, and a manual NVDA pass for
the owner to run before a release.

## 1. What runs automatically

`npx vitest run --maxWorkers=2 a11yAxe` runs axe-core 4.13 in jsdom over every
major surface, plus the house markup audit (`src/renderer/__tests__/helpers/ariaAudit.ts`).
Each suite asserts **zero serious or critical** findings.

| Suite | Surfaces |
| --- | --- |
| `a11yAxeShell` | Whole desktop, skip link, Start menu, a window's chrome, taskbar, notification centre, Quick Settings |
| `a11yAxeSettings` | Settings home and every page in the rail (Advanced Mode on) |
| `a11yAxeDictionary` | Results page, pop-up variant, no match, floating pop-up, Dictionary view |
| `a11yAxeFlashcards` | Deck list with preference panels open, review before/after answer, FSRS optimiser idle/running/finished |
| `a11yAxeGrammar` | Explorer, filter panel, a point, guides, Review cloze and verdict |
| `a11yAxeCalendar` | Month grid, day panel, every view mode incl. year, event editor |
| `a11yAxeStats` | Statistics view, review-insight charts with their tables, empty state |
| `a11yAxeLibrary` | Library shelf, novel reader chrome with a tool open, manga reader chrome |
| `a11yAxeTranslate` | Workbench empty and with text, default and Aero |
| `a11yAxeFiles` | Files root and eight scopes |
| `a11yAxeMedia` | Media Center home, library list, downloads |
| `src/media/__tests__/a11yAxeStudyBar` | Video study bar and each of its sheets |
| `a11yAxeBlanc` | Blanc shell, App Drawer, Master search with a query |
| `a11yAxeOnboarding` | Every first-run step, focus trap and focus return, tour, first-steps checklist |
| `a11yAxeLock` | Lock screen in all four skins, Blanc lock, PIN status announcements |
| `a11yAxeUpdate` | Update panel in every state |
| `a11yAxeRecorder` | Recorder panel (jobs, recording, paused, error), launcher, history list |
| `a11yAxeDialogs` | Confirm / alert / prompt dialogs, the shared Dialog, Aero Flip: trap and focus return |
| `a11yAxeWidgets` | Every registered widget at default and minimum size |
| `a11yAxeHelper` | The helper itself: it must catch the defects the suites rely on |

### Rules switched off in jsdom, and why

jsdom has no layout or paint, so these rules are disabled in
`helpers/axeAudit.ts` and must be checked by hand (section 3):
`color-contrast`, `color-contrast-enhanced`, `link-in-text-block` (need painted
colours), `target-size` (needs geometry; `hitTargetFloor24` covers the CSS),
`scrollable-region-focusable` (needs scroll sizes), `css-orientation-lock`,
and the page-level rules (`document-title`, `html-has-lang`, `landmark-one-main`,
`page-has-heading-one`, `region`, `bypass`, `meta-viewport*`, `frame-tested`),
which describe a whole page, not a component mounted in a bare `<div>`.

axe also cannot see focusability in jsdom (it reads element geometry), so its
`aria-hidden-focus` rule never fires there. The house audit decides that from
markup, which is why every suite runs both.

### Limits worth knowing

- Bridge calls the suites do not stub stay pending, so most pages are audited
  in their first-paint and loading states, not with every list populated.
- `minor` and `moderate` findings are not asserted.
- Nothing here listens to a screen reader. Section 2 does.

## 2. NVDA manual pass

Setup: NVDA 2024 or later, Windows default voice, browse mode on (NVDA+Space
toggles), speech viewer open (NVDA menu > Tools > Speech viewer) so you can read
what was said. Run the installed build, not the dev server.

Mark each line pass or fail and note what NVDA said.

### Desktop shell
- [ ] On first Tab after the desktop loads, NVDA says "Skip to taskbar, button". Enter moves to Start.
- [ ] NVDA+F7 (elements list) > Landmarks lists the taskbar as navigation, and each open window as a region named by its title.
- [ ] Start: opening announces an expanded menu; arrow keys read each app; Escape closes and NVDA is back on "Start".
- [ ] Notification centre: the bell is named (with unread count, if any); opening reads "Notifications, dialog"; each dismiss button names the notification it removes.
- [ ] Quick Settings: every select and slider is read with its label (Theme, Performance, Wallpaper fit, Volume, each mixer).
- [ ] A toast (mine a card from the dictionary pop-up) is spoken once without moving focus.

### Modal dialogs and overlays
- [ ] Any confirm (remove a deck): focus starts on Cancel, Tab and Shift+Tab cycle inside, Escape returns focus to the button that opened it.
- [ ] A prompt (rename a folder): the text field is read with the question as its label.
- [ ] First-run setup (Help > Restart setup): each step reads its heading; Shift+Tab from the heading stays in the dialog; closing returns to the Help button.
- [ ] Lock screen: focus starts inside; typing digits says "PIN digits entered: 2 of 4"; a wrong PIN is announced; Tab never reaches the desktop behind.
- [ ] Aero Flip (Ctrl+Alt+Tab): reads the list name and the current window; Escape returns to where you were.

### Dictionary
- [ ] Type a word: "Looking up" is spoken, then results; NVDA does not read stale results while busy.
- [ ] A word with no match: the "no match" line is spoken.
- [ ] Examples: "Searching examples" then the count or "no examples" is spoken.
- [ ] Each sense list is announced as a list with its item count; Anki and audio buttons have names.

### Study
- [ ] Flashcards deck list: each deck heading row reads as one button with its card count; the Options button opens the deck menu.
- [ ] Review: the card front is read; after Show answer, the grade buttons are reachable by Tab with their names.
- [ ] FSRS optimiser: "Optimising" progress is announced as a progress bar with a percent; the result sentence is read.
- [ ] Grammar explorer: Filters button reports expanded/collapsed; the result list is navigable; Review checks an answer and the verdict is spoken.
- [ ] Calendar: arrow keys move by day in the month and year grids; the day panel heading follows the selection.
- [ ] Statistics: each chart is read as an image with a one-sentence summary; the data table beside it has column headers.

### Reading and media
- [ ] Library Covers grid: each book is "<title>, button" with Remove and File as separate buttons after it (not inside it).
- [ ] Novel reader: chapter jump select is labelled; opening Bookmarks / Translate / Settings tools moves focus into the tool.
- [ ] Video study bar: each sheet toggle reports expanded/collapsed; sliders read their values.
- [ ] Recorder: starting reads "Recording", pausing reads "Recording paused"; after Stop, "Converting the recording" and later "Ready" are spoken once each, not every percent.

### Blanc
- [ ] Landmarks list shows Blanc's navigation and main.
- [ ] Open tools tablist: arrow keys move between tabs; Delete closes the focused tab (NVDA reports the shortcut).
- [ ] Master search (Ctrl+F in the Toolbox, or the search button): dialog name read, results announced as you type.

### Settings
- [ ] Search box reads as a combo box and reports when results are shown.
- [ ] Companions routine editor: each step's fields are read as "Step 2: app", "Step 3: wait in milliseconds", and so on.
- [ ] AI page: engine choice reads as a radio group with two radios.

## 3. Visual checks jsdom cannot make

- [ ] Windows High Contrast (Settings > Accessibility > Contrast themes): every theme keeps visible focus rings, borders on buttons, and readable text. The forced-colors CSS covers the main surfaces; look for icon-only buttons that vanish.
- [ ] Text contrast at 4.5:1 for body text in each theme (Accessibility Insights for Windows, or the Chrome DevTools contrast picker in a dev build).
- [ ] 200% UI zoom (Settings > Display): no clipped controls in Settings, the Dictionary pop-up, or the study bar.
- [ ] Reduced motion (Settings > Motion): no window or flyout animation plays.
- [ ] Focus is always visible when tabbing through the desktop, Start and a window, in Aero, Wired and Study OS.

## 4. Known gaps

- The card-level Library open button and the Blanc tab close button were
  restructured for nested-interactive and tablist rules; confirm with NVDA that
  pointer users lost nothing (click anywhere on a cover still opens it; the
  close cross on a Blanc tab still closes it).
- Live regions that mount together with their text (role="status" nodes that
  appear on state change) are announced by NVDA but not reliably by every
  screen reader; Narrator is not covered by this checklist.
- Colour contrast and target size are checked by the CSS tests and by hand only.
