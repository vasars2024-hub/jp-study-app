import type { MediaItem } from './types';
export type ExternalPlayerOs = 'windows' | 'macos' | 'linux' | 'all';
export type ExternalPlayerContentType = 'audio' | 'video' | 'any';
export interface ExternalPlayerProfile { id: string; name: string; executablePath: string; os: ExternalPlayerOs; contentType: ExternalPlayerContentType; arguments: string[]; supportsSubtitles: boolean; supportsResume: boolean; }
export interface ExternalPlayerPreferences { profiles: ExternalPlayerProfile[]; defaultProfileId: string | null; contentTypeProfileIds: Partial<Record<'audio' | 'video', string>>; lastUsedProfileId: string | null; }
export interface PlaybackHandoff { mediaPath: string; title: string; episodeNumber: number | null; subtitlePath: string | null; audioPreference: string | null; metadata: Record<string, string>; resumePositionSec: number | null; }
export function createEmptyExternalPlayerPreferences(): ExternalPlayerPreferences { return { profiles: [], defaultProfileId: null, contentTypeProfileIds: {}, lastUsedProfileId: null }; }
export function selectExternalPlayerProfile(preferences: ExternalPlayerPreferences, contentType: 'audio' | 'video' = 'video'): ExternalPlayerProfile | null {
  const id = preferences.contentTypeProfileIds[contentType] ?? preferences.defaultProfileId ?? preferences.lastUsedProfileId;
  return preferences.profiles.find((profile) => profile.id === id) ?? preferences.profiles.find((profile) => profile.contentType === contentType || profile.contentType === 'any') ?? null;
}
export function createPlaybackHandoff(item: MediaItem, subtitlePath?: string | null, audioPreference?: string | null): PlaybackHandoff { return { mediaPath: item.path, title: item.title, episodeNumber: null, subtitlePath: subtitlePath ?? null, audioPreference: audioPreference ?? item.lang ?? null, metadata: { fileName: item.fileName, kind: item.kind ?? 'unknown' }, resumePositionSec: typeof item.positionSec === 'number' && item.positionSec > 0 ? item.positionSec : null }; }
export function normalizeExternalPlayerPreferences(input: unknown): ExternalPlayerPreferences {
  if (!input || typeof input !== 'object') return createEmptyExternalPlayerPreferences();
  const raw = input as Partial<ExternalPlayerPreferences>;
  const profiles: ExternalPlayerProfile[] = Array.isArray(raw.profiles) ? raw.profiles.filter((p): p is ExternalPlayerProfile => Boolean(p && typeof p === 'object' && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.executablePath === 'string')).map((p) => ({ ...p, id: p.id.trim().slice(0, 64), name: p.name.trim().slice(0, 100), executablePath: p.executablePath.trim(), os: (p.os === 'windows' || p.os === 'macos' || p.os === 'linux' ? p.os : 'all') as ExternalPlayerOs, contentType: (p.contentType === 'audio' || p.contentType === 'video' ? p.contentType : 'any') as ExternalPlayerContentType, arguments: Array.isArray(p.arguments) ? p.arguments.filter((a): a is string => typeof a === 'string').slice(0, 30) : [], supportsSubtitles: p.supportsSubtitles === true, supportsResume: p.supportsResume === true })) : [];
  const ids = new Set(profiles.map((p) => p.id)); const valid = (v: unknown) => typeof v === 'string' && ids.has(v) ? v : null;
  const mappings = raw.contentTypeProfileIds && typeof raw.contentTypeProfileIds === 'object' ? raw.contentTypeProfileIds : {};
  return { profiles, defaultProfileId: valid(raw.defaultProfileId), contentTypeProfileIds: { audio: valid(mappings.audio) ?? undefined, video: valid(mappings.video) ?? undefined }, lastUsedProfileId: valid(raw.lastUsedProfileId) };
}
