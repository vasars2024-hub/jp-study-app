# Register classification pass

Labels grammar points by **register** — the speech level a pattern belongs to:
`neutral`, `casual`, `business` (shown in the UI as "Formal"), `literary`.

## Why this is a separate tier from the morphology rules

`normalize.ts` derives register from the pattern's own shape wherever that is
decisive — 敬語 morphology, contracted casual endings, classical auxiliaries,
plus a whitelist that positively asserts *neutral* for core connectives. Those
labels are marked `derived` and the UI trusts them.

The rules cannot reach the rest, so this pass asks a language model. Its output
is written with `registerSource: 'classified'`, which is **deliberately not
trusted** by `trusted()` in normalize.ts. The labels are visible and
attributable, and the "verified tags only" toggle hides them by default.

That split is the whole point. The register system exists because an earlier
tagger ran regexes over the English gloss and froze the results into the data
files, making a guess indistinguishable from an authored fact — the Business
filter returning informal patterns was that bug surfacing. A model reading the
pattern is better evidence than a regex reading the gloss, but it is still a
guess, and it stays labelled as one.

## Running it

```sh
# 1. Collect the points no morphology rule could decide.
node tools/grammar-register/extract.cjs

# 2. Generate prompt files (~14 batches of 150).
node tools/grammar-register/make-prompts.cjs

# 3. Paste each prompts/batch-NN.txt into a chat model.
#    Save each reply verbatim as replies/batch-NN.txt.

# 4. Validate. Reports bad ids, bad values, duplicates. Writes nothing.
node tools/grammar-register/ingest.cjs

# 5. Commit the validated labels to assignments.jsonl.
node tools/grammar-register/ingest.cjs --apply

# 6. Preview the edit to the .ts data files, then make it.
node tools/grammar-register/apply.cjs --dry
node tools/grammar-register/apply.cjs

# 7. Confirm nothing broke and see what moved.
npx vitest run
node tools/grammar-audit.cjs
```

Steps 1–2 and 4–6 are safe to re-run; each is idempotent and `extract` skips
anything already classified.

## The one thing to watch

**Most patterns are genuinely neutral.** Japanese politeness rides on the
sentence-final predicate, not on the grammar pattern — 〜ながら is identical in
食べながら見た and 食べながら見ました. The prompt says so explicitly, and `ingest.cjs`
warns if a reply comes back more than 35% non-neutral, because a model that
ignores that instruction produces a corpus where every record carries a
confident register and none of them mean anything.

If that warning fires, re-run those batches rather than applying them. Spot-read
about twenty assignments after the first batch before doing the remaining
thirteen — it is much cheaper than discovering the problem at step 7.
