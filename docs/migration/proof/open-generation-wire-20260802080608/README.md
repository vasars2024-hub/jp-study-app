# The DEPLOYED sidecar refuses a stale open — slice 46, 2026-08-02

The second run of the same gate, after the deployment. Reproduce:

```
node docs/migration/tools/open-generation-wire-gate.mjs --exe="C:/Users/Arseniy/Projects/seanime-upstream/seanime.exe"
```

Exit 0. Same seven steps, same two differ — but the subject and the control have swapped
roles with the run in `open-generation-wire-20260802075705/`:

| | binary | 0002 | 0004 |
|---|---|---|---|
| subject | `../seanime-upstream/seanime.exe` — **what the app launches** | yes | yes |
| control | `../seanime-upstream/seanime.exe.pre-patches-20260727` — the pin it replaced | no | no |

So this is no longer "a binary can refuse". **The binary this app launches refuses**, and the
one it launched until 07:51 today does not, measured side by side an hour apart.

## What changed on disk

`seanime.exe` is now the 2026-08-02 build from the pin + `0002` + `0004`
(sha256 `70ecf65d…`, 84,409,856 bytes). The bare pin it replaced is preserved beside it as
`seanime.exe.pre-patches-20260727` (sha256 `62d6af1b…`, 84,408,320 bytes) and both hashes were
verified after each copy. Deployed **by explicit user decision** — they were asked, because it
overwrites an 84 MB binary in a checkout outside this repo, and chose to keep a backup.

The preserved pin is not just a rollback: it is this gate's **control**, and the gate now
prefers it automatically. Deleting it costs the gate its ability to prove anything.

## Read it with the same caution as the first run

The refusal still has no positive observable — see the first run's README, all of which still
applies. In particular this shows the *rule* running in the deployed binary; it does **not**
show the app's own client producing a genuinely overtaken open against it. That remains
unobserved.

Nothing here exercises `0002`. It is in the deployed binary now (probed by
`flushTerminalSubtitleBatch` in pclntab), but the dual-subtitle terminal flush has still only
ever been proven against a purpose-built exe via `SEANIME_EXE` — the difference is that the
binary carrying it is finally the one the product runs.
