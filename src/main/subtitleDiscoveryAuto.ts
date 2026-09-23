/**
 * Subtitle automation: every video ends up with a Japanese study line and a
 * helper line under it, without the user pressing anything.
 *
 * The import sweep (`subtitleDiscovery.runSubtitleDiscovery`) does the cheap,
 * library-wide half: embedded streams, files beside the video, Jimaku, and
 * OpenSubtitles for the study language. This module does the per-episode half,
 * when an episode is first played or its title is marked Watching:
 *
 *   1. search again for this one episode, now including the helper language
 *      from the network (the sweep never downloads it — see
 *      `planDiscoveryLanguages`);
 *   2. Japanese but no helper track → machine-translate the Japanese;
 *   3. helper track but no Japanese → on Japanese audio, Whisper aligned to the
 *      helper track's timing (EN→JA fusion); otherwise translate the helper
 *      track into Japanese;
 *   4. nothing at all → the existing `autoTranscribe` fallback, on Japanese audio;
 *   5. persist the picks and announce the item's status.
 *
 * Cost is bounded by construction: work is queued per episode, a Watching title
 * prepares at most the next few episodes, the queue is short and runs one item
 * at a time, and a translation that failed is not retried for a day.
 */

import { BrowserWindow, app, ipcMain } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { MediaItem } from '../shared/types';
import { isMachineTranslatedSubtitle, type SubtitleRecord } from '../shared/subtitleRecord';
import type { SubtitleDiscoverySettings } from '../shared/subtitleDiscoveryIpc';
import {
  isMachineSubtitle,
  pickHelperSubtitle,
  pickStudySubtitle,
  pickSubtitlePair,
  subtitleLangMatches,
} from '../shared/subtitleDiscoveryPick';
import {
  SUBTITLE_AUTO_NOTICES,
  decideAudioLanguage,
  deriveSubtitleAutoStatus,
  sameSubtitleAutoStatus,
  subtitleRecordStatusSource,
  type AudioLanguageVerdict,
  type SecondarySubtitlePick,
  type SubtitleAutoActivity,
  type SubtitleAutoAttempt,
  type SubtitleAutoNotice,
  type SubtitleAutoNotices,
  type SubtitleAutoState,
  type SubtitleAutoStatus,
} from '../shared/subtitleDiscoveryStatus';
import { translationIsUsable } from '../shared/subtitleDiscoveryTranslate';
import {
  loadDiscoverySettings,
  onSubtitleDiscoveryEvent,
  readSubtitleRecord,
  runSubtitleDiscovery,
  saveDiscoverySettings,
  subtitleDiscoveryActiveIds,
  subtitleDiscoveryEligible,
  whenSubtitleSweepIdle,
  writeSubtitleFile,
} from './subtitleDiscovery';
import { hasSubtitleProviderKey } from './subtitleProviderClients';
import { activeSubtitleNotices, onSubtitleNoticesChanged, raiseSubtitleNotice } from './subtitleDiscoveryNotices';
import { resolveSubtitleTranslationEngine, translateSubtitleTrack } from './subtitleDiscoveryTranslate';
import { enqueueTranscription, onMainTranscriptionProgress } from './transcriptionJobs';
import { listAudioStreamLanguages } from './subtitleLocalSources';

export interface SubtitleAutoHost {
  listItems: () => MediaItem[];
  patchItems: (ids: readonly string[], patch: Partial<MediaItem>) => void;
}

export type SubtitlePrepareReason = 'play' | 'watching' | 'manual' | 'retry';

/** Items waiting to be prepared. Beyond this, background requests are dropped; a play still jumps the line. */
const MAX_PENDING = 12;
/** A title marked Watching prepares this many upcoming episodes, not the season. */
const WATCHING_AHEAD = 3;
/** A failed translation or fusion is not retried sooner than this. */
const RETRY_FAILED_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS_KEPT = 12;
/** A play re-requested within this window is the same play, not a new one. */
const PLAY_REPEAT_MS = 10 * 60_000;
const lastPlayRequest = new Map<string, number>();

let host: SubtitleAutoHost | null = null;
const queue: { mediaId: string; reason: SubtitlePrepareReason }[] = [];
let draining: Promise<void> | null = null;
/** Languages being translated or transcribed, per item. */
const generating = new Map<string, Set<string>>();
/** Items the on-play search is running for. */
const searching = new Set<string>();
/** Items waiting on an EN→JA fusion job this module queued. */
const fusing = new Set<string>();
/** Per-item fixable reason a line is missing. */
const itemNotices = new Map<string, SubtitleAutoNotice>();
/** Last status sent per item, so an unchanged one is not re-broadcast. */
const lastStatus = new Map<string, SubtitleAutoStatus>();
/** Audio language per file path; probing spawns ffmpeg, and the answer does not change. */
const audioVerdicts = new Map<string, AudioLanguageVerdict>();
const unsubscribers: (() => void)[] = [];

function findItem(id: string): MediaItem | undefined {
  return host?.listItems().find((entry) => entry.id === id);
}

/** The study line's language, exactly as `media:subtitleForPath` computes it. */
export function studyLanguage(settings: Pick<SubtitleDiscoverySettings, 'autoDownloadLanguages'>): string {
  return settings.autoDownloadLanguages[0] ?? 'ja';
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

function activityFor(id: string, activeDiscovery: ReadonlySet<string>): SubtitleAutoActivity {
  const langs = new Set(generating.get(id) ?? []);
  if (fusing.has(id)) langs.add('ja');
  return {
    searching: searching.has(id) || activeDiscovery.has(id),
    generating: [...langs],
    notice: itemNotices.get(id) ?? null,
  };
}

function statusOf(item: MediaItem, settings: SubtitleDiscoverySettings, activeDiscovery: ReadonlySet<string>): SubtitleAutoStatus {
  return deriveSubtitleAutoStatus({
    mediaId: item.id,
    records: item.subtitles,
    preferredSubtitleId: item.preferredSubtitleId,
    studyLang: studyLanguage(settings),
    helperLang: settings.helperLanguage,
    activity: activityFor(item.id, activeDiscovery),
    now: Date.now(),
  });
}

/** Status for the given items (every eligible video when omitted). */
export function subtitleAutoStatuses(mediaIds?: readonly string[]): SubtitleAutoStatus[] {
  if (!host) return [];
  const settings = loadDiscoverySettings();
  const active = new Set(subtitleDiscoveryActiveIds());
  const wanted = mediaIds?.length ? new Set(mediaIds) : null;
  return host.listItems()
    .filter((item) => (wanted ? wanted.has(item.id) : subtitleDiscoveryEligible(item)))
    .map((item) => statusOf(item, settings, active));
}

/**
 * Persists the automatic picks when they moved, and announces changed statuses.
 * The picks are stored so the library can show which track plays without
 * re-deriving the ranking; `preferredSubtitleId` still outranks them at playback.
 */
function refresh(ids: readonly string[]): void {
  if (!host || !ids.length) return;
  const settings = loadDiscoverySettings();
  const active = new Set(subtitleDiscoveryActiveIds());
  const wanted = new Set(ids);
  for (const item of host.listItems()) {
    if (!wanted.has(item.id)) continue;
    const auto = pickSubtitlePair(item.subtitles, studyLanguage(settings), settings.helperLanguage);
    const previous = item.subtitleAuto ?? {};
    if ((previous.primaryId ?? null) !== (auto.primary?.id ?? null)
      || (previous.secondaryId ?? null) !== (auto.secondary?.id ?? null)) {
      const next: SubtitleAutoState = { ...previous };
      if (auto.primary) next.primaryId = auto.primary.id;
      else delete next.primaryId;
      if (auto.secondary) next.secondaryId = auto.secondary.id;
      else delete next.secondaryId;
      host.patchItems([item.id], { subtitleAuto: next });
    }
    const status = statusOf(item, settings, active);
    if (sameSubtitleAutoStatus(lastStatus.get(item.id), status)) continue;
    lastStatus.set(item.id, status);
    broadcast('subtitleAuto:status', status);
  }
}

/**
 * `refresh`, coalesced. Discovery announces every phase of every item, and each
 * refresh reads the library store, so a sweep over a large library would read it
 * several times per item; batching into one read per quarter-second keeps the
 * status live without that cost.
 */
const pendingRefresh = new Set<string>();
let refreshTimer: NodeJS.Timeout | null = null;
function scheduleRefresh(ids: readonly string[]): void {
  for (const id of ids) pendingRefresh.add(id);
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    const batch = [...pendingRefresh];
    pendingRefresh.clear();
    try {
      refresh(batch);
    } catch {
      /* a status refresh must never throw into a timer */
    }
  }, 250);
}

/** Discovery phases that change what the status says: searching starts, and ends. */
const STATUS_PHASES = new Set(['queued', 'done', 'error', 'cancelled']);

// ---------------------------------------------------------------------------
// Attempts
// ---------------------------------------------------------------------------

function recentAttempt(
  item: MediaItem,
  task: SubtitleAutoAttempt['task'],
  from: string | undefined,
  to: string,
  outcomes: readonly SubtitleAutoAttempt['outcome'][],
  now = Date.now(),
): SubtitleAutoAttempt | undefined {
  return (item.subtitleAuto?.attempts ?? []).find((attempt) =>
    attempt.task === task
    && (attempt.from ?? '') === (from ?? '')
    && attempt.to === to
    && outcomes.includes(attempt.outcome)
    && now - attempt.at < RETRY_FAILED_MS);
}

function recordAttempt(id: string, attempt: SubtitleAutoAttempt): void {
  const item = findItem(id);
  if (!host || !item) return;
  const previous = item.subtitleAuto ?? {};
  const others = (previous.attempts ?? []).filter((entry) =>
    !(entry.task === attempt.task && (entry.from ?? '') === (attempt.from ?? '') && entry.to === attempt.to));
  host.patchItems([id], {
    subtitleAuto: { ...previous, attempts: [...others, attempt].slice(-MAX_ATTEMPTS_KEPT) },
  });
}

function setGenerating(id: string, lang: string, on: boolean): void {
  const set = generating.get(id) ?? new Set<string>();
  if (on) set.add(lang);
  else set.delete(lang);
  if (set.size) generating.set(id, set);
  else generating.delete(id);
}

// ---------------------------------------------------------------------------
// The work
// ---------------------------------------------------------------------------

/** A usable track in `lang` that is not a machine translation (discovery's own notion of "covered"). */
function covered(records: readonly SubtitleRecord[] | undefined, lang: string): boolean {
  return (records ?? []).some((record) => subtitleLangMatches(record.lang, lang) && !isMachineTranslatedSubtitle(record));
}

async function audioVerdict(item: MediaItem): Promise<AudioLanguageVerdict> {
  const cached = audioVerdicts.get(item.path);
  if (cached) return cached;
  let streams: (string | null)[] = [];
  try {
    streams = await listAudioStreamLanguages(item.path);
  } catch {
    streams = [];
  }
  const raw = item as MediaItem & { originalLanguage?: unknown };
  const verdict = decideAudioLanguage({
    streamLanguages: streams,
    originalLanguage: typeof raw.originalLanguage === 'string' ? raw.originalLanguage : null,
    category: item.category ?? null,
    anilistId: item.anilistId ?? null,
    itemLang: item.lang ?? null,
    nativeTitle: item.nativeTitle ?? null,
  });
  audioVerdicts.set(item.path, verdict);
  return verdict;
}

/** Runs discovery for one item, waiting out a library sweep rather than racing it. */
async function searchItem(id: string, languages: string[]): Promise<void> {
  searching.add(id);
  refresh([id]);
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await whenSubtitleSweepIdle();
      const result = await runSubtitleDiscovery({ mediaIds: [id], languages, remoteLanguages: languages });
      // Refused only because a sweep started in the gap; wait for it and ask again.
      if (result.ok || !/already running/i.test(result.error ?? '')) return;
    }
  } catch {
    /* discovery reports its own failures; preparation carries on with what is there */
  } finally {
    searching.delete(id);
  }
}

function langName(lang: string): string {
  return lang.toUpperCase();
}

/**
 * Translates `source` into `target` and attaches the result as a generated,
 * clearly-labelled track, replacing an earlier machine translation into the same
 * language. Never throws.
 */
async function translateInto(
  item: MediaItem,
  source: SubtitleRecord,
  target: string,
  settings: SubtitleDiscoverySettings,
): Promise<void> {
  const from = source.lang.slice(0, 2).toLowerCase();
  if (recentAttempt(item, 'translate', from, target, ['failed'])) return;
  const engine = resolveSubtitleTranslationEngine(settings.translationEngine);
  if (!engine) {
    // Quietly skipped, and said once in the subtitle panel — not per episode.
    raiseSubtitleNotice('translation-unavailable');
    itemNotices.set(item.id, 'translation-unavailable');
    refresh([item.id]);
    return;
  }
  if (itemNotices.get(item.id) === 'translation-unavailable') itemNotices.delete(item.id);
  const raw = readSubtitleRecord(source);
  if (!raw) {
    recordAttempt(item.id, { task: 'translate', from, to: target, at: Date.now(), outcome: 'failed', reason: 'source-unreadable' });
    return;
  }

  setGenerating(item.id, target, true);
  refresh([item.id]);
  try {
    const result = await translateSubtitleTrack(raw, from, target, engine, {
      isCancelled: () => !findItem(item.id),
    });
    if (!result || !translationIsUsable(result)) {
      recordAttempt(item.id, {
        task: 'translate', from, to: target, at: Date.now(), outcome: 'failed',
        reason: result?.stoppedBy ?? (result ? `partial:${result.translated}/${result.total}` : 'nothing-to-translate'),
      });
      return;
    }
    const current = findItem(item.id);
    if (!current || !host) return;
    const relative = writeSubtitleFile(
      item.id,
      `mt-${from}-${target}-${source.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}.${target}.srt`,
      result.srt,
    );
    if (!relative) {
      recordAttempt(item.id, { task: 'translate', from, to: target, at: Date.now(), outcome: 'failed', reason: 'write-failed' });
      return;
    }
    const record: SubtitleRecord = {
      id: crypto.randomUUID(),
      lang: target,
      source: 'generated',
      format: 'srt',
      path: relative,
      // Study content, not chrome: the track picker shows it verbatim, and the
      // words "machine translation" are what keep it from being trusted as a
      // human subtitle.
      label: `${langName(target)} · machine translation of ${source.label?.trim() || langName(from)}`,
      machineGenerated: true,
      derivation: 'machine-translation',
      translatedFromId: source.id,
      translationEngine: result.engine,
      addedAt: Date.now(),
    };
    const replaced = (current.subtitles ?? []).filter((entry) =>
      isMachineTranslatedSubtitle(entry) && subtitleLangMatches(entry.lang, target));
    host.patchItems([item.id], {
      subtitles: [
        ...(current.subtitles ?? []).filter((entry) => !replaced.includes(entry)),
        record,
      ],
    });
    for (const old of replaced) {
      if (old.external || old.path === relative) continue;
      try {
        fs.unlinkSync(path.join(app.getPath('userData'), old.path));
      } catch {
        /* an orphaned cache file is not worth failing for */
      }
    }
    recordAttempt(item.id, { task: 'translate', from, to: target, at: Date.now(), outcome: 'done' });
  } catch (error) {
    recordAttempt(item.id, {
      task: 'translate', from, to: target, at: Date.now(), outcome: 'failed',
      reason: error instanceof Error ? error.message.slice(0, 120) : 'error',
    });
  } finally {
    setGenerating(item.id, target, false);
    refresh([item.id]);
  }
}

/**
 * Queues Whisper over the Japanese audio on the English track's cue grid. The
 * result arrives through the transcription progress listener below.
 */
function startFusion(item: MediaItem, helper: SubtitleRecord): boolean {
  if (fusing.has(item.id)) return true;
  const queued = enqueueTranscription({
    mediaId: item.id,
    lang: 'ja',
    kind: 'fuse-en-ja',
    sourceSubtitleId: helper.id,
  });
  if (!queued.ok) return false;
  fusing.add(item.id);
  recordAttempt(item.id, { task: 'fuse', from: 'en', to: 'ja', at: Date.now(), outcome: 'queued' });
  refresh([item.id]);
  return true;
}

/**
 * Brings one item up to "study line + helper line", as far as the configured
 * engines allow. Exported for the tests; everything else goes through the queue.
 */
export async function prepareItem(mediaId: string): Promise<void> {
  let item = findItem(mediaId);
  if (!host || !item || !subtitleDiscoveryEligible(item)) return;
  const settings = loadDiscoverySettings();
  const study = studyLanguage(settings);
  const helper = settings.helperLanguage && !subtitleLangMatches(settings.helperLanguage, study)
    ? settings.helperLanguage
    : null;
  const wanted = helper ? [study, helper] : [study];

  // 1. This episode's own search, helper language included. Idempotent: the
  //    discovery back-off answers "already asked" without a request.
  if (settings.autoDiscover && wanted.some((lang) => !covered(item?.subtitles, lang))) {
    await searchItem(mediaId, wanted);
    item = findItem(mediaId);
    if (!item) return;
  }

  // 2–4. Fill whichever line is still missing.
  const records = item.subtitles ?? [];
  const studyTrack = pickStudySubtitle(
    records.filter((record) => subtitleLangMatches(record.lang, study)),
    study,
    item.preferredSubtitleId,
  );
  const helperTrack = helper ? pickHelperSubtitle(records, helper) : null;

  if (studyTrack && helper && settings.autoTranslate) {
    // A machine translation made from a track that is no longer the study track
    // is timed and worded for the wrong source; redo it from the current one.
    const stale = helperTrack
      && isMachineTranslatedSubtitle(helperTrack)
      && !!helperTrack.translatedFromId
      && helperTrack.translatedFromId !== studyTrack.id
      && !isMachineSubtitle(studyTrack);
    if (!helperTrack || stale) await translateInto(item, studyTrack, helper, settings);
  } else if (!studyTrack && helperTrack && !isMachineSubtitle(helperTrack) && settings.autoStudyTrack) {
    const verdict = await audioVerdict(item);
    const fusionFailed = recentAttempt(item, 'fuse', 'en', 'ja', ['failed']);
    // Fusion reads an English track only (`transcriptionJobs.pickEnglishTrack`).
    const canFuse = verdict === 'ja' && subtitleLangMatches(helperTrack.lang, 'en') && !fusionFailed;
    if (!(canFuse && startFusion(item, helperTrack)) && settings.autoTranslate) {
      await translateInto(item, helperTrack, study, settings);
    }
  } else if (!studyTrack && !helperTrack && settings.autoTranscribe) {
    if (!recentAttempt(item, 'transcribe', undefined, study, ['failed', 'queued']) && (await audioVerdict(item)) === 'ja') {
      if (enqueueTranscription({ mediaId, lang: study }).ok) {
        recordAttempt(mediaId, { task: 'transcribe', to: study, at: Date.now(), outcome: 'queued' });
      }
    }
  }

  const latest = findItem(mediaId);
  if (latest && host) {
    host.patchItems([mediaId], { subtitleAuto: { ...(latest.subtitleAuto ?? {}), preparedAt: Date.now() } });
  }
  refresh([mediaId]);
}

async function drain(): Promise<void> {
  while (queue.length) {
    const next = queue.shift();
    if (!next) break;
    try {
      await prepareItem(next.mediaId);
    } catch {
      /* one item's failure must not stall the queue */
    }
  }
}

function kick(): Promise<void> {
  if (!draining) {
    draining = drain().finally(() => {
      draining = null;
    });
  }
  return draining;
}

/**
 * The upcoming episodes of a title the user just marked Watching: in episode
 * order, the first few never opened. Not the season — translating twenty-four
 * episodes nobody may watch is exactly the cost this queue exists to avoid.
 */
export function watchingAhead(items: readonly MediaItem[], count = WATCHING_AHEAD): MediaItem[] {
  return [...items]
    .filter((item) => subtitleDiscoveryEligible(item) && !item.lastPlayedAt)
    .sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0) || a.addedAt - b.addedAt)
    .slice(0, count);
}

/**
 * Queues preparation. `play` goes to the front of the queue (the user is waiting
 * for it); everything else joins the back, and is dropped once the queue is full.
 * Returns how many items were queued.
 */
export function requestSubtitlePreparation(
  mediaIds: readonly string[],
  reason: SubtitlePrepareReason = 'play',
): number {
  if (!host) return 0;
  const items = host.listItems();
  const byId = new Map(items.map((item) => [item.id, item]));
  let targets = mediaIds
    .map((id) => byId.get(id))
    .filter((item): item is MediaItem => !!item && subtitleDiscoveryEligible(item));
  if (reason === 'watching') targets = watchingAhead(targets);

  let added = 0;
  const now = Date.now();
  for (const item of targets) {
    // The player asks again on every library change (it re-reads its track when
    // `media:changed` fires), and preparing an item changes the library. Without
    // this, one play would be a loop: prepare → patch → changed → play → prepare.
    if (reason === 'play') {
      const last = lastPlayRequest.get(item.id);
      if (last !== undefined && now - last < PLAY_REPEAT_MS) continue;
      lastPlayRequest.set(item.id, now);
    }
    const index = queue.findIndex((entry) => entry.mediaId === item.id);
    if (index >= 0) {
      if (reason === 'play' && index > 0) queue.unshift(...queue.splice(index, 1));
      continue;
    }
    if (reason === 'play') queue.unshift({ mediaId: item.id, reason });
    else if (queue.length < MAX_PENDING) queue.push({ mediaId: item.id, reason });
    else continue;
    added += 1;
  }
  if (added || queue.length) void kick();
  return added;
}

/** Every file of a series, for a Watching request that names the series rather than files. */
export function requestSeriesPreparation(seriesKey: string, reason: SubtitlePrepareReason = 'watching'): number {
  if (!host || !seriesKey) return 0;
  const ids = host.listItems().filter((item) => item.seriesKey === seriesKey).map((item) => item.id);
  return requestSubtitlePreparation(ids, reason);
}

/** Resolves when the queue is empty. For tests and for callers that want to await a play's preparation. */
export function subtitlePreparationIdle(): Promise<void> {
  return draining ?? Promise.resolve();
}

// ---------------------------------------------------------------------------
// Player hand-off
// ---------------------------------------------------------------------------

/**
 * The helper-line track for an item, as `media:secondarySubtitleForPath` returns
 * it. Picked together with the study line, so it can never be the same track.
 */
export function secondarySubtitleForItem(item: MediaItem): SecondarySubtitlePick | null {
  const settings = loadDiscoverySettings();
  const { secondary } = pickSubtitlePair(
    item.subtitles,
    studyLanguage(settings),
    settings.helperLanguage,
    item.preferredSubtitleId,
  );
  if (!secondary) return null;
  const text = readSubtitleRecord(secondary);
  if (!text) return null;
  return {
    name: secondary.label ?? `${secondary.lang} (${secondary.source})`,
    text,
    lang: secondary.lang,
    recordId: secondary.id,
    source: subtitleRecordStatusSource(secondary),
    machineTranslated: isMachineTranslatedSubtitle(secondary),
  };
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

export function subtitleAutoNotices(): SubtitleAutoNotices {
  const settings = loadDiscoverySettings();
  return activeSubtitleNotices(settings.dismissedNotices, {
    hasOpenSubtitlesKey: hasSubtitleProviderKey('opensubtitles'),
    translationAvailable: !!resolveSubtitleTranslationEngine(settings.translationEngine),
  });
}

export function dismissSubtitleAutoNotice(id: unknown): SubtitleAutoNotices {
  if (typeof id === 'string' && (SUBTITLE_AUTO_NOTICES as readonly string[]).includes(id)) {
    const settings = loadDiscoverySettings();
    if (!settings.dismissedNotices.includes(id)) {
      saveDiscoverySettings({ ...settings, dismissedNotices: [...settings.dismissedNotices, id] });
    }
  }
  const notices = subtitleAutoNotices();
  broadcast('subtitleAuto:notices', notices);
  return notices;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

function onTranscription(progress: { mediaId: string; phase: string; error?: string }): void {
  const { mediaId, phase } = progress;
  if (phase !== 'done' && phase !== 'error' && phase !== 'cancelled') {
    // Whisper reports per chunk; the status only needs to be current, not per chunk.
    if (fusing.has(mediaId)) scheduleRefresh([mediaId]);
    return;
  }
  if (fusing.delete(mediaId)) {
    recordAttempt(mediaId, {
      task: 'fuse', from: 'en', to: 'ja', at: Date.now(),
      outcome: phase === 'done' ? 'done' : 'failed',
      ...(phase === 'done' ? {} : { reason: progress.error ?? phase }),
    });
    // A fusion that failed (no Whisper model, no window, unreadable audio) falls
    // back to translating the English track — once, through the normal queue.
    if (phase === 'error') requestSubtitlePreparation([mediaId], 'retry');
  }
  refresh([mediaId]);
}

/**
 * Subscribes without letting a failure escape. This runs inside
 * `registerMediaIpc`, and a throw here would abort every media handler
 * registered after it — the automation is an enhancement and must never cost
 * the library its IPC. Without a subscription the status is still correct when
 * queried; only the push event for that source is lost.
 */
function subscribe(start: () => () => void): void {
  try {
    unsubscribers.push(start());
  } catch {
    /* see above */
  }
}

export function registerSubtitleAutoIpc(autoHost: SubtitleAutoHost): void {
  host = autoHost;
  for (const stop of unsubscribers.splice(0)) stop();

  subscribe(() => onSubtitleDiscoveryEvent((event) => {
    if (event.type === 'records') scheduleRefresh(event.mediaIds);
    else if (event.type === 'progress' && STATUS_PHASES.has(event.progress.phase)) {
      scheduleRefresh([event.progress.mediaId]);
    }
  }));
  subscribe(() => onMainTranscriptionProgress(onTranscription));
  subscribe(() => onSubtitleNoticesChanged(() => broadcast('subtitleAuto:notices', subtitleAutoNotices())));

  ipcMain.handle('subtitleAuto:status', (_e, mediaIds?: unknown) =>
    subtitleAutoStatuses(Array.isArray(mediaIds) ? mediaIds.filter((id): id is string => typeof id === 'string') : undefined));
  ipcMain.handle('subtitleAuto:prepare', (_e, request?: unknown) => {
    const raw = (request && typeof request === 'object' ? request : {}) as {
      mediaIds?: unknown; seriesKey?: unknown; reason?: unknown;
    };
    const reason: SubtitlePrepareReason = raw.reason === 'watching' || raw.reason === 'manual' ? raw.reason : 'play';
    const ids = Array.isArray(raw.mediaIds) ? raw.mediaIds.filter((id): id is string => typeof id === 'string') : [];
    const queued = typeof raw.seriesKey === 'string' && raw.seriesKey
      ? requestSeriesPreparation(raw.seriesKey, reason)
      : requestSubtitlePreparation(ids, reason);
    return { queued };
  });
  ipcMain.handle('subtitleAuto:notices', () => subtitleAutoNotices());
  ipcMain.handle('subtitleAuto:dismissNotice', (_e, id: unknown) => dismissSubtitleAutoNotice(id));
}

/** Test seam: forget all in-memory state. */
export function resetSubtitleAutoForTests(): void {
  queue.length = 0;
  lastPlayRequest.clear();
  pendingRefresh.clear();
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  generating.clear();
  searching.clear();
  fusing.clear();
  itemNotices.clear();
  lastStatus.clear();
  audioVerdicts.clear();
}
