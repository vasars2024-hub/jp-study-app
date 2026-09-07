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

// A leaf module (it imports nothing), so naming the record's format union here
// cannot put this file in a cycle.
import type { SubtitleRecordFormat } from './subtitleRecord';
import type { NyaaUnavailableReason } from './subtitleNyaa';

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
  /**
   * `sub-pack` takes the whole torrent; `batch-sidecar` and `sub-archive` take
   * selected files — the difference being that an archive holds every title's
   * subtitles and none of the video, so the wanted work is a folder inside it.
   */
  route: 'sub-pack' | 'sub-archive' | 'batch-sidecar';
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
  /**
   * Which availability check refused, when one did — `null` otherwise, and
   * `null` too for a refusal that is not an availability question (a media row
   * that has left the library, the index failing).
   *
   * `message` alone is untranslatable: it is built in main, so no catalog
   * carries it and every i18n gate in this repo is blind to it. With the code
   * in hand the dialog says it in the user's language and names the remedy
   * (D172, and D171 for the same defect on the harvest panel).
   */
  reason?: NyaaUnavailableReason | null;
}

/**
 * Why a subtitle attach refused, as a code the UI can act on.
 *
 * `message` is written for a person and is the right thing to *show* wherever a
 * surface can show a sentence. But the file-drop router cannot: `ImportHooks.
 * onRefused` takes an i18n key, so every named refusal `attachSubtitleFile`
 * produces collapsed into one "Could not import {name}." — the user was told
 * that something failed and never that the fix is to add the video first. These
 * codes are what a caller with only a key to give can still translate.
 *
 * Deliberately NOT a replacement for `message`: main writes English prose there
 * for surfaces that render it directly, and dropping that would make every
 * non-drop caller worse to fix one caller.
 */
export type SubtitleAttachRefusal =
  /** Nothing was handed in — an empty or non-string path. */
  | 'no-path'
  /** The extension is not one this app can parse. */
  | 'unreadable-format'
  /** The path is gone, or is a directory rather than a file. */
  | 'missing-file'
  /** No library item sits beside it, so there is nobody to attach it to. */
  | 'no-owner'
  /** That exact path is already attached to that item. */
  | 'duplicate'
  /** The name carries no language tag, so it cannot be filed as one. */
  | 'no-language';

export interface NyaaSubtitleAcceptResult {
  ok: boolean;
  message: string;
  /** Language of the attached record, so the caller can refresh the right row. */
  lang?: string;
  /**
   * Set on refusals that a caller may want to act on differently. Optional and
   * additive: every existing caller reads `ok` and `message` and is unaffected.
   */
  reason?: SubtitleAttachRefusal;
}

/**
 * Cue text the user already has in hand, attached to a library item they own.
 *
 * Every other route into a `SubtitleRecord` starts from the media item and goes
 * looking for text. This one is the reverse, and it exists because the harvest
 * panel has no media item at all: it fetches subtitles for a *catalogue* entry,
 * so a season of cues could be mined but could never reach the player. The
 * bytes are already in the renderer by the time this is called — nothing is
 * fetched here, which is why it takes no provider config and cannot start a
 * transfer.
 */
export interface SubtitleAttachTextInput {
  mediaId: string;
  text: string;
  /** Lower-case extension without the dot, from the file the provider served. */
  format: string;
  /** Defaults to `ja`; this is a Japanese-study app and the harvest is Japanese. */
  lang?: string;
  /** Shown as the track name. Falls back to the format when absent. */
  label?: string;
  /** Which index served the text, kept so the track's provenance is not lost. */
  providerId?: string;
  providerItemId?: string;
}

/**
 * Formats an attach may write.
 *
 * `lrc` is a `SubtitleRecordFormat` but is not here: it is a lyrics container
 * the transcription path writes for audio, and nothing in a subtitle index
 * serves one. Accepting it would mean the picker offers a format no harvest can
 * produce.
 */
export const ATTACHABLE_SUBTITLE_FORMATS: readonly SubtitleRecordFormat[] = ['srt', 'ass', 'ssa', 'vtt'];

/**
 * The largest cue file an attach will write, in bytes.
 *
 * A whole-season `.ass` measured on the acquired JoJo pack is ~90 KB per
 * episode; 8 MB is two orders of magnitude above anything real and exists only
 * so a renderer bug cannot push an arbitrary payload across IPC and onto disk.
 */
export const MAX_ATTACHED_SUBTITLE_BYTES = 8 * 1024 * 1024;

/** A validated attach request: every field settled, nothing left to guess. */
export interface NormalizedSubtitleAttach {
  mediaId: string;
  text: string;
  format: SubtitleRecordFormat;
  lang: string;
  label: string;
  providerId: string;
  providerItemId: string;
}

/**
 * Validates an attach request, refusing with a sentence rather than a boolean.
 *
 * Pure and shared so the renderer can disable the button for the same reasons
 * main would refuse, and so the refusals are testable without Electron. Main
 * still calls it — a renderer check is a convenience, never the gate.
 */
export function normalizeSubtitleAttachText(
  input: unknown,
): { ok: true; value: NormalizedSubtitleAttach } | { ok: false; message: string } {
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<SubtitleAttachTextInput>;
  const mediaId = typeof raw.mediaId === 'string' ? raw.mediaId.trim() : '';
  if (!mediaId) return { ok: false, message: 'No library item was chosen.' };

  const text = typeof raw.text === 'string' ? raw.text : '';
  if (!text.trim()) return { ok: false, message: 'That subtitle file holds no text.' };
  // Byte length, not character count: the cue text is Japanese, so a UTF-16
  // length understates the file on disk by roughly a third.
  const bytes = typeof TextEncoder === 'function'
    ? new TextEncoder().encode(text).length
    : text.length;
  if (bytes > MAX_ATTACHED_SUBTITLE_BYTES) {
    return { ok: false, message: 'That subtitle file is too large to attach.' };
  }

  const format = (typeof raw.format === 'string' ? raw.format : '').trim().toLowerCase().replace(/^\./, '');
  if (!(ATTACHABLE_SUBTITLE_FORMATS as readonly string[]).includes(format)) {
    return { ok: false, message: `“${format || 'unknown'}” is not a subtitle format this app reads.` };
  }

  const lang = (typeof raw.lang === 'string' ? raw.lang : '').trim().toLowerCase() || 'ja';
  const label = (typeof raw.label === 'string' ? raw.label : '').trim().slice(0, 200)
    || `Harvested ${format.toUpperCase()}`;
  const providerId = (typeof raw.providerId === 'string' ? raw.providerId : '').trim() || 'harvest';
  const providerItemId = (typeof raw.providerItemId === 'string' ? raw.providerItemId : '').trim();

  return {
    ok: true,
    value: { mediaId, text, format: format as SubtitleRecordFormat, lang, label, providerId, providerItemId },
  };
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
