# DISPATCH S0b — Author three repo skills: `honesty-probe`, `css-measure`, `claim-check`

You are a cold agent working in the `jp-study-app` repository. You have no prior context;
everything you need is in this document plus the two files it points you at. Read all of it
before acting.

Your job is **to author three Claude Code skills**. You are not auditing the app, not fixing
defects, and not touching application code. **You must not start, restart or kill any app.**

---

## 0. Read these two first — they are the output of the run before yours

1. **`.claude/skills/jp-dispatch/SKILL.md`** — the working rules for dispatched runs in this
   repo. **Follow it.** It supersedes anything you would otherwise assume about git, gates or
   handoffs, and this document deliberately does not repeat it.
2. **`docs/audit/HANDOFF_S0_SKILLS.md`** — a verified fact table (`CONFIRMED` / `CORRECTED` /
   `UNVERIFIABLE`, each with `file:line`).

**You inherit that fact table. Do not re-derive it.** Five claims in the previous dispatch
were wrong and are already corrected there; re-deriving risks reintroducing them. The one
exception is §3 below: any fact you *encode into a skill* must be traceable to a
`CONFIRMED`/`CORRECTED` row, and if you encode something that table does not cover, you verify
that one yourself and record it in your own handoff.

Also read **`.claude/skills/jp-bridge/SKILL.md`**. `honesty-probe` will reference it rather
than restate it — the split is: *jp-bridge is how you drive; honesty-probe is what you conclude.*

---

## 1. What you own

Create and edit **only** under:

- `.claude/skills/honesty-probe/**`
- `.claude/skills/css-measure/**`
- `.claude/skills/claim-check/**`
- `docs/audit/HANDOFF_S0B_SKILLS.md`

Everything else is read-only. Branch `audit/s0b-skills` **from `audit/s0-skills`** (not from
`grammarx/phase-1-5`) so the two existing skills are present for you to reference.

Record any defect you notice in code you do not own; do not fix it.

---

## 2. The single most important design constraint

These skills exist so that **six concurrent agents emit identically shaped output**. Without
that, assembling the master audit costs a whole session spent normalizing six invented
formats. Optimise every one of them for *machine-concatenable, uniformly shaped* results —
not for prose quality.

Concretely: define the row schema **once**, in `honesty-probe`, and have the other two refer
to it rather than defining their own.

---

## 3. `honesty-probe` — the probes, the verdicts, the row schema

**Purpose:** any agent auditing a surface produces findings in one shape, with one vocabulary,
and knows which of six probes it is running.

Frontmatter `description` must trigger on the phrasings later dispatches use — "audit this
surface", "is this feature real", "does this control do anything", "check whether the page is
honest", "report coverage". Description quality decides whether the skill fires at all.

### Content

**The governing rule.** A document saying "done" is a hypothesis. The verdict comes from
driving the app and observing a side effect. `ready` in a registry, a green test, and a tick
in a plan can all be true while the feature is dead.

**Coverage is a ratio, not an impression.** Every table reports `visited / enumerated`. An
audit that does not state its denominator is claiming completeness it did not measure.

**The six probes:**

- **A — Dead controls.** A handler whose only effect is `setState` plus a success message.
  Static: diff claimed IPC against the real surface in `src/preload.ts`. Live: click, then
  assert an observable side effect — an IPC call, a changed persisted file, state that
  survives reload. *An "update" that vanishes on reload never happened.*
- **B — Fabricated data.** On an empty scratch profile, rendered content is fabricated
  **unless it traces to a shipped data file that is legitimately bundled study content.**
  Content traced to a module-level constant *inside a view file* is fabricated regardless.
- **C — Dead handoffs.** `openX(id)` where the id shape does not match the target's id space.
  Live: click every cross-app navigation and assert the target actually selected something.
- **D — Silent failures.** Surfaces that render nothing and say nothing; errors that surface a
  raw transport string with no way forward. Any `NOT-REACHABLE` recorded as `PASS`.
- **E — Settings.** A setting must be *persisted* **and** *consumed*. Three separable
  failures: writes nothing · writes but **no code reads the key** (orphan — statically
  detectable: grep the key, count read sites, zero = orphan) · read only at startup while the
  UI implies live effect. Test: flip → assert the persisted file changed → restart on a copied
  profile → assert behaviour differs.
- **F — Availability and integration.** A feature can be real and still not reach the user.
  Measurable proxies only: entry-point count (**zero = exists only in code**); discovery depth
  in clicks from root; launcher/palette registration; presence of empty/loading/error states
  (**a feature with no empty state was wired, not designed**); control-type histogram (a panel
  that is overwhelmingly checkboxes with no primary action is the "settings page pretending to
  be a feature" pattern); lazy-CSS proxies — elements with no design-system class, inline
  `style=`, hardcoded hex/px instead of tokens, **class families used exactly once**, and
  **native unstyled `<input>`/`<select>`/`<button>` with no app class**; structural
  conformance measured against `AppChrome`, which has 42 consumers, so non-adoption is a
  measurement and not a matter of taste.

**Two resolution ladders, and they differ.** For probes A–E the default verdict is
**document-don't-fix**: disable the control, label it honestly, add a row to the known-issues
file. For probe F that does **not** work — labelling an unfinished feature does not make it
usable — so F rows resolve as **relocate/promote · polish · hide**, and *hide* is the default
consideration before publication.

**Craft is not machine-decidable.** F's proxies are evidence; ranking polish is a human
judgement and goes to the user, never scored by an agent.

**Verdict vocabulary:** `LIVE` · `MIXED` · `FIXTURE` · `DEAD` · `BROKEN` · `NOT-REACHABLE`.
Define each precisely, and state that `NOT-REACHABLE` is never to be reported as `PASS`.

**The row schema** — one table shape every agent emits:
`id · area · surface · probe · claim · what was measured · verdict · evidence path · severity · owner`

### Also define the promise-register classification

Used when reconciling plan docs against the tree:
`SHIPPED-VERIFIED` · `SHIPPED-PARTIAL` · `SHIPPED-DEAD` (code exists, driving says no) ·
`NOT-SHIPPED` · `SILENTLY-DROPPED` (planned, never built, never marked abandoned — the doc
still reads as a commitment) · `RENAMED/SUPERSEDED`.

**Rank promises by exposure:** claims in shipping UI copy first, then public docs, then
internal plans. A lie the user reads in the app outranks a stale tick in a planning file.

Note the highest-value row shape: **a feature with zero entry points that a plan marks done**
is simultaneously an F row and a commitment failure, and the expensive part is already built.

---

## 4. `css-measure` — the corrections that decide whether numbers are true

**Purpose:** any agent measuring contrast, layout or box treatment gets true numbers.

Each item below has a measured track record of producing false findings in this repo. Verify
each against the cited source before encoding it; correct anything that does not hold.

1. **`color-mix()` computes to `color(srgb 0.87 0.49 0.50)` — 0..1 channels.** An 8-bit parser
   reads those as near-black, turning a pass into a fail. A real case measured 1.38 when the
   true ratio was **5.33**. Also strip the colourspace token before matching numbers —
   `display-p3` contains a digit.
2. **WCAG 2.5.8's spacing exception.** A raw "under 24px fails" rule reported **98** failures
   across the suite; checked properly, all 11 undersized controls passed, with
   nearest-neighbour centres 31–342px. Compact desktop chrome is compliant; inflating it is
   damage, not repair.
3. **A minimised window measures as perfect** — every box is 0×0. Refuse to score; do not
   record zeros.
4. **A detached node's `getComputedStyle` returns an empty declaration, not `auto`.**
5. **`@media (max-width: …)` never fires inside a floating window** — the viewport is the whole
   screen, not the window. Use `@container` with `container-type: inline-size`. To test a
   narrow layout, set the `.fwin` element's inline width from JS and restore it. **Never resize
   the real OS window.**
6. **A borderless-by-design control is not a contrast failure.** `.os-tray-btn` declares
   `background: transparent; border: 1px solid transparent`; a sampler with no "paints no
   boundary" class scores the *absence* of a border as a failed one at a flat 1.00:1.
7. **A thin state indicator can fall between your sample rings.** An `::after` bar at
   `bottom: 3px; height: 2px` is missed by rings sampled at 1px and ~6px.
8. **The governing check:** *a contrast defect moves with the palette.* A number that does not
   move when the palette changes is not measuring contrast. This single test invalidated a
   headline finding of 66 failures that was really 0.

**Bound the work.** Families × 13 themes × 2 sizes is unbounded. Render-measure two extremes
— the dark default `study-os` and the worst light theme `soft-sepia` — then verify the rest
**algebraically**: a family whose cues are all `var(--token)` and which passes both extremes
can only fail in between if a theme overrides one of the tokens it reads. Render only those.

---

## 5. `claim-check` — reading a report you did not produce

**Purpose:** fires when *reading agent reports or plan docs*, a distinct moment from driving
the app.

1. **Re-derive every count, every "zero/never/all" claim, and every named identifier** before
   repeating it. Agents' substance here has been reliable; their phrasing overshoots, and both
   recorded wrong claims were sweeping quantifiers that took one command to check.
2. **A number invariant across the input it claims to depend on is measuring something else.**
3. **A refusal has no positive observable.** Conclusions about things that did *not* happen
   come from the difference between two runs on identical input, never an absence read alone.
4. **Ask whether the instrument did the thing it claims.** Six false findings were caught this
   way in one session.
5. **Ask whether the fixture can show the thing being tested.** Two sessions of manga proofs
   ran on a 1×1 GIF.
6. **Check the tree, not the log.** A run that dies at its usage limit usually dies *after*
   doing the work: the log holds one line while 25 files sit changed on disk.
7. **An edit reporting success is not evidence the bytes changed.** Six edits reported
   success; five were in the file. After a repeated or multi-file edit, read the values back
   out and assert on all N.
8. **State measured totals, never a delta you did not cause** — test and i18n counts drift for
   unrelated reasons.

---

## 6. Verify your own output

- All three `SKILL.md` files parse as valid YAML frontmatter + Markdown.
- **Re-read all three from disk after writing** and confirm every encoded fact traces to a
  `CONFIRMED`/`CORRECTED` row in `HANDOFF_S0_SKILLS.md` or to a row you verified yourself.
  List any that do not.
- The row schema is defined in exactly one place and referenced from the others — not
  redefined.
- `git status --porcelain` shows only your four owned paths.

---

## 7. Handoff

`docs/audit/HANDOFF_S0B_SKILLS.md`, written **as you go**:

1. Any fact you verified yourself (not inherited), with `file:line`.
2. What you created, path by path.
3. Anything you could not verify, stated plainly.
4. Defects noticed in code you did not own — recorded, not fixed.
5. **Whether any item in §4 failed to hold when you checked it** — those are corrections to
   the audit's own instrument and matter more than the skills themselves.

---

## 8. Scope discipline

If you finish early, stop. Do not audit the app, do not extend `jp-bridge` or `jp-dispatch`,
and do not fix anything you found. Three correct skills are the entire deliverable.
