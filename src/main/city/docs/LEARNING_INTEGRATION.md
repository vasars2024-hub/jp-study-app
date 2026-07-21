---
doc_id: noctis.learning_integration
tier: 7
authority: domain_specification
role: learning_integration_domain_blueprint
status: reconciled
depends_on:
  - VISION.md
  - ART_DIRECTION.md
  - NOCTIS_ECOLOGICAL_ENGINE.md
  - DOCUMENT_ARCHITECTURE.md
  - GAME_DESIGN.md
  - ARCHITECTURE.md
  - SIMULATION_SYSTEMS.md
  - ECOLOGY_SYSTEM.md
  - CITIZEN_SYSTEM.md
  - TECHNOLOGY_SYSTEM.md
  - CULTURE_SYSTEM.md
  - MEMORY_SYSTEM.md
  - ECONOMY_SYSTEM.md
---

# Noctis Civilization Module — Learning Integration

## Document Status And Authority

This document is the learning-integration domain blueprint of the Noctis civilization simulation: the Tier 7 specification of the **single membrane** between the user's real study activity and every simulated domain. Every sibling document — Ecology, Citizen, Technology, Culture, Memory, Economy — has already stated the same boundary from its own side: *we receive an already-interpreted learning input, never raw telemetry, and study is never a currency* (`SIMULATION_SYSTEMS.md` Sections 3, 22). This document is where that promise is finally kept: it defines what the raw Study OS actually produces, how it is interpreted, and the exact shape of the signal that crosses into the simulation.

It sits beneath the full canon, the technical architecture, the simulation physics, and the six peer domains already written, and may never contradict any of them:

```
VISION.md                      Tier 1 — Absolute Conceptual Anchor
ART_DIRECTION.md               Tier 2 — Aesthetic & Spatial Interface
NOCTIS_ECOLOGICAL_ENGINE.md    Tier 3 — Mechanical & Biological Execution
DOCUMENT_ARCHITECTURE.md       Meta  — Structural Guardrail Framework
GAME_DESIGN.md                 Tier 4 — Experience Design
ARCHITECTURE.md                Tier 5 — Technical Architecture
SIMULATION_SYSTEMS.md          Tier 6 — Simulation Physics
ECOLOGY_SYSTEM.md              Tier 7 — Ecological Domain Blueprint
CITIZEN_SYSTEM.md              Tier 7 — Citizen Domain Blueprint
TECHNOLOGY_SYSTEM.md           Tier 7 — Technology Domain Blueprint
CULTURE_SYSTEM.md              Tier 7 — Culture Domain Blueprint
MEMORY_SYSTEM.md               Tier 7 — Memory Domain Blueprint
ECONOMY_SYSTEM.md              Tier 7 — Economy Domain Blueprint
LEARNING_INTEGRATION.md        Tier 7 — Learning Integration Domain Blueprint (this file)
```

In the per-evaluation dependency topology of `SIMULATION_SYSTEMS.md` Section 13, Learning Integration is the **sole root**: every domain's energy, possibility, and readiness traces back through it to the user's real activity, and it traces back to nothing (`SIMULATION_SYSTEMS.md` Section 13, "the graph must have exactly one root"). This document specializes the Learning Integration Contract of `SIMULATION_SYSTEMS.md` Section 22 and the Input Contract of Section 3; it may specialize the physics, and it may never override it.

### Grounded, Not Aspirational

This document is authored against **the Study OS that actually exists today**, not an imagined general-purpose study platform. The current application is a Japanese-reading immersion tool. Its real, inspectable telemetry is: reading time and characters read, per day and per book (`src/renderer/stats.ts`); a day-streak; vocabulary knowledge levels (Learning / Familiar / Known); flashcard review activity; saved dictionary words; and a lightweight companion/achievement event bus. There is, at this writing, **no multi-subject tracking** — no separate math, history, or art telemetry. Section 6 defines an **extensible** cognitive-pathway classification exactly as the canon requires, but honestly notes that, today, nearly all real signal resolves to the language/humanities pathway. Nothing in this document invents telemetry the app does not produce.

### The Identity Guardrail

Learning Integration is not a settings panel, not a subject picker, not a telemetry dashboard, and not a currency mint. The user never tags a session with a subject from a menu, never assigns "points" to a domain, and never sees their reading minutes converted into a number they can spend. Raw telemetry crosses this membrane exactly once, is interpreted here into an abstract profile, and every downstream domain receives only that profile — never the app's internal fields, never a subject string to switch on (`SIMULATION_SYSTEMS.md` Sections 3, 7). The user studies Japanese; the civilization receives *conceptual depth, retained understanding, consistency, and curiosity* — not "Japanese: +1."

### What This Document Binds — And What It Refuses To Bind

**Binds:** the raw-telemetry inventory as it actually exists in the codebase; the interpretation pipeline and its stages; the interpreted learning profile's dimensions and their derivation from real telemetry; the cognitive-pathway classification and its extensibility contract; the input contract's exact shape as received by `SIMULATION_SYSTEMS.md` Section 3; the privacy and non-inference boundaries; the protected-milestone detection that feeds `MEMORY_SYSTEM.md`; the coefficient families of the domain, each named symbolically with its binding constraint and canon citation.

**Refuses to bind:** every numeric coefficient and threshold *value* (bound at implementation, each carrying a canon citation); the exact field identifiers, IPC payload shape, or code (`ARCHITECTURE.md` Section 4 owns the wire format; the still-stubbed `city:recordSession` channel is where this document's output actually crosses into the engine); how any receiving domain *uses* the profile (each Tier 7 sibling owns that); ecological, technological, cultural, memory, economic, and era outcomes; and all rendering and UI (`ART_DIRECTION.md`, Tier 8). This document owns the **membrane**; it does not own what happens on either side of it.

No numeric anchors appear in this document beyond the three the canon itself locks: the three-consecutive-day consistency trigger, the five-day absence horizon, and the ten-minute reawakening session (`NOCTIS_ECOLOGICAL_ENGINE.md` section 7).

### Notation

Notation follows the siblings. Learning Integration produces the interpreted learning input `I` of `SIMULATION_SYSTEMS.md` Section 3 (focus duration `d`, interpreted profile, difficulty `f`, consistency `k`, completion `b`) and the accumulators `K_total`, `k`, `m` of Section 2. It introduces its own raw-telemetry vocabulary, grounded in the real code: `seconds` and `chars` (per day, per book — `stats.ts`), `streak` (consecutive days), `knowledgeLevel ∈ {1,2,3}` (Learning/Familiar/Known, `knownWords.ts`), and event names `READING_RECORDED_EVENT`, `flashcard-deck-changed`, `word-knowledge-changed`. Interpreted-profile dimensions are bounded, `[0,1]`-normalized signals: `conceptualDepth`, `retention`, `disciplinaryExposure`, `interdisciplinaryConnection`, `sustainedAttention`, `mastery`, `curiosity`, `revisionStrength`, `difficulty`, `novelty`. Seeded deterministic selection is written `select(seed, S, context)` — a pure function of committed state, never randomness (`SIMULATION_SYSTEMS.md` Section 11).

---

## SECTION 1 — LEARNING INTEGRATION PHILOSOPHY

### The One True Root

Every domain in Noctis ultimately answers to one fact: the user studied, or did not. `SIMULATION_SYSTEMS.md` Section 13 states it as topology — "the graph must have exactly one root" — and this document is where that root is planted. Nothing else in the simulation may read the user's actual behavior directly; everything reads it through the interpretation this document performs. That single narrow gate is what makes the rest of the canon's promises possible: that citizens can act without becoming a resource farm, that technology can precipitate without becoming a purchase, that culture can emerge without becoming a menu — because the *only* thing any of them are ultimately fed is a bounded, honest, already-digested signal about a real study session.

### Translation, Not Transcription

`GAME_DESIGN.md` Section 1 states the design law this document exists to implement: *a translator does not repeat your sentence back to you; it renders your meaning in another language.* Ten minutes of reading never becomes ten of anything. This document is the translator. It takes the literal, boring facts a reading app can measure — seconds elapsed, characters read, a word's memory strength — and renders them into the abstract vocabulary every civilizational domain can use: depth, retention, consistency, curiosity, novelty. The translation is lossy on purpose: a subject string is thrown away; a raw character count is folded into a bounded signal; nothing downstream can reconstruct exactly what book was read or what word was reviewed. That loss is privacy by architecture (Section 9), not an oversight.

### Honest About What Exists

A recurring failure mode this document exists to prevent is designing the interpretation layer against an imagined telemetry richness the app does not have. The real Study OS today tracks reading time, characters, streak, vocabulary levels, and flashcards — overwhelmingly a **single-subject, language-immersion** signal set. This document's interpreted-profile dimensions and cognitive-pathway classification (Section 6) are built to be genuinely useful with *only* that telemetry, and to extend cleanly, without rewrite, if the app later adds other subjects. Nothing here is aspirational; every claim is checked against `src/renderer/stats.ts` and its siblings.

---

## SECTION 2 — DOMAIN OWNERSHIP

Specializing `SIMULATION_SYSTEMS.md` Section 14.

**Learning Integration owns:** the inventory and validation of raw study telemetry; the interpretation pipeline that turns telemetry into the interpreted learning profile; the profile's dimensions and their derivation; the cognitive-pathway classification and its extensibility; the shape of the interpreted learning input `I` (Section 3, `SIMULATION_SYSTEMS.md` Section 3); the detection of protected-milestone candidates for `MEMORY_SYSTEM.md`; the privacy and non-inference boundary over raw telemetry; and the seeded-variation-safe determinism of the interpretation itself.

**Learning Integration does not own:** anything the interpreted profile is *used for* — ecological growth (`ECOLOGY_SYSTEM.md`), citizen behavior (`CITIZEN_SYSTEM.md`), invention (`TECHNOLOGY_SYSTEM.md`), cultural formation (`CULTURE_SYSTEM.md`), historical significance (`MEMORY_SYSTEM.md`), or economic possibility (`ECONOMY_SYSTEM.md`); era gating (`ERA_PROGRESSION.md`); the reader, dictionary, flashcard, or statistics UI themselves (existing `src/renderer` application code, unowned by Noctis); and any rendering or presentation (`ART_DIRECTION.md`, Tier 8). Every downstream domain reads the profile this document produces and interprets it entirely on its own terms; this document interprets *only* raw activity into that profile, nothing more.

---

## SECTION 3 — RAW TELEMETRY INVENTORY

This is the actual, current, inspectable input surface. Nothing here is invented; every entry is grounded in existing application code, and the document says so at each point.

### Reading Activity (`src/renderer/stats.ts`)

The primary and richest existing signal. Per calendar day (local time) and per book: `seconds` (time actively reading) and `chars` (approximate characters read), accumulated by `recordReading()` and flushed periodically by the reader. Derived from this stock: `streak` (consecutive days with any reading, allowed to "end" at yesterday so a session in progress doesn't break it), `daysActive`, a 14-day recent history, and per-book totals with `lastRead` timestamps. The live signal fires as `READING_RECORDED_EVENT` with a `ReadingDelta { bookId, title, seconds, chars }` on every flush — this is the event every listener (including the existing, intentionally under-coupled `noctisLightBridge.ts`) already subscribes to.

### Vocabulary Knowledge (`knownWords.ts`, referenced by `study.tsx`)

Per-word knowledge level on a three-stage scale: `1` (Learning), `2` (Familiar), `3` (Known). `knowledgeCounts()` aggregates these into totals; a `word-knowledge-changed` event fires on update. This is the closest existing signal to *mastery* and *retention* (Section 6).

### Saved Words (`savedWords.ts`)

Citizen-curated dictionary entries (word, reading, meaning), surfaced today as "Word of the Day." A weak signal of *curiosity* and *sustained personal interest* — the user chose to keep this word, unprompted by a review schedule.

### Flashcard Activity (`flashcard-deck-changed` event)

Deck-change events indicating spaced-repetition review activity. Today a coarse boolean-ish signal (an event fired, not a rich payload); a signal of *revision strength* and *deliberate practice* distinct from passive reading.

### Companion / Achievement Events (`achievements.ts`, `env:companion`)

A lightweight event bus already carrying `kind: 'streak' | 'achievement'` notices with an optional `note`. This is the existing, if thin, precedent for a **milestone** signal (Section 8) — the achievement system already recognizes when something is worth remarking on; this document generalizes that recognition into the protected-milestone contract Memory reads.

### The Existing Bridge, And Its Honest Limits

The repository contains an earlier renderer collector, state mirror, `city:recordSession` IPC path, and a separate coarse `noctisLightBridge.ts`. They were implemented before the completed Tier 6/7 reconciliation and are therefore **provisional, not authoritative**. The final integration must retain one path only: raw local activity is accumulated in the renderer, interpreted into `I`, and only the irreversible interpreted payload crosses `city:recordSession`. The coarse pulse bridge may provide presentation-only ambience, but it may never become a second simulation writer or bypass the interpretation membrane. Implementation status does not change this contract.

### What Does Not Exist Today

No per-subject classification beyond "reading Japanese." No explicit difficulty/failure-rate signal. No explicit "long project" or "course" completion marker beyond the achievement bus's generic `note`. No interdisciplinary telemetry (there is only one discipline tracked). Section 6's extensible taxonomy and Section 8's milestone detection are written to degrade gracefully to this reality and to extend without rewrite when the app's tracked activities grow.

---

## SECTION 4 — THE INTERPRETATION PIPELINE

Raw telemetry becomes the interpreted learning input `I` through an ordered, deterministic pipeline — never a black box, and never a place variation enters uncontrolled (`SIMULATION_SYSTEMS.md` Section 11).

```
1. Collection        Raw events accumulate in their existing stores
                      (stats.ts day/book entries, knownWords levels,
                      savedWords, flashcard events, achievement notes).
                      Unowned application code; this document reads it,
                      never redefines it.

2. Validation         Values are checked for the state invariants every
                      domain already requires (SIMULATION_SYSTEMS.md
                      Section 1): finite, non-negative seconds/chars,
                      well-formed day keys, no future timestamps.
                      Malformed input is a developer error, not a
                      simulation event.

3. Windowing          A session or a checkpoint's telemetry is scoped to
                      the relevant interval — today's delta for an active
                      evaluation, or the elapsed window for a checkpoint
                      (SIMULATION_SYSTEMS.md Section 4).

4. Normalization       Raw counts (seconds, chars, streak length,
                      knowledge-level counts) are mapped into the bounded
                      [0,1] dimensions of the interpreted profile
                      (Section 6). This is where "47 minutes and 3,200
                      characters" becomes "sustainedAttention: 0.6,
                      conceptualDepth: 0.4."

5. Pathway resolution  The activity is classified against the extensible
                      cognitive-pathway taxonomy (Section 7). Today this
                      resolves almost entirely to the language/humanities
                      pathway; the classification step is where a future
                      subject would be routed differently, without
                      touching any other stage.

6. Milestone detection A separate, coarser pass checks the same window
                      against the protected-milestone conditions of
                      Section 8, independent of the profile (a milestone
                      can fire without a large profile shift, and vice
                      versa).

7. Assembly            The interpreted learning input I is assembled:
                      focus duration d, the interpreted profile,
                      difficulty f (where available), consistency k,
                      completion b (from milestone detection).

8. Handoff             I crosses the membrane into SIMULATION_SYSTEMS.md
                      Section 3 as the sole external input to F(S, I, Δt).
                      Nothing about the raw telemetry — book titles,
                      exact word lists, session timestamps beyond the day
                      key — crosses with it.
```

Every stage is a pure function of its inputs; the same telemetry always produces the same `I` (`SIMULATION_SYSTEMS.md` Law 1, Law 2). Where a stage must choose among several valid readings (Section 10), it does so through seeded deterministic selection, never chance.

---

## SECTION 5 — CONCEPTUAL STATE MODEL

Learning Integration's own state is thin by design: it is a **pipeline**, not an accumulator. It holds no legacy of its own — `K_total`, `k`, `m`, and every domain's heritage layer belong to `SIMULATION_SYSTEMS.md` and the receiving Tier 7 domains. What this document defines conceptually is the **shape** of what crosses the membrane, not a store.

```
InterpretedLearningInput  I  (the sole payload SIMULATION_SYSTEMS.md Section 3 accepts)
{
  focusDuration        d — real focused minutes, derived from stats.ts seconds
                       for the window (Section 4, stage 3)

  interpretedProfile   the bounded [0,1] dimensions of Section 6 — the
                       payload every Tier 7 domain actually reads

  difficulty           f — a difficulty/failure signal, where available
                       (today: thin, derived indirectly — Section 6)

  consistency          k — the consecutive-day count, read directly from
                       stats.ts streak (already computed there)

  completion           b — a breakthrough/milestone marker, from the
                       Section 8 detection pass, independent of the profile
}
```

Two laws bind this shape permanently. First, **it is the only door.** No domain may reach behind Learning Integration to read `stats.ts`, `knownWords.ts`, or any raw store directly; the `city:recordSession` channel (once built) carries only this shape (`ARCHITECTURE.md` Section 4). Second, **the shape is stable, but the profile is extensible.** New interpreted dimensions may be added as the app's telemetry grows (Section 7), but the four top-level fields — duration, profile, difficulty, consistency, completion — are the permanent contract every domain already expects (`SIMULATION_SYSTEMS.md` Section 3), and no domain-specific field is ever added at this level.

---

## SECTION 6 — THE INTERPRETED LEARNING PROFILE

The profile is the actual payload every domain reads (`SIMULATION_SYSTEMS.md` Section 3, "interpreted learning profile"; Section 22, "already-interpreted signals"). Each dimension is bounded `[0,1]`, derived from real telemetry, and named exactly as the sibling documents already expect it.

| Dimension | Derived from (real telemetry) | Meaning |
|---|---|---|
| `conceptualDepth` | Characters read per session, weighted by session length (`chars`/`seconds` density, `stats.ts`) | How substantively, not just how long, the session engaged material |
| `retention` | Vocabulary knowledge-level distribution (`knownWords.ts`): proportion at Familiar/Known vs. Learning | How much of what was studied has actually stuck |
| `disciplinaryExposure` | Currently near-constant (one tracked discipline); extensible when the app tracks more (Section 7) | Breadth of subject area engaged |
| `interdisciplinaryConnection` | Currently near-zero (no cross-subject telemetry exists); an honest gap, not a fabricated signal (Section 7) | Whether study spans and connects multiple domains |
| `sustainedAttention` | Session `seconds`, normalized against a rolling personal baseline | Depth of a single sitting's focus |
| `mastery` | Proportion of vocabulary at Known (`knowledgeLevel = 3`) | Accumulated command of the material |
| `curiosity` | Saved-word rate (`savedWords.ts`) relative to reading volume — words kept beyond what review requires | Self-directed interest beyond the assigned task |
| `revisionStrength` | Flashcard review frequency (`flashcard-deck-changed`) relative to first-exposure reading | Deliberate practice versus passive exposure |
| `difficulty` | Indirectly inferred: falling `chars`/`seconds` density or knowledge-level regression in a session | A struggle signal, thin today, honestly marked as low-confidence (Section 9) |
| `novelty` | New-book or new-vocabulary-item rate relative to review of known material | Freshness of material versus consolidation |

**No academic subject unlocks a fixed downstream outcome** (`SIMULATION_SYSTEMS.md` Section 7): these dimensions are what every receiving domain reads, and the same dimension can and should produce different consequences in ecology, technology, culture, and memory, because each domain's own contract (already written) decides how to use it. This document's only job is to make sure the ten dimensions above are *honestly derived* from what the app actually measures, never invented to satisfy a receiving domain's wish list.

---

## SECTION 7 — COGNITIVE PATHWAY CLASSIFICATION (EXTENSIBLE)

`NOCTIS_ECOLOGICAL_ENGINE.md` Section 5 and `SIMULATION_SYSTEMS.md` Section 7 fix four canonical ecological pathway tendencies — mathematics/logic, history/languages, creative arts, science/engineering — each mapped to a nutrient register. This document owns the **classification step** that decides which tendency a given activity leans toward (Section 4, stage 5), and binds it as an **extensible, not exhaustive**, contract.

### Today's Honest Resolution

The Study OS currently tracks one discipline: Japanese-language reading and vocabulary acquisition. Under the canon's own mapping, this resolves overwhelmingly to the **history/languages → chemosynthetic glucans → mycelial** tendency (`NOCTIS_ECOLOGICAL_ENGINE.md` Section 5; `ECOLOGY_SYSTEM.md` Section 3), with a minor secondary lean toward the **creative arts** register where reading is manifestly aesthetic (poetry, literary prose) rather than purely functional. There is, today, no real telemetry supporting a mathematics/logic or a science/engineering classification, and this document does not fabricate one. A Noctis civilization run against the current app will, honestly and correctly, grow mycelial-network-dominant.

### The Extension Point

The classification is a lookup from an **activity descriptor** (today: essentially just "reading" and "vocabulary review," both language-typed) to a **pathway weight vector** `w(c) = (w_brine, w_glucans, w_catalysts)` (`SIMULATION_SYSTEMS.md` Section 5). Adding a new tracked activity — a math-drill mode, a science-reading mode — means adding one new descriptor-to-vector entry here; it touches no other stage of the pipeline (Section 4) and no receiving domain's contract, because every domain already reads the resolved profile and pathway weight, never the raw activity type. This is exactly the "already-interpreted signal, never raw telemetry" boundary the six completed siblings already assume (`TECHNOLOGY_SYSTEM.md` Section 16; `CULTURE_SYSTEM.md` Section 27).

**No subject is a guaranteed unlock.** The pathway weight conditions the *ecological tendency*; what a civilization actually builds from it is a path-dependent, seeded, cross-domain outcome (`TECHNOLOGY_SYSTEM.md` Sections 7, 19), never a direct grant.

---

## SECTION 8 — PROTECTED MILESTONE DETECTION

`MEMORY_SYSTEM.md` Section 27 already specifies the contract it expects from this document: "a major learning milestone occurred," "a long-term project was completed," "a study period produced a protected user-linked legacy anchor" — always as a validated signal, never raw telemetry. This document owns the detection.

### What Qualifies, Grounded In Real Signals

A milestone candidate is detected from combinations that are real and inspectable today: a `streak` crossing a meaningful threshold for the first time; a book completed (its `chars` total closing near a known length, or the reader signaling completion); a large jump in `knowledgeCounts()` at the Known level; the existing achievement bus firing a `kind: 'achievement'` note; or a sustained high-`conceptualDepth` period the app's own statistics view would already surface as notable. The detection pass deliberately does **not** invent milestones the app cannot evidence — no "long project completed" marker exists today beyond the achievement bus's generic note, and this document says so rather than fabricating a richer signal.

### The Handoff

A detected milestone becomes the completion marker `b` in the interpreted input `I` (Section 5) and, separately, a **milestone candidate** offered to `MEMORY_SYSTEM.md` (its Section 8, significance; its Section 27, the Learning Integration interface) — Memory decides whether and how it becomes a permanent heritage anchor; this document only detects and offers. **Not every study session is a milestone** (`MEMORY_SYSTEM.md` Section 27's own caution); most sessions produce only the ordinary interpreted profile of Section 6, with `b` absent.

---

## SECTION 9 — PRIVACY AND THE NON-INFERENCE BOUNDARY

The membrane is also a privacy boundary, and this document treats that as load-bearing, not incidental. **No book title, no specific word, no exact session timestamp, and no raw character count ever crosses into the simulation.** What crosses is bounded, normalized, and irreversible: from `conceptualDepth: 0.6` no downstream domain, and no user-facing surface fed by one, can reconstruct what was read.

The document also binds an honesty discipline about **confidence**, matching `MEMORY_SYSTEM.md` Section 11's graded-confidence model: dimensions derived from rich, direct telemetry (`sustainedAttention` from `seconds`, `mastery` from knowledge levels) carry higher confidence than dimensions inferred indirectly (`difficulty`, today inferred rather than measured; `interdisciplinaryConnection`, today near-zero for lack of a second discipline). This document never presents a low-confidence inference as equivalent to a directly measured signal; where a domain's contract cares about confidence, this document's output can and should carry it forward, rather than smoothing every dimension into false certainty.

---

## SECTION 10 — DETERMINISM AND SEEDED VARIATION

Given identical raw telemetry for a window, the interpretation pipeline (Section 4) produces an identical interpreted input `I`, every time, on every machine (`SIMULATION_SYSTEMS.md` Law 1, Law 2). Where the pipeline must resolve genuine ambiguity — a session spanning a midnight boundary, a burst of vocabulary review touching several knowledge-level transitions at once — it resolves deterministically from the ordering already present in the raw stores (`stats.ts` day keys, timestamp order), never by chance.

Where a *receiving* domain needs seeded variation (which citizen notices an opportunity, which institution first responds — `SIMULATION_SYSTEMS.md` Section 11), that variation is **not** this document's concern: Learning Integration supplies only the deterministic interpreted input; the seed and the selection happen downstream, in the domain that owns the actor being varied. This document introduces no randomness and resolves no domain's variation on its behalf.

---

## SECTION 11 — TEMPORAL EVALUATION

Learning Integration inherits its relationship to time entirely from `SIMULATION_SYSTEMS.md` Sections 3–4: event-driven, lazy, no ticking. It runs the interpretation pipeline exactly when a meaningful event exists to interpret — a reader flush (`READING_RECORDED_EVENT`), a knowledge-level change, a flashcard session, an achievement note — and produces nothing between such events. There is no polling of `stats.ts`, no background re-interpretation, and no continuous recomputation of the profile; the existing 30-second UI refresh interval in `study.tsx` is a **presentation** concern (re-reading the already-computed summary for display) and is not, and must never become, a simulation tick (`ARCHITECTURE.md` Section 5).

---

## SECTION 12 — INPUTS AND OUTPUTS

**Learning Integration receives**: the raw telemetry inventory of Section 3, exactly as it exists in the current codebase, and nothing else — no direct access to any Tier 7 domain's state, no read of committed simulation state (interpretation is a pure function of raw telemetry, not of what the civilization has already become).

**Learning Integration produces**: the interpreted learning input `I` (Section 5) as the sole payload crossing into `SIMULATION_SYSTEMS.md` Section 3; and, separately, milestone candidates offered to `MEMORY_SYSTEM.md` (Section 8). It produces no other output, and in particular emits no subject label, no raw count, and no "modifier" of any kind to any domain.

---

## SECTION 13 — INVARIANTS

Hard rules; a proposed learning-integration mechanic that violates any is invalid at birth and redesigned from the constraint up.

1. **This is the sole root.** No domain reads raw study telemetry directly; every domain reads only the interpreted input `I` (`SIMULATION_SYSTEMS.md` Section 13).
2. **Study is never a currency.** No mechanic converts study minutes, characters, or words into a spendable stock in any domain (`SIMULATION_SYSTEMS.md` Law 7; `GAME_DESIGN.md` Section 11, Principle 2).
3. **No subject is a guaranteed unlock.** The interpreted profile conditions possibility; it never grants a fixed outcome (`SIMULATION_SYSTEMS.md` Section 7).
4. **Telemetry is honestly bounded.** Every profile dimension traces to real, inspectable application telemetry, or is explicitly marked low-confidence/absent; nothing is fabricated to satisfy a receiving domain (Sections 3, 6, 9).
5. **Interpretation is deterministic.** The same telemetry produces the same `I`, always (Section 10; `SIMULATION_SYSTEMS.md` Law 1).
6. **The membrane preserves privacy.** No raw identifying detail (book title, exact word, timestamp) ever crosses (Section 9).
7. **Not every session is a milestone.** Milestone detection is a separate, conservative pass grounded in real signals (Section 8).
8. **The pipeline is lazy and event-driven.** No polling, no background reinterpretation, no ticking (Section 11).
9. **The taxonomy is extensible without rewrite.** Adding a tracked activity adds a classification entry (Section 7); it touches no other stage and no receiving domain's contract.
10. **This document decides nothing downstream.** It owns interpretation only; every consequence of the interpreted profile is owned by the receiving domain (Section 2).

---

## SECTION 14 — DEFERRED QUESTIONS

Bound by implementation under the contract this file provides: the versioned wire encoding of `I` on `city:recordSession` (`ARCHITECTURE.md` Section 4); reliable accumulation and retry semantics so shutdown or a renderer crash cannot silently lose a partial window; the exact normalization coefficients for each profile dimension, each carrying a canon citation; the classification entries for future tracked activity beyond Japanese reading (Section 7); a genuine difficulty/failure telemetry source, should the app add one (Section 6); and any UI surfacing of the interpreted profile itself (`ART_DIRECTION.md`, Tier 8 — the Statistics view may continue to surface raw user-facing telemetry while Noctis consumes only the interpreted projection). Each is a clean implementation contract, resolved with no arbitrary assumption here.

---

## SECTION 15 — VALIDATION CHECKLIST

- [x] Grounded in real, inspectable telemetry — Section 3, verified against `src/renderer/stats.ts` and siblings.
- [x] No fabricated signal presented as measured — Sections 6, 9.
- [x] The sole root of the dependency topology — Sections 1, 13.
- [x] Study is never a currency; no subject a guaranteed unlock — Section 13.
- [x] Interpreted profile matches the shape every sibling already expects — Sections 5, 6; cited against `TECHNOLOGY_SYSTEM.md` Section 16, `CULTURE_SYSTEM.md` Section 27, `MEMORY_SYSTEM.md` Section 27.
- [x] Cognitive-pathway taxonomy extensible without rewrite — Section 7.
- [x] Milestone detection conservative and grounded — Section 8.
- [x] Privacy-preserving; no raw detail crosses the membrane — Section 9.
- [x] Deterministic; seeded variation left to receiving domains — Sections 10, 13.
- [x] Event-driven, no ticking — Section 11.
- [x] Owns interpretation only, decides nothing downstream — Section 2.

---

## Closing Validation Statement

Every future learning-integration concept for the Noctis Civilization Module must pass, in order: the Tier 1 test of `VISION.md`, the Tier 2 test of `ART_DIRECTION.md`, the Tier 3 test of `NOCTIS_ECOLOGICAL_ENGINE.md`, the experience tests of `GAME_DESIGN.md`, the structural laws of `ARCHITECTURE.md`, the physics of `SIMULATION_SYSTEMS.md`, and the domain laws of `ECOLOGY_SYSTEM.md`, `CITIZEN_SYSTEM.md`, `TECHNOLOGY_SYSTEM.md`, `CULTURE_SYSTEM.md`, `MEMORY_SYSTEM.md`, `ECONOMY_SYSTEM.md`, and this document. Anything that fails is rejected and redesigned from the constraint up.

This is the one true root. A person read a page of Japanese, saved a word, kept a streak alive — and this document is the honest, narrow, privacy-preserving translation of that real life into the only thing a civilization beneath the glass is ever allowed to know about it: that somewhere, someone studied.

The user studies.

The membrane listens, carefully and only once.

And everything else in Noctis is what the civilization makes of that.
