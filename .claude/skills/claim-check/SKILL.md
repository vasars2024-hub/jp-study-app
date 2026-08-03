---
name: claim-check
description: >
  Re-derive what a report claims before repeating it. Use when reading an agent
  report, a handoff, a gate log, a plan or progress doc, or any findings written
  by someone else — reviewing a subagent's results, summarising a run you did
  not perform, reconciling a plan against the tree, checking whether a sweep or
  edit actually landed, or before quoting a count, a "zero/never/all" claim or a
  named identifier from a document. This is the reading moment, distinct from
  driving the app.
---

# Reading a report you did not produce

This fires at a **different moment** from `honesty-probe` and `css-measure`. Those are for driving
and measuring. **This is for the moment you are handed prose and asked to believe it** — a
subagent's findings, a handoff, a gate log, a plan doc, your own notes from four hours ago.

If reading turns into re-reporting, emit the row schema defined in **`honesty-probe` §5**. This
skill does not define its own.

The eight rules below each come from a recorded failure in this repo, most of them from a report
that was *substantively right*.

---

## 1. Re-derive every count, every sweeping quantifier, every named identifier

Before you repeat it: **every number, every "zero" / "never" / "all" / "only" / "none", and every
file, function, token or flag name.**

**Agents' substance here has been reliable; their phrasing overshoots.** The recorded pattern is a
correct finding wrapped in a **sweeping quantifier that took one command to check**. The check is
cheap and it is not optional:

```powershell
rg -c "<AppChrome" src                 # a claimed consumer count
rg -n "<the-identifier-as-written>" src  # does it exist under that exact name?
git ls-files | rg -i "known_issues"      # a claimed file
```

Two live examples, both from documents handed to this run:

- **A count that was a line number.** A dispatch stated `AppChrome` "has 42 consumers". Measured:
  **19 files, 23 render sites** (`rg -c "<AppChrome" src`).
  `src/renderer/components/ui/index.ts` **line 42** is `export * from './AppChrome';`. Nobody lied;
  a number travelled one hop and arrived as a different kind of number.
- **A quantifier that outgrew its scope.** The same document said the WCAG 2.5.8 spacing exception
  cleared "**all 11** undersized controls". The source says all 11 undersized controls **in the
  Scraper** (`UI_UX_AUDIT.md:420-422`); the suite baseline records **~64**, and one family of ~40
  was a genuine failure that the exception did not absolve (`:441-455`, `:493-495`). The finding was
  right. The sentence had shed a qualifier.

**When you cannot re-derive it, say "unverified" rather than dropping the qualifier.** Passing a
claim along without its provenance is how a guess becomes a fact in three hops.

**When you cannot re-derive it, say "unverified" rather than dropping the qualifier.** Passing a
claim along without its provenance is how a guess becomes a fact in three hops.

## 2. A number invariant across the input it claims to depend on is measuring something else

Vary the input and confirm the number moves. A metric stable across conditions that should move it
is the single most common way a run reports a false pass.

- A contrast count came back **byte-identical on two unrelated palettes** and was written up as
  evidence the defect was structural. It was evidence the number contained no colour: `48` was
  `6 controls × 8 surfaces`. The true figure was **0**, not 66
  (`SLICE_77_B2P_CORRECTION.md:18-28`, `:112-116`).
- A counter named `rendererRequestsDuringStep` read **0 in both arms** of an offline differential —
  including the control arm that demonstrably loaded a remote AniList image. That counter is not
  observing renderer network traffic, and the offline conclusion correctly rests on other evidence
  (`SLICE_76_PRACTICAL_SWEEP.md:355-361`).

**Challenge it before reporting it, not after someone questions it.**

## 3. A refusal has no positive observable

Nothing happening looks identical to: the feature being absent, the harness misfiring, the click
landing on the wrong window, and the control being disabled.

**Conclusions about things that did *not* happen come from the difference between two runs on
identical input** — one where the thing should occur and one where it should not — **never from
reading an absence alone.**

The shape done properly, twice in this repo:

- **MAL config:** the packaged app launched twice, differing in exactly one variable — whether
  `JP_STUDY_MAL_CLIENT_ID` was in the child's environment. Control: `configured: false`,
  `beginAuth()` refused. Armed: `configured: true`, `ok: true`. **Step 6 asserts the arms differ**
  (`SLICE_76_PRACTICAL_SWEEP.md:193-210`).
- **CSP:** the header being present is the absence-read-as-pass. The gate injects an inline script
  and asserts it is **refused** — `violatedDirective: script-src-elem`, `inline script ran: false`
  (`:363-373`).

If a report concludes "X did not happen" and describes only one run, that conclusion is not
supported, however careful the rest of it is.

## 4. Ask whether the instrument did the thing it claims

**A single session's sweep produced six false results this way — five from one gate and one from a
safety check — and every one was caught by asking what the instrument did, not what it said.** Read
the report's *method*, not only its result.

The purest example is the safety check: a credential scan reported **clean**. `rg --files-from=…`
is not a ripgrep flag; with `2>/dev/null` the error vanished and the empty output read exactly like
"no credentials found". **A positive control — grep for `export`, which must match hundreds of
files — returned 0**, which is what exposed it (`SLICE_76_PRACTICAL_SWEEP.md:50-54`). The other
five were one surface classifier's first run, "and every one of them was mine, not the app's"
(`:401`).

**Demand a positive control for any instrument reporting an absence.** If the tool cannot be shown
to find a thing you know is there, its "nothing found" is not information.

Two more from the same track, both of which manufactured findings rather than hiding them:

- A theme-application guard required `data-materials`, which only material-set themes stamp — so it
  **hard-failed on correctly applied themes** and would have reported twelve phantom
  theme-application failures (`:141-158`).
- A surface classifier put five perfectly good surfaces into EMPTY-SILENT, including one that
  missed a 220-character threshold by **15 characters** (`:394-416`).

**And check the flags mean what the report assumes.** `--selfcheck` is honoured by
`packaged-a11y-deep-gate.mjs` and `phase7-queue-refusal-live-gate.mjs`, and **ignored** by
`packaged-csp-gate.mjs` and `packaged-offline-gate.mjs`, which run the full gate regardless
(`:525-529`). A "cheap self-check" that was actually a full measurement is a different claim.

## 5. Ask whether the fixture can show the thing being tested

**If the fixture cannot fail, the pass carries no information** — and that is itself a finding worth
reporting.

**Sessions of manga proofs ran on a 1×1 GIF.** That fixture is real and still in the tree —
`fixture-manga-cdn.mjs` "serves the rendered pages when they exist and the **1×1 GIF** otherwise"
(`NEXT_SESSION.md:8139`) — and the track counts it as the first of at least three fixture-shaped
false defects, alongside a 0.4 s silent audio file (`:4866`, `:6970`).

The live analogue: `--fixture` on its own **measures exactly what no fixture measures** — the same
4 images. Only `SEANIME_SIDECAR=0 … --fixture` seeds the local grid and produces the 16-image
artwork coverage, because with the sidecar on, `player` and `video` route to it instead of to the
local grid. **Anyone running `--fixture` alone and reporting "artwork coverage" is reporting the
un-fixtured number** (`SLICE_76_PRACTICAL_SWEEP.md:306-317`, `:537-540`).

Ask of every green result: *what would this have looked like if the feature were broken?* If the
answer is "the same", the result is not a pass.

Related: a minimised window measures 0×0 and scores as perfect; an empty library shows no scan
defects; a test file outside the glob passes forever. **Two `.test.tsx` files in this repo have
never executed** — every `vitest.config.ts` `include` glob ends in `*.test.ts`, so
`externalPlayerPanel.test.tsx` and `mediaTrackingSourcesHistory.test.tsx` pass by never running
(`HANDOFF_S0_SKILLS.md` §4.1).

## 6. Check the tree, not the log

**A run that dies at its usage limit usually dies *after* doing the work.** The log holds one line
while dozens of files sit changed on disk. This is also why `jp-dispatch` §7 tells you to write the
handoff *as you go*: an incrementally written handoff survives that death and one planned for the
end does not.

Before concluding a run produced nothing:

```powershell
git status --porcelain
git diff --stat
```

The inverse holds too — **do not read the log tail as the verdict.** A packaging run in this repo
succeeded on retry and was caught only because the harness **diffed the exe timestamp against
`src`** rather than reading the log (`NEXT_SESSION.md:24-27`). And a tool that names its own output
directory must not also trust what it finds there: one gate read a stale record from an
identically-named directory and reported `n/a` about a run that had actually happened
(`NEXT_SESSION.md:44-47`).

## 7. An edit reporting success is not evidence the bytes changed

**A prior session reported six successful edits when five were in the file** (`jp-dispatch` §8).

Edit tools report per-call success, which is not the same as the file containing what you think. A
near-duplicate match, a silently skipped occurrence, or a later edit reverting an earlier one all
pass at the call site.

**After any repeated or multi-file edit, read the values back out and assert on all N — not a spot
check of one.**

```powershell
rg -c "theNewValue" src        # count the hits, compare to N
```

If the count is not N, you do not have a partial success; you have an unknown state, because you do
not yet know *which* N−1 landed.

## 8. State measured totals, never a delta you did not cause

Test counts and i18n counts drift for reasons unrelated to any one change — other agents commit in
adjacent trees during a run, and this repo has two other live worktrees on a shared object store.

**Say:** `npx vitest run` → *N* passed, *M* failed — the totals **you measured this run**.

**Never say:** "my change fixed 4 tests" unless you ran the suite immediately before and after your
own edit, on an otherwise untouched tree, and can name the four.

A delta you did not personally cause and bracket is not a measurement. **If you cannot bracket it,
report the total and say the baseline is unknown.** The same applies to any number you inherit from
a document: it was true when written, and this repo's own records show i18n key counts drifting
between slices for exactly this reason.

---

## When the report survives all eight

Then repeat it — **with its provenance attached**. `file:line` or the command, every time. A
finding that has been re-derived and still carries no re-runnable command is one hop from becoming
folklore, and the whole point of checking it was to stop that.
