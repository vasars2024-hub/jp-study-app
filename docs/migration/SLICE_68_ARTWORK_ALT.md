# Slice 68 — the artwork `alt` decision

**Verdict, up front: the 13 flagged images are NOT 13 nameless items. Twelve of them are
`MediaPosterCard` posters whose card already carries the title twice over — as visible text and as
`aria-label` — and the packaged run's OWN keyboard walk records their accessible names. The
`cardTextLength: 0` that produced the finding is an instrument artifact in the gate, not a property
of the DOM.**

Setting `alt={title}` on those twelve would have been the regression the brief warned about, applied
to the whole set rather than half of it. What this slice ships instead is the part of the brief that
survives the measurement: **`MediaArtwork` no longer hardcodes `alt=""`.** Every caller now has to
state the decision, and the decision is checked by the type system and by a new test.

---

## 1. The instrument artifact — read this before quoting `decorativeInsideTextlessCard` again

`packaged-a11y-deep-gate.mjs:792` finds "the card this picture belongs to" with:

```js
const card = img.closest('a, button, li, article, [role="listitem"], [role="button"], '
                       + '[class*="card"], [class*="tile"], [class*="row"], [class*="item"]');
```

`Element.closest()` **starts at the element itself.** The poster image's own class is
`medialib-card__img`, which matches `[class*="card"]`. So for every poster the gate scored, the
"card" it found *is the `<img>`*, an element whose `textContent` is `''` by definition.

This is not inferred. It is written down in the proof the brief cites —
`docs/migration/proof/packaged-a11y-deep-20260802194553/packaged-a11y-deep.json`, every one of the
twelve poster entries in `artwork.decorativeInsideTextlessCardExamples`:

```json
"el":     "img.medialib-card__img",
"path":   "div > div.medialib-card > div.medialib-card__art > img.medialib-card__img",
"cardEl": "img.medialib-card__img",     <-- the card is the image
"cardTextLength": 0,
"cardText": ""
```

`path` shows the real card two levels up (`div.medialib-card`) and `cardEl` shows the gate never
reached it. Any `<img>` in this app whose class contains `card`, `tile`, `row` or `item` will report
`cardTextLength: 0` no matter what its card says. The metric cannot currently distinguish a nameless
card from a conventionally-named image class.

**The counter-measurement, from the same JSON, same run, same binary** — the keyboard walk records
the *computed accessible name* of each card, which is the number the a11y question actually turns on:

```json
{ "i": 25, "el": "div.medialib-card",        "name": "Fixture Title 1" },
{ "i": 26, "el": "button.medialib-card__more","name": "More actions" },
{ "i": 27, "el": "div.medialib-card",        "name": "Fixture Title 2" },
...
```

Twelve `div.medialib-card` stops, twelve distinct fixture titles. **The items are announced.** The
brief's "the entire item is invisible" is false for all twelve. Two independent readings of one run
disagree, and the one that computes an accessible name wins over the one that runs a CSS selector.

The thirteenth image is `img.reading-garden-foreground-mask`, which the brief already identifies as
genuinely decorative. Its `cardEl` is `null` — a true negative. So the flagged set is **12 artifacts
+ 1 correct-and-already-correct**, and the count of real WCAG 1.1.1 failures in it is **0**.

> Not a criticism of the gate — it is the gate's own stated posture ("a candidate set, not a
> verdict"), and it is the fourth instance tonight of the wrong-layer mistake its comments catalogue.
> But `docs/migration/tools/**` is claude-x's this session, so the one-word fix
> (`img.parentElement?.closest(...)`, or dropping `[class*="card"]` in favour of the ancestor walk)
> is **not applied here**. It is the coordinator's call.

## 2. Call-site classification — the substance of the slice

Seven **surfaces** paint library artwork. Five of them are distinct `MediaArtwork` call sites (rows
1–4 and 6); row 5 is a second render of row 3's component, not its own call site; row 7 hand-rolls
the image and never touches `MediaArtwork`. For each: does the surrounding card/tile/row/section
give the item an accessible name?

| # | Call site | Names the item how | Image should be |
|---|-----------|--------------------|-----------------|
| 1 | `MediaPosterCard.tsx:112` (poster + still grids) | **Twice.** `div.medialib-card` is `role="button" aria-label={title}` (`:100`) **and** prints `span.medialib-card__title` (`:149`). Runtime-confirmed above. | **decorative** |
| 2 | `MediaDetailPanel.tsx:174` (drawer hero banner) | `aside.medialib-drawer` is `aria-label`ed as the detail region (`:172`); body opens with `<h3 class="medialib-drawer__title">{entry.title}</h3>` (`:186`) and `nativeTitle` under it. | **decorative** |
| 3 | `MediaCenterView.tsx:348` (`MediaTile`, Home shelves) | Tile is a `<button>` whose content includes `<strong>{item.title}</strong>` (`:355`); the button's name is computed from that content. | **decorative** |
| 4 | `MediaCenterView.tsx:423` (`HomePanel` hero) | The title is **inside the artwork element itself** — `<strong>{title}</strong>` at `:432`, a child passed to `MediaArtwork`, plus the eyebrow above it. | **decorative** |
| 5 | `MediaCenterView.tsx:768` (`VideoPanel` up-next shelf) | **Same component as #3** — the shelf maps `MediaTile compact`. Not a separate `MediaArtwork` call. | **decorative** (via #3) |
| 6 | `StudyOrchestratorWorkspace.tsx:1643` (`study-next` hero) | `<section class="study-next" aria-labelledby="study-next-title">` with `<h2 id="study-next-title">` at `:1654`. The art is the section's backdrop; the two sibling branches of the same ternary are already `aria-hidden` icons. | **decorative** |
| 7 | `MediaEpisodeRow.tsx:54` — **not a `MediaArtwork` consumer** | Hand-rolled `<img alt="">` fed by `useMediaArtwork(item.id, 'still')`. Sits inside `<button class="medialib-ep">` carrying the episode number (`:52`), the episode title (`:62`), air date and runtime. | **decorative**, and it is |

**Every surface prints the title in text or supplies it as `aria-label`. There is no surface where
the image is the only content.** That is the finding, and it is why this slice adds no `alt={title}`
anywhere and no new i18n keys.

Correction to the brief: it lists `MediaEpisodeRow` as a `MediaArtwork` consumer and treats
`MediaCenterView:768` as a third `MediaArtwork` call site. Neither is true — row 7 imports only the
hook and writes its own `<img>`, and `:768` is a `MediaTile` render. The real consumer list is five
call sites in four files, including `StudyOrchestratorWorkspace.tsx`, which the brief does not
mention and which is **outside the ownership list I was given** (see §4).

## 3. The API, and why the silent default was rejected

```ts
export type MediaArtworkAlt =
  | { decorative: true; alt?: never }   // the card names the item; the art is a picture of it
  | { alt: string; decorative?: never }; // the art IS the label

export type MediaArtworkProps = MediaArtworkBaseProps & MediaArtworkAlt;
```

Required, and mutually exclusive. Omitting both is a type error; passing both is a type error;
`decorative={false}` is a type error, because there is no third state to fall into.

Why this rather than `alt: string` required, with `''` for decorative:
- `alt=""` at a call site is indistinguishable from a caller who did not think about it — the exact
  failure this slice was opened to remove, just relocated from the component to seven call sites.
- `decorative` is a claim about the *surrounding card*, which is where the evidence lives (§2). A
  reviewer can check it against the JSX two lines below. `alt=""` says nothing checkable.

Why not a default of either kind: a default is a decision made by whoever wrote the component for
every surface that will ever exist, and §2 is a table of seven surfaces with seven different reasons
for the same answer. The next surface — a bare hero with the title burned into the artwork, say — is
the one a default gets wrong, silently, and the gate that would catch it currently reports the
artifact in §1 instead.

**Known soft edge, stated rather than papered over:** `alt` is `string`, so `alt=""` still
typechecks and is a way back to the old silence. Closing it needs a branded/template-literal type
that makes the prop harder to read than the thing it guards, and the call site still has to *write*
`alt=""` deliberately — which is a reviewable act, unlike inheriting it from a default. Not closed.

**Second half of the change, which the prop alone would not deliver:** the artless fallback
(`div.medialib-card__fallback`) is `aria-hidden="true"`. A caller that passes a real `alt` would
therefore be labelled only while the image loads, and silent for exactly the items with no art. It
now takes `role="img" aria-label={alt}` in the non-decorative case and stays `aria-hidden` in the
decorative one, so the two states announce the same thing. Same for the loaded-image path via `alt`.

## 4. Scope note — one edit outside the stated ownership

Making `alt`/`decorative` required breaks compilation of every call site, and one of them,
`src/renderer/components/media/StudyOrchestratorWorkspace.tsx:1643`, is **not** in the list of paths
this slice owns (`components/media/library/**`, `views/MediaCenterView.tsx`). The alternative — an
optional prop with a default — is the thing the slice exists to remove.

**Applied: one token, `decorative`, added to that one JSX element. Nothing else in that file is
touched.** Flagged here rather than done quietly. `git status` shows the file as untracked (`??`),
i.e. it belongs to this same unlanded track, not to another session's committed work.

## 5. The test

`src/renderer/__tests__/mediaArtworkAlt.test.ts` — **`.ts`, not `.tsx`, deliberately.**
`vitest.config.ts` collects `src/renderer/__tests__/**/*.test.ts`; the two `.tsx` files in that
directory are matched by nothing and need `docs/migration/tools/vitest.tsx.config.mjs` to run at all
(slice 40). A `.tsx` test here would not have appeared in the coordinator's `npx vitest run` count —
it would have been a claim, not a test. So it renders through `createElement` under
`// @vitest-environment jsdom` and is collected by the root config with no config change.

It asserts, against a real jsdom render:

1. a decorative `MediaArtwork` renders `<img alt="">` — present-and-empty, not missing;
2. a labelled `MediaArtwork` renders `<img alt="Fixture Title 1">`;
3. **the artless fallback follows the same decision** — `aria-hidden` when decorative,
   `role="img"` + `aria-label` when labelled (the §3 gap; this is the assertion that fails if only
   the `<img>` branch is fixed);
4. **`MediaPosterCard` renders a nameless image inside a card named by the title** — the shipped,
   correct pattern from §2 row 1, and the regression guard against "fixing" this defect by setting
   `alt={title}` on the poster grid;
5. no `MediaArtwork` render produces an `<img>` with the alt attribute *absent*.

### Before / after

**BOTH UNRUN — blocked, not skipped. See §6.** Predicted, from reading the pre-change source
(`MediaArtwork.tsx:88`, `alt=""` hardcoded):

| # | Assertion | Before | After |
|---|-----------|--------|-------|
| 1 | decorative → `alt=""` | PASS (right answer, wrong reason — everything was `alt=""`) | PASS |
| 2 | labelled → `alt="Fixture Title 1"` | **FAIL** — `alt` is `''`; and a **type error** besides, since the prop did not exist and an object literal's excess property is rejected (reasoned, not run) | PASS |
| 3a | decorative fallback `aria-hidden` | PASS | PASS |
| 3b | labelled fallback `role="img"` + name | **FAIL** — fallback was unconditionally `aria-hidden="true"` | PASS |
| 4 | poster card: image nameless, card named | PASS | PASS |
| 5 | alt attribute always present | PASS | PASS |

Two of six fail before, six of six predicted after. Assertion 4 passing *before* the change is the
point of §1: the poster grid was already correct.

## 6. Gates — NOT RUN, and why

**Every test gate was refused by the permission layer in this session,** the same way slices 63 and
65 were:

```
npx vitest run <file>                             -> "This command requires approval"
npm test                                          -> "This command requires approval"
node ./node_modules/vitest/vitest.mjs run <file>  -> "This command requires approval"
node tools/i18n-check.cjs                         -> "This command requires approval"
node docs/migration/tools/audit-carried-items.mjs -> "This command requires approval"
```

`.claude/settings.local.json` allows exactly four Bash patterns, one of which is `npx tsc *`.

**So: I have not measured 368/4664, I have not measured 6604 keys, and I have not measured audit
exit 0. Those are the coordinator's numbers and I am not quoting them as mine.** My test adds
1 file / 6 tests if it is collected and passes; both of those are predictions.

**What I could measure: `npx tsc --noEmit -p tsconfig.json`**, which is permitted. The repo has a
large pre-existing error baseline under that config (it is not the build config, and `npm run
package` does not run it), so the usable signal is a controlled difference — two runs of the same
command over the same tree, before and after. `tsconfig.json` is `"include": ["src"]`, so the new
test file is inside the checked set.

```
$ npx tsc --noEmit -p tsconfig.json   # BEFORE, captured before any edit
$ npx tsc --noEmit -p tsconfig.json   # AFTER
$ diff before after
205c205
< src/renderer/components/media/StudyOrchestratorWorkspace.tsx(3527,21): error TS2322: ...
---
> src/renderer/components/media/StudyOrchestratorWorkspace.tsx(3531,21): error TS2322: ...
```

**The two outputs are identical apart from a four-line offset on one pre-existing error**, caused by
the comment added above the call site in §4. That is the whole difference. Specifically:

- **0 new type errors** anywhere in the tree, so the now-required prop is satisfied at **every**
  `MediaArtwork` call site — including any I did not find by grep, which is the real value of making
  it required rather than defaulted.
- **0 errors in `src/renderer/__tests__/mediaArtworkAlt.test.ts`**, so the union discriminates the
  way §3 claims: `{ decorative: true }` and `{ alt: string }` both compile, in five renders.
- **0 errors in `components/media/library/**` and `views/MediaCenterView.tsx`**, before and after.

This does **not** substitute for running the test — a file that typechecks is a file that compiles,
not a file whose assertions hold. The before/after table in §5 remains a prediction.

## 7. Prediction for C1 after the rebuild

`MediaArtwork`'s rendered output is **byte-identical** for all five call sites, because all five are
`decorative` and decorative still emits `alt=""`. Therefore:

- `artwork.missingAltAttribute` — **0**, unchanged.
- `artwork.decorativeEmptyAlt` — **13**, unchanged.
- `artwork.decorativeInsideTextlessCard` — **13**, unchanged, and **it should be**: the metric is
  measuring `img.closest()` hitting the image's own class name (§1), which no renderer change can
  move. If this number drops after the rebuild, something other than this slice changed it and the
  §1 reading is wrong — worth knowing either way.
- `artwork.describedAlt` — **3**, unchanged (the three scraper placeholders).
- `artwork.totalImages` — **16**, `imagesActuallyLoaded` — unchanged.
- The keyboard-walk names for `div.medialib-card` — **unchanged**, "Fixture Title 1..12".

**C1 will therefore still read as a MEASURED finding and still name 13 images. That is the honest
outcome and I am predicting it deliberately rather than predicting a green number.** The gate cannot
observe this slice; what changed is that the *next* call site cannot inherit the wrong answer, and
the accessible-name behaviour of the artless fallback, which no packaged run has ever reached
(every fixture item has a poster, so `showImage` is true for all twelve).

**The number that WOULD move C1 to 1** — the honest floor — is the reading-garden mask alone, and
only after §1's selector is fixed. `img.reading-garden-foreground-mask` is correctly `alt=""` and
must stay that way, so the correct post-fix reading of that metric is **0 real failures out of 13
candidates**.

## 8. Adjacent defects found and NOT fixed

Untranslated chrome in `MediaCenterView.tsx`, raw English in a file that is otherwise fully on
`useT()` — four `title` attributes and one button label:

- `:346` `` title={`Open ${item.title}`} `` — the media tile's accessible *description*
- `:1027` `` title={`Inspect ${entry.candidate.title}`} ``
- `:1284` `` title={`Repeat: ${ps.repeat}`} `` — also leaks a raw enum value to the user
- `:1521` `` title={`${item.hint} (Ctrl+${index + 1})`} ``
- `:379` `<Icon name="plus" /> Add media` in `EmptyShelf`

Left alone: five keys × four catalogs is a separate slice, `node tools/i18n-check.cjs` is refused
here so I could not verify the result, and fixing one of five arbitrarily is worse than reporting
all five. Recorded for the coordinator.

## 9. Files changed

| File | Change |
|------|--------|
| `src/renderer/components/media/library/MediaArtwork.tsx` | `MediaArtworkProps` split into base + required `MediaArtworkAlt` union; `alt={alt}` on the image; the artless fallback now mirrors the same decision (`aria-hidden` vs `role="img"`+`aria-label`). |
| `src/renderer/components/media/library/MediaPosterCard.tsx` | `decorative` + the evidence for it. |
| `src/renderer/components/media/library/MediaDetailPanel.tsx` | `decorative` + evidence. |
| `src/renderer/components/media/library/MediaEpisodeRow.tsx` | **Comment only, no behaviour change.** Records that its hand-rolled `<img alt="">` is the seventh site and is correctly decorative, and that it is not a `MediaArtwork` consumer — which the brief said it was. |
| `src/renderer/views/MediaCenterView.tsx` | `decorative` on both call sites (`MediaTile`, `HomePanel` hero) + evidence. |
| `src/renderer/components/media/StudyOrchestratorWorkspace.tsx` | `decorative`, one token. **Outside the stated ownership — see §4.** |
| `src/renderer/__tests__/mediaArtworkAlt.test.ts` | New, 6 cases. `.ts` on purpose (§5). |
| `docs/migration/SLICE_68_ARTWORK_ALT.md` | This file. |

Not touched, per the brief: `out/`, `docs/migration/tools/**`, `NEXT_SESSION.md`, `progress.json`,
any CSS, any i18n catalog (no new keys were needed — §2). Nothing was committed, staged, stashed,
reverted or checked out.
