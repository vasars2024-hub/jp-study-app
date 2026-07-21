# M00 — Mobile Product Charter

**Status:** Approved 2026-07-20 — M00 complete
**Phase:** M00 of `MOBILE_EXPANSION_MASTER_PLAN.md` — Program A, Product and Governance
**Exit condition (from the master plan):** *"The first release can be described unambiguously, measured, and distinguished from the desktop product."*

**Process note:** The master plan's AI-lane table assigns Lane P drafting to "Codex `gpt-5.6`, Ultra reasoning." This charter was instead drafted in a Claude Code planning session. The lane's substantive requirement — a human must approve product decisions before they're adopted — still applies and is unmet until you sign off below. Re-validate model/lane availability per the master plan's own instruction before M01 begins.

---

## 1. Proposition

**Study OS Mobile is the phone-first companion to the desktop Study OS.** It lets a self-directed Japanese learner keep their review queue moving, keep reading, and capture new vocabulary from the real world — from a couch, a commute, or a bookstore — with everything syncing back to the same account the desktop app uses.

It is **not** a second desktop. The desktop Study OS remains the command center: library management, full Noctis presentation, full settings, CSV/toolbox power tools, and deep sentence-mining workflows stay there. Mobile's job is a tight, high-frequency slice of that experience, done well on a touch screen, not a shrunken port of everything.

One-line version (store-listing length): *"Review your Japanese SRS queue, keep reading, and mine new words from a photo — synced with your Study OS desktop."*

## 2. Intended audience

v1 ships publicly to the Android Play Store, so it needs to work for two overlapping groups:

- **Primary (dogfood-first):** Existing desktop Study OS users who want their review queue, reading position, and captured vocabulary available on their phone, synced to the same account. This is the audience the app is built against first, and the one whose daily use validates v1 before public release.
- **Secondary (Android-only public users):** People who discover the app fresh on the Play Store with no desktop Study OS installed. They must be able to create an account, understand what the app does, and get value from it without ever touching the desktop app.

Both groups share the same defining trait: **self-directed immersion learners** — people already doing extensive reading, sentence mining, and SRS review (Anki or AnkiDroid-familiar), not learners looking for a structured beginner course. This is a deliberate exclusion of the "guided lessons / gamified beginner path" segment that dominates the general "learn Japanese" app market — Study OS Mobile is a tool for learners who already have a self-directed method, not a course product.

## 3. Success metrics

Two tiers, matching the confirmed decision that v1 must prove itself personally before it's judged publicly.

### Tier 1 — Personal-utility bar (near-term, gates "Android v1 works")

Checkable during your own daily use, before public release is even considered:

- You maintain your SRS review streak using the phone alone (no desktop) for a defined trial window (proposed: 14 consecutive days).
- At least one complete on-device loop — camera capture → OCR → mine → review — happens with no desktop involvement.
- Zero sync data-loss or unresolved-conflict incidents observed during the trial (reading position, review history, or captured vocabulary silently lost or duplicated).
- You would genuinely reach for the phone app instead of your current ad hoc phone-side workaround (if any) for at least one of: review, reading, or capture.

### Tier 2 — Public-adoption bar (release-blocking, gates "Android v1 is publicly viable")

Concrete numeric targets, proposed at solo-developer scale rather than startup KPIs — **flagged as proposed, needs your explicit sign-off**:

- Crash-free session rate ≥ 99% (Play Console vitals) sustained over the closed-beta period.
- Day-1 retention ≥ 30%, Day-7 retention ≥ 15% among users who complete onboarding — modest, appropriate for a niche tool, not a mass-market target.
- Install → first-completed-review conversion ≥ 40% (i.e. most people who install actually do one review session).
- Play Store rating ≥ 4.0 with at least 20 ratings before treating public release as validated, not just shipped.

These numbers are placeholders for you to accept, adjust, or replace — they are the one part of this charter that most needs your judgment call, since they set the bar for M43–M47 (Integrated Alpha through Public Release).

## 4. Desktop / mobile responsibility split

Coarse, capability-area split (fine-grained per-feature classification is M01's job, not M00's):

| Capability area | Desktop | Mobile v1 |
|---|---|---|
| Library management (import, organize, CSV/toolbox) | Command center | Not in v1 |
| Reading | Full reader, all formats | Companion reader: continue reading, positions, annotations sync |
| Dictionary / lookup | Full, offline-first | Popup lookup, script-aware |
| Sentence mining | Full workflow | Capture only (camera OCR + manual); deep editing stays desktop |
| SRS review (Study OS + AnkiDroid modes) | Full | Full review sessions, offline-capable |
| Camera OCR | N/A | Core v1 feature |
| Noctis companion | Full simulation + presentation | Simplified, non-authoritative view only |
| Calendar, widgets, Game Arena, Music/Media, Immersion browser, Clipboard History | Full | Not in v1 (desktop-only) |
| Settings | Full | Minimal (account, sync, notifications only) |
| Sync / account / device pairing | Command-center source of truth | Required — this is what makes mobile useful at all |

## 5. Explicit non-goals (v1)

Restated from the master plan's own locked defaults — no additions per the confirmed decision:

- No unrestricted remote control of the desktop.
- No CSV/toolbox parity.
- No desktop window management from mobile.
- No full Noctis presentation on mobile (companion view only).
- No complete settings parity with desktop.

## 6. Exit-condition mapping

The master plan requires v1 to be *"described unambiguously, measured, and distinguished from the desktop product"* before M00 can be considered done:

- **Unambiguous description →** Section 1 (Proposition) + Section 2 (Audience): one sentence a stranger can understand, plus who it's for and who it deliberately isn't for.
- **Measured →** Section 3 (Success metrics): a personal-use bar and a public-adoption bar, both concrete and checkable — not aspirational language.
- **Distinguished from desktop →** Section 4 (Responsibility split) + Section 5 (Non-goals): a capability-by-capability line and an explicit exclusion list, not an implicit "eventually everything."

If you approve this charter as-is (or with edits to the Tier 2 numbers), M00 is complete and the master plan's own process says the next future planning session covers **M01 — Capability and Release Matrix** only.

---

## Approval

- [x] Approved as-is
- [ ] Approved with changes (list below)
- [ ] Not approved — needs rework

Notes: Approved as-is on 2026-07-20. Tier 2 public-adoption numbers (§3) accepted as
written — crash-free ≥99%, D1 ≥30% / D7 ≥15%, install→first-review ≥40%, rating ≥4.0
with 20+ ratings. These are now the release bar carried into M43–M47.
