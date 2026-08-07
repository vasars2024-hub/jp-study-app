/**
 * Wire types for subtitle discovery, shared by main and renderer.
 *
 * Settings live here rather than in §8's `SubtitlePreferences` because they are
 * about *execution* — whether to search at all, how confident a match must be to
 * attach, which languages to download without asking. §8's preferences describe
 * what the user likes; these describe what the app is allowed to do. Keeping them
 * apart is also what keeps API keys out of the renderer: the key state below is
 * a boolean, never the secret.
 */

export type SubtitleDiscoveryPhase =
  | 'queued'
  | 'probing-embedded'
  | 'scanning-sidecar'
  | 'searching-providers'
  | 'matching'
  | 'downloading'
  | 'done'
  | 'cancelled'
  | 'error';

export interface SubtitleDiscoveryProgress {
  mediaId: string;
  /** Display title, so a progress row can name the file without a lookup. */
  title: string;
  phase: SubtitleDiscoveryPhase;
  done: number;
  total: number;
  /** Provider currently being asked, when in `searching-providers`. */
  providerId?: string;
  /** Languages attached so far for this item. */
  languages?: string[];
  etaMs?: number;
  error?: string;
}

/** The providers this phase can actually execute against. */
export const SUBTITLE_PROVIDER_IDS = ['embedded', 'sidecar', 'jimaku', 'opensubtitles', 'nyaa'] as const;
export type SubtitleProviderExecutionId = (typeof SUBTITLE_PROVIDER_IDS)[number];

/** Providers that reach the network, and therefore need a key and a health check. */
export const NETWORK_SUBTITLE_PROVIDERS: SubtitleProviderExecutionId[] = ['jimaku', 'opensubtitles'];

export function isNetworkSubtitleProvider(id: string): id is 'jimaku' | 'opensubtitles' {
  return (NETWORK_SUBTITLE_PROVIDERS as readonly string[]).includes(id);
}

/**
 * Providers that answer with candidates to score, rather than reading a local
 * file.
 *
 * Deliberately wider than `NETWORK_SUBTITLE_PROVIDERS`, which means "needs an
 * API key" and is what the settings panel renders a key field from. `nyaa`
 * reaches the network but has no account and no key, so conflating the two
 * would either put a pointless key box in the UI or drop the provider out of
 * the discovery loop entirely.
 */
export const REMOTE_SUBTITLE_PROVIDERS: SubtitleProviderExecutionId[] = [
  'jimaku',
  'opensubtitles',
  'nyaa',
];

export function isRemoteSubtitleProvider(
  id: string,
): id is 'jimaku' | 'opensubtitles' | 'nyaa' {
  return (REMOTE_SUBTITLE_PROVIDERS as readonly string[]).includes(id);
}

/**
 * Providers whose results are never attached without the user choosing them.
 *
 * A torrent-sourced subtitle is a name match against a release, with no
 * curation and no hash check behind it — materially lower-trust than Jimaku,
 * where a human uploaded a file for a known series. Attaching one silently is
 * how a user ends up watching with subtitles for a different cut and only finds
 * out several minutes in.
 */
export const MANUAL_ONLY_SUBTITLE_PROVIDERS: SubtitleProviderExecutionId[] = ['nyaa'];

export function isManualOnlySubtitleProvider(id: string): boolean {
  return (MANUAL_ONLY_SUBTITLE_PROVIDERS as readonly string[]).includes(id);
}

export interface SubtitleProviderSetting {
  id: SubtitleProviderExecutionId;
  enabled: boolean;
  /** Lower runs first. Reordering in the settings list rewrites these. */
  priority: number;
}

export interface SubtitleDiscoverySettings {
  /** Run discovery automatically when media is imported. */
  autoDiscover: boolean;
  /**
   * Languages to attach without asking. Empty means "attach nothing
   * automatically" — search still runs and results are listed for manual choice.
   */
  autoDownloadLanguages: string[];
  /**
   * Minimum match score (0–100, the shared matcher's scale) for an automatic
   * attach. The default is deliberately high: a subtitle for the wrong episode is
   * worse than no subtitle, because the user only finds out minutes in.
   */
  minConfidence: number;
  /** Start a Whisper transcription when no Japanese subtitle can be found. */
  autoTranscribe: boolean;
  providers: SubtitleProviderSetting[];
  /** Days before a failed search for the same language is retried. */
  retryAfterDays: number;
}

export const DEFAULT_SUBTITLE_DISCOVERY_SETTINGS: SubtitleDiscoverySettings = {
  autoDiscover: true,
  autoDownloadLanguages: ['ja'],
  minConfidence: 70,
  autoTranscribe: false,
  providers: [
    // Local sources first: they are free, instant, and already in sync with the
    // exact file, so a network round trip is only worth making when they fail.
    { id: 'embedded', enabled: true, priority: 0 },
    { id: 'sidecar', enabled: true, priority: 1 },
    { id: 'jimaku', enabled: true, priority: 2 },
    { id: 'opensubtitles', enabled: true, priority: 3 },
    // Off by default and last. It reaches a torrent index and, on acceptance,
    // puts a transfer into the user's own qBittorrent — neither of which should
    // start happening because they updated the app.
    { id: 'nyaa', enabled: false, priority: 4 },
  ],
  retryAfterDays: 7,
};

/** Whether a provider needs a key, and whether one is stored. Never the key. */
export interface SubtitleProviderCredentialState {
  id: SubtitleProviderExecutionId;
  requiresKey: boolean;
  hasKey: boolean;
}

export interface SubtitleProviderTestResult {
  id: SubtitleProviderExecutionId;
  ok: boolean;
  /** Short human-readable outcome, already localized by the caller when possible. */
  detail?: string;
}

export interface SubtitleDiscoveryRequest {
  /** Items to search. Omit to sweep everything not checked recently. */
  mediaIds?: string[];
  /** Re-search even where records or recent failures already exist. */
  force?: boolean;
  /** Restrict to these languages instead of the configured set. */
  languages?: string[];
  /**
   * Scraper configuration for the `nyaa` provider: torrent indexes to search
   * and the qBittorrent to fetch through.
   *
   * Carried on the request rather than read from a copy in main because
   * scraper settings live in the renderer, per profile — the same reason every
   * other scraper entry point is handed its settings per call.
   *
   * Omitting it disables the provider for that run, which is what the
   * automatic sweep on media import does. Adding transfers to someone's
   * torrent client and then waiting on a swarm is not a thing that should
   * happen unattended.
   *
   * Typed loosely here so this wire module stays a leaf; the provider
   * validates the shape it needs.
   */
  acquisition?: unknown;
}

export interface SubtitleDiscoveryResult {
  ok: boolean;
  /** Items that gained at least one subtitle. */
  attached: number;
  /** Items where every source came back empty. */
  empty: number;
  /** Subtitle files written in total. */
  files: number;
  error?: string;
}

/**
 * One nyaa release offered to the user.
 *
 * Carries size and swarm health, which a curated provider's candidate never
 * needs to: this is the only provider where accepting means starting a
 * transfer in the user's own torrent client, so the two numbers that decide
 * whether that is a good idea have to be on screen before the click.
 */
export interface NyaaSubtitleCandidateView {
  id: string;
  releaseName: string;
  /** `sub-pack` takes the whole torrent; `batch-sidecar` takes selected files. */
  route: 'sub-pack' | 'batch-sidecar';
  sizeBytes: number;
  seeders: number;
  languages: string[];
  score: number;
  /** Why it ranked where it did, shown so a wrong-looking order is explicable. */
  reasons: string[];
}

export interface NyaaSubtitleListResult {
  ok: boolean;
  candidates: NyaaSubtitleCandidateView[];
  /**
   * Why the list is empty, when it is. A misconfiguration and a title with no
   * subtitle releases are different problems and must not both read as
   * "nothing found".
   */
  message: string;
}

export interface NyaaSubtitleAcceptResult {
  ok: boolean;
  message: string;
  /** Language of the attached record, so the caller can refresh the right row. */
  lang?: string;
}

export { MIN_SAMPLES_FOR_ETA, estimateEtaMs } from './jobEta';

/** Clamps a persisted settings blob back into range, filling gaps with defaults. */
export function normalizeSubtitleDiscoverySettings(input: unknown): SubtitleDiscoverySettings {
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<SubtitleDiscoverySettings>;
  const defaults = DEFAULT_SUBTITLE_DISCOVERY_SETTINGS;

  const languages = Array.isArray(raw.autoDownloadLanguages)
    ? [...new Set(
      raw.autoDownloadLanguages
        .filter((lang): lang is string => typeof lang === 'string')
        .map((lang) => lang.trim().toLowerCase())
        .filter(Boolean),
    )]
    : defaults.autoDownloadLanguages;

  const byId = new Map<string, SubtitleProviderSetting>();
  for (const entry of Array.isArray(raw.providers) ? raw.providers : []) {
    if (!entry || typeof entry !== 'object') continue;
    const id = (entry as SubtitleProviderSetting).id;
    if (!(SUBTITLE_PROVIDER_IDS as readonly string[]).includes(id)) continue;
    byId.set(id, {
      id,
      enabled: (entry as SubtitleProviderSetting).enabled !== false,
      priority: Number.isFinite((entry as SubtitleProviderSetting).priority)
        ? Number((entry as SubtitleProviderSetting).priority)
        : 0,
    });
  }
  // A provider missing from a persisted blob (added in a later version) takes its
  // default rather than vanishing from the list.
  for (const fallback of defaults.providers) {
    if (!byId.has(fallback.id)) byId.set(fallback.id, { ...fallback });
  }

  const confidence = Number(raw.minConfidence);
  const retryDays = Number(raw.retryAfterDays);

  return {
    autoDiscover: raw.autoDiscover !== false,
    autoDownloadLanguages: languages,
    minConfidence: Number.isFinite(confidence) ? Math.min(100, Math.max(0, confidence)) : defaults.minConfidence,
    autoTranscribe: raw.autoTranscribe === true,
    providers: [...byId.values()].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id)),
    retryAfterDays: Number.isFinite(retryDays) ? Math.min(365, Math.max(0, retryDays)) : defaults.retryAfterDays,
  };
}

/** Enabled network+local providers in the order discovery should try them. */
export function orderedSubtitleProviders(settings: SubtitleDiscoverySettings): SubtitleProviderExecutionId[] {
  return settings.providers
    .filter((provider) => provider.enabled)
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
    .map((provider) => provider.id);
}
