# The telemetry-consent near-miss — a false privacy finding, caught by its own control

**2026-08-04, orchestrator, solo.** This file exists because the audit came within one write-up of
publishing a serious and false accusation about the app's privacy behaviour. The mechanism that
stopped it was a control, not care.

---

## 1. What was observed

While probing Media on a freshly-created scratch profile (`%TEMP%\jp-audit-media2-profile`,
`Remove-Item`'d immediately before launch), `localStorage` read:

```
jp-telemetry-consent = yes
jp-telemetry-pinged  = 1
jp-clipboard-history = [{"id":"cb-…","type":"manual","text":"For your security, …
```

with **no consent screen on display** and **no user interaction of any kind**.

Read at face value that is: *the app grants itself telemetry consent on a fresh install, sends the
ping, and captures the system clipboard.* Publication-relevant, reputation-damaging, and — given
`jp-telemetry-pinged` is written **only after a successful send** (`telemetryPing.ts:27`) — apparently
evidenced by the app's own state.

## 2. Everything that made it look solid

Each of these was verified, and none of them was sufficient:

| Check | Result |
|---|---|
| Was the profile fresh? | Yes — `CURRENT`, `LOCK`, `MANIFEST` all stamped at launch, `08:58:53` |
| Did `--user-data-dir` take? | Yes — 580 files in the scratch dir, its own `Local Storage/leveldb` |
| Was I reading a stale second instance? | No — `Win32_Process` showed **one** app (pid 39488) and five children, every one carrying the scratch `--user-data-dir` |
| Was the real profile involved? | No — newest write `8/2/2026 9:40:03 AM`, two days earlier |
| Is there a code path that seeds `yes`? | **None.** All three writers (`ConsentScreen:20`, `SettingsView:350`, `more.tsx:230`) require a user action, and no literal-string writer exists |
| Had another track moved source under me? | No — zero `src/**` files modified in 3h |

Six confirmations, and the conclusion was still wrong.

## 3. The control that refuted it

Two experiments, on a second genuinely fresh profile, changing nothing:

**A — untouched boot, held 45 seconds:**

```
T+0    {"consentScreen":true,"consent":null,"pinged":null,"clipEntries":0}
T+45   {"consentScreen":true,"consent":null,"pinged":null,"clipEntries":0}
```

**B — decline, then hold 30 seconds on a live shell:**

```
after decline   {"consent":"no","pinged":null,"clipEntries":0}
T+30            {"consent":"no","pinged":null,"clipEntries":{"n":0,...}}
```

The app does **not** self-consent, does **not** ping, and does **not** capture the clipboard. A third
control — clearing the two keys on the first profile and reloading — brought the consent screen
straight back, proving the gate mechanism itself is sound.

## 4. Verdict

**No defect. The consent flow is correct**, and belongs in the *what works* register:

- The gate blocks the shell until answered, and writes nothing before it is.
- Declining writes `consent=no` and **never pings** — verified, `pinged` stayed `null`.
- `jp-telemetry-pinged` is set only after a confirmed successful send.
- Clipboard history is a user-facing clipboard-manager feature (`HEAVY_LOCAL_STORAGE_KEYS`,
  `storageMigrationBoundary.ts:42`), not a background capture; 30 s of live shell produced 0 entries.

The `media2` observation is recorded as an **unreproduced anomaly**. Something in that run set those
keys; two controlled retests could not make it happen again, and no code path explains it. That is
where it stops. **An unreproduced observation is not a finding**, however well-corroborated its
surroundings are.

## 5. Why this is the most important entry in the audit's error record

The five earlier instrument errors were *undercounts and misattributions* — `AppChrome` 42 vs 23,
`~94%` vs 35.6%, a stale memory about `DictionaryResults`, a dropped "dashboard" qualifier, a
`node`-vs-`jsdom` mechanism. Each produced a wrong number in a report.

This one would have produced a **false accusation about user privacy** in a document written to
decide whether the app is fit to publish. It is the first error of this session whose cost was
asymmetric: an undercount misleads, an invented privacy defect defames — and it would have been
"supported" by six independent verifications, a direct read of the app's own storage, and a plausible
mechanism.

The generalisable rule, and the one this session should carry forward:

> **Corroboration is not reproduction.** Verifying the *circumstances* of an observation — the right
> process, the right profile, the right file — does not verify the *observation*. Only re-running the
> scenario does. For any finding that accuses the software of acting against the user, reproduction
> on a clean fixture is mandatory before it is written down, not before it is published.

This sits alongside the standing rule that an *absence* is a scope hypothesis. Together they cover
both directions: **do not report what you failed to find, and do not report what you found once.**
