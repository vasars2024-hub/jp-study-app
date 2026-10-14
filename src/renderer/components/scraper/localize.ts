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

import { getUiLang, t } from '../../i18n';
import type { TVars } from '../../../shared/i18n/core';
import {
  SCRAPER_BUILTIN_PROFILE_TEXT,
  SCRAPER_PROFILE_REASON,
  type ScraperSettingsProfile,
} from '../../../shared/scraperSettings';
import { SCRAPER_LOG_MESSAGE } from '../../../shared/scraperLogMessages';
import { ipcErrorText } from '../../../shared/ipcErrorText';
import type { QbitSendReport } from '../../../shared/scraperResults';

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

/**
 * The engine's fixed failure sentences (`main/scraper/engine.ts`), matched the
 * same way as above: main keeps writing English, the renderer shows the ones it
 * recognises in the UI language and passes anything else through unchanged.
 */
const ENGINE_ERRORS: ReadonlyArray<readonly [RegExp, (m: RegExpExecArray) => string]> = [
  [/^(.+) answered (\d{3})\.$/, (m) => t('scraperFix.ui.err.httpStatus', { target: m[1], status: m[2] })],
  [/^The rule for (.+) matched nothing on (.+)\.$/, (m) => t('scraperFix.ui.err.ruleNoMatch', { host: m[1], url: m[2] })],
  [/^(\d+) episode\(s\) failed validation\.$/, (m) => t('scraperFix.ui.err.validationFailed', { count: m[1] })],
  [/^There is nothing to search for\.$/, () => t('scraperFix.ui.err.nothingToSearch')],
  [/^Nothing in the catalogue matches "(.*)"\.$/, (m) => t('scraperFix.ui.err.noCatalogueMatch', { query: m[1] })],
  [/^(\S+) acquisition is not connected to a catalogue provider yet\.$/, (m) => t('scraperFix.ui.err.contentType', { type: m[1] })],
  // The current sentence; the one above is kept for history written by older builds.
  [/^Only anime can be scraped; this is a (\S+) title\.$/, (m) => t('scraperFix.ui.err.contentType', { type: m[1] })],
  [/^Episode list is short: (\d+) of (\d+)\.$/, (m) => t('scraperFix.ui.err.episodeCountShort', { found: m[1], expected: m[2] })],
  [/^Seanime auto-downloader is disabled\.$/, () => t('scraperFix.ui.err.autoDownloaderOff')],
];

const NOTE_RULE_CHECKS = 'Some rule checks did not pass.';
const NOTE_MISSING = /Missing episode numbers?: ([\d, ]+?)(?:, \+(\d+) more)?\./;

/**
 * A job summary's `note`, which main composes from fixed English sentences
 * (`engine.ts`, `missingEpisodesNote`). Known sentences are translated in
 * place; anything else is kept as written.
 */
const NOTE_PAGES = /Could not read (.+?); the episode list may be incomplete\./;
const NOTE_PAGE_PART = /page (\d+) \((?:HTTP (\d{3})|(no rows)|not reachable)\)/g;

/** `engine.ts` `pageFailuresNote`, part by part, in the UI language. */
function localizePageFailures(list: string): string {
  const parts = [...list.matchAll(NOTE_PAGE_PART)].map((m) => (m[2]
    ? t('scr2.note.pageStatus', { page: m[1], status: m[2] })
    : m[3] ? t('scr2.note.pageEmpty', { page: m[1] }) : t('scr2.note.pageUnreachable', { page: m[1] })));
  let joined = parts.join(', ');
  try {
    joined = new Intl.ListFormat(getUiLang(), { style: 'narrow', type: 'unit' }).format(parts);
  } catch {
    /* an engine without ListFormat keeps the comma list */
  }
  return t('scr2.note.pagesFailed', { list: joined });
}

const NOTE_PARTIAL = /Partial episode list: page (\d+) of the catalogue failed to load\./;
const NOTE_SHORT = /Episode list is short: (\d+) of (\d+)\./;
const NOTE_INDEX = /(\d+) index result\(s\)\./;
const NOTE_STREAMS = /(\d+) playable stream\(s\)\./;

export function localizeScraperJobNote(note: string): string {
  let text = note.replace(NOTE_RULE_CHECKS, () => t('scraperFix.ui.note.ruleChecks'));
  text = text.replace(NOTE_PARTIAL, (_all, page: string) => t('scraperFix.ui.note.partialList', { page }));
  text = text.replace(NOTE_SHORT, (_all, found: string, expected: string) =>
    t('scraperFix.ui.err.episodeCountShort', { found, expected }));
  text = text.replace(NOTE_INDEX, (_all, n: string) => t('scraperFix.ui.note.indexResults', { count: Number(n) }));
  text = text.replace(NOTE_STREAMS, (_all, n: string) => t('scraperFix.ui.note.streams', { count: Number(n) }));
  text = text.replace(NOTE_PAGES, (_all, list: string) => localizePageFailures(list));
  text = text.replace(NOTE_MISSING, (_all, list: string, more?: string) =>
    more
      ? t('scraperFix.ui.note.missingMore', { list, more })
      : t('scraperFix.ui.note.missing', { list }));
  return text;
}

/** `t()` that falls back to `english` when the key is unknown to this build. */
function tOr(key: string, english: string, vars?: TVars): string {
  const text = t(key, vars);
  return text === key ? english : text;
}

type SendDetail = QbitSendReport['details'][number];

function isCodedFailure(value: unknown): value is { message: string; code: string; vars?: TVars } {
  return typeof value === 'object' && value !== null
    && typeof (value as { code?: unknown }).code === 'string'
    && typeof (value as { message?: unknown }).message === 'string';
}

/** "Sent" / "Skipped" / "Failed" for one row of a qBittorrent send report. */
export function qbitSendOutcomeText(outcome: SendDetail['outcome']): string {
  return t(`scraperFix.send.outcome.${outcome}`);
}

/**
 * Why one row of a send report was not sent, in the UI language. Main writes an
 * English `reason` for its log and a `reasonCode` beside it: `torrentFile.*`
 * (a .torrent file that did not parse), `send.*` (the add itself) or `qbit.*`
 * (a login or transport failure, the same codes as the connection test). A
 * report without a code, from an older main, keeps its English.
 */
export function qbitSendReasonText(detail: Pick<SendDetail, 'reason' | 'reasonCode' | 'reasonVars'>): string {
  const code = detail.reasonCode ?? '';
  const vars = detail.reasonVars;
  if (code.startsWith('torrentFile.')) return tOr(`scr2.torrentFile.${code.slice('torrentFile.'.length)}`, detail.reason, vars);
  if (code.startsWith('send.')) return tOr(`scraperFix.send.${code.slice('send.'.length)}`, detail.reason, vars);
  if (code.startsWith('qbit.')) return tOr(`scraperFix.qbit.${code.slice('qbit.'.length)}`, detail.reason, vars);
  return detail.reason;
}

/**
 * A validation note on an episode row (`EpisodeRow.statusNote`). The engine
 * joins fixed English sentences (`validateRows`); each is translated in place.
 */
const ROW_PROBLEMS: ReadonlyArray<readonly [string, string]> = [
  ['Placeholder title.', 'scraperFix.ui.problem.placeholderTitle'],
  ['Title is longer than the limit.', 'scraperFix.ui.problem.titleTooLong'],
  ['Shorter than the minimum episode duration.', 'scraperFix.ui.problem.tooShort'],
  ['No subtitles found.', 'scraperFix.ui.problem.noSubtitles'],
  ['No playable link.', 'scraperFix.ui.problem.noLink'],
];

export function localizeScraperRowNote(note: string): string {
  let text = note;
  for (const [english, key] of ROW_PROBLEMS) text = text.split(english).join(t(key));
  return text;
}

const SITE_RULE_PROVIDER = /^Site rule · (.+)$/;

/** A job's provider label. Catalogue names are names; the site-rule label is a sentence. */
export function localizeScraperProvider(provider: string): string {
  const rule = SITE_RULE_PROVIDER.exec(provider);
  return rule ? t('scraperFix.ui.provider.siteRule', { host: rule[1] }) : provider;
}

/**
 * Any scraper failure as one line a user can read: Electron's
 * "Error invoking remote method '...': Error: " wrapper is stripped first (it
 * names an IPC channel, which nobody can act on), then known engine sentences
 * are translated. A job's `error` event goes through the same path, coded or not.
 */
export function scraperErrorText(error: unknown): string {
  if (error === null || error === undefined || error === '') return t('scraperFix.ui.err.unknown');
  // A job's coded `error` event (`ScraperJobError` in main): shown from its key,
  // so main's English sentence never reaches the screen.
  if (isCodedFailure(error)) {
    return tOr(`scraperFix.ui.err.${error.code}`, scraperErrorText(error.message), error.vars);
  }
  const text = ipcErrorText(error);
  for (const [pattern, render] of ENGINE_ERRORS) {
    const match = pattern.exec(text);
    if (match) return render(match);
  }
  return text === 'Unknown error' ? t('scraperFix.ui.err.unknown') : localizeScraperMessage(text);
}
