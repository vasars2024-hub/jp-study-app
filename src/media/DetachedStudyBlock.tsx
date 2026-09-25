/**
 * One Study Block, alone in its own OS window.
 *
 * The whole point of this file is what it does *not* contain: a second implementation
 * of anything. Every block below renders the exact component the docked block renders —
 * `VideoCoreTranscriptPanel`, `VideoCoreGrammarPanel`, `AiWorkspaceBlock`,
 * `MiningQueueBlock`, `MediaInfoBlock`, `StudyHudBlock`. A detached transcript that was
 * a simplified copy would drift from the docked one within a release, and the two would
 * disagree about what a mined line looks like.
 *
 * What differs is only where the data comes from: a `StudyDetachSnapshot` pushed by the
 * host, instead of hooks over a live `<video>` element that this process does not have.
 * Interactions travel back the other way as `StudyDetachCommand`s.
 *
 * ## Why the window can be closed at any moment and nothing breaks
 *
 * Closing is not coordinated. Main notices the window went away and broadcasts;
 * `useStudyDetach` in the host sees the block is no longer live and re-docks it. The
 * explicit "return to the player" button below does the same thing one step earlier, by
 * sending `closing` before it closes, so the panel is already back in its dock by the
 * time the window disappears rather than a frame later.
 */
import React from 'react';
import {
  emptyDetachSnapshot,
  mergeDetachSnapshot,
  parseDetachTarget,
  type HostedDetachBlockId,
  type StudyDetachCommand,
  type StudyDetachSnapshot,
} from '../shared/studyDetach';
import type { CueAnalysisState } from './useCueAnalysis';
import type { StudyLang } from '../renderer/studyEnvironment';
import { normalizeStudyLang } from '../shared/studyLang';
import { canPresentLiquid } from '../renderer/liquidWindowPresentation';
import { useT } from '../renderer/i18n';
import './mediaWorkspace.css';
import './studyWorkspace.css';
import VideoCoreTranscriptPanel from './VideoCoreTranscriptPanel';
import VideoCoreGrammarPanel from './VideoCoreGrammarPanel';
import {
  AiWorkspaceBlock,
  MediaInfoBlock,
  MiningQueueBlock,
  StudyHudBlock,
} from './StudyBlocks';

const TITLE_KEY: Readonly<Record<HostedDetachBlockId, string>> = {
  transcript: 'studyWorkspace.block.transcript',
  grammar: 'studyWorkspace.block.grammar',
  aiWorkspace: 'studyWorkspace.block.aiWorkspace',
  miningQueue: 'studyWorkspace.block.miningQueue',
  mediaInfo: 'studyWorkspace.block.mediaInfo',
  studyHud: 'studyWorkspace.block.studyHud',
};

/**
 * The snapshot, kept current.
 *
 * `mergeDetachSnapshot` is applied here as well as in main because a window that opens
 * mid-stream can receive a light frame (`cues: null`) before it has ever seen a full
 * one; without the merge its transcript would blank out on the next tick.
 */
function useDetachSnapshot(surface: string): StudyDetachSnapshot {
  const [snapshot, setSnapshot] = React.useState<StudyDetachSnapshot>(emptyDetachSnapshot);

  React.useEffect(() => {
    if (typeof window.api?.onStudyBlockSync !== 'function') return undefined;
    let alive = true;
    void window.api.studyBlockRequestSnapshot(surface).then((initial) => {
      if (alive && initial) setSnapshot((previous) => mergeDetachSnapshot(previous, initial));
    }).catch(() => undefined);
    const off = window.api.onStudyBlockSync((next) => {
      setSnapshot((previous) => {
        // Frames can overtake each other on a busy channel. A stale one would rewind
        // the active line, which looks exactly like a seek the user did not ask for.
        if (next.revision && previous.revision > next.revision
          && previous.sourceId === next.sourceId) {
          return previous;
        }
        return mergeDetachSnapshot(previous, next);
      });
    });
    return () => {
      alive = false;
      off();
    };
  }, [surface]);

  return snapshot;
}

export default function DetachedStudyBlock({
  blockId: blockIdProp,
  surface: surfaceProp,
}: {
  /**
   * Which block to render. Defaults to the window's own URL, which is how the real
   * window works; passing it explicitly is for the dev harness, which shows all six in
   * one page and has only one URL between them.
   */
  blockId?: HostedDetachBlockId;
  surface?: string;
} = {}): React.ReactElement | null {
  const { t } = useT();
  const fromUrl = React.useMemo(() => parseDetachTarget(window.location.search), []);
  const target = blockIdProp
    ? { blockId: blockIdProp, surface: surfaceProp ?? fromUrl?.surface ?? 'workspace' }
    : fromUrl;
  const surface = target?.surface ?? 'workspace';
  const snapshot = useDetachSnapshot(surface);

  const send = React.useCallback((command: StudyDetachCommand): void => {
    window.api?.studyBlockSendCommand?.(surface, command);
  }, [surface]);

  const blockId = target?.blockId;

  /* Returning the block to the player, from the window's own chrome. */
  const returnToPlayer = React.useCallback((): void => {
    if (blockId) send({ type: 'closing', blockId });
    window.close();
  }, [blockId, send]);

  /*
    Escape returns the block, matching the docked contract: Escape resolves the
    temporary surface you are looking at. There is no playback in this window for it to
    fall through to, so it is unconditional here.
  */
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) returnToPlayer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [returnToPlayer]);

  if (!blockId) return null;

  /*
    Asked through the shared policy, not hardcoded here, so presentability and
    reversibility stay one expression — the boss-audit finding that made
    `canPresentLiquid` a single function in the first place. It is `false` for
    every block; the call exists so a future block that DID disclose a Liquid
    region would change one rule rather than this render.
  */
  const liquidAllowed = canPresentLiquid(blockId, 'detached');

  const lang: StudyLang = normalizeStudyLang(snapshot.studyLang);
  const cues = snapshot.cues ?? [];
  const activeCue = snapshot.activeIndex != null
    ? cues.find((cue) => cue.index === snapshot.activeIndex) ?? null
    : null;
  const analysisState = (snapshot.analysis ?? { kind: 'idle' }) as CueAnalysisState;

  const grammar = (
    <VideoCoreGrammarPanel
      state={analysisState}
      lang={lang}
      selectedIndex={snapshot.selectedAnnotation}
      onSelectedIndexChange={(index) => send({ type: 'select-annotation', index })}
      onAnalyzeNow={() => send({ type: 'analyze-now' })}
      /*
        The dictionary card opens in the *player's* window, not this one. It is
        positioned at the word that was clicked and the click happened over there;
        a card that appeared on this monitor would answer a question asked on another.
      */
      onLookup={(query, context) => send({ type: 'lookup', query, context })}
    />
  );

  let body: React.ReactNode = null;
  switch (blockId) {
    case 'transcript':
      body = (
        <VideoCoreTranscriptPanel
          cues={cues}
          activeIndex={snapshot.activeIndex}
          lang={lang}
          trackLabel={snapshot.trackLabel}
          onSeek={(cue) => send({ type: 'seek-cue', index: cue.index })}
          onClose={returnToPlayer}
        />
      );
      break;
    case 'grammar':
      body = grammar;
      break;
    case 'aiWorkspace':
      body = (
        <AiWorkspaceBlock
          mode={snapshot.aiMode}
          onModeChange={(mode) => send({ type: 'set-ai-mode', mode })}
          hasCue={!!activeCue}
          translation={snapshot.translation}
          translationBusy={snapshot.translationBusy}
          onTranslate={() => send({ type: 'translate' })}
          analysis={grammar}
        />
      );
      break;
    case 'miningQueue':
      // Reads the same `localStorage` history the player writes — same origin, same
      // store, so nothing about it needs to travel. `mineSignal` is only the nudge
      // that says "re-read now".
      body = <MiningQueueBlock mineSignal={snapshot.mineSignal} />;
      break;
    case 'mediaInfo':
      body = (
        <MediaInfoBlock
          name={snapshot.mediaName || '—'}
          episodeNumber={snapshot.episode}
          streamType={snapshot.streamType}
          durationSec={snapshot.durationSec}
          trackCount={snapshot.trackCount}
          audioTrackCount={snapshot.audioTrackCount}
        />
      );
      break;
    case 'studyHud':
      body = (
        <StudyHudBlock
          cue={activeCue}
          cueCount={cues.length}
          trackLabel={snapshot.trackLabel}
          subtitleDelaySec={snapshot.subtitleDelaySec}
          playbackRate={snapshot.playbackRate}
          source={snapshot.miningSource}
          mineSignal={snapshot.mineSignal}
        />
      );
      break;
  }

  return (
    <div
      /*
        `#media-workspace` is not decoration: `mediaWorkspace.css` and
        `studyWorkspace.css` scope every one of their selectors under that id, so the
        panels below are styled by the same rules that style them in the player. Without
        it a detached transcript would render as unstyled markup — and duplicating the
        rules under a second id is how the two copies drift apart.
      */
      id="media-workspace"
      className="detached-study-block"
      data-detached-block={blockId}
      data-connected={snapshot.revision > 0 ? 'true' : 'false'}
      /*
        L4 parity, recorded 2026-09-02 against rows 11 and 12 and repaired here:
        this window carried NO presentation at all — `data-presentation` null and
        zero `[class*="liquid"]` nodes — while the host it was detached FROM was
        Liquid and `lq.workspace.presentation` was set in the same origin. That is
        indistinguishable from a host nobody has wired yet, which is the state L3
        exists to make impossible in either direction.

        So the answer is declared rather than left absent. The other three hosts
        render `data-presentation={presentable ? … : undefined}`, because for them
        absence means "this section could present and this one does not". Here
        absence would mean the wrong thing, so this host DIVERGES: it always
        declares what it is, plus why it can be nothing else. A probe reading the
        root can now tell a decision from an omission without reading source.
      */
      data-presentation={liquidAllowed ? 'liquid' : 'standard'}
      data-presentation-locked={liquidAllowed ? undefined : 'dense-work'}
    >
      <header className="detached-study-header">
        <h1>{t(TITLE_KEY[blockId])}</h1>
        <span className="detached-study-media" title={snapshot.mediaName}>
          {snapshot.mediaName}
        </span>
        <button
          type="button"
          data-study-action="return-to-player"
          onClick={returnToPlayer}
        >
          {t('studyWorkspace.detach.return')}
        </button>
      </header>
      {snapshot.revision === 0 ? (
        /*
          Honest, not decorative: a detached window can outlive the player that fed it
          (the user closed the episode). Saying so beats a panel that silently shows the
          last line of a video that is no longer playing.
        */
        <p className="detached-study-waiting">{t('studyWorkspace.detach.waiting')}</p>
      ) : null}
      <div className="detached-study-body">{body}</div>
    </div>
  );
}
