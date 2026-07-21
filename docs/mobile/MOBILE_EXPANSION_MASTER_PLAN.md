# Mobile Expansion Master Plan

**Status:** Not started  
**Primary target:** Public Android companion  
**Later target:** iOS, after Android v1 stabilization  
**Relationship to desktop:** The desktop Study OS remains the command center; mobile is a purpose-built companion.

This is the master meta-roadmap for expanding Study OS onto mobile. Each numbered phase is intentionally scoped as the subject of its own future planning session. A phase must receive a detailed implementation plan, acceptance criteria, and verification strategy before implementation begins.

## Summary

Build a public Android-first Study OS companion while retaining desktop as the command center. Android v1 includes reliable synchronization, separate Study OS and AnkiDroid review modes, reading, dictionary, sentence mining, camera OCR, a simplified Noctis companion, and core desktop-continuity interactions. Advanced remote controls, richer companion identity, additional Android form factors, and iOS follow only after Android v1 is stable.

## AI Lanes

- **P — Product:** Codex `gpt-5.6`, Ultra reasoning; human approval.
- **C — Core engineering:** Claude Code `opus` alias for implementation; Codex `gpt-5.6` High for independent audit.
- **S — Sync/security:** Codex `gpt-5.6` Ultra for specification and adversarial audit; Claude Code `opus` for implementation.
- **A — Android:** Claude Code `opus` for integration, Gemini Pro Agent Mode in Android Studio for native work and device validation, Codex for audit.
- **U — UX:** Claude Code `sonnet` alias for bounded UI work, Codex for behavior and accessibility review, human visual approval.
- **Q — Quality/release:** Codex `gpt-5.6` Ultra for validation, Gemini Pro for Android-device testing, Claude Code for repairs.

Model availability must be revalidated at the start of every phase. Current reference documentation: [Codex model guidance](https://learn.chatgpt.com/docs/agent-configuration/subagents.md), [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code/cli-usage), and [Gemini Agent Mode](https://developer.android.com/studio/gemini/agent-mode).

Effort is relative:

- **S:** One bounded subsystem or change.
- **M:** One complete feature or several tightly related modules.
- **L:** Cross-module work with significant integration and audit requirements.
- **XL:** Cross-client or program-sized work that will require staged implementation inside its detailed phase plan.

Risk levels describe potential impact on user data, desktop stability, security, operational cost, or release viability.

## Program A — Product and Governance

### M00 — Mobile Product Charter

Define the public Android companion proposition, intended audience, success metrics, desktop/mobile responsibilities, and explicit non-goals.

- **Lane:** P
- **Effort / risk:** M / Medium
- **Exit condition:** The first release can be described unambiguously, measured, and distinguished from the desktop product.

### M01 — Capability and Release Matrix

Classify every desktop capability as shared, Android v1, Android post-v1, desktop-only, or iOS-later.

- **Lane:** P
- **Effort / risk:** M / Medium
- **Exit condition:** Every known feature has one release classification and no feature-parity assumption remains implicit.

### M02 — Repository Governance

Authorize a scoped monorepo evolution and define how existing `src/` protections, desktop configuration, migration, and rollback will work.

- **Lane:** C
- **Effort / risk:** L / High
- **Exit condition:** Repository rules explicitly permit the approved mobile/shared infrastructure changes while continuing to protect the working Electron app.

### M03 — Architecture and Reuse Audit

Map Electron, DOM, filesystem, IPC, storage, test, and runtime coupling and establish desktop regression baselines.

- **Lane:** C
- **Effort / risk:** XL / High
- **Exit condition:** Every candidate shared module is classified by portability, dependencies, state ownership, and extraction risk.

### M04 — Mobile Stack Feasibility ADR

Validate and lock Expo/React Native, native-module, local-database, navigation, build, and release choices through focused spikes.

- **Lane:** A
- **Effort / risk:** L / High
- **Exit condition:** The mobile stack is supported by working technical proofs for the riskiest requirements, especially storage, background work, OCR, AnkiDroid, and local networking.

Expo remains the default candidate because it provides a TypeScript React Native workflow across Android and later iOS while supporting native modules and production builds. It may be overturned only through documented evidence in this phase. References: [Expo TypeScript](https://docs.expo.dev/guides/typescript/) and [Expo New Architecture](https://docs.expo.dev/guides/new-architecture/).

### M05 — Privacy, Threat, and Compliance Charter

Define data classes, content ownership, telemetry, retention, account recovery, abuse controls, and store obligations.

- **Lane:** S
- **Effort / risk:** L / High
- **Exit condition:** Every stored or transferred data category has a purpose, retention rule, protection level, deletion path, and consent requirement.

### M06 — Data Authority and Identity Map

Give every persisted entity a canonical owner, stable identity, lifecycle, migration path, and deletion behavior.

- **Lane:** C
- **Effort / risk:** XL / Critical
- **Exit condition:** The foundation gate is approved and no entity has conflicting desktop, mobile, Anki, cloud, or Noctis authorities.

## Program B — Shared Architecture

### M07 — Shared Contract System

Define versioned cross-client types, validation, repository interfaces, adapters, and compatibility rules.

- **Lane:** C
- **Effort / risk:** XL / Critical
- **Exit condition:** Shared logic depends only on explicit portable contracts and every platform dependency sits behind an adapter.

### M08 — Dual Review Architecture

Specify separate first-class Study OS and Anki review providers without blending their schedulers or histories.

- **Lane:** C
- **Effort / risk:** XL / High
- **Exit condition:** Both modes offer complete product journeys while retaining independent scheduling authorities and clearly labelled data ownership.

### M09 — AnkiDroid Interoperability

Define supported intents and APIs, permissions, capability detection, progress reconciliation, and fallback behavior.

- **Lane:** A
- **Effort / risk:** L / High
- **Exit condition:** A tested compatibility contract defines what Study OS can create, open, query, and reconcile for each supported AnkiDroid version.

Only supported AnkiDroid integration surfaces may be used; Study OS must not reproduce Anki's private synchronization protocol. Reference: [AnkiDroid project](https://github.com/ankidroid/anki-android).

### M10 — Reader and Content Architecture

Define book identity, manifests, positions, annotations, mining records, dictionary resources, and explicit file-transfer semantics.

- **Lane:** C
- **Effort / risk:** XL / High
- **Exit condition:** The same logical book and reading state can be identified across clients without assuming matching local filesystem paths.

### M11 — Noctis Portability Architecture

Define portable study inputs and projections while retaining deterministic simulation authority and client-specific rendering.

- **Lane:** C
- **Effort / risk:** L / High
- **Exit condition:** Mobile can consume and contribute valid Noctis state without importing Electron services or desktop rendering components.

### M12 — Contracts and Validation Extraction

Extract dependency-clean shared types, schemas, validation, migrations, and compatibility fixtures.

- **Lane:** C
- **Effort / risk:** L / High
- **Exit condition:** Contract packages compile and test without Electron, React DOM, React Native, browser storage, or filesystem access.

### M13 — Study Core Extraction

Extract portable review, mastery, session, goal, streak, and statistics logic behind storage-independent interfaces.

- **Lane:** C
- **Effort / risk:** XL / Critical
- **Exit condition:** Desktop behavior runs through the portable core and representative state transitions have deterministic tests.

### M14 — Content Core Extraction

Extract portable reader-position, annotation, mining, tokenization, and dictionary contracts without reusing desktop UI.

- **Lane:** C
- **Effort / risk:** XL / Critical
- **Exit condition:** Content-domain behavior can be exercised in a non-Electron test environment with platform I/O supplied through adapters.

### M15 — Noctis Core Packaging

Package the existing pure Noctis engine and sync-safe projection contracts without Electron, filesystem, or renderer dependencies.

- **Lane:** C
- **Effort / risk:** L / High
- **Exit condition:** The packaged engine remains deterministic, immutable, versioned, and compatible with existing desktop saves.

### M16 — Desktop Adapter Cutover

Move desktop behavior onto the shared contracts and prove functional and data parity before sync development proceeds.

- **Lane:** Q
- **Effort / risk:** XL / Critical
- **Exit condition:** The desktop parity gate passes with legacy-data fixtures, automated regression tests, runtime verification, and a documented rollback path.

## Program C — Synchronization Platform

### M17 — Sync Semantics

Define entity ownership, event ordering, conflicts, tombstones, retries, idempotency, clock skew, and schema-version handling.

- **Lane:** S
- **Effort / risk:** XL / Critical
- **Exit condition:** Every synchronizable entity has deterministic convergence rules for edits, duplicates, deletions, retries, and incompatible clients.

### M18 — Backend Selection

Select authentication, database, object-transfer, push, observability, cost, backup, and operational providers.

- **Lane:** S
- **Effort / risk:** L / Critical
- **Exit condition:** One backend architecture is selected through documented cost, privacy, security, scale, migration, and operational comparisons.

Managed cloud is the default candidate, but the sync domain must remain provider-independent.

### M19 — Identity and Device Trust

Specify accounts, device pairing, key management, recovery, revocation, session expiry, and trusted-device UX.

- **Lane:** S
- **Effort / risk:** L / Critical
- **Exit condition:** Lost, stolen, expired, and newly paired devices have defined security behavior that does not expose user content.

### M20 — Local-First Data Layer

Build the canonical mobile/desktop database, migrations, outbox, inbox, checkpoints, and offline transaction model.

- **Lane:** S
- **Effort / risk:** XL / Critical
- **Exit condition:** Both clients remain fully usable offline and can resume safe synchronization after interruption or restart.

### M21 — Cloud Sync Service

Build the authenticated versioned synchronization service with rate limits, validation, backups, and safe retries.

- **Lane:** S
- **Effort / risk:** XL / Critical
- **Exit condition:** The service rejects invalid or unauthorized data, survives duplicate delivery, and supports versioned clients and recoverable operations.

### M22 — Desktop Sync and Migration

Migrate existing localStorage, IndexedDB, Electron files, profiles, study data, and Noctis state without data loss.

- **Lane:** C
- **Effort / risk:** XL / Critical
- **Exit condition:** Existing installations upgrade into the canonical data layer with backups, verification, rollback, and idempotent reruns.

### M23 — Explicit Content Transfer

Build encrypted, resumable, user-initiated book transfer without automatically uploading the user's entire library.

- **Lane:** S
- **Effort / risk:** XL / High
- **Exit condition:** A selected book transfers securely, resumes after interruption, verifies integrity, and never causes unrelated files to upload.

### M24 — Sync Reliability Gate

Pass multi-device torture tests, security review, recovery drills, observability checks, and migration rollback tests.

- **Lane:** Q
- **Effort / risk:** XL / Critical
- **Exit condition:** The sync gate passes before mobile product features begin relying on synchronized production data.

## Program D — Android Foundation

### M25 — Expo Android Foundation

Create the Android app, environment separation, navigation shell, continuous-integration builds, signing strategy, and internal distribution.

- **Lane:** A
- **Effort / risk:** L / High
- **Exit condition:** Reproducible development and internal Android builds install, launch, update, and report their environment correctly.

### M26 — Mobile Design System

Establish touch-first components, typography, motion, Aero/Noctis tokens, dark modes, and accessibility foundations.

- **Lane:** U
- **Effort / risk:** L / Medium
- **Exit condition:** Core mobile screens can be assembled from accessible, tested components without copying desktop window chrome.

### M27 — Mobile Data Integration

Connect mobile repositories, local-first startup, synchronization, migrations, caching, and degraded offline states.

- **Lane:** S
- **Effort / risk:** XL / High
- **Exit condition:** The Android shell can start and expose coherent data while online, offline, migrating, partially synchronized, or recovering from failure.

### M28 — Onboarding and Pairing

Build account entry, device pairing, permissions education, recovery, settings, and desktop connection status.

- **Lane:** U
- **Effort / risk:** L / High
- **Exit condition:** A new user can create or enter an account, pair a desktop, understand requested permissions, recover access, and revoke a device.

### M29 — Android Platform Services

Implement background work, push notifications, deep links, diagnostics, crash reporting, permissions, and feature flags.

- **Lane:** A
- **Effort / risk:** L / High
- **Exit condition:** The platform gate passes under Android background restrictions, denied permissions, cold starts, deep links, and controlled feature rollout.

## Program E — Android v1 Product

### M30 — Home, Goals, and Statistics

Build the daily dashboard, queues, streaks, goals, quick focus sessions, sync status, and recent activity.

- **Lane:** U
- **Effort / risk:** M / Medium
- **Exit condition:** The home screen gives a fast, accurate picture of what to study, current progress, and cross-device state.

### M31 — Study OS Review Mode

Build native deck management, scheduling, offline review sessions, grading, media handling, and review history.

- **Lane:** C
- **Effort / risk:** XL / High
- **Exit condition:** A Study OS deck can be created, synchronized, reviewed offline, reconciled after conflicts, and audited through its history.

### M32 — AnkiDroid Review Mode

Productize mining, deck selection, review launch, capability detection, and supported progress reconciliation with AnkiDroid.

- **Lane:** A
- **Effort / risk:** L / High
- **Exit condition:** Anki users receive a first-class journey while AnkiDroid remains the scheduling authority and failures degrade clearly.

### M33 — Mobile Library

Build local import, explicit desktop transfer, downloads, storage controls, metadata, covers, and missing-file recovery.

- **Lane:** U
- **Effort / risk:** L / High
- **Exit condition:** Users can obtain, manage, open, remove, and recover locally stored reading content without silent cloud-library uploads.

### M34 — Mobile Reader

Build reading, positions, bookmarks, annotations, progress sync, vertical-text decisions, and offline restoration.

- **Lane:** U
- **Effort / risk:** XL / High
- **Exit condition:** Reading state remains usable offline and converges safely across desktop and mobile without losing annotations or position.

### M35 — Dictionary and Audio

Build popup lookup, tokenization, dictionary-resource management, examples, pronunciation, and text-to-speech.

- **Lane:** C
- **Effort / risk:** L / Medium
- **Exit condition:** Reader and standalone lookups are fast, script-aware, resource-aware, and functional in documented offline states.

### M36 — Vocabulary and Sentence Capture

Build structured capture, editing, deduplication, source context, inbox routing, and both review-provider destinations.

- **Lane:** U
- **Effort / risk:** L / Medium
- **Exit condition:** Words and sentences retain their source context and can be routed safely to either Study OS or AnkiDroid workflows.

### M37 — Camera OCR

Build camera/import OCR, region correction, vertical-text handling, permission failures, caching, and mining actions.

- **Lane:** A
- **Effort / risk:** XL / High
- **Exit condition:** Common Japanese print layouts can be captured, corrected, looked up, and mined with clear offline and failure behavior.

### M38 — Noctis Companion v1

Show a simplified synchronized civilization view and convert mobile study activity into deterministic Noctis inputs.

- **Lane:** U
- **Effort / risk:** L / High
- **Exit condition:** Mobile study changes the same civilization lawfully while the phone presents a lightweight, non-authoritative view.

### M39 — Live Study Handoff

Transfer active reader or review context, position, selection, notes, and safe resumable state between devices.

- **Lane:** S
- **Effort / risk:** L / High
- **Exit condition:** Handoff is explicit, resumable, idempotent, and never replaces newer work silently.

### M40 — Reader Second Screen

Let mobile securely control pages, audio, definitions, highlights, saving, and notes during a desktop reading session.

- **Lane:** A
- **Effort / risk:** L / High
- **Exit condition:** Controls are capability-negotiated, authenticated, low-latency, revocable, and safe when either device disconnects.

### M41 — Camera-to-Desktop OCR

Stream or transfer mobile captures into the desktop OCR workspace with resumability, correction, and explicit consent.

- **Lane:** A
- **Effort / risk:** L / High
- **Exit condition:** Captures arrive once, preserve provenance, survive connection loss, and remain under deliberate user control.

### M42 — Vocabulary and Clipboard Relay

Relay structured Japanese words, sentences, URLs, and capture actions without unrestricted background clipboard surveillance.

- **Lane:** S
- **Effort / risk:** L / High
- **Exit condition:** Supported payloads are classified and routed explicitly, sensitive clipboard content is not harvested, and duplicates are safe.

## Program F — Android Release

### M43 — Integrated Alpha

Validate complete user journeys on real desktop/mobile pairs and close all blocking cross-feature defects.

- **Lane:** Q
- **Effort / risk:** XL / Critical
- **Exit condition:** Every Android v1 acceptance journey works end to end on the supported internal device matrix.

### M44 — Reliability and Efficiency

Harden offline behavior, background restrictions, startup, memory, rendering, battery, network use, and large libraries.

- **Lane:** Q
- **Effort / risk:** XL / Critical
- **Exit condition:** Measured performance and reliability budgets pass under realistic low-resource and poor-network conditions.

### M45 — Inclusive Device Quality

Complete accessibility, localization, visual QA, orientation, screen-size, OEM, and Android-version coverage.

- **Lane:** Q
- **Effort / risk:** L / High
- **Exit condition:** Supported devices and languages pass the defined accessibility, layout, navigation, and visual-quality matrix.

### M46 — Security and Store Audit

Complete penetration-style review, privacy verification, account recovery drills, data deletion, signing, and Play compliance.

- **Lane:** S
- **Effort / risk:** XL / Critical
- **Exit condition:** Critical findings are closed, privacy claims match actual behavior, and the release meets current Play requirements.

### M47 — Beta, Public Release, and Operations

Run closed beta, staged rollout, rollback drills, support processes, monitoring, incident response, and Android v1 launch.

- **Lane:** Q
- **Effort / risk:** XL / Critical
- **Exit condition:** Android v1 is publicly available, monitored, supportable, reversible, and governed by a post-release maintenance process.

## Program G — Post-v1 and iOS

### M48 — Secure Remote Command Panel

Add explicitly authorized desktop commands, focus controls, audio controls, layouts, locking, and automation approval.

- **Lane:** A
- **Effort / risk:** XL / Critical
- **Exit condition:** Every command is allow-listed, authenticated, auditable, revocable, and safe against replay or unattended approval.

### M49 — Living Companion Expansion

Add richer Noctis views, daily exchanges, the travelling companion, ambient shared state, Aero, and secret-mode identity.

- **Lane:** U
- **Effort / risk:** XL / High
- **Exit condition:** The expanded identity remains performant, study-first, synchronized, and optional without changing simulation authority.

### M50 — Widgets and Larger Form Factors

Add Android widgets, quick actions, tablet, foldable, and ChromeOS experiences based on validated usage.

- **Lane:** A
- **Effort / risk:** L / High
- **Exit condition:** Each new surface has a specific user need, responsive design, lifecycle behavior, and measurable quality target.

### M51 — iOS Architecture and Anki Strategy

Audit iOS constraints, replace Android adapters, define AnkiMobile interoperability, and lock the iOS release scope.

- **Lane:** C
- **Effort / risk:** L / Critical
- **Exit condition:** The iOS architecture has no unresolved dependency on Android-only APIs and does not assume AnkiDroid behavior exists on iOS.

### M52 — iOS Implementation and Release

Adapt shared Android capabilities, complete Apple-specific QA and compliance, run beta, and release without blocking Android maintenance.

- **Lane:** Q
- **Effort / risk:** XL / Critical
- **Exit condition:** The iOS application is released through a separately validated rollout while Android remains supported.

## Planned Interface Families

Detailed phase plans may choose names and wire shapes, but the architecture must provide these interface families:

- Storage and repository adapters separating shared logic from Electron, React Native, filesystem access, localStorage, IndexedDB, and mobile databases.
- A review-provider contract with independent Study OS and AnkiDroid implementations.
- Versioned sync identities, entities, events, tombstones, checkpoints, migrations, and errors.
- Book fingerprints and encrypted transfer manifests for explicit content movement.
- Portable Noctis study-input and projection contracts, with rendering remaining client-specific.
- Trusted-device session and companion-command protocols with revocation and capability negotiation.

## Mandatory Gates

### Foundation Gate — M06

Product definition, governance, privacy, architecture feasibility, and data authority must be approved before extraction work begins.

### Desktop Parity Gate — M16

Extracted shared cores must cause no desktop behavior or data regression before synchronization work begins.

### Sync Gate — M24

Offline behavior, conflicts, migration, security, recovery, and observability must pass before mobile features rely on synchronized production data.

### Platform Gate — M29

The installable Android foundation must survive offline startup, pairing, denied permissions, deep links, and background restrictions.

### Feature-Complete Gate — M42

Every Android v1 product and continuity journey must work end to end before release hardening begins.

### Android Release Gate — M47

The staged public release must be secure, supportable, monitored, and reversible.

### iOS Gate — M52

iOS may ship only after Android v1 is stable and the iOS-specific architecture and interoperability strategy are approved.

## Core Verification Scenarios

Every detailed phase plan must preserve or address the following scenarios when relevant:

1. Existing desktop profiles, books, cards, statistics, annotations, and Noctis saves survive extraction and migration.
2. Duplicate retries, clock skew, concurrent edits, deletions, long offline periods, reinstalls, and lost devices converge safely.
3. Study OS and AnkiDroid modes remain clearly separate while offering equivalent first-class product journeys.
4. Interrupted book transfer resumes safely and never silently uploads unrelated library content.
5. Reader position, annotations, mining context, OCR results, and Noctis inputs hand off without duplication.
6. Android Doze, background restrictions, denied permissions, low storage, poor networks, and missing AnkiDroid degrade visibly and safely.
7. Revoked devices lose access, account recovery does not expose content, and export or deletion requests are verifiable.
8. Every release includes automated unit and integration tests, real-device tests, migration fixtures, and an independent requirement-based audit.

## Locked Defaults and Non-goals

- Android is public and first; iOS begins only after Android v1 stabilization.
- Desktop remains the command center; mobile is a purpose-built companion rather than a miniature desktop OS.
- Android v1 excludes unrestricted remote control, CSV/toolbox parity, desktop window management, full Noctis presentation, and complete settings parity.
- Actual book files use explicit encrypted transfer; normal cloud sync covers metadata, progress, annotations, study state, and other approved small records.
- Study OS and AnkiDroid receive equal product support through separate scheduling authorities.
- The target monorepo is `apps/desktop`, `apps/mobile`, and dependency-clean `packages/*`.
- M02 must explicitly amend the repository rules before root configuration changes occur.
- The desktop toolchain remains stable during extraction; mobile/shared toolchain upgrades must not force an uncontrolled Electron migration.
- Backend selection belongs to M18; managed cloud is the default candidate, but shared sync semantics must remain provider-independent.
- Mobile and desktop interfaces remain separate; stable logic, contracts, validation, design tokens, and deterministic simulation behavior may be shared.
- UI components are not extracted merely to claim code reuse.
- Remote commands, companion spectacle, and secret-mode features never bypass synchronization, privacy, or security gates.

## Target Repository Direction

The intended long-term structure is:

```text
apps/
  desktop/
  mobile/

packages/
  contracts/
  study-core/
  content-core/
  sync-core/
  noctis-core/
  design-tokens/
```

This structure is a target, not permission for an immediate repository move. M02 must define the incremental migration and rollback sequence, and M16 must prove desktop parity before the old layout can be retired.

## How to Start Later

When work begins, start a new planning session with M00 only. Provide this master plan, the current repository, and the instruction:

> Produce the decision-complete implementation plan for phase M00 only. Verify the current repository state, do not implement later phases, state all deliverables and acceptance criteria, and preserve every dependency and gate in the Mobile Expansion Master Plan.

After M00 is implemented and verified, repeat the process for M01. Do not skip gates or combine critical phases merely to accelerate the roadmap.
