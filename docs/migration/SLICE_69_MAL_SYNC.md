# Slice 69 — Authenticated MyAnimeList sync (Phase 8, item 1)

Phase 8's order is *Authenticated MAL sync → secure browser/overlay host → YouTube &
Avant-Garde discovery → Chrome-extension parity* (`SEANIME_MIGRATION_PLAN.md:633-636`).
This slice is the first item. It is **build work**, not hardening.

---

## 0. Instrument availability — READ THIS BEFORE BELIEVING ANY NUMBER BELOW

**Every gate in this track was refused by the permission layer for this agent.** Measured by
attempting each, not assumed:

| Command | Result |
|---|---|
| `npx vitest run` | **REFUSED** — "This command requires approval" |
| `npx vitest run <one file>` | **REFUSED** |
| `node node_modules/vitest/vitest.mjs run <one file>` | **REFUSED** |
| `npm test` | **REFUSED** |
| `node tools/i18n-check.cjs` | **REFUSED** |
| `node docs/migration/tools/audit-carried-items.mjs` | **REFUSED** |
| `WebFetch` (MAL API docs) | **REFUSED** — permission not granted |
| `WebSearch` (MAL API docs) | **REFUSED** — permission not granted |
| `npx tsc --noEmit` | **RUNS** (allow-listed) |

This is the fourth agent tonight to be blocked this way. Consequences, stated plainly:

1. **I have not run the test suite. I did not observe my tests fail before the change, and I
   have not observed them pass after it.** The brief asked for a red-then-green report; I can
   supply the tests and the reasoning, not the observation. Treat "the agent wrote a test" and
   "the test passes" as two different claims.
2. **I do not quote the brief's baselines (369 files / 4670 tests, i18n exit 0, audit exit 0)
   as my own.** They are the coordinator's numbers, not mine.
3. **I could not read MAL's API documentation.** §1 below states exactly which parameter names
   are therefore unverified and how to verify them in one command.

### The one instrument I do have, and its calibration

`npx tsc --noEmit` runs, but the root `tsconfig.json` covers files the vitest/vite configs
don't, so the repo has a **large pre-existing error population**. It is not a pass/fail gate.
Used as a *differential* instead — the method rule for this track is that a verdict is a
difference between two controlled runs, never an absence read alone:

```
BEFORE (tree as found, nothing written by me):   320 errors   (.slice69-tsc-baseline.txt)
```

The `AFTER` run and the diff are in §6.

---

## 1. The OAuth flow, and which parameter names are verified

**Unverified-source warning.** `WebFetch` and `WebSearch` were both refused, so I could not
open `https://myanimelist.net/apiconfig/references/authorization`. The parameter names below
come from **model knowledge, not from reading MAL's docs tonight.** The brief told me to read
MAL's actual parameter names rather than trust the brief; I could do neither, so I am flagging
the whole table rather than presenting it as verified.

They are, however, **cheap to verify and structurally isolated**: every name appears exactly
once, as a string literal, in `src/shared/malSync.ts` or `src/main/malSync.ts`, and each has a
test asserting it. Correcting a wrong name is a one-line edit plus the matching test line.

### Authorization request — `GET https://myanimelist.net/v1/oauth2/authorize`

| Parameter | Value |
|---|---|
| `response_type` | `code` |
| `client_id` | from config (never hardcoded — §3) |
| `code_challenge` | the PKCE challenge |
| `code_challenge_method` | `plain` |
| `state` | CSRF nonce, checked on callback |
| `redirect_uri` | optional; omitted when the app has exactly one registered URI |

### **`code_challenge_method=plain` is deliberate. Do not "fix" it to S256.**

MAL implements PKCE with the `plain` method only, so **the code challenge is byte-identical to
the code verifier**. A reviewer who knows RFC 7636 will read `challenge === verifier` as a
missing SHA-256 and "correct" it — which silently breaks the token exchange, because MAL will
compare the S256 digest against the verifier it stored and reject it. This is called out in a
comment at the generation site *and* pinned by a test
(`derives the challenge as the verifier itself, because MAL only supports the plain method`).

The verifier is 64 random bytes, base64url-encoded → 86 characters, inside RFC 7636's required
43–128 range. A test asserts the length band rather than the exact string.

### Token exchange — `POST https://myanimelist.net/v1/oauth2/token`

`Content-Type: application/x-www-form-urlencoded`.

| Field | Value |
|---|---|
| `client_id` | from config |
| `code` | the authorization code from the callback |
| `code_verifier` | the verifier matching the challenge sent above |
| `grant_type` | `authorization_code` |
| `redirect_uri` | echoed only when it was sent to `/authorize` |

### Refresh — same endpoint

| Field | Value |
|---|---|
| `client_id` | from config |
| `grant_type` | `refresh_token` |
| `refresh_token` | the stored refresh token |

Response fields consumed: `access_token`, `refresh_token`, `expires_in`, `token_type`.

### List read — `GET https://api.myanimelist.net/v2/users/@me/animelist`

Query: `fields=list_status,num_episodes`, `limit`, `offset`, `nsfw=true`, optional `status`.
Paging follows `paging.next` when present.

### List write — `PATCH https://api.myanimelist.net/v2/anime/{anime_id}/my_list_status`

Form-urlencoded. Fields: `status`, `num_watched_episodes`, `score`, `is_rewatching`.

### The read/write field-name asymmetry — the highest-value thing in this file

MAL is **not symmetric** here, and this is the single easiest way to ship a write that silently
does nothing:

```
READ  (response) : list_status.num_episodes_watched
WRITE (request)  : num_watched_episodes
```

`num_episodes_watched` vs `num_watched_episodes` — same four words, different order. Sending
the read spelling on a PATCH is accepted with a 200 and **the episode count does not move**.
Both spellings are pinned by name in tests, and the domain model deliberately uses a third,
unambiguous name (`episodesWatched`) so neither wire spelling can leak into app code by habit.
