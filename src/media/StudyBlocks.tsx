/**
 * The small Study Blocks — the ones that are a panel rather than a subsystem.
 *
 * The three big panels (grammar, mining, transcript) already had components. These are
 * the rest of the registry, and every one of them renders real data or routes to a real
 * surface. Nothing here is a shell: where the app has no such feature the block is
 * marked `planned` in the registry and is never offered, rather than being drawn empty.
 */
import React from 'react';
import type { VideoCore_VideoPlaybackInfo } from '@/app/(main)/_features/video-core/video-core.atoms';
import type { VideoCoreActiveCue } from '@/app/(main)/_features/video-core/video-core-subtitles';
import {
  normalizeVideoCoreMiningHistory,
  VIDEO_CORE_MINING_HISTORY_EVENT,
  VIDEO_CORE_MINING_HISTORY_KEY,
  type VideoCoreMiningHistoryEntry,
  type VideoCoreMiningSource,
} from '../shared/videoCoreMining';
import { findMinedCueEntry } from '../shared/seanimeWatchLoop';
import { MINING_HISTORY_STATUS_KEY } from '../shared/mediaWorkspaceLabels';
import { useT } from '../renderer/i18n';

/* ------------------------------------------------------------------------------ *
 * App-owned blocks
 *
 * The feature is real and lives elsewhere in this app. The block says where, and the
 * button goes there — it does not re-implement the surface inside the player, and it
 * does not pretend the player already had it.
 * ------------------------------------------------------------------------------ */

const APP_SECTION: Readonly<Record<string, string>> = {
  notes: 'files',
  library: 'library',
  statistics: 'stats',
  review: 'anki',
};

export function StudyAppOwnedBlock({
  blockId,
  titleKey,
}: {
  blockId: string;
  titleKey: string;
}): React.ReactElement {
  const { t } = useT();
  const section = APP_SECTION[blockId];
  return (
    <section className="study-mini-block" data-study-block={blockId}>
      <h3>{t(titleKey)}</h3>
      <p>{t('studyWorkspace.appOwnedHint')}</p>
      <button
        type="button"
        data-study-action="open-app-section"
        data-section={section}
        onClick={() => {
          // The app's own routing event, the same one the command palette and the
          // extension bridge use. No second navigation mechanism.
          window.dispatchEvent(new CustomEvent('os:open', { detail: section }));
        }}
      >
        {t('studyWorkspace.openInApp')}
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------------------ *
 * Study HUD
 * ------------------------------------------------------------------------------ */

/**
 * One compact status line instead of indicators scattered over the picture.
 *
 * Only values the player actually holds. There is no JLPT level, difficulty score or
 * subtitle-confidence number anywhere in this surface, so those rows are absent rather
 * than filled with a plausible-looking constant.
 */
export function StudyHudBlock({
  cue,
  cueCount,
  trackLabel,
  subtitleDelaySec,
  playbackRate,
  source,
  mineSignal,
}: {
  cue: VideoCoreActiveCue | null;
  cueCount: number;
  trackLabel: string;
  subtitleDelaySec: number;
  playbackRate: number;
  source: VideoCoreMiningSource | null;
  /** The mining panel's export counter — what makes "mined" go true without polling. */
  mineSignal: number;
}): React.ReactElement {
  const { t } = useT();
  /*
    Read from storage, not from a prop, and only when the line or the mine count
    changes. Doing it per render would put a `localStorage` parse in the path of every
    `timeupdate`, which is four to five times a second while a video plays.
  */
  const mined = React.useMemo(() => {
    if (!cue || !source) return false;
    return !!findMinedCueEntry(loadHistory(), source, cue);
  }, [cue, mineSignal, source]);

  return (
    <section className="study-mini-block study-hud" data-study-block="studyHud">
      <dl>
        <div>
          <dt>{t('studyWorkspace.hud.line')}</dt>
          <dd>{cue ? `${cue.index + 1} / ${cueCount}` : '—'}</dd>
        </div>
        <div>
          <dt>{t('studyWorkspace.hud.track')}</dt>
          <dd title={trackLabel}>{trackLabel}</dd>
        </div>
        <div>
          <dt>{t('mediaWorkspace.study.subtitleOffset')}</dt>
          <dd>{subtitleDelaySec >= 0 ? '+' : ''}{subtitleDelaySec.toFixed(1)}s</dd>
        </div>
        <div>
          <dt>{t('mediaWorkspace.study.playbackSpeed')}</dt>
          <dd>{playbackRate.toFixed(2)}x</dd>
        </div>
        <div>
          <dt>{t('studyWorkspace.hud.mined')}</dt>
          <dd>{t(mined ? 'studyWorkspace.hud.minedYes' : 'studyWorkspace.hud.minedNo')}</dd>
        </div>
      </dl>
    </section>
  );
}

/* ------------------------------------------------------------------------------ *
 * Media information
 * ------------------------------------------------------------------------------ */

/**
 * Resolve the on-screen name of the playing media.
 *
 * Study content, never translated — the same order `miningSourceFromPlayback` uses so
 * one file does not acquire two names across two surfaces. Exported because the
 * detached copy of this block gets a name over IPC and must derive it identically.
 */
export function mediaDisplayName(playbackInfo: VideoCore_VideoPlaybackInfo | null): string {
  const title = playbackInfo?.media?.title;
  return title?.userPreferred || title?.romaji || title?.english || title?.native
    || playbackInfo?.localFile?.path?.split(/[\\/]/).pop()
    || playbackInfo?.streamPath
    || '—';
}

/**
 * `durationSec` rather than the `<video>` element it used to take.
 *
 * The element was read for exactly one number, and holding it made the block
 * un-detachable: a second renderer process has no video in it. Passing the number is
 * what lets the same component render in the player and in its own window.
 */
export function MediaInfoBlock({
  name,
  episodeNumber,
  streamType,
  durationSec,
  trackCount,
  audioTrackCount,
}: {
  name: string;
  episodeNumber: number | null;
  streamType: string;
  durationSec: number;
  trackCount: number;
  audioTrackCount: number;
}): React.ReactElement {
  const { t } = useT();
  const duration = Number.isFinite(durationSec) ? durationSec : 0;
  const minutes = Math.floor(duration / 60);
  const seconds = Math.round(duration % 60);

  return (
    <section className="study-mini-block" data-study-block="mediaInfo">
      <dl>
        <div><dt>{t('mediaWorkspace.mining.media')}</dt><dd title={name}>{name}</dd></div>
        {episodeNumber != null && (
          <div>
            <dt>{t('mediaWorkspace.mining.episodeLabel')}</dt>
            <dd>{episodeNumber}</dd>
          </div>
        )}
        <div>
          <dt>{t('studyWorkspace.info.duration')}</dt>
          <dd>{duration > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : '—'}</dd>
        </div>
        <div>
          <dt>{t('studyWorkspace.info.streamType')}</dt>
          <dd>{streamType || '—'}</dd>
        </div>
        <div>
          <dt>{t('mediaWorkspace.study.subtitleTrack')}</dt>
          <dd>{trackCount}</dd>
        </div>
        <div>
          <dt>{t('mediaWorkspace.study.audioTrack')}</dt>
          <dd>{audioTrackCount}</dd>
        </div>
      </dl>
    </section>
  );
}

/* ------------------------------------------------------------------------------ *
 * Mining queue
 * ------------------------------------------------------------------------------ */

function loadHistory(): VideoCoreMiningHistoryEntry[] {
  try {
    return normalizeVideoCoreMiningHistory(
      JSON.parse(localStorage.getItem(VIDEO_CORE_MINING_HISTORY_KEY) ?? '[]'),
    );
  } catch {
    return [];
  }
}

/**
 * What has been mined, as its own block.
 *
 * Reads the same store the mining panel writes, and re-reads it whenever a mine has
 * happened — `mineSignal` is the panel's own export counter, so the queue is fresh
 * without polling `localStorage` on a timer while a video is playing.
 */
export function MiningQueueBlock({ mineSignal }: { mineSignal: number }): React.ReactElement {
  const { t } = useT();
  const [history, setHistory] = React.useState<VideoCoreMiningHistoryEntry[]>(loadHistory);
  React.useEffect(() => setHistory(loadHistory()), [mineSignal]);
  // The mine finishes after the signal (Anki answers later), so also follow the log itself.
  React.useEffect(() => {
    const reload = (): void => setHistory(loadHistory());
    window.addEventListener(VIDEO_CORE_MINING_HISTORY_EVENT, reload);
    return () => window.removeEventListener(VIDEO_CORE_MINING_HISTORY_EVENT, reload);
  }, []);

  const recent = history.slice(-12).reverse();
  return (
    <section className="study-mini-block" data-study-block="miningQueue">
      <h3>{t('mediaWorkspace.mining.history')}</h3>
      {recent.length === 0 ? (
        <p>{t('studyWorkspace.queueEmpty')}</p>
      ) : (
        <ul className="study-queue-list">
          {recent.map((entry) => (
            <li key={entry.id} data-history-status={entry.status}>
              <span title={entry.term || entry.sentence}>{entry.term || entry.sentence}</span>
              <small>
                {t(MINING_HISTORY_STATUS_KEY[entry.status])}
                {entry.destination ? ` · ${entry.destination}` : ''}
              </small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------------------ *
 * Listening practice
 * ------------------------------------------------------------------------------ */

/**
 * Audio-first comprehension: subtitles off, revealed on demand or after a delay.
 *
 * Every control here drives something that already existed — the primary-subtitle
 * preference, the replay-line action and the playback rate. What the block adds is the
 * *delay*, which is the one thing listening practice needs and the player had no way to
 * express: hide the line, try to catch it, let it appear a few seconds in.
 */
export function ListeningBlock({
  hidden,
  onHiddenChange,
  onReplay,
  cueKey,
}: {
  /** The study line is hidden for listening — session state owned by the overlay. */
  hidden: boolean;
  onHiddenChange: (hidden: boolean) => void;
  onReplay: () => void;
  /** Changes when the line changes, which is what re-arms the reveal timer. */
  cueKey: string;
}): React.ReactElement {
  const { t } = useT();
  const [delaySec, setDelaySec] = React.useState(0);
  const revealed = !hidden;

  /*
    Re-arm on every new line, so "reveal after N seconds" means after N seconds of THIS line
    rather than N seconds after the block was opened. Session state only: this used to write
    the saved "show subtitles" preference twice per line, and closing the block mid-delay left
    the user's subtitles switched off for good.
  */
  React.useEffect(() => {
    if (delaySec <= 0) return undefined;
    onHiddenChange(true);
    const timer = window.setTimeout(() => onHiddenChange(false), delaySec * 1000);
    return () => window.clearTimeout(timer);
  }, [cueKey, delaySec, onHiddenChange]);
  // Closing the block always gives the line back.
  React.useEffect(() => () => onHiddenChange(false), [onHiddenChange]);

  return (
    <section className="study-mini-block" data-study-block="listening">
      <h3>{t('studyWorkspace.block.listening')}</h3>
      <div className="study-mini-actions">
        <button
          type="button"
          data-study-action="listening-reveal"
          aria-pressed={revealed}
          onClick={() => onHiddenChange(revealed)}
        >
          {t(revealed
            ? 'studyWorkspace.listening.hide'
            : 'studyWorkspace.listening.reveal')}
        </button>
        <button type="button" data-study-action="listening-replay" onClick={onReplay}>
          {t('mediaWorkspace.study.replayLine')}
        </button>
        <label>
          {t('studyWorkspace.listening.delay')}
          <select
            value={delaySec}
            aria-label={t('studyWorkspace.listening.delay')}
            onChange={(event) => setDelaySec(Number(event.currentTarget.value))}
          >
            <option value={0}>{t('common.off')}</option>
            {[2, 4, 8].map((seconds) => (
              <option key={seconds} value={seconds}>{t('studyLoop.player.seconds', { seconds })}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="study-mini-note">
        {t(revealed
          ? 'studyWorkspace.listening.shown'
          : 'studyWorkspace.listening.hidden')}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------------------ *
 * AI workspace
 * ------------------------------------------------------------------------------ */

export type AiMode = 'analysis' | 'translation';

/**
 * One AI surface with modes, instead of an AI panel per AI feature.
 *
 * It does not own the analysis: `useCueAnalysis` lives in the overlay and the grammar
 * view renders from it, so clicking a word on the subtitle and clicking it here are one
 * act. The mode is chosen automatically by the contextual rules and can be changed by
 * hand — both, as the brief requires.
 */
export function AiWorkspaceBlock({
  mode,
  onModeChange,
  analysis,
  translation,
  translationBusy,
  onTranslate,
  hasCue,
}: {
  mode: AiMode;
  onModeChange: (mode: AiMode) => void;
  analysis: React.ReactNode;
  translation: string;
  translationBusy: boolean;
  onTranslate: () => void;
  hasCue: boolean;
}): React.ReactElement {
  const { t } = useT();
  return (
    <section className="study-mini-block study-ai-block" data-study-block="aiWorkspace">
      <div className="study-ai-modes" role="tablist" aria-label={t('studyWorkspace.block.aiWorkspace')}>
        {(['analysis', 'translation'] as const).map((entry) => (
          <button
            key={entry}
            type="button"
            role="tab"
            aria-selected={mode === entry}
            data-study-action="ai-mode"
            data-mode={entry}
            onClick={() => onModeChange(entry)}
          >
            {t(entry === 'analysis'
              ? 'studyWorkspace.block.sentenceAnalysis'
              : 'studyWorkspace.block.translation')}
          </button>
        ))}
      </div>
      <div className="study-ai-body" role="tabpanel">
        {mode === 'analysis' ? analysis : (
          <div className="study-ai-translation">
            <button
              type="button"
              disabled={!hasCue || translationBusy}
              onClick={onTranslate}
            >
              {t(translationBusy
                ? 'mediaWorkspace.study.translating'
                : 'mediaWorkspace.study.translateLine')}
            </button>
            {translation ? <p>{translation}</p> : null}
          </div>
        )}
      </div>
    </section>
  );
}
