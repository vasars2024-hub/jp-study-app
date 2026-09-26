// Scraper — translated renderings of the values the app stores as plain data.
//
// `strings.ts` covers chrome the Scraper authored. This module covers the other
// half the round-2 audit found still rendering English in ja/zh/ru: enum values
// painted straight into pills (`row.kind`, `t.state`, `entry.kind`), units glued
// on in JSX (`12 ms`, `3d`), the built-in profiles' stored names, the profile
// revision log's reasons, and the few fixed sentences main writes into the log
// and inventory messages.
//
// Every function resolves at CALL time through `t()`, never at module load, so
// a language switch is picked up by the next render (ScraperApp subscribes once
// at the root for the whole tree). Unknown values fall through unchanged: a
// build newer than its catalog shows the raw value, never a dotted key.

import { t } from '../../i18n';
import type { TVars } from '../../../shared/i18n/core';
import {
  SCRAPER_BUILTIN_PROFILE_TEXT,
  SCRAPER_PROFILE_REASON,
  type ScraperSettingsProfile,
} from '../../../shared/scraperSettings';
import { SCRAPER_LOG_MESSAGE } from '../../../shared/scraperLogMessages';

/** `t()` under a name that does not collide with the `t` loop variables in these pages. */
export function tr(key: string, vars?: TVars): string {
  return t(key, vars);
}

function enumText(group: string, value: string): string {
  const key = `scrApp.enum.${group}.${value}`;
  const text = t(key);
  return text === key ? value : text;
}

/** Episode kind: episode, special, OVA, movie… */
export const episodeKindText = (value: string) => enumText('kind', value);
/** Episode row status: ok, warning, failed, pending. */
export const episodeStatusText = (value: string) => enumText('status', value);
/** Stream mirror health: ok, degraded, dead, unknown. */
export const streamHealthText = (value: string) => enumText('health', value);
/** Artwork kind: poster, banner, thumbnail, still. */
export const imageKindText = (value: string) => enumText('image', value);
/** Log level: error, warn, info, debug, trace. */
export const logLevelText = (value: string) => enumText('level', value);
/** Source kind: streaming, torrent, metadata, subtitles (and 'all' for the tab). */
export const sourceKindText = (value: string) => enumText('sourceKind', value);

/** "12 ms" — the unit is a word in ru and zh, so it is not glued on in JSX. */
export const unitMs = (n: number) => t('scrApp.unit.ms', { n });
/** "3d" — torrent age in days. */
export const unitDays = (n: number) => t('scrApp.unit.days', { n });
/** "1,200 kbps". */
export const unitKbps = (n: string) => t('scrApp.unit.kbps', { n });

/**
 * A built-in profile keeps its stored English name ('Fast', 'Balanced',
 * 'Thorough') in the settings document — that document is exported as portable
 * JSON and read by main, so it must not change with the UI language. It is
 * translated here, at render, but ONLY while it still reads as the default: a
 * name the user typed is theirs and is shown as typed.
 */
export function profileName(profile: Pick<ScraperSettingsProfile, 'id' | 'name'>): string {
  const builtin = SCRAPER_BUILTIN_PROFILE_TEXT[profile.id as keyof typeof SCRAPER_BUILTIN_PROFILE_TEXT];
  return builtin && profile.name === builtin.name ? t(builtin.nameKey) : profile.name;
}

/** Same rule as `profileName`, for the description line. */
export function profileDescription(
  profile: Pick<ScraperSettingsProfile, 'id' | 'description'>,
): string {
  const builtin = SCRAPER_BUILTIN_PROFILE_TEXT[profile.id as keyof typeof SCRAPER_BUILTIN_PROFILE_TEXT];
  return builtin && profile.description === builtin.description
    ? t(builtin.descriptionKey)
    : profile.description;
}

/**
 * A revision-log reason. The document stores the English sentence (it is part of
 * the portable JSON); the four sentences the settings module itself writes are
 * recognised and translated, anything else is shown as stored.
 */
export function profileReasonText(reason: string): string {
  if (reason === SCRAPER_PROFILE_REASON.updated) return t('scrApp.r2.profile.reason.updated');
  if (reason === SCRAPER_PROFILE_REASON.fallback) return t('scrApp.r2.profile.reason.fallback');
  const preset = SCRAPER_PROFILE_REASON.presetPattern.exec(reason);
  if (preset) {
    return t('scrApp.r2.profile.reason.preset', { preset: t(`scraperMgmt.preset.${preset[1]}`) });
  }
  const rollback = SCRAPER_PROFILE_REASON.rollbackPattern.exec(reason);
  if (rollback) return t('scrApp.r2.profile.reason.rollback', { id: rollback[1] });
  return reason;
}

const SIDECAR_MESSAGE = /^Seanime sidecar is (disabled|stopped|starting|offline|failed|not ready)\.$/;

/**
 * The fixed sentences main writes where the renderer shows them verbatim: the
 * scraper log's startup line and the Seanime sidecar's not-ready reasons. Main
 * keeps writing English (log files are read by people filing bugs); the
 * renderer translates the sentences it recognises and passes the rest through.
 */
export function localizeScraperMessage(message: string): string {
  if (message === SCRAPER_LOG_MESSAGE.backendReady) return t('scrApp.r2.msg.backendReady');
  const sidecar = SIDECAR_MESSAGE.exec(message);
  if (sidecar) {
    const state = sidecar[1] === 'not ready' ? 'notReady' : sidecar[1];
    return t(`scrApp.r2.msg.sidecar.${state}`);
  }
  return message;
}
