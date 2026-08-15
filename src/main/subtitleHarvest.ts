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
import type {
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
  const blank = { matchedBy: null, entry: null, idLookupDown: false } as const;

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
    const match = await jimakuSearchDetailed(anilistId, title, null);
    remember(match.candidates);
    const files: HarvestFileCandidate[] = match.candidates.map((candidate) => ({
      id: candidate.providerItemId,
      name: candidate.releaseName,
      format: candidate.format,
    }));
    return {
      ok: true,
      needsKey: false,
      files,
      message: files.length ? '' : 'Jimaku has no Japanese subtitles filed for this title.',
      matchedBy: match.entry ? match.basis : null,
      entry: match.entry,
      idLookupDown,
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
    };
  }
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

/** Test seam — drops the session listing. */
export function resetSubtitleHarvest(): void {
  catalogue.clear();
}

export function registerSubtitleHarvestIpc(): void {
  ipcMain.handle('subtitleHarvest:list', (_event, input: SubtitleHarvestListInput) =>
    listSubtitleHarvest(input ?? { anilistId: null, title: '' }));
  ipcMain.handle('subtitleHarvest:fetch', (_event, ids: string[]) =>
    fetchSubtitleHarvest(Array.isArray(ids) ? ids.slice(0, 200) : []));
}
