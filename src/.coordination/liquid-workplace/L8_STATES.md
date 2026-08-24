# L8 — the four states on the Liquid Dictionary window

Rubric category 8's second and third numbers: *whether empty, loading, error and offline states
each render a named, translated message*, and *0 raw i18n keys*.
Instrument `probes/l8-honest-states.cjs`, driven live against pid 7920, 2026-08-24.
Raw run: `baselines/l8-honest-states-run2.json`.

`L1_HONEST_STATES.md` recorded this category VOID for a stated reason: *"Two induced-failure
attempts both SUCCEEDED, so the error and offline states were never observed."* This run has a
dependency that is genuinely down.

## The induction, and its control

| Probe | Verdict | Detail |
| --- | --- | --- |
| `127.0.0.1:8765` AnkiConnect | **REFUSED** | `ECONNREFUSED`, TCP connect from node |
| `127.0.0.1:5173` Vite (control) | LISTENING | connect succeeded |

The refusal is measured **from outside the app**, by this process's own socket, before the probe
touches the renderer. The thing under test cannot also be the evidence that its dependency is
down. The second row is the control on the control: a prober that returned REFUSED for everything
would prove nothing. The app's own reading agrees — `ankiLinkState()` returns
`state: 'disconnected'`, `consecutiveFailures: 598`.

## The three states this run measured

| State | Rendered | Number |
| --- | --- | --- |
| Empty | `No dictionary match for "zzzqqqxxwv".` | names the query back; **0** raw keys |
| Loading | `Looking up…` | observed in-page; **8** entries after; **0** raw keys |
| Offline | `Can't reach Anki. Open Anki desktop and make sure the AnkiConnect add-on is installed.` + `To add cards, install the free AnkiConnect add-on (one time):` + **4** numbered steps + `Retry` | **0** raw keys, `falseSuccess: false` |

`falseSuccess` is the assertion that matters for the offline row: no `.dict-add` label read
*Added* after the click. A surface that reports success against a refused port is the exact defect
category 8 exists to catch, and it is asserted rather than eyeballed.

**Clicking `+ Add to Anki` is safe while the port is refused, and that is measured, not assumed.**
`l8-dead-controls.cjs` excludes all eight because they write a real note; here `addToAnki` awaits
`ensureAnki()`, reads `connected:false` and returns **before** `ankiMineNote`. The run records
`ankiStatus().connected === false` immediately before the click.

## The instrument defect this slice paid for

Run 1 sampled `.dict-loading` over the bridge every 40 ms for 1500 ms and returned **`[]`** — on a
lookup that provably ran (8 entries after). One `/eval` round trip is longer than a local SQLite
lookup, so the sampler's own latency exceeded the state it was sampling. That `[]` is
indistinguishable from a surface that says nothing while it works: `L1_HONEST_STATES.md`'s
`loading: 0` a second time, different cause. A MutationObserver installed in the page **before**
the click sees it — `Looking up…`. Any transient state on this surface must be observed in-page,
never polled from node.

## The way back is not on the panel — measured

`AnkiSetup` replaces the whole result list from an early return (`DictionaryResults.tsx:844`) and
receives `onBack` **only when `variant === 'popup'`**. The floating Dictionary window is
`variant='page'`, so the panel renders exactly one button:

- `backButtonPresent: false`
- Retry → `setShowSetup(false)` then `ensureAnki()`, which sets it straight back:
  `stillSetup: true`, `entries: 0`.

It is not a dead end — `:290-293` clears `showSetup` whenever the query changes, and the search
box stays visible above the panel, so a fresh search restores the results. But the eight results
the user already had are gone and must be re-queried against a 697k-row database to get back.
Recorded as a category 6 reversibility defect on this surface.

**Fixed and re-measured in the same commit** — `onBack` is now passed for every variant, not only
`popup`. `probes/l8-setup-back.cjs`, same refused port (`ECONNREFUSED`):

| | before the click | on the panel | after Back |
| --- | --- | --- | --- |
| `.dict-entry` | **8** | 0 | **8** |
| window chars | **3,720** | — | **3,720** |
| buttons | — | `Back`, `Retry` | — |

`roundTripExact: true`, `stillOnPanel: false`. The char equality is the part that matters: a "fix"
that silently re-ran the lookup would also show 8 entries and would not be a way back. Nothing was
re-queried — `showSetup` is the only state that changed.

## Still open for category 8

- **Error**: not reachable from the Anki path while the port is refused — `ensureAnki`
  short-circuits ahead of `ankiMineNote`, so `res.error` never renders. Driven separately.
- **Fabricated values**: no verdict yet.
