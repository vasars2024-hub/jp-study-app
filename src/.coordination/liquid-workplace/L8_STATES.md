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

## The error state, and the defect the induction found on the way

The error branch is unreachable from the Anki path while the port is refused: `ensureAnki`
short-circuits ahead of `ankiMineNote`, so `res.error` never renders. It needs a dependency that
*accepts* the request and then fails it. `probes/l8-explain-error.cjs` configures the `deepseek`
bucket with a key that is shaped like one and is not a credential, switches to `deepseek-v4-pro`,
and clicks `Explain this word`.

**Reversible, which is the only reason it is allowed.** `deepseek` was UNCONFIGURED
(`aiProviderHealth`: `configured:false`), so nothing of the user's is overwritten, and it is
`store: 'vault'` (`credentialRegistry.ts:135`), so `credentials:clear` removes it. `ai:setApiKey`
cannot — it refuses an empty key at `mining.ts:1959` *before* `writeAiProviderSecret` would have
cleared it, so the restore goes through `clearCredential`. Both runs end `restored: true`:
`aiGetConfig()` and `aiProviderHealth()` byte-identical to the captures. The real Gemini key is
never read, written or sent.

### Run 1 — the control did not fail, and that was the finding

Provider `deepseek-v4-pro`, `apiKeysSet.deepseek: true` (the fabricated one) — and the click
returned **a real grounded answer about 食べる**. Its own provenance line said why:

> From cloud:**gemini-2.5-flash**:default, kept since 8/24/2026.

`EntryExplain` resolves the policy in an effect whose deps are `[word, reading, lang, glossLang]`
— the word, not the configuration. Nothing re-runs it when the user changes their AI provider, and
`explain()` sent `engine.policy` from mount. **A user who switches provider keeps calling the old
one, and is billed there, until the panel remounts.** The app was honest about which model wrote
the answer; the request had simply gone somewhere the user had stopped choosing.

Fixed in the same commit: `explain()` resolves `explainPolicyFromEngine(await aiGetConfig())` at
click time, and a resolution that has become unusable renders the blocked message rather than
calling a provider whose key is gone.

Cost, stated rather than omitted: run 1 spent one real Gemini call and stored an explanation for
食べる in userData. It is the app's own flow and removable by `Forget this explanation`; it was not
what the run intended.

### Run 2 — the same induction, after the fix

| | |
| --- | --- |
| `duringConfig.providerId` | `deepseek-v4-pro`, `apiKeysSet.deepseek: true` |
| Rendered | **`The AI provider did not answer. authentication`** |
| `role` | `alert` |
| Provider code | **`authentication`** — DeepSeek's own rejection, so the request left the machine |
| Raw i18n keys | **0** |
| `falseSuccess` | **false** |
| `restored` | **true** |

`falseSuccess` is measured as *the answer changed*, not *an answer is present*: `EntryExplain`
deliberately leaves the stored answer on screen beside the error, because a failed refresh leaves
the database row untouched and replacing it would claim the stored answer was gone. Before and
after are the same string, so nothing was manufactured.

Run 1 is run 2's negative control, and a stronger one than a planted failure: the same induction
that produced a wrong-provider success before the fix produces a named authentication failure
after it.

## Still open for category 8

- **Fabricated values**: no verdict yet. Until it has one, **no score is claimed**.
