# Storage 6.3 — byte-for-byte round-trip across boots

_Generated 2026-08-07T18:29:38.191Z by `docs/migration/tools/storage-roundtrip.mjs`
(2 reload cycles, read-only)._

Every live key, cycled through the app's own load path: **snapshot → reload → snapshot → reload
→ snapshot**. A key whose bytes move with no user interaction is not surviving a cycle. Two
reloads split that into *canonicalised once* and *changes every boot* — the second is the 6.A
class, and this probe would have caught 6.A on its second reload.

| Measure | Count |
|---|---|
| Live keys examined | 72 |
| **Byte-identical across every cycle** | **72** |
| Changed on the first boot only (canonicalised) | 0 |
| **Changed on every boot (6.A class)** | **0** |
| Appeared or disappeared | 0 |
| **Lost a field across the cycle** | **0** |

## Every key that moved

_None — every live key is byte-identical across every cycle._

## How to read a row

- **identical field set + a byte delta** — a value edit inside the blob, not a structural change.
  A continuously-writing owner (a pet position autosave serialising a longer float) looks exactly
  like this and is benign; see 3.3 / 6.F.
- **changed field set** — structural. Fields *lost* are the ones that matter: that is a normaliser
  or a second owner dropping data, and it is the direct answer to "byte for byte … to see if it's
  missing".
- **per-boot** — the value never settles. Escalate: this is the shape 6.A had.

## What this probe does and does not cover

**Covers:** every live key, through the app's real load-and-boot path, including every normaliser
that runs on read and every writer that fires during startup. That is the population 6.3 names,
and it is the class 6.A belonged to.

**Does not cover:** a field that only a *user action* can change. 6.3's original wording — drive
one control, drive it back, diff — remains the only way to test those, and it has been done per
item rather than store-wide: `jp-os-desktop-prefs-v1` byte-identical after an icon-size change
and restore (4.1), `jp-os-personalization-v1` restored (2.2), `jp-study-shortcuts-v1` still
`null` throughout (4.2), and the known benign absent-vs-`""` case (3.3).

**A caveat this run must carry:** an all-stable result is only as strong as the store's appetite
to move during it. The one key with a continuously-writing owner is `jp-os-environment-v1`, and
a run taken while its pet is parked (`motion: 'wall'`, stationary) exercises nothing. The
self-test above is what separates "nothing moved" from "the diff cannot see movement"; it is not
a substitute for noting that the live store may simply have been quiet.
