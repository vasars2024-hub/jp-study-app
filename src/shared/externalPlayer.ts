/**
 * External players — VLC, mpv, IINA or anything else the user points at.
 *
 * The profile list is configured in Settings and **owned by the main process**
 * (`main/externalPlayer.ts`, `<userData>/external-players.json`): the launcher
 * only ever runs an executable that is one of those saved profiles, looked up by
 * id, never a path the renderer hands it at launch time. The renderer keeps a
 * synchronous mirror (`renderer/externalPlayerStore.ts`) for menus.
 *
 * Arguments are templates. Placeholders:
 *   `{media}`    the file
 *   `{subtitle}` the subtitle file — an argument using it is DROPPED when there
 *                is none or the profile says it cannot take one, so a
 *                `--sub-file={subtitle}` never reaches the player empty
 *   `{position}` the resume position in whole seconds — dropped the same way
 *   `{title}`    the display title
 *
 * Pure: no I/O.
 */

import type { MediaItem } from './types';

export type ExternalPlayerOs = 'windows' | 'macos' | 'linux' | 'all';
export type ExternalPlayerContentType = 'audio' | 'video' | 'any';
export interface ExternalPlayerProfile {
  id: string;
  name: string;
  executablePath: string;
  os: ExternalPlayerOs;
  contentType: ExternalPlayerContentType;
  arguments: string[];
  supportsSubtitles: boolean;
  supportsResume: boolean;
}
export interface ExternalPlayerPreferences {
  profiles: ExternalPlayerProfile[];
  defaultProfileId: string | null;
  contentTypeProfileIds: Partial<Record<'audio' | 'video', string>>;
  /** The player the user last opened something in; offered first next time. */
  lastUsedProfileId: string | null;
}
export interface PlaybackHandoff {
  mediaPath: string;
  title: string;
  episodeNumber: number | null;
  subtitlePath: string | null;
  audioPreference: string | null;
  metadata: Record<string, string>;
  resumePositionSec: number | null;
}

export const EXTERNAL_PLAYER_PLACEHOLDERS = ['{media}', '{subtitle}', '{position}', '{title}'] as const;

export function createEmptyExternalPlayerPreferences(): ExternalPlayerPreferences {
  return { profiles: [], defaultProfileId: null, contentTypeProfileIds: {}, lastUsedProfileId: null };
}

function compatible(profile: ExternalPlayerProfile, contentType: 'audio' | 'video'): boolean {
  return profile.contentType === contentType || profile.contentType === 'any';
}

/**
 * The player to open a file in: an explicit per-type choice, else the one the
 * user last used (if it can play this type), else the default, else the first
 * compatible profile.
 */
export function selectExternalPlayerProfile(
  preferences: ExternalPlayerPreferences,
  contentType: 'audio' | 'video' = 'video',
): ExternalPlayerProfile | null {
  const byId = (id: string | null | undefined): ExternalPlayerProfile | undefined =>
    id ? preferences.profiles.find((profile) => profile.id === id) : undefined;
  const mapped = byId(preferences.contentTypeProfileIds[contentType]);
  if (mapped) return mapped;
  const last = byId(preferences.lastUsedProfileId);
  if (last && compatible(last, contentType)) return last;
  return byId(preferences.defaultProfileId)
    ?? preferences.profiles.find((profile) => compatible(profile, contentType))
    ?? null;
}

/** Profiles in menu order: the one {@link selectExternalPlayerProfile} picks first, then the rest. */
export function orderExternalPlayerProfiles(
  preferences: ExternalPlayerPreferences,
  contentType: 'audio' | 'video' = 'video',
): ExternalPlayerProfile[] {
  const first = selectExternalPlayerProfile(preferences, contentType);
  const rest = preferences.profiles.filter((profile) => profile !== first && compatible(profile, contentType));
  return first ? [first, ...rest] : rest;
}

export function createPlaybackHandoff(
  item: MediaItem,
  subtitlePath?: string | null,
  audioPreference?: string | null,
): PlaybackHandoff {
  return {
    mediaPath: item.path,
    title: item.title,
    episodeNumber: typeof item.episode === 'number' && item.episode > 0 ? item.episode : null,
    subtitlePath: subtitlePath ?? null,
    audioPreference: audioPreference ?? item.lang ?? null,
    metadata: { fileName: item.fileName, kind: item.kind ?? 'unknown' },
    resumePositionSec: typeof item.positionSec === 'number' && item.positionSec > 0 ? item.positionSec : null,
  };
}

/**
 * The argv for a launch. An argument whose placeholder has no value (no
 * subtitle, nothing to resume, or a profile that says it cannot take one) is
 * dropped whole rather than passed empty. A bare `{title}` that would start
 * with `-` loses the dashes, so a title can never read as a switch.
 */
export function buildExternalPlayerArguments(profile: ExternalPlayerProfile, handoff: PlaybackHandoff): string[] {
  const subtitle = profile.supportsSubtitles && handoff.subtitlePath ? handoff.subtitlePath : null;
  const position = profile.supportsResume && typeof handoff.resumePositionSec === 'number'
    && Number.isFinite(handoff.resumePositionSec) && handoff.resumePositionSec >= 1
    ? String(Math.floor(handoff.resumePositionSec))
    : null;
  const args: string[] = [];
  let mediaPlaced = false;
  for (const raw of profile.arguments) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    if (raw.includes('{subtitle}') && !subtitle) continue;
    if (raw.includes('{position}') && !position) continue;
    if (raw.includes('{media}')) mediaPlaced = true;
    const title = raw.trim() === '{title}' ? handoff.title.replace(/^-+/, '') : handoff.title;
    args.push(raw
      .replaceAll('{media}', handoff.mediaPath)
      .replaceAll('{subtitle}', subtitle ?? '')
      .replaceAll('{position}', position ?? '')
      .replaceAll('{title}', title));
  }
  // A profile saved without `{media}` would open the player on nothing.
  if (!mediaPlaced) args.push(handoff.mediaPath);
  return args;
}

/** Argument templates for the players people actually use, keyed by executable name. */
const PRESETS: { match: RegExp; arguments: string[]; supportsSubtitles: boolean; supportsResume: boolean }[] = [
  {
    match: /(^|[\\/])vlc(\.exe)?$/i,
    arguments: ['{media}', '--start-time={position}', '--sub-file={subtitle}', '--meta-title={title}'],
    supportsSubtitles: true,
    supportsResume: true,
  },
  {
    match: /(^|[\\/])mpv(\.exe|\.com)?$/i,
    arguments: ['{media}', '--start={position}', '--sub-file={subtitle}', '--force-media-title={title}'],
    supportsSubtitles: true,
    supportsResume: true,
  },
  {
    match: /(^|[\\/])mpc-(hc|be)(64)?\.exe$/i,
    arguments: ['{media}', '/start', '{position}000', '/sub', '{subtitle}'],
    supportsSubtitles: true,
    supportsResume: true,
  },
  {
    match: /(^|[\\/])potplayermini(64)?\.exe$/i,
    arguments: ['{media}', '/seek={position}', '/sub={subtitle}'],
    supportsSubtitles: true,
    supportsResume: true,
  },
  {
    match: /(^|[\\/])iina(-cli)?$/i,
    arguments: ['{media}', '--mpv-start={position}', '--mpv-sub-file={subtitle}'],
    supportsSubtitles: true,
    supportsResume: true,
  },
];

/** Arguments and capabilities for a known player, or null for anything else. */
export function externalPlayerPresetFor(
  executablePath: string,
): Pick<ExternalPlayerProfile, 'arguments' | 'supportsSubtitles' | 'supportsResume'> | null {
  const preset = PRESETS.find((entry) => entry.match.test(executablePath.trim()));
  return preset
    ? { arguments: [...preset.arguments], supportsSubtitles: preset.supportsSubtitles, supportsResume: preset.supportsResume }
    : null;
}

export function normalizeExternalPlayerPreferences(input: unknown): ExternalPlayerPreferences {
  if (!input || typeof input !== 'object') return createEmptyExternalPlayerPreferences();
  const raw = input as Partial<ExternalPlayerPreferences>;
  const profiles: ExternalPlayerProfile[] = Array.isArray(raw.profiles)
    ? raw.profiles
      .filter((p): p is ExternalPlayerProfile => Boolean(p && typeof p === 'object' && typeof p.id === 'string'
        && typeof p.name === 'string' && typeof p.executablePath === 'string'))
      .map((p) => ({
        ...p,
        id: p.id.trim().slice(0, 64),
        name: p.name.trim().slice(0, 100),
        executablePath: p.executablePath.trim(),
        os: (p.os === 'windows' || p.os === 'macos' || p.os === 'linux' ? p.os : 'all') as ExternalPlayerOs,
        contentType: (p.contentType === 'audio' || p.contentType === 'video' ? p.contentType : 'any') as ExternalPlayerContentType,
        arguments: Array.isArray(p.arguments)
          ? p.arguments.filter((a): a is string => typeof a === 'string').map((a) => a.trim()).filter(Boolean).slice(0, 30)
          : [],
        supportsSubtitles: p.supportsSubtitles === true,
        supportsResume: p.supportsResume === true,
      }))
      .filter((p) => p.id.length > 0)
    : [];
  const ids = new Set(profiles.map((p) => p.id));
  const valid = (v: unknown): string | null => (typeof v === 'string' && ids.has(v) ? v : null);
  const mappings = raw.contentTypeProfileIds && typeof raw.contentTypeProfileIds === 'object' ? raw.contentTypeProfileIds : {};
  return {
    profiles,
    defaultProfileId: valid(raw.defaultProfileId),
    contentTypeProfileIds: { audio: valid(mappings.audio) ?? undefined, video: valid(mappings.video) ?? undefined },
    lastUsedProfileId: valid(raw.lastUsedProfileId),
  };
}
