# Part A — nyaa subtitle provider: live verification

Run 2026-08-08 against the dev app through the debug bridge (`jp-bridge`), after a **full restart**.
The code shipped as `477380b`; this is the boot check the plan requires on top of the test suite.

## Why the restart mattered — a false reading it would have produced

The first probe found `listNyaaSubtitles` present on `window.api` and concluded the feature was
live. It was not. Invoking it returned:

```
No handler registered for 'subtitleDiscovery:nyaaList'
```

**Preload and main are reloaded on different schedules.** A preload edit reaches the renderer on a
window reload; a main-process edit needs the process to restart. So the bindings were new and the
handlers were from the pre-change build. The same staleness explains a second reading that looked
like a defect: `getSubtitleDiscoverySettings()` returned four providers with no `nyaa`, which reads
exactly like the normalizer failing to backfill a newly-added provider. It was the old main process
answering.

**Rule: after a main-process change, presence on `window.api` proves nothing. Invoke the handler.**

## What is verified live, after the restart

| Check | Result |
|---|---|
| `nyaa` in the live provider registry | `{"id":"nyaa","enabled":false,"priority":4}` |
| Backfilled into a settings blob written before it existed | yes — the stored blob still holds four providers; the normalizer supplies the fifth |
| Default disabled, last in priority | yes |
| Renderer never sees an API-key field for it | `isNetworkSubtitleProvider` still returns `'jimaku' \| 'opensubtitles'` (A5 dep 2) |
| Handlers registered | `subtitleDiscovery:nyaaList` and `:nyaaAccept` both answer |

### The availability guard refuses with four distinct messages

This is the plan's stated end-to-end requirement — *self-disable with a specific message rather than
returning empty* — and it is the failure mode the source document never anticipated. Driven through
the real IPC path against a real media item:

| Config | `ok` | Message |
|---|---|---|
| none | false | `No scraper configuration was supplied.` |
| no torrent indexer enabled | false | `No torrent index is enabled in this profile.` |
| qBittorrent off | false | `Fetching a subtitle from a torrent needs qBittorrent, which is turned off.` |
| save path unreadable here | false | `qBittorrent saves to "Z:\qbit\done", which is not readable from this machine.` |

All four return `candidates: []` **with** a message — never an empty list on its own.

**One probe error worth recording, because it is the same class the audit keeps hitting.** The first
run of this table reported `not-configured` for all four cases, which looks like the guard being
broken. It was the probe: `asAcquisitionConfig` (`subtitleDiscovery.ts:90`) requires `indexers`,
`torrents` **and** `qbittorrent`, and the probe omitted `torrents`. Reading the wire type also
corrected a second mistake — the field is `message`, not `reason`, so an earlier run read `null`
from every case and could have been written up as "the guard loses its message."

A genuine wart the probe did surface: `asAcquisitionConfig` collapses three distinct shape failures
into one `not-configured`. Harmless in the product, where the renderer builds the config from real
settings, but it is why a hand-built probe misdiagnoses so easily.

## What is NOT verified, and exactly how to finish it

**A real acquisition — Route A or Route B against a live qBittorrent — has not been run.** Two
reasons, both stated rather than worked around:

1. qBittorrent is running on this machine (pid observed) but its **WebUI is not reachable**:
   `127.0.0.1:8080` refuses the connection, so the client API the whole acquisition path depends on
   is unavailable. Enabling the WebUI is a change to the user's own application, not to this repo.
2. Completing it downloads a real torrent from a public swarm on the user's connection. That is an
   outward-facing side effect, and it was not run unattended.

To finish it, with the app running:

1. qBittorrent → *Tools ▸ Options ▸ Web UI* → enable, note host/port/credentials.
2. In the app: *Settings ▸ Scraper* → enable a torrent index and the qBittorrent connection; set the
   save path to a directory this machine can read (the guard above refuses otherwise, by design).
3. *Settings ▸ Subtitles* → enable the **nyaa** provider.
4. Open a title Jimaku does not cover → **Fetch from nyaa** → confirm candidates rank sub-only
   before batch → accept one.
5. Confirm a `.ass`/`.srt` lands as a `SubtitleRecord` and its cues render in the player through the
   same path a Jimaku subtitle takes. `readSubtitleRecord:163` reads a nyaa record identically to a
   Jimaku one (`source: 'provider'`, relative path, `external` unset) — verified by reading, so the
   remaining risk is in acquisition, not in playback.

Everything upstream of that boundary — search, ranking, route selection, per-file priority
construction, bitmap rejection, the "don't touch a torrent the user already has" rule — is covered
by 40 unit tests (`subtitleNyaa.test.ts` 30, `subtitleNyaaFetch.test.ts` 10) inside the green
423-file suite.
