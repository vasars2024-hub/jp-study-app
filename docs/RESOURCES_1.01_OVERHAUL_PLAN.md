# Resources App 1.01 Overhaul — jp-study-app

## Context

The Resources app today is a static, hand-coded list of ~36 links compiled into the app (`src/renderer/data/resources.ts` + `ResourcesView.tsx`). The overhaul turns it into a living hub for version **1.0.1**: a country download heat map greeting (opt-in, anonymous), 10+ themed "gem/creature" bundles with researched beginner checklists, a "New & promising" section — all served from **remote JSON on GitHub** so content updates never require an app release and app size stays minimal — plus a "collect tool" button in the Immersion browser, and a bulk-expanded, difficulty-levelled novel catalogue.

**Hardest piece goes last:** the heat map (Phase 6) — it's the only piece needing an external backend (Cloudflare Worker + KV, deployed by a first-timer), a privacy/consent UX, and new map rendering. Novels bulk import (Phase 5) is tedious but stays within existing app patterns.

Each phase is independently shippable. After every phase: `npm run lint`, `npm test`, `npm start` smoke-test.

---

## Phase 0 — Version bump + shared types (quick)

- `package.json`: version → `1.0.1` (SemVer form of "1.01"; UI can display "1.01").
- Create `src/shared/resourcesCatalog.ts` — types + URL constants (style of `src/shared/release.ts`):

```ts
export const CATALOG_BASE = 'https://raw.githubusercontent.com/vasars2024-hub/jp-study-app-catalog/main';
export const CATALOG_URL = `${CATALOG_BASE}/catalog.json`;

export type Cost = 'Free' | 'Freemium' | 'Paid';
export interface CatalogResource { name: string; url: string; description: string; cost: Cost; tags?: string[]; }
export interface ChecklistItem { id: string; text: string; url?: string; }
export interface Bundle {
  id: string; gem: string; creature?: string; color: string; icon: string;
  title: string; blurb: string; items: CatalogResource[]; checklist?: ChecklistItem[];
}
export interface NewEntry extends CatalogResource { addedAt: string; source?: 'github' | 'web'; lang?: string[]; }
export interface ResourcesCatalog {
  schemaVersion: 1; updatedAt: string;
  bundles: Bundle[]; newSection: NewEntry[];
  categories?: { id: string; icon: string; title: string; blurb: string; items: CatalogResource[] }[];
}
```

---

## Phase 1 — Remote catalogue plumbing (fetch + cache + refresh)

**Hosting:** new public GitHub repo `vasars2024-hub/jp-study-app-catalog` containing `catalog.json` (later `novels.json`). Editing JSON on github.com updates every install (raw CDN refreshes in ~5 min).

**Files:**
- New `src/main/resourcesCatalog.ts` — clone the fetch pattern from `src/main/release.ts` (AbortController, 15s timeout, null on failure) and the userData-JSON atomic-write pattern from `src/main/immersion/index.ts`:
  - `catalog:get` — return cache from `userData/resources-catalog.json`, else null.
  - `catalog:refresh` — fetch CATALOG_URL, validate `schemaVersion === 1`, atomic write, return catalog.
  - Register next to `registerReleaseIpc(...)` in the main entry.
- `src/preload.ts` — add `catalogGet` / `catalogRefresh` next to `openExternal` (~line 381); extend `window.api` types (`src/renderer/window.d.ts`).
- New `src/renderer/data/catalogFallback.ts` — small bundled ResourcesCatalog (bundle skeletons) so first offline launch isn't empty.
- `src/renderer/views/ResourcesView.tsx` — on mount `catalogGet()` → state; background `catalogRefresh()`; Refresh button with spinner + "updated / cached" hint. Static RESOURCES categories stay; remote `categories` append after.
- i18n keys in `src/shared/i18n/catalogs.ts`.

**Caching:** single userData JSON; overwrite only on successful fetch; never delete on failure; refresh every launch + manual button (payload ~10–50 KB).

**Verify:** online launch → cache file exists; offline relaunch → cached data; delete cache + offline → fallback; Refresh works. Vitest schema test in `src/shared/__tests__`.

---

## Phase 2 — 10 gem/creature bundles + checklists (research phase)

**Research step (during implementation, before authoring catalog.json):** WebSearch/WebFetch across r/LearnJapanese wiki & starter guide, TheMoeWay (learnjapanese.moe), Refold roadmap, itazuraneko/toolbox lists, Tofugu; lighter pass for Chinese (Heavenly Path, r/ChineseLanguage) and Russian. Distill into short imperative checklist items with optional URLs.

**The 10 bundles (adjustable):**
1. **Sapphire** (Whale) — Flashcards & SRS (Anki, FSRS, jpdb, Kitsun)
2. **Ruby** (Phoenix) — Kanji & writing (WaniKani, KanjiStudy, RRTK, Ringotan)
3. **Emerald** (Serpent) — Grammar (Bunpro, Cure Dolly, Tae Kim, Imabi, Sakubi, DoJG)
4. **Amber** (Fox) — Listening (Nihongo con Teppei, condensed audio, YouGlish)
5. **Opal** (Owl) — Reading & immersion (Tadoku, NHK Easy, ttsu reader, Mokuro, asbplayer)
6. **Dragon** — Chinese (Pleco, HackChinese, DuChinese, Heavenly Path)
7. **Amethyst** (Bear) — Russian (graded readers, learner resources)
8. **Pearl** (Crane) — Beginner Japanese checklist bundle (kana → core deck → grammar → first immersion)
9. **Topaz** (Tiger) — Output & speaking (HelloTalk, iTalki, VRChat JP, LangCorrect, shadowing)
10. **Obsidian** (Wolf) — Tools & tech (Yomitan, Textractor, OCR, Anki add-ons)

**Files:**
- Author `catalog.json` in the catalog repo; mirror into `catalogFallback.ts`.
- New `src/renderer/components/resources/BundleCard.tsx` + `BundleDetail.tsx` — no router; `selectedBundle` useState in ResourcesView (same sub-screen pattern as NovelsView → NovelReader).
- Checklist ticks in localStorage via `src/renderer/storage/storage.ts`, key `resources.checklist.<bundleId>`.
- Gem accent via CSS var `--bundle-accent` from `bundle.color`; extend existing Aero styles.

**Verify:** 10 bundles render + open; links via `window.api.openExternal`; checkboxes persist across relaunch; works offline from cache.

---

## Phase 3 — "New & promising" section + catalogue expansion (research phase)

- Curate ~20–30 entries: active GitHub projects (mokuro, asbplayer, memento, JL, exSTATic, lute-v3, jpdb tools) + practical Chinese/Russian tools; each with `addedAt` → "NEW" badge if <30 days old.
- `ResourcesView.tsx`: render newSection sorted by addedAt desc, badge, empty state.
- `src/renderer/data/resources.ts`: expand existing categories (+~30 entries) — remains the bundled always-available core.

**Verify:** badge logic; edit JSON on github.com → Refresh → change appears.

---

## Phase 4 — "Collect tool" from Immersion browser + My Tools

- New `src/shared/collectedTools.ts`: `CollectedTool { id, name, url, note?, tags?, favicon?, addedAt, source: 'app' | 'extension' }` (`source` future-proofs the Chrome extension), `CollectedToolsStore { version: 1; tools: [] }`.
- New `src/main/collectedTools.ts` — clone `src/main/immersion/index.ts` store pattern (`userData/collected-tools.json`, atomic write). IPC: `tools:list/add/remove/update`; dedupe by normalized URL.
- `src/preload.ts` + types: expose the four calls.
- `src/renderer/views/ImmersionView.tsx`: star/"Save as tool" toolbar button (reuse current webview URL/title reads next to saved-sites control); toast; "already saved" state.
- `src/renderer/views/ResourcesView.tsx`: "My tools" section (only when non-empty), remove + edit note.
- i18n keys.

**Verify:** save from Immersion → appears in Resources; survives relaunch; duplicate save no-op; remove works.

---

## Phase 5 — Novels bulk import (remote levelled novels catalogue)

1. **Offline build script** `tools/build-novels-catalog.mjs` (run manually, not app code):
   - Ingest community jpdb.io difficulty-list exports/CSVs from GitHub (search during implementation); Natively levels only if a ToS-friendly community CSV exists, else skip.
   - Map difficulty scores → the app's existing scale (Beginner..Very Hard + JLPT) — verify exact `Novel` field names in `src/renderer/data/novels.ts` first.
   - Replicate novels.ts's Aozora/BookWalker/Wikipedia search-URL builders inside the script so output is plain data.
2. Output `novels.json` → catalog repo.
3. App: extend `src/main/resourcesCatalog.ts` with `novels:get` / `novels:refresh` (same cache pattern, `novels-catalog.json`); `NovelsView.tsx` merges bundled core + remote (dedupe by title+author), Refresh button, count badge.

**Verify:** script output passes a vitest schema check; merged list renders; difficulty filters still work; offline → bundled list; spot-check 10 links.

---

## Phase 6 — Download heat map + consent + Cloudflare Worker (HARDEST, LAST)

### 6a. Cloudflare Worker (free tier, copy-paste)
1. Sign up at dash.cloudflare.com → `npm i -g wrangler` → `wrangler login`.
2. `mkdir jp-study-pings && cd jp-study-pings && wrangler init --yes`.
3. `wrangler kv namespace create COUNTS` → paste binding into `wrangler.toml`.
4. Worker (`src/index.ts`): `POST /ping` reads `CF-IPCountry` header only (IP never read/stored), increments KV counter; `GET /counts` returns `{ "JP": 12, "US": 40, ... }`:

```ts
export interface Env { COUNTS: KVNamespace }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST',
  'content-type': 'application/json',
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'POST' && url.pathname === '/ping') {
      // Country only. IP is never read or stored.
      const country = req.headers.get('CF-IPCountry') ?? 'XX';
      if (!/^[A-Z]{2}$/.test(country)) return new Response('{"ok":true}', { headers: CORS });
      const cur = parseInt((await env.COUNTS.get(country)) ?? '0', 10);
      await env.COUNTS.put(country, String(cur + 1));
      return new Response('{"ok":true}', { headers: CORS });
    }
    if (req.method === 'GET' && url.pathname === '/counts') {
      const list = await env.COUNTS.list();
      const out: Record<string, number> = {};
      for (const k of list.keys) out[k.name] = parseInt((await env.COUNTS.get(k.name)) ?? '0', 10);
      return new Response(JSON.stringify(out), { headers: CORS });
    }
    return new Response('not found', { status: 404 });
  },
};
```

5. `wrangler deploy` → `https://jp-study-pings.<account>.workers.dev`; test with curl.

Free-tier fit: ping once per install, counts once per launch — far under 100k req/day + 1k KV writes/day. Rare lost increments from non-atomic KV are acceptable for a fun map.

### 6b. Consent flow (first launch, before shell)
- New `src/renderer/components/ConsentScreen.tsx` styled like `BootScreen.tsx`, mounted in `App.tsx` after BootScreen, shown only when localStorage `jp-telemetry-consent` unset. Buttons: "Share my country (anonymous)" / "No thanks". Plain-language copy: one request, country derived from connection by Cloudflare, no IP or ID stored.
- Accept → consent=yes, one `stats:ping`, set `jp-telemetry-pinged`. Decline → never ping. Settings toggle in `SettingsView.tsx` (turning on pings once if never pinged).
- New `src/main/stats.ts` (release.ts pattern): `stats:ping` (fire-and-forget POST), `stats:counts` (GET, cache to `userData/download-stats.json`, return cache on failure). Constants in `src/shared/stats.ts`; expose in preload.

### 6c. Heat map rendering (zero new runtime deps)
- Vendor one static file `src/renderer/data/worldMapPaths.ts`: `{ iso2: svgPathD }` pre-simplified from Natural Earth 110m (or the MIT data file from react-svg-worldmap), ~60–90 KB.
- New `src/renderer/components/resources/WorldHeatMap.tsx`: single `<svg>`, each country `<path>` filled by a 5-step log-scale ramp of the app accent color; hover tooltip (country + count). No d3, no animation loop → low-resource.
- Embed as the greeting/header of ResourcesView: "Learners in N countries". `/counts` is anonymous so the map may fetch regardless of consent — consent gates only the ping.

**Verify:** clear localStorage → consent appears once; accept → exactly one POST (`wrangler tail`); decline → zero POSTs; map colors match counts; offline renders cached map; Settings toggle works.

---

## Brainstorm: 10 medium/hard future features (not implemented now)

1. **Resource health checker** — monthly HEAD-check of every catalogue URL; flag dead links (plus a GitHub Action in the catalog repo).
2. **Personal ratings + "my stack"** — star resources; export a shareable "my learning stack" card as PNG.
3. **Checklist → study-plan generator** — 5 questions (level, goals, hours/week) auto-assemble a personalized checklist from bundle items.
4. **In-app resource previews** — hover cards with cached screenshots/OpenGraph data fetched by main process.
5. **Chrome extension "collect" companion** — MV3 extension posting the current tab via a `jp-study://collect?url=` deep link.
6. **Suggest-a-resource in-app** — pre-filled GitHub issue/PR against the catalog repo.
7. **Usage-aware suggestions** — cross-reference mining stats / flashcard maturity to surface bundles matching the user's real level ("you're ~N4, try these").
8. **Offline resource vault** — snapshot key reference pages (Tae Kim, Sakubi) into the Library via existing `readabilityExtract.ts`.
9. **Gamified bundle completion** — finishing a bundle's checklist awards the gem on a collectible shelf; its creature "hatches".
10. **Multi-language catalog namespaces** — schema v2 with per-language trees (ja/zh/ru), language filter chips, per-language "New" feeds.

## Phase order recap
0 version+types → 1 remote plumbing → 2 bundles+checklists → 3 New section+expansion → 4 collect tool → 5 novels bulk import → 6 heat map+consent+Worker (hardest last).



# Resources App 1.01 Overhaul — Phased Implementation Plan

Target: `C:\Users\Arseniy\Projects\jp-study-app` (Electron Forge + Vite + React 19, no router, OS-shell UI).
Version bump: `package.json` "version": "1.0.0" -> "1.0.1" (SemVer-safe form of "1.01"; display as "1.01" in UI strings if desired).

**Hardest-last decision:** the download heat map (Phase 6) goes last, and it is *harder than* the novels bulk import (Phase 5). Justification: the heat map is the only piece with an external backend (Cloudflare Worker + KV + wrangler deployment by a user with zero backend experience), a privacy/consent UX, and a new rendering problem (SVG choropleth). Novels bulk import is tedious data work but stays entirely inside patterns the app already has (static/remote JSON + existing NovelsView). Also, the remote-catalogue plumbing built in Phase 1 is reused by phases 2-5, so the backend work benefits from landing after everything else is stable.

---

## Phase 0 — Version bump + groundwork (30 min)

**Goal:** version 1.0.1, shared types for the remote catalogue, no behavior change.

**Files:**
- Modify `package.json`: version -> `1.0.1`.
- Create `src/shared/resourcesCatalog.ts` — shared types + remote catalogue URL constants (mirrors `src/shared/release.ts` style):

```ts
export const CATALOG_BASE =
  'https://raw.githubusercontent.com/vasars2024-hub/jp-study-app-catalog/main';
export const CATALOG_URL = `${CATALOG_BASE}/catalog.json`;

export type Cost = 'Free' | 'Freemium' | 'Paid';
export interface CatalogResource { name: string; url: string; description: string; cost: Cost; tags?: string[]; }
export interface ChecklistItem { id: string; text: string; url?: string; }
export interface Bundle {
  id: string;               // 'sapphire', 'dragon', ...
  gem: string;              // display name: 'Sapphire'
  creature?: string;        // optional creature pairing
  color: string;            // accent hex for the card
  icon: string;             // key into the icon set ResourcesView already uses
  title: string;            // 'Flashcards & SRS'
  blurb: string;
  items: CatalogResource[];
  checklist?: ChecklistItem[];
}
export interface NewEntry extends CatalogResource { addedAt: string; source?: 'github' | 'web'; lang?: string[]; }
export interface ResourcesCatalog {
  schemaVersion: 1;
  updatedAt: string;
  bundles: Bundle[];
  newSection: NewEntry[];
  categories?: { id: string; icon: string; title: string; blurb: string; items: CatalogResource[] }[]; // optional remote additions to the static category list
}
```

**Verify:** `npm run lint && npm test`, app starts (`npm start`), version shows 1.0.1.

---

## Phase 1 — Remote catalogue plumbing (fetch + userData cache + refresh)

**Goal:** app fetches `catalog.json` from GitHub at launch and via a "Refresh" button; cached in userData; works offline from cache; bundled fallback so a first offline launch still shows something.

**Backend-free hosting:** create a public GitHub repo `vasars2024-hub/jp-study-app-catalog` containing `catalog.json` (and later `novels.json`). Editing the JSON on github.com updates every installed app with no app release. (Raw URLs refresh within ~5 min of CDN cache; acceptable.)

**Files:**
- Create `src/main/resourcesCatalog.ts` (pattern: copy `src/main/release.ts` fetch style — AbortController 15s timeout, User-Agent header, return null on failure; and `src/main/immersion/index.ts` loadSites/saveSites JSON-in-userData pattern):
  - `catalog:get` IPC — return cached catalog from `path.join(app.getPath('userData'), 'resources-catalog.json')` if present, else null.
  - `catalog:refresh` IPC — fetch CATALOG_URL, validate `schemaVersion === 1`, write cache atomically (temp file then rename, as the immersion store does), return parsed catalog.
  - Register alongside the other `register*Ipc` calls (grep `registerReleaseIpc(` in the main entry and add next to it).
- Modify `src/preload.ts`: add `catalogGet: () => ipcRenderer.invoke('catalog:get')` and `catalogRefresh` next to `openExternal` (line ~381); extend the `window.api` type declaration (grep for where the api type is declared).
- Create `src/renderer/data/catalogFallback.ts`: a small bundled ResourcesCatalog (10 bundle skeletons, empty newSection) so the UI never renders empty.
- Modify `src/renderer/views/ResourcesView.tsx`: on mount `catalogGet()` -> state; fire-and-forget `catalogRefresh()` in background, update state on resolve; Refresh button (spinner while pending, "updated / cached" hint). Keep the existing static RESOURCES categories; append remote `categories` extras after them.
- i18n: add keys to `src/shared/i18n/catalogs.ts` (refresh, updated, offline-cached).

**Caching strategy:** single JSON file in userData; overwrite only on successful refresh; never delete on failed fetch; renderer keeps last catalog in memory. No TTL — refresh on every launch (~10-50 KB) plus the manual button.

**Verify:** launch online -> cache file appears under the userData dir; disconnect network, relaunch -> cached data renders; delete cache + offline -> fallback renders; Refresh works. Add a vitest schema-validation test in `src/shared/__tests__`.

---

## Phase 2 — Gem/creature bundles UI + checklist research

**Goal:** >=10 themed bundles with checklists rendered as an attractive section at the top of ResourcesView.

**Research step (during implementation, before authoring catalog.json):** use WebSearch/WebFetch to compile beginner checklists and resource lists from: r/LearnJapanese wiki & starter's guide, TheMoeWay (learnjapanese.moe), Refold roadmap, itazuraneko / "learn japanese toolbox" lists, Tofugu's guide. Distill into checklist items (short imperative text + optional URL). Lighter pass for Chinese (Heavenly Path, r/ChineseLanguage) and Russian.

**The 10 bundles (proposal — adjust freely):**
1. **Sapphire** (Whale) — Flashcards & SRS (Anki, AnkiWeb, FSRS, jpdb, Kitsun)
2. **Ruby** (Phoenix) — Kanji & writing (WaniKani, KanjiStudy, RTK/RRTK, Ringotan)
3. **Emerald** (Serpent) — Grammar (Bunpro, Cure Dolly, Tae Kim, Imabi, Sakubi, DoJG)
4. **Amber** (Fox) — Listening & audio (Nihongo con Teppei, condensed audio, YouGlish, podcasts)
5. **Opal** (Owl) — Reading & immersion (Tadoku, NHK Easy, ttsu reader, Mokuro, asbplayer)
6. **Dragon** (Dragon) — Chinese (Pleco, HackChinese, DuChinese, Heavenly Path, Dot)
7. **Amethyst** (Bear) — Russian (graded readers, learner resources)
8. **Pearl** (Crane) — Beginner Japanese checklist bundle (kana -> core deck -> grammar guide -> first immersion; the researched checklist lives here)
9. **Topaz** (Tiger) — Output & speaking (HelloTalk, iTalki, VRChat JP, LangCorrect, shadowing)
10. **Obsidian** (Wolf) — Tools & tech (Yomitan, Textractor, OCR, Anki add-ons, GoldenDict)

**Files:**
- Author `catalog.json` in the catalog repo; mirror the same content into `catalogFallback.ts`.
- Create `src/renderer/components/resources/BundleCard.tsx` and `BundleDetail.tsx` (no router: a `selectedBundle` useState in ResourcesView, same pattern as NovelsView -> NovelReader sub-screen switching).
- Checklist persistence: localStorage via existing helpers in `src/renderer/storage/storage.ts`, key `resources.checklist.<bundleId>`.
- CSS: extend ResourcesView's Aero styles; gem accent via a CSS variable `--bundle-accent` set inline from `bundle.color`.

**Verify:** all 10 bundles render, open, links open externally via `window.api.openExternal`, checkboxes persist across relaunch, works from cache offline.

---

## Phase 3 — "New" section + general catalogue expansion

**Goal:** a "New & promising" strip (remote `newSection`) plus expansion of the static `resources.ts` categories.

**Research step:** curate ~20-30 entries: active GitHub projects (mokuro, asbplayer, memento, JL, exSTATic, lute-v3, jpdb tools, Migaku alternatives) + practical tools for Chinese/Russian. Each NewEntry gets `addedAt` so the UI can show a "NEW" badge for entries <30 days old.

**Files:**
- Modify `src/renderer/views/ResourcesView.tsx`: render newSection sorted by addedAt desc, badge, empty state.
- Modify `src/renderer/data/resources.ts`: expand existing categories (+~30 entries) — stays bundled as the always-available core.
- Update `catalog.json` in the repo.

**Verify:** badge logic (fake a recent date); edit JSON on github.com, hit Refresh, see the change appear.

---

## Phase 4 — Personal tools collection + Immersion "collect" button

**Goal:** one-click "save this site as a tool" from the Immersion browser; "My tools" section in ResourcesView. Chrome extension deferred, but schema includes `source: 'app' | 'extension'` so it's ready.

**Files:**
- Create `src/shared/collectedTools.ts`: `CollectedTool { id, name, url, note?, tags?, favicon?, addedAt, source }`, `CollectedToolsStore { version: 1; tools: CollectedTool[] }`.
- Create `src/main/collectedTools.ts`: clone the `src/main/immersion/index.ts` loadSites/saveSites pattern (userData JSON `collected-tools.json`, atomic write). IPC: `tools:list`, `tools:add` (dedupe by normalized URL), `tools:remove`, `tools:update`.
- Modify `src/preload.ts` + api types: expose the four calls.
- Modify `src/renderer/views/ImmersionView.tsx`: bookmark/star "Save as tool" button in the toolbar next to the existing saved-sites control (reuse how it reads current webview URL/title); toast on save; toggled "saved" state if the URL is already collected.
- Modify `src/renderer/views/ResourcesView.tsx`: "My tools" section (shown only when non-empty) with remove + edit-note.
- i18n keys in `src/shared/i18n/catalogs.ts`.

**Verify:** browse a site in Immersion, click save, it appears in Resources; survives relaunch; duplicate save is a no-op; remove works.

---

## Phase 5 — Novels bulk import / remote novels catalogue

**Goal:** expand novels far beyond the 3177-line `novels.ts` via community difficulty-graded lists, served as remote JSON.

**Approach:**
1. **Offline build script** `tools/build-novels-catalog.mjs` (one-time tool run manually, NOT app code):
   - jpdb difficulty list: use a community GitHub export/CSV of jpdb.io novel difficulty rankings (search "jpdb difficulty list github" during implementation) — title, author, difficulty score.
   - Natively (learnnatively.com) levels: no public API; use a community-shared CSV if available, otherwise skip (ToS-friendly) and rely on jpdb + manual curation.
   - Map difficulty score -> the app's existing scale (Beginner..Very Hard + JLPT) — verify field names against the actual Novel type in `src/renderer/data/novels.ts` and thresholds in `src/shared/levelScale.ts` before writing the script.
   - Replicate the Aozora/BookWalker/Wikipedia search-URL builders from `novels.ts` inside the script so output entries are plain data.
2. Output `novels.json` -> commit to the catalog repo.
3. **App side:** extend `src/main/resourcesCatalog.ts` with `novels:get` / `novels:refresh` (same cache pattern, file `novels-catalog.json`); modify `src/renderer/views/NovelsView.tsx` to merge bundled `novels.ts` (curated core) + remote catalog (dedupe by title+author), with a Refresh button and a count badge.

**Files:** `tools/build-novels-catalog.mjs` (new), `src/main/resourcesCatalog.ts`, `src/shared/resourcesCatalog.ts` (NovelEntry type), `src/renderer/views/NovelsView.tsx`, `src/preload.ts`.

**Verify:** script output passes a vitest schema check; NovelsView shows merged list; filters/difficulty facets still work; offline falls back to bundled list; spot-check 10 random entries' links.

---

## Phase 6 — Download heat map + consent flow + Cloudflare Worker (HARDEST, LAST)

### 6a. Cloudflare Worker (free tier) — copy-paste steps

1. Sign up at dash.cloudflare.com (free). `npm i -g wrangler`, then `wrangler login` (opens browser).
2. `mkdir jp-study-pings && cd jp-study-pings && wrangler init --yes` (plain Hello World worker).
3. Create KV: `wrangler kv namespace create COUNTS` -> paste the printed binding into `wrangler.toml`:

```toml
name = "jp-study-pings"
main = "src/index.ts"
compatibility_date = "2026-07-01"
[[kv_namespaces]]
binding = "COUNTS"
id = "<printed id>"
```

4. `src/index.ts`:

```ts
export interface Env { COUNTS: KVNamespace }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST',
  'content-type': 'application/json',
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'POST' && url.pathname === '/ping') {
      // Country only. IP is never read or stored.
      const country = req.headers.get('CF-IPCountry') ?? 'XX';
      if (!/^[A-Z]{2}$/.test(country)) return new Response('{"ok":true}', { headers: CORS });
      const cur = parseInt((await env.COUNTS.get(country)) ?? '0', 10);
      await env.COUNTS.put(country, String(cur + 1));
      return new Response('{"ok":true}', { headers: CORS });
    }
    if (req.method === 'GET' && url.pathname === '/counts') {
      const list = await env.COUNTS.list();
      const out: Record<string, number> = {};
      for (const k of list.keys) out[k.name] = parseInt((await env.COUNTS.get(k.name)) ?? '0', 10);
      return new Response(JSON.stringify(out), { headers: CORS });
    }
    return new Response('not found', { status: 404 });
  },
};
```

5. `wrangler deploy` -> URL like `https://jp-study-pings.<account>.workers.dev`. Test: `curl -X POST .../ping` then `curl .../counts`.

Free-tier fit: 100k req/day, KV 1k writes/day — pings happen once per install, counts fetched once per launch: trivially within limits. KV writes aren't atomic (rare lost increments) — fine for a fun heat map. Cache `/counts` in userData so the map renders offline.

### 6b. Consent flow (first launch, before shell)

- Create `src/renderer/components/ConsentScreen.tsx`, styled like `src/renderer/components/BootScreen.tsx` and mounted in `src/renderer/App.tsx` right after BootScreen; shown only if localStorage `jp-telemetry-consent` is unset. Two buttons: "Share my country (anonymous)" / "No thanks". Plain-language copy: one request; Cloudflare derives country from the connection; no IP or ID is ever stored; happens once.
- On accept: consent='yes', call `stats:ping` once, set `jp-telemetry-pinged=1`. On decline: consent='no', never ping. Add a Settings toggle in `SettingsView.tsx` (switching to yes pings once if never pinged).
- Create `src/main/stats.ts` (release.ts fetch pattern): `stats:ping` (POST /ping, fire-and-forget, swallow errors), `stats:counts` (GET /counts, cache to userData `download-stats.json`, return cache on failure). Constants in `src/shared/stats.ts`. Expose both in `src/preload.ts`.

### 6c. Heat map (lightest approach — no d3, no runtime topojson)

Vendor a single static file `src/renderer/data/worldMapPaths.ts`: `{ [iso2]: string }` of pre-simplified SVG path `d` strings (generate once from Natural Earth 110m with a throwaway script, or reuse the MIT-licensed data file from `react-svg-worldmap`; ~60-90 KB). Render:

```tsx
<svg viewBox="0 0 1010 666">{Object.entries(paths).map(([iso, d]) =>
  <path key={iso} d={d} fill={colorFor(counts[iso] ?? 0)} />)}</svg>
```

`colorFor` = 5-step log-scale opacity ramp of the app accent color. Hover tooltip: country name + count. Zero new dependencies, single render, no animation loop -> low-resource.

- Create `src/renderer/components/resources/WorldHeatMap.tsx`; embed in the greeting/header area of ResourcesView with a caption like "Learners in N countries". Note: the `/counts` GET is anonymous, so it may be fetched regardless of consent — consent gates only the *ping*.

**Verify:** clear localStorage -> consent screen appears once; accept -> exactly one POST (check `wrangler tail`); decline -> zero POSTs; map colors match counts; offline launch renders cached map; Settings toggle works.

---

## 10-feature brainstorm (medium/hard, not implemented now)

1. **Resource health checker** — background job HEADs every catalogue URL monthly and flags dead links (plus a GitHub Action in the catalog repo).
2. **Personal ratings + "my stack"** — star resources, export a shareable "my learning stack" card as PNG.
3. **Checklist -> study-plan generator** — 5 questions (level, goals, hours/week) auto-assemble a personalized checklist from bundle items.
4. **In-app resource previews** — hover cards with cached screenshots/OpenGraph data fetched by the main process.
5. **Chrome extension "collect" companion** — MV3 extension posting the current tab to a localhost endpoint or `jp-study://collect?url=` deep link.
6. **Suggest-a-resource from inside the app** — pre-filled GitHub issue/PR against the catalog repo.
7. **Usage-aware suggestions** — cross-reference mining stats / flashcard maturity to surface bundles matching the user's actual level ("you're ~N4, try these").
8. **Offline resource vault** — snapshot key reference pages (Tae Kim, Sakubi) into the Library via existing readabilityExtract.ts.
9. **Gamified bundle completion** — finishing a bundle's checklist awards the gem on a collectible shelf; the paired creature "hatches".
10. **Multi-language catalog namespaces** — schema v2 with per-language trees (ja/zh/ru), language filter chips, per-language "New" feeds.

---

## Phase order recap
0 version+types -> 1 remote catalogue plumbing -> 2 bundles+checklists (research) -> 3 New section+expansion (research) -> 4 collect tool -> 5 novels bulk import -> 6 heat map+consent+Worker (hardest last).

Each phase is independently shippable; run `npm run lint`, `npm test`, and an `npm start` smoke-test after every phase.

