# The packaged app with no internet — Phase 9 / slice 47j

```
node docs/migration/tools/packaged-offline-gate.mjs
```

Needs a packaged build in `out/`. Runs against a throwaway `--user-data-dir`, so it exercises a
**first run with no internet** — the harshest version of the question — and never touches the
real profile.

## The result

```text
0   window            app://bundle/index.html
1   block             every off-machine request failed; loopback and app:/media:/… still pass
2   desktop           mounts with no internet (readyState complete, .desktop-root, window.api)
3   local machinery   lookupTerm 3, lookupTermOffline 3, dictAvailableLangs 3, no errors
3b  network surface   searchDiscovery('frieren') -> resolved, 0 results, 1,034 ms
4   shell health      still mounted, no visible error, no hang
5   the block bit     main process reached nothing
```

## The differential that makes it mean something

The same query, the same build, the same profile shape — only DNS changed:

| | `searchDiscovery('frieren')` |
|---|---|
| with the internet | **6 results**, 2,720 ms |
| with DNS blackholed | **0 results**, 1,034 ms |

So the surface that needs the network *degrades* — promptly, with an empty list, leaving the
shell standing — rather than hanging or throwing into the UI. And the local study machinery
answers normally throughout.

## The mistake this gate made first, and why the control caught it

The first version blocked requests through the **renderer's** CDP `Fetch` domain. It reported
`0 external requests blocked` while `searchDiscovery` came back with **6 real results**. The
app was plainly online, and a gate reading only "the shell survived" would have called that a
PASS of offline behaviour.

> **This app does its networking in the MAIN process** (`ipcRenderer.invoke('discovery:search', …)`),
> and main-process requests never pass through a renderer's CDP session. A renderer-side block
> can only ever prove things about the renderer.

The fix is `--host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE localhost"`, applied by Chromium's
network stack — which Electron's `net` module, the one `main.ts` imports, uses too. Literal
`127.0.0.1` is not a hostname, so the sidecar is untouched. That is the real shape of offline:
**the internet is gone and the machine is not**.

The control was the only reason this was caught, so it is now two independent witnesses:
renderer requests denied, **and** `searchDiscovery` not returning hits. A run where the main
process reaches the internet is a hard `FAIL` — it is not an offline run at all.

`Network.emulateNetworkConditions({ offline: true })` was rejected for the opposite reason: it
kills loopback too, so it would have shown the player failing and invited "offline is broken"
about the local server the user still has.

## What this does NOT show

- **The renderer-side witness read 0 both ways in this run.** `Fetch.enable` attaches after the
  document has loaded, so it sees little on a settled page; an earlier run saw 34 local
  requests. The verdict rests on the main-process witness, which is the one that matters here.
- **One surface.** `searchDiscovery` stands in for "things that need the internet".
  Metadata sweeps, artwork fetches, subtitle discovery, Whisper's first-use model download and
  AniList sync were not exercised, and the Whisper download in particular is the one most
  likely to behave badly offline.
- **No media playback offline.** The sidecar was not driven; this is a boot-and-surfaces run.
- The audited artifact predates slice 47g's CSP extraction, like the CSP gate's.
