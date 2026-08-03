# Patch 0004 over the wire — slice 46, 2026-08-02

`node docs/migration/tools/open-generation-wire-gate.mjs` — exit 0, `open-generation-wire.json`.

Two sidecar binaries, one probe, seven POSTs each. **Only two steps differ, and they are the
two the patch is about.**

| step | client | generation | patched | control |
|---|---|---|---|---|
| first open sets the bar | alpha | 2 | accepted | accepted |
| **an older generation is refused** | alpha | **1** | **refused** | **accepted** |
| the equal generation is the recovery | alpha | 2 | accepted | accepted |
| another client is ordered independently | beta | 1 | accepted | accepted |
| no generation field behaves as before | alpha | *absent* | accepted | accepted |
| a newer generation moves the bar | alpha | 3 | accepted | accepted |
| **the moved bar refuses what it used to accept** | alpha | **2** | **refused** | **accepted** |

- patched: built 2026-08-02 04:51 UTC from the pin + `patches/seanime/0002` and `0004`, in
  `%TEMP%/studyos-sidecar-0004/seanime.exe`. Carries the string `stale open request: generation`.
- control: `../seanime-upstream/seanime.exe`, built 2026-07-27 — **the binary this app
  actually launches**. Does not carry it.
- Both report sidecar **v3.10.2**, both accepted a `/events` websocket, both ran on a throwaway
  `--datadir` in the OS temp dir that was deleted afterwards (`dataDirRemoved: true`).

## What this closes

The Go unit test from slice 41 constructs a `Manager` and calls `AcceptOpenGeneration`
directly. That covers the *rule* and nothing else. The other two parts of the patch — the
`json:"generation"` field on the handler's body struct, and the `Generation: b.Generation` it
forwards into `PlayLocalFileOptions` — could not fail such a test, and had never been
executed. Nor had the client-id resolution the rule is keyed on. This posts real JSON at a
real binary, and step 4 (`beta` at generation 1 accepted while `alpha` at generation 1 is
refused in the same second) is what proves the claimed client id actually reached the rule.

## Read the verdict the right way — the refusal has NO positive observable

`PlayLocalFile` returns **before** `BeginOpen`, so the `defer` that would call `AbortOpen` is
never registered and **nothing is logged**. And both outcomes answer

```text
500 {"message":"Internal Server Error"}
```

byte-identically (`httpResponsesAreIdentical.indistinguishable: true` in the record) — echo's
default error handler with `e.Debug = false` replaces every non-`HTTPError` with that
constant, and Seanime installs no request-logging middleware. So there is no line to find and
no body to read.

The verdict is therefore the **difference between the two binaries on identical input**, never
an absence read on its own — this track has already paid three times for treating a missing
log line as a missing event. Each step's absence is bracketed by its own HTTP response (the
server received that exact request and answered it) and by the control's presence. The gate
fails a step that has neither a marker nor a response, calling it `INCONCLUSIVE` rather than
refused.

Timing corroborates: accepted steps reach the abort marker in **1–3 ms**; the two refused
steps pay the full 4,000 ms marker wait and record **4,044 ms** and **4,010 ms**.

## What it does NOT show

1. **Nothing was deployed** *in this run*. The patched binary is in the OS temp dir and the
   sidecar the app launches is the *control* here — this run is the measurement of that binary
   ignoring `generation`, not a fix.
   **Superseded the same day:** the user was asked and chose to deploy, so
   `../seanime-upstream/seanime.exe` now carries `0002` and `0004`, and the gate was re-run with
   it as the subject — `../open-generation-wire-20260802080608/`. The unpatched pin measured
   here is preserved as `seanime.exe.pre-patches-20260727` and is now this gate's control.
2. **No real open succeeded.** The datadir has no anime collection on purpose, so every
   accepted step fails immediately afterwards at "cannot play local file, anime collection is
   not set". That is what makes the steps comparable — the only thing varying is the
   generation — but it means nothing here streamed a frame.
3. **No stale open was produced by the app.** These generations are posted by the probe. The
   client's own path (`StudyPlayerSlice.tsx` + `shared/directstreamOpenChannel.ts`) issuing a
   genuinely overtaken request against a patched sidecar has still never been observed.
4. **The `--desktop-sidecar` dead-man switch never armed** in a run this short, so nothing
   here says anything about it.

## A latent hazard this surfaced

Because a refusal is indistinguishable from any other open failure over HTTP, a client cannot
tell "the server correctly declined a request I had already superseded" from "the open really
failed". Today that is harmless by construction rather than by design:

- the **launch** path always posts the newest generation, so the only launch POST that can be
  refused is one whose `fetch` was already aborted by the supersession — and that branch
  returns without reporting (`StudyPlayerSlice.tsx:802`);
- the **recovery** path posts the *same* generation the launch minted, which
  `AcceptOpenGeneration` accepts as equal, and its `.catch` deliberately reports nothing.

So no legitimate refusal reaches the user-visible error at `StudyPlayerSlice.tsx:798` today.
It is one changed assumption away from doing so, and the server gives the client nothing to
discriminate with. If 0004 is ever submitted upstream, a distinguishable status or error body
belongs in it.
