// The source registry and its health probes.
//
// Two things live here. The first is a catalogue of the endpoints this app
// actually talks to — the same catalogue APIs, subtitle providers and public
// torrent index the rest of src/main already uses, rather than invented sample
// hosts. The Source Manager seeds itself from it, so what the user reorders is
// a real list.
//
// The second is the probe: one request per source, classified into the health
// vocabulary the UI already renders, with a rolling success history persisted
// so the sparkline survives a restart.

import type { SourceStatus } from '../../shared/scraperResults';
import type {
  ScraperSourceEntry,
  ScraperSourceHealth,
  ScraperSourceKind,
} from '../../shared/scraperSourceSettings';
import { scraperRequest } from './http';
import { scraperLog } from './logBus';
import { readScraperJson, writeScraperJson } from './store';

const HEALTH_FILE = 'source-health.json';
/** How many probe outcomes the sparkline keeps. */
const HISTORY_LENGTH = 20;

interface SourceCatalogueItem {
  id: string;
  label: string;
  host: string;
  kind: ScraperSourceKind;
  /** Path that answers cheaply and proves the API is alive, not just the host. */
  probePath: string;
  requiresAuth: boolean;
  supportsSubtitles: boolean;
}

/**
 * The endpoints the app genuinely integrates with.
 *
 * Metadata and subtitle providers are the ones the scraper's own pipeline
 * calls. Nyaa is listed as a torrent *index* — the Torrent Manager searches its
 * public RSS feed; nothing here resolves or fetches media.
 */
export const SOURCE_CATALOGUE: SourceCatalogueItem[] = [
  {
    id: 'jikan',
    label: 'Jikan (MyAnimeList)',
    host: 'api.jikan.moe',
    kind: 'metadata',
    probePath: '/v4/anime?limit=1',
    requiresAuth: false,
    supportsSubtitles: false,
  },
  {
    id: 'anilist',
    label: 'AniList',
    host: 'graphql.anilist.co',
    kind: 'metadata',
    // GraphQL answers 400 to a bare GET; that still proves it is reachable and
    // is classified as "up" below.
    probePath: '/',
    requiresAuth: false,
    supportsSubtitles: false,
  },
  {
    id: 'animethemes',
    label: 'AnimeThemes',
    host: 'api.animethemes.moe',
    kind: 'metadata',
    probePath: '/anime?page[size]=1',
    requiresAuth: false,
    supportsSubtitles: false,
  },
  {
    id: 'nyaa',
    label: 'Nyaa (torrent index)',
    host: 'nyaa.si',
    kind: 'torrent',
    probePath: '/?page=rss&q=&c=1_2',
    requiresAuth: false,
    supportsSubtitles: true,
  },
  {
    id: 'jimaku',
    label: 'Jimaku (Japanese subtitles)',
    host: 'jimaku.cc',
    kind: 'subtitles',
    probePath: '/api/entries/search?query=a',
    requiresAuth: true,
    supportsSubtitles: true,
  },
  {
    id: 'opensubtitles',
    label: 'OpenSubtitles',
    host: 'api.opensubtitles.com',
    kind: 'subtitles',
    probePath: '/api/v1/infos/languages',
    requiresAuth: true,
    supportsSubtitles: true,
  },
];

interface HealthRecord {
  health: ScraperSourceHealth;
  latencyMs: number;
  lastCheckedAt: string | null;
  /** 1 = the probe succeeded, 0 = it did not. Oldest first. */
  history: number[];
  note: string;
}

type HealthFile = Record<string, HealthRecord>;

let cache: HealthFile | null = null;

async function loadHealth(): Promise<HealthFile> {
  if (!cache) cache = await readScraperJson<HealthFile>(HEALTH_FILE, {});
  return cache;
}

function emptyRecord(): HealthRecord {
  return { health: 'unknown', latencyMs: 0, lastCheckedAt: null, history: [], note: '' };
}

/**
 * Turns one probe response into the health vocabulary the UI renders.
 *
 * The distinction that matters is "the site is up but is refusing me"
 * (blocked — an auth wall, a rate limit, a bot challenge) versus "the site is
 * broken" (degraded) versus "nothing answered" (offline). Only the last one is
 * a reason to skip a source entirely, so conflating them would make
 * `skipUnhealthy` drop sources that merely need a key.
 */
export function classifyProbe(status: number, body: string): {
  health: ScraperSourceHealth;
  note: string;
} {
  if (status === 0) return { health: 'offline', note: 'No response.' };
  if (status === 401 || status === 403) {
    // A bot challenge answers 403 with a recognisable body; an API answers 403
    // because the key is missing. Both are "up but refusing", but the note
    // should say which.
    const challenge = /cloudflare|just a moment|attention required|captcha/i.test(body);
    return {
      health: 'blocked',
      note: challenge ? 'Anti-bot challenge.' : 'Authentication required.',
    };
  }
  if (status === 429) return { health: 'blocked', note: 'Rate limited.' };
  if (status >= 500) return { health: 'degraded', note: `Server error ${status}.` };
  if (status === 404) return { health: 'degraded', note: 'Probe path is missing.' };
  // 2xx, 3xx, and 4xx-that-is-not-refusal (GraphQL's 400 to a bare GET) all
  // prove the host answered a real request.
  return { health: 'ok', note: '' };
}

function toStatus(
  entry: ScraperSourceEntry,
  record: HealthRecord,
  index: number,
): SourceStatus {
  return {
    id: entry.id,
    label: entry.label,
    host: entry.host,
    kind: entry.kind,
    enabled: entry.enabled,
    priority: entry.priority || index + 1,
    fallbackIds: entry.fallbackIds,
    health: record.health,
    latencyMs: record.latencyMs,
    supportsSubtitles: entry.supportsSubtitles,
    requiresAuth: entry.requiresAuth,
    history: record.history,
    note: record.note,
    lastCheckedAt: record.lastCheckedAt,
  };
}

/** The catalogue as settings entries — what the Source Manager seeds from. */
export function catalogueEntries(): ScraperSourceEntry[] {
  return SOURCE_CATALOGUE.map((item, index) => ({
    id: item.id,
    label: item.label,
    host: item.host,
    kind: item.kind,
    enabled: true,
    priority: index + 1,
    fallbackIds: [],
    verifiedSiteId: '',
    requiresAuth: item.requiresAuth,
    supportsSubtitles: item.supportsSubtitles,
    health: 'unknown',
    lastCheckedAt: null,
    notes: '',
  }));
}

/**
 * The source list with whatever health is already known.
 *
 * Deliberately does not probe: opening the page must not fire six network
 * requests, and a stale-but-labelled history is more useful than a spinner.
 * The user probes explicitly.
 */
export async function listSources(entries: ScraperSourceEntry[]): Promise<SourceStatus[]> {
  const health = await loadHealth();
  const list = entries.length ? entries : catalogueEntries();
  return list.map((entry, index) => toStatus(entry, health[entry.id] ?? emptyRecord(), index));
}

/** One real request against a source, recorded into its history. */
export async function probeSource(
  entry: ScraperSourceEntry,
  timeoutMs = 15_000,
  requestedPath?: string,
  /**
   * The SSRF guard: refuse a loopback/private/link-local target. The IPC
   * handler sets it from the profile's `safety.allowPrivateNetwork` (on unless
   * the profile allows private networks); direct callers opt in.
   */
  blockPrivateNetwork = false,
): Promise<SourceStatus> {
  const catalogue = SOURCE_CATALOGUE.find((item) => item.id === entry.id);
  // A caller-supplied path is only a path — never a scheme or another host.
  const ownPath = typeof requestedPath === 'string' && /^\/(?!\/)/.test(requestedPath)
    ? requestedPath
    : '';
  const path = ownPath || catalogue?.probePath || '/';
  const started = Date.now();
  scraperLog('info', 'sources', `Probing ${entry.label} (${entry.host})`, {
    correlationId: `probe:${entry.id}`,
  });

  let status = 0;
  let body = '';
  // HTTPS first, then plain HTTP. A source is not always a public site: a
  // self-hosted indexer on the LAN speaks http, and reporting it "offline"
  // because it has no certificate would be wrong. Only a connection-level
  // failure falls through — any HTTP status, including 4xx, is an answer.
  // A torrent index entry may keep the scheme the user typed
  // (`http://192.168.1.5:9117`); that scheme is then the only one tried.
  const typed = /^(https?):\/\/(.+?)\/*$/i.exec(entry.host);
  const hostOnly = typed ? typed[2] : entry.host;
  const schemes = typed ? [typed[1].toLowerCase()] : ['https', 'http'];
  for (const scheme of schemes) {
    try {
      const response = await scraperRequest(`${scheme}://${hostOnly}${path}`, {
        timeoutMs,
        // 64 KB is plenty to recognise a challenge page and keeps a probe from
        // pulling a whole feed.
        maxBytes: 64 * 1024,
        correlationId: `probe:${entry.id}`,
        blockPrivateNetwork,
      });
      status = response.status;
      body = response.body;
      break;
    } catch (error) {
      body = error instanceof Error ? error.message : String(error);
    }
  }

  const latencyMs = Date.now() - started;
  const { health, note } = classifyProbe(status, body);
  const store = await loadHealth();
  const previous = store[entry.id] ?? emptyRecord();
  const record: HealthRecord = {
    health,
    latencyMs,
    lastCheckedAt: new Date().toISOString(),
    history: [...previous.history, health === 'ok' ? 1 : 0].slice(-HISTORY_LENGTH),
    note,
  };
  store[entry.id] = record;
  await writeScraperJson(HEALTH_FILE, store);

  scraperLog(
    health === 'ok' ? 'info' : 'warn',
    'sources',
    `${entry.label}: ${health}${note ? ` — ${note}` : ''} (${status || 'no response'}, ${latencyMs}ms)`,
    { correlationId: `probe:${entry.id}` },
  );

  return toStatus(entry, record, entry.priority - 1);
}

/** Test seam — drops the in-memory health cache. */
export function resetSourceHealthCache(): void {
  cache = null;
}
