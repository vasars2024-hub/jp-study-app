/**
 * Subtitle harvest — Japanese subs for a catalogue entry, without the video.
 *
 * `subtitleDiscovery.ts` next door answers "what subs match this file on disk".
 * This answers "what subs exist for this AniList id", which is a different
 * question with a different key and no local media at all. They share the
 * provider clients and the credential store; nothing else.
 *
 * Jimaku only, deliberately. It keys off an AniList id, so a hit is exact
 * rather than a title guess, and it is Japanese-only — which is the whole point
 * for a learner mining vocabulary. OpenSubtitles would add fuzzy title matching
 * and a language filter to get the same result worse.
 *
 * ---------------------------------------------------------------------------
 * THE RENDERER NEVER SEES A URL.
 *
 * `jimakuSearch` hands back a `fetchToken`, which is a CDN address. Passing
 * that to the renderer and taking it back on the fetch call would mean main
 * fetching whatever address the renderer asked for. Instead the candidates stay
 * here in `catalogue`, keyed by their provider-scoped id, and the renderer
 * exchanges ids. Main can only ever fetch something it listed itself.
 * ---------------------------------------------------------------------------
 */

import { ipcMain } from 'electron';
import {
  fetchSubtitleCandidate,
  hasSubtitleProviderKey,
  jimakuSearchDetailed,
  type ProviderSubtitleCandidate,
} from './subtitleProviderClients';
import {
  emptyRankDrops,
  nyaaAvailability,
  nyaaFetchAll,
  nyaaSearch,
  nyaaSearchDetailed,
  rememberNyaaCandidates,
  takeRememberedNyaaCandidate,
} from './subtitleNyaaSource';
import { asNyaaAcquisitionConfig, describeEmptyNyaaListing } from '../shared/subtitleNyaa';
import { harvestParentTitle, harvestSearchAliases } from '../shared/subtitleHarvest';
import { readMalLibrary } from './malLibrary';
import { malLibraryKey } from '../shared/malLibrary';
import type {
  HarvestNyaaFetchResult,
  HarvestNyaaListInput,
  HarvestNyaaListResult,
  HarvestNyaaOffer,
  HarvestFileCandidate,
  SubtitleHarvestFetchResult,
  SubtitleHarvestListInput,
  SubtitleHarvestListResult,
} from '../shared/subtitleHarvest';

/**
 * Listed candidates, so a fetch can name one by id.
 *
 * Bounded and FIFO: a session that browses many shows must not grow this
 * without limit, and the only thing lost by eviction is the ability to fetch
 * from a listing the user has long since navigated away from.
 */
const catalogue = new Map<string, ProviderSubtitleCandidate>();
const CATALOGUE_LIMIT = 4_000;

function remember(candidates: readonly ProviderSubtitleCandidate[]): void {
  for (const candidate of candidates) catalogue.set(candidate.providerItemId, candidate);
  if (catalogue.size <= CATALOGUE_LIMIT) return;
  for (const key of [...catalogue.keys()].slice(0, catalogue.size - CATALOGUE_LIMIT)) {
    catalogue.delete(key);
  }
}

/**
 * Between fetches, in ms.
 *
 * Explicit because this is not a scrape job: `scraperRequest`'s safety policy
 * only applies under a scrape runtime (`main/scraper/http.ts:580-581`), so
 * nothing else paces these. A 24-episode season is 24 requests to a small
 * community-run service, and firing them at once is the behaviour that gets an
 * app blocked. Same reasoning as the AniList schedule reader in C1-3.
 */
const FETCH_PACING_MS = 400;

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

/**
 * MAL id → AniList id.
 *
 * Discover prefers Jikan for anime because its episode catalogue is richer, so
 * most candidates arrive with a MAL id and no AniList id — and Jimaku only keys
 * on the latter. Without this hop every MyAnimeList entry would silently fall
 * back to a fuzzy title search, which is the difference between one answer and
 * a guess.
 *
 * Deliberately NOT `main/scraper/catalogue.ts`'s copy of this query: that one
 * runs through `scraperRequest`, whose safety policy only applies under a scrape
 * runtime, and borrowing it would couple the subtitle system to the scraper's
 * job machinery for one id lookup.
 */
const ANILIST_GRAPHQL = 'https://graphql.anilist.co';
const anilistByMal = new Map<number, number | null>();

/**
 * `down` separates "AniList could not answer" from "AniList says there is no
 * mapping". Both leave the caller on the title path, but only the first is
 * temporary, and telling the user which one they hit is the difference between
 * "try again later" and "this title is not on AniList".
 *
 * Measured 2026-08-16: the endpoint returns **403 "The AniList API has been
 * temporarily disabled due to severe stability issues"** for every query, so
 * `down` is the live case, not the rare one.
 */
interface AnilistResolution { id: number | null; down: boolean }

async function resolveAnilistId(malId: number): Promise<AnilistResolution> {
  const cached = anilistByMal.get(malId);
  if (cached !== undefined) return { id: cached, down: false };
  try {
    const response = await fetch(ANILIST_GRAPHQL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        query: 'query ($idMal: Int) { Media(idMal: $idMal, type: ANIME) { id } }',
        variables: { idMal: malId },
      }),
    });
    if (!response.ok) {
      // Not cached: a 429 or a blip is not evidence the mapping does not exist,
      // and caching it would make one bad minute permanent for that title.
      return { id: null, down: true };
    }
    const body = await response.json() as {
      data?: { Media?: { id?: number } };
      errors?: unknown[];
    };
    // A 200 carrying `errors` is how GraphQL reports its own failures, and
    // reading that as "no mapping" would cache an outage as a fact.
    if (Array.isArray(body?.errors) && body.errors.length) return { id: null, down: true };
    const id = body?.data?.Media?.id ?? null;
    anilistByMal.set(malId, id);
    return { id, down: false };
  } catch {
    return { id: null, down: true };
  }
}

export async function listSubtitleHarvest(
  input: SubtitleHarvestListInput,
): Promise<SubtitleHarvestListResult> {
  const title = (input.title ?? '').trim();
  let anilistId = Number.isInteger(input.anilistId) && (input.anilistId ?? 0) > 0
    ? (input.anilistId as number)
    : undefined;
  let idLookupDown = false;
  const blank = {
    matchedBy: null, entry: null, idLookupDown: false, jimakuDown: false,
    rejectedEntry: null, nyaa: null,
  } as const;

  if (!anilistId && !title && !input.malId) {
    return {
      ok: false,
      needsKey: false,
      files: [],
      message: 'No AniList id and no title to search with.',
      ...blank,
    };
  }
  // Distinguished from "no results" on purpose: a missing key is a thing the
  // user can fix, and reporting it as an empty list sends them looking for a
  // show that is actually there.
  if (!hasSubtitleProviderKey('jimaku')) {
    return {
      ok: false,
      needsKey: true,
      files: [],
      message: 'Jimaku needs an API key before it will answer. Add one in Settings → Scraper → Subtitle providers.',
      ...blank,
    };
  }

  // A MAL candidate is put on the id path before the title fallback is
  // considered; failing that, `jimakuSearch` still has the title to try.
  if (!anilistId && input.malId) {
    const resolved = await resolveAnilistId(input.malId);
    anilistId = resolved.id ?? undefined;
    idLookupDown = resolved.down;
  }

  try {
    // `null` episode asks for the whole entry, which is what lets one request
    // serve both "episodes 20-24" and "the whole season" — the choosing is
    // `planSubtitleHarvest`'s job, not the network's.
    let match = await jimakuSearchDetailed(anilistId, title, null);

    // An OVA/special/recap is usually filed under its season, not under its own
    // id, so the derivative's lookup dead-ends on a title the catalogue does
    // cover. Tried only when the primary found nothing and Jimaku answered —
    // during an outage there is no "nothing" to fall back from — and the hit is
    // reported through the ordinary title-match path, so the panel's existing
    // "check this is the right show" warning names the parent it used.
    if (!match.candidates.length && !match.down) {
      const parent = harvestParentTitle(title);
      if (parent) {
        // No id is passed, so `jimakuSearchDetailed` stamps `basis: 'title'`
        // itself — the warning path is a property of the call, not an override.
        const viaParent = await jimakuSearchDetailed(undefined, parent, null);
        if (viaParent.candidates.length) match = viaParent;
      }
    }

    remember(match.candidates);
    const files: HarvestFileCandidate[] = match.candidates.map((candidate) => ({
      id: candidate.providerItemId,
      name: candidate.releaseName,
      format: candidate.format,
    }));
    // An outage is reported as an outage. The nyaa fallback is still offered —
    // a user who wants to go that way should not have to wait out a rate limit
    // — but the sentence above it no longer claims Jimaku filed nothing.
    const emptyMessage = match.down
      ? `Jimaku did not answer${match.downStatus ? ` (HTTP ${match.downStatus})` : ''}, so this is not an answer about the title. Try again in a moment.`
      : match.rejectedEntry
        ? `Jimaku has entries, but none of them is this title — the closest was "${match.rejectedEntry}". It may be filed under another name.`
        : 'Jimaku has no Japanese subtitles filed for this title.';
    return {
      ok: true,
      needsKey: false,
      files,
      message: files.length ? '' : emptyMessage,
      matchedBy: match.entry ? match.basis : null,
      entry: match.entry,
      idLookupDown,
      jimakuDown: match.down,
      rejectedEntry: match.rejectedEntry,
      // Only when Jimaku covered nothing. Computing it on every listing would
      // put a torrent provider in front of a user who already has what they
      // asked for, and nyaa ships default-disabled and last for that reason.
      nyaa: files.length ? null : await describeNyaaFallback(input.acquisition),
    };
  } catch (error) {
    return {
      ok: false,
      needsKey: false,
      files: [],
      message: error instanceof Error ? error.message : String(error),
      matchedBy: null,
      entry: null,
      idLookupDown,
      // A throw out of the client is the same class of thing as a bad status:
      // nothing here is a statement about the catalogue.
      jimakuDown: true,
      rejectedEntry: null,
      nyaa: await describeNyaaFallback(input.acquisition),
    };
  }
}

/**
 * Whether the nyaa fallback could run, in nyaa's own words.
 *
 * Reuses `nyaaAvailability` rather than re-deriving the conditions: its five
 * refusals are measured behaviour that P6 already leans on, and a second
 * opinion here could tell the user the fallback is available while the fetch
 * path refuses it.
 */
async function describeNyaaFallback(acquisition: unknown): Promise<HarvestNyaaOffer> {
  const available = await nyaaAvailability(asNyaaAcquisitionConfig(acquisition));
  return available.ok
    ? { available: true, reason: null, detail: '' }
    : { available: false, reason: available.reason, detail: available.detail };
}

/**
 * Exchange ids for subtitle text.
 *
 * A file that fails comes back with `text: null` rather than throwing the whole
 * batch away — losing 23 episodes because the 24th 404s is not an improvement
 * on losing one.
 */
export async function fetchSubtitleHarvest(ids: readonly string[]): Promise<SubtitleHarvestFetchResult> {
  const files: SubtitleHarvestFetchResult['files'] = [];
  let first = true;
  for (const id of ids) {
    const candidate = catalogue.get(id);
    if (!candidate) {
      files.push({ id, text: null, error: 'That subtitle is no longer in this session’s listing.' });
      continue;
    }
    if (!first) await sleep(FETCH_PACING_MS);
    first = false;
    try {
      const text = await fetchSubtitleCandidate(candidate);
      files.push(text
        ? { id, text, error: '' }
        : { id, text: null, error: 'The provider returned no content.' });
    } catch (error) {
      files.push({ id, text: null, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { files };
}

// ---------------------------------------------------------------- nyaa ---
//
// The fallback the panel could previously only name. `describeNyaaFallback`
// above answers "could this run"; these two answer "run it".
//
// Deliberately not routed through `subtitleDiscovery.ts`'s pair, even though
// the acquisition underneath is the same: those refuse anything
// `host.listItems()` does not hold, because their job ends in a
// `SubtitleRecord` attached to a file on disk. A harvest has no file and wants
// no record — it wants the text — so the media item is the one thing it cannot
// supply. `nyaaSearch` only ever used `mediaId` to look a title up, and
// `nyaaFetchAll` never sees one.

/** What one synced MAL row tells a harvest about the work it is searching for. */
interface StoredMalFacts {
  /** Every other name the catalogue publishes, or none. */
  aliases: string[];
  /** Episodes the work has, or null when unknown or still airing. */
  totalEpisodes: number | null;
}

const NO_MAL_FACTS: StoredMalFacts = { aliases: [], totalEpisodes: null };

/**
 * What a synced MAL row says about this work, or nothing.
 *
 * The sync writes `altTitles` for 1,373 of the user's 1,429 rows and, until
 * this call existed, nothing read them back — 41 % of `mal-library.json` was a
 * field with no reader, and the case it was added for still failed from the UI:
 * MAL 2596's `Ghost Hound` reached disk and stopped there.
 *
 * `totalEpisodes` rides along from the same row on purpose. It is the size floor
 * a range listing is judged against, and reading it separately would mean
 * parsing an 806 KB file twice to answer one listing.
 *
 * Anime only, because a nyaa subtitle harvest is about episodes and the library
 * keys manga separately under the same numbers.
 *
 * Never throws: an absent, corrupt or newer-versioned library is no facts at
 * all, and a listing that searches one name is still a listing.
 */
export function storedMalFacts(malId: number | null | undefined): StoredMalFacts {
  if (typeof malId !== 'number' || !Number.isFinite(malId) || malId <= 0) return NO_MAL_FACTS;
  try {
    const wanted = malLibraryKey('anime', malId);
    for (const entry of readMalLibrary().entries) {
      if (malLibraryKey(entry.media, entry.malId) !== wanted) continue;
      // MAL means "still airing" by 0, so it is an unknown count rather than a
      // zero-episode work — and an unknown count must not impose a floor.
      const episodes = entry.totalEpisodes;
      return {
        aliases: (entry.altTitles ?? []).filter((name) => typeof name === 'string' && !!name.trim()),
        totalEpisodes:
          typeof episodes === 'number' && Number.isFinite(episodes) && episodes > 0 ? episodes : null,
      };
    }
  } catch {
    return NO_MAL_FACTS;
  }
  return NO_MAL_FACTS;
}

/**
 * Ranked nyaa releases for a title.
 *
 * Searched with `episode: null` on purpose: a harvest asks for a range, and the
 * releases that can serve a range are the ones that carry it whole. Pinning an
 * episode at search time is what would make a 100-episode request resolve to a
 * single-episode release.
 */
export async function listNyaaHarvest(
  input: HarvestNyaaListInput,
): Promise<HarvestNyaaListResult> {
  const stored = storedMalFacts(input?.malId);
  const aliases = harvestSearchAliases(input?.title ?? '', [
    ...(input?.titles ?? []),
    ...stored.aliases,
  ]);
  if (!aliases.length) {
    return { ok: false, candidates: [], message: 'No title to search the index with.', searchedAs: null };
  }

  const config = asNyaaAcquisitionConfig(input?.acquisition);
  const available = await nyaaAvailability(config);
  // Its own four refusals, not a shrug: "your indexer is off" and "this show has
  // no subtitle releases" are different problems and only one is actionable.
  if (!available.ok || !config) {
    return { ok: false, candidates: [], message: available.ok ? '' : available.detail, searchedAs: null };
  }

  const season = Number.isFinite(input?.season) ? Number(input?.season) : null;
  try {
    // One alias's results win outright, rather than a union of all of them.
    // `nyaaSearch` filters each result against the name it was asked about, so a
    // union would rank releases scored under different titles against each
    // other — and the aliases are names for one work, so a hit is the same show
    // by construction.
    //
    // The walk stops on the first name that finds a **`sub-pack`**, not the
    // first that finds anything. Those are not interchangeable answers to a
    // harvest: a `sub-pack` is subtitles alone, tens of megabytes, while a
    // `batch-sidecar` is the video batch the subtitles are buried in — and this
    // flow exists precisely so the user need not download the video. Measured
    // on the user's own library: `Eureka Seven`'s primary name returns 21 rows,
    // two of which are *Hi-Evolution movie* batches at 21 GB and 43 GB (not even
    // the TV series), so a first-anything break stopped there and never reached
    // `Psalms of Planets Eureka Seven`, the only name carrying the 39.20 MB
    // 50-episode subs-only pack. `Revolutionary Girl Utena` is the same shape
    // behind a 49-row primary.
    //
    // The cost is honest and bounded: a sidecar-only hit now walks to
    // `HARVEST_ALIAS_LIMIT` (4) instead of stopping at 1, so a Route B title
    // spends up to 3 more paced requests. A pack hit — including the ordinary
    // case where the primary title finds one — still costs exactly one request,
    // and a title with no aliases cannot walk at all.
    let found: Awaited<ReturnType<typeof nyaaSearch>> = [];
    let searchedAs: string | null = null;
    // The alias that saw the most of this work, so an empty result reports the
    // richest refusal the walk found rather than the last alias's silence.
    let drops = emptyRankDrops();
    for (const [index, title] of aliases.entries()) {
      if (index) await sleep(FETCH_PACING_MS);
      const { candidates, dropped } = await nyaaSearchDetailed({
        config,
        title,
        season,
        episode: null,
        languages: ['ja'],
        // The listing asks for the whole work at once, so a release that can
        // only hold one episode is not an answer to it.
        episodeCount: stored.totalEpisodes,
      });
      if (dropped.titleMatched > drops.titleMatched) drops = dropped;
      if (!candidates.length) continue;
      const carriesPack = candidates.some((candidate) => candidate.route === 'sub-pack');
      // Earliest name still wins among equals: a later sidecar-only hit never
      // displaces an earlier one, so the fallback is the same release the old
      // break condition would have returned.
      if (!found.length || carriesPack) {
        found = candidates;
        searchedAs = index ? title : null;
      }
      if (carriesPack) break;
    }
    // The one session catalogue in `subtitleNyaaSource`, shared with discovery,
    // so an id listed by either surface is fetchable by either — and the
    // "candidate ids do not survive a restart" trap lives in exactly one place.
    rememberNyaaCandidates(found);
    return {
      ok: true,
      candidates: found.map((candidate) => ({
        id: candidate.providerItemId,
        releaseName: candidate.releaseName,
        route: candidate.route,
        sizeBytes: candidate.sizeBytes,
        seeders: candidate.seeders,
        languages: candidate.language ? [candidate.language] : [],
        score: candidate.score,
        reasons: candidate.reasons,
      })),
      message: found.length ? '' : describeEmptyNyaaListing(drops),
      searchedAs,
    };
  } catch (error) {
    return {
      ok: false,
      candidates: [],
      message: error instanceof Error ? error.message : String(error),
      searchedAs: null,
    };
  }
}

/**
 * Acquires one release and returns every subtitle in it, as text.
 *
 * Nothing is written to the library and no `SubtitleRecord` is created: the
 * caller is mining words, and a record would claim a media item this flow does
 * not have. The transfer itself is real and lands in the user's own
 * qBittorrent under `jp-study-subtitles`, exactly as the discovery path's does.
 */
export async function fetchNyaaHarvest(
  candidateId: string,
  acquisition: unknown,
): Promise<HarvestNyaaFetchResult> {
  const config = asNyaaAcquisitionConfig(acquisition);
  if (!config) return { ok: false, files: [], message: 'No scraper configuration was supplied.' };

  const candidate = takeRememberedNyaaCandidate(typeof candidateId === 'string' ? candidateId : '');
  if (!candidate) {
    return { ok: false, files: [], message: 'That release is no longer in this session’s listing. Search again.' };
  }

  const outcome = await nyaaFetchAll(candidate, config);
  if (!outcome.ok) return { ok: false, files: [], message: outcome.reason };
  return {
    ok: true,
    files: outcome.files.map((file) => ({
      episode: file.episode,
      text: file.text,
      format: file.format,
      fileName: file.fileName,
    })),
    // Empty unless the acquisition came back short. `message` is not only the
    // failure channel: a partial season that says nothing is indistinguishable
    // from a whole one, which is exactly the silent-success shape this flow is
    // meant not to have.
    message: outcome.notice ?? '',
  };
}

/** Test seam — drops the session listing. */
export function resetSubtitleHarvest(): void {
  catalogue.clear();
}

export function registerSubtitleHarvestIpc(): void {
  ipcMain.handle('subtitleHarvest:list', (_event, input: SubtitleHarvestListInput) =>
    listSubtitleHarvest(input ?? { anilistId: null, title: '' }));
  ipcMain.handle('subtitleHarvest:fetch', (_event, ids: string[]) =>
    fetchSubtitleHarvest(Array.isArray(ids) ? ids.slice(0, 200) : []));
  ipcMain.handle('subtitleHarvest:nyaaList', (_event, input: HarvestNyaaListInput) =>
    listNyaaHarvest(input ?? { title: '' }));
  ipcMain.handle('subtitleHarvest:nyaaFetch', (_event, candidateId: string, acquisition: unknown) =>
    fetchNyaaHarvest(candidateId, acquisition));
}
