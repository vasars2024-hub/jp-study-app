# L0 performance baseline — what rubric category 7 is scored against

Milestone: **L0-baseline-1**. Measured 2026-08-16 on `feat/nyaa-subtitles` at `bad26d58`.
Never overwrite this file; a later milestone is a new file.

Instrument: `tools/liquid-perf-probe.ps1`. `/health` is handled on Electron's main thread, so
the round-trip latency of a burst of `/health` calls **is** main event-loop availability.

**The probe reports min / p50 / p95 / max and deliberately never a mean.** Every finding below
is invisible in p50. Under the worst measurement here, p50 was 2.4 ms while max was 8,235.9 ms —
an average would have reported this surface as healthy.

## Environment

| | |
| --- | --- |
| Window | 1280×860 at (320,110), viewport 1264×821, dpr 1, not minimized/maximized |
| Renderer JS heap | 229 MB used of a 4096 MB limit |
| Theme at capture | `forest-night` |
| `prefers-reduced-motion` | false |
| Open `.fwin` windows | 2 |
| Process uptime at capture | 68.6 min (no restart — see gaps below) |

## Main event-loop availability

| Condition | samples | min | p50 | p95 | **max** |
| --- | --- | --- | --- | --- | --- |
| Idle | 40 | 0.9 | 1.4 | 3.5 | **4.2** |
| Idle (re-check) | 40 | 1.2 | 1.5 | 2.1 | **9.8** |
| CONTROL — renderer blocked 1500 ms | 40 | 1.1 | 1.3 | 3.4 | **3.5** |
| 120 dictionary lookups, **warm** cache | 40 | 1.6 | 2.1 | 57.2 | **60.8** |
| 120 dictionary lookups, **cold** | 40 | 1.2 | 1.8 | 56.2 | **9,922.8** |
| 126 dictionary lookups, **cold**, unseen words | 40 | 1.8 | 2.4 | 83.1 | **8,235.9** |

Reproduce the last row:

```powershell
$w = '走る,泳ぐ,登る,降りる,渡る,曲がる,進む,戻る,届く,届ける,預ける,借りる,貸す,返す,払う,売る,買う,配る,集める,並ぶ,並べる' -split ','
$js = "(() => { const w=['" + ($w -join "','") + "']; const suf=['','が','を','に','で','は'];" +
      " for(const s of suf){ for(const x of w){ window.api.lookupTerm(x+s).catch(()=>{}); } } return 'fired'; })()"
pwsh tools/liquid-perf-probe.ps1 -Samples 40 -Label 'dict cold' -DuringJs $js
```

## Both controls, and the one that was wrong first

Category 7 requires a control that fails. This probe needed **two**, because isolation and
sensitivity are different claims:

- **Isolation — does it measure the right process?** A 1500 ms renderer busy-wait left main at
  p50 1.3 / max 3.5 ms, i.e. indistinguishable from idle. `/health` is main-only. **Passes.**
- **Sensitivity — can it catch the reference defect?** The `7954921a` shape is 36,910 ms during
  vs 1 ms after. A cold dictionary burst produced **8,235.9 ms against a 4.2 ms idle**, same
  shape, ~2,000×. **Passes** — this probe can score category 7.

**The isolation control was broken on its first run and read as a product defect.** It reported
p95 41.5 ms / max 224.3 ms against a 3.5 ms idle, which looks exactly like a main-process block.
It was not one: the control used `Start-Job`, which spawns a fresh PowerShell process, and the
probe timed that process's own startup CPU. Rewritten to fire the request on an async
`HttpClient` task inside the existing process, the same control came back clean. **The harness
must stay off the CPU it is timing** — and a control that "fails" is only useful if you check
*why* it failed.

## Finding — dictionary lookup saturates the main loop

**Cold dictionary lookups make the main process unavailable to a trivial request for up to
8.2–9.9 seconds.** Two independent cold runs (9,922.8 ms / 8,235.9 ms) agree in magnitude;
warm is 60.8 ms; idle is 4.2 ms. All 120 lookups completed — nothing failed, which is why no
error state exists to notice this.

- The rubric's category 7 bar is **no main-process block over 500 ms** under a surface's
  heaviest real operation. This is **16–20× over**.
- CLAUDE.md: *"Never run CPU-heavy parsing, indexing, media analysis, or dictionary processing
  on Electron's main event loop."* 126 lookups at the ~67 ms/word already recorded in the relay
  state file is ~8.4 s of serialized main-thread work, which matches what was measured.
- **Precise claim:** this is main-loop **saturation by serialized synchronous work**, not
  proven to be one monolithic 8-second block. The user-visible consequence is the same, and
  window-drag responsiveness is a stated product invariant — but do not quote it as a single
  block, because that is not what was measured.
- **Pre-existing, not introduced by this track.** The relay state file already carried "67 ms
  for a single word" and the cold synchronous `openDictionaryDb` as open perf items. This
  baseline is the first measurement of what they cost together under a realistic burst.

Dictionary is `DictionaryView` (50 owned files, 97 controls) and its lookups are also reached
from Reading, Immersion and the video player's word panel, so this cost is not confined to one
§7 row.

## Gaps — NOT measured, and why

These are the rest of L0's perf list. They are listed as gaps rather than quietly omitted.

| Baseline | Status | Blocker |
| --- | --- | --- |
| Boot cost | **not measured** | Requires a real restart; the process under test had 68.6 min uptime. The rubric voids any main-process number taken without one. |
| Window drag frame stability | **not measured** | Needs a drag driven over time; `/health` sampling during a synthetic drag was not attempted this turn. Note dragging a window rewrites `desktop-layout.json` synchronously (`src/main/desktop.ts:311`), so this must be capture-restore. |
| Resize | **not measured** | Same as drag. |
| Theme-switch cost | **not measured** | Must go through the app's own `jp-theme-changed` event rather than writing storage; capture-restore the current `forest-night` value and assert it byte-for-byte. |
| Main-process memory | **not measured** | Only the renderer heap (229 MB) was read. Main RSS needs the process, not the bridge. |
| Player frame stability | **MEASURED 2026-09-03** | Closed — see `PERF_BASELINE_PLAYER.md`. A real clip (JoJo 39-END RAW, 1280x720, directstream) playing in `#media-workspace`: 0 dropped and 0 corrupted frames across six readings in three runs, renderer p50 16.7 ms against a 16.7 ms session ceiling. Negative control (paused player must refuse) and `-Jank` sensitivity control both fired. |

The next turn should take the restart-dependent rows in one pass, because they all need the
same fresh process and a restart mid-sequence invalidates whatever came before it.

> **Done — see `PERF_BASELINE_RESTART.md`** (same milestone, restart leg, 2026-08-16). Five of
> these six rows are measured there off one cold start.
> **No number above was modified by that pass** — this is a pointer, not a correction.

> **The sixth row is done too — see `PERF_BASELINE_PLAYER.md`** (same milestone, player leg,
> 2026-09-03). All six of L0's perf baselines are now measured. Again a pointer, not a
> correction: no number in this file or in `PERF_BASELINE_RESTART.md` was modified by it.
