import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaItem } from '../../../shared/types';
import type { Cue } from '../../subtitles';
import {
  buildMediaStudyActions,
  MEDIA_STUDY_EVENT,
  parseMediaStudyRequest,
  type MediaStudyRequest,
} from '../../../shared/mediaStudyIntegration';
import {
  addMediaStudyFlashcards,
  analyzeMediaStudyCues,
  createMediaLanguageProfile,
  type MediaStudyAnalysis,
} from '../../mediaStudyWorkflow';
import {
  addMediaStudySessionProgress,
  endMediaStudySession,
  saveMediaLanguageProfile,
  startMediaStudySession,
} from '../../mediaStudyStore';
import { dispatchMediaStudyAction } from './MediaStudyActions';
import { openMediaWorkspace, reachMediaWorkspace } from '../../mediaWorkspaceBridge';
import { useT } from '../../i18n';
import MediaLanguageProfileCard from './MediaLanguageProfileCard';
import MediaStudyAssistantPanel from './MediaStudyAssistantPanel';
import { clearHandoff, peekHandoff } from '../../pendingHandoff';

function pendingRequest(): MediaStudyRequest | null {
  try {
    return parseMediaStudyRequest(JSON.parse(peekHandoff('studyMediaRequest') ?? 'null'));
  } catch {
    return null;
  }
}

/**
 * Open the episode in the adopted player, at a second when one is given — slice 19.
 *
 * This used to be `os:open 'video'` plus a seek parked in `sessionStorage` under
 * `jp-pending-study-media-seek`, to be picked up by whichever player mounted next. That
 * worked while the legacy player mounted inside this same view: it set `isPlayerVisible`,
 * and this component consumed its own key. Retirement routed `video` to the adopted
 * workspace and slice 16 deleted the legacy player, so the seek had **no reader left in
 * the app** — a sweep for that key found exactly this file. The request opened a player
 * at zero, or, from a pop-out with no host, opened nothing at all.
 *
 * `openMediaWorkspace` carries the position in the request itself, which is the channel
 * `startAtSec` was built for and the one the Continue-watching command already uses.
 */
async function openInPlayer(
  item: MediaItem,
  startAtSec: number | undefined,
  say: (key: string) => void,
): Promise<void> {
  const reach = await reachMediaWorkspace();
  if (reach === 'no-host') {
    say('media.study.noWorkspaceHere');
    return;
  }
  if (reach === 'unavailable') {
    say('media.study.playerUnavailable');
    return;
  }
  openMediaWorkspace({ localFilePath: item.path, startAtSec });
}

function clearPendingRequest(): void {
  try {
    clearHandoff('studyMediaRequest', 'studyMediaId');
  } catch {
    // Storage is optional.
  }
}

function formatCueTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}

interface MediaStudyModeProps {
  items: MediaItem[];
  current: MediaItem | null;
  cues: Cue[];
  activeCue: Cue | null;
  positionSec: number;
  onOpen: (id: string) => Promise<void>;
  onLoadSubtitles: () => Promise<void>;
  /** Start Whisper on the open media; used when analysis is asked for with no cues. */
  onTranscribe?: () => void;
  /** True while Whisper is extracting/loading/transcribing. */
  isTranscribing?: boolean;
}

/** Inline study hand-off surface shared by the library and video entry points. */
export default function MediaStudyMode({
  items,
  current,
  cues,
  activeCue,
  positionSec,
  onOpen,
  onLoadSubtitles,
  onTranscribe,
  isTranscribing = false,
}: MediaStudyModeProps) {
  const { t, lang } = useT();
  const [request, setRequest] = useState<MediaStudyRequest | null>(null);
  const [analysisState, setAnalysisState] = useState<{
    key: string;
    value: MediaStudyAnalysis;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const positionRef = useRef(positionSec);
  positionRef.current = positionSec;

  useEffect(() => {
    const onStudy = (event: Event): void => {
      const next = parseMediaStudyRequest((event as CustomEvent<unknown>).detail);
      if (next) setRequest(next);
    };
    window.addEventListener(MEDIA_STUDY_EVENT, onStudy);
    const stored = pendingRequest();
    if (stored) setRequest(stored);
    return () => window.removeEventListener(MEDIA_STUDY_EVENT, onStudy);
  }, []);

  useEffect(() => {
    if (!request) return;
    const sessionId = startMediaStudySession({
      mediaId: request.mediaId,
      title: request.title,
      action: request.action,
      positionSec: positionRef.current,
    }, request.requestedAt);
    setActiveSessionId(sessionId);
    setStatus('');
  }, [request]);

  // `lang` rather than `t` — `t`'s identity is stable by design, so depending on it goes
  // stale after a language switch instead of erroring.
  const say = useCallback((key: string): void => {
    window.dispatchEvent(new CustomEvent('os:toast', {
      detail: { message: t(key), kind: 'muted' },
    }));
  }, [lang]);

  /**
   * One open per request, not one per render. `onOpen` sets `current`, which re-runs this
   * effect — and unlike the old `os:open 'video'` dispatch there is no `isPlayerVisible`
   * flipping to true to stop the second one. A repeat carries a fresh `requestId`, which
   * the host reads as a new playback request and would restart the episode from the top.
   */
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!request) return;
    if (current?.id !== request.mediaId) {
      void onOpen(request.mediaId);
    }
    if (request.action !== 'study-episode') return;
    const key = `${request.mediaId}@${request.requestedAt}`;
    if (openedFor.current === key) return;
    // The library may not have arrived yet; `items` is in the deps so this retries.
    const target = items.find((candidate) => candidate.id === request.mediaId);
    if (!target) return;
    openedFor.current = key;
    void openInPlayer(target, undefined, say);
  }, [current?.id, items, onOpen, request, say]);

  // "Analyze Japanese" with no cues yet: run Whisper, then let the analysis
  // effect below pick the cues up on its own. Keyed by media id so a failed or
  // empty run does not retrigger in a loop.
  const transcribeStartedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!request || request.action !== 'analyze-japanese') return;
    if (!onTranscribe || current?.id !== request.mediaId) return;
    if (cues.length > 0 || isTranscribing) return;
    if (transcribeStartedFor.current === request.mediaId) return;
    transcribeStartedFor.current = request.mediaId;
    setStatus(t('media.study.transcribingFirst'));
    onTranscribe();
    // `lang` (not `t`) is the dependency that must retrigger on a language
    // switch — t's identity is stable by design.
  }, [cues.length, current?.id, isTranscribing, onTranscribe, request, t, lang]);

  const needsAnalysis = request?.action !== 'study-episode';
  const analysisKey = current && cues.length
    ? `${current.id}:${cues.length}:${cues[0]?.start ?? 0}:${cues[cues.length - 1]?.end ?? 0}`
    : '';

  useEffect(() => {
    if (!request || !activeSessionId || !needsAnalysis || current?.id !== request.mediaId || !analysisKey) return;
    if (analysisState?.key === analysisKey) return;
    let cancelled = false;
    setBusy(true);
    setError('');
    void analyzeMediaStudyCues(cues)
      .then((value) => {
        if (cancelled) return;
        setAnalysisState({ key: analysisKey, value });
        saveMediaLanguageProfile(createMediaLanguageProfile(current, value));
        if (activeSessionId) {
          addMediaStudySessionProgress(activeSessionId, {
            positionSec: positionRef.current,
            vocabularyMined: value.vocabulary.length,
          });
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSessionId, analysisKey, analysisState?.key, cues, current, needsAnalysis, request]);

  if (!request) return null;
  const item = items.find((candidate) => candidate.id === request.mediaId);
  if (!item) return null;

  // Reflect the real cue state so "Analyze Japanese" becomes the transcribe-first
  // variant when there is nothing to read yet.
  const actions = buildMediaStudyActions(item, {
    hasJapaneseText: cues.length > 0,
    hasSentences: cues.length > 0,
  });
  const analysis = analysisState?.key === analysisKey ? analysisState.value : null;
  const openSentence = (start: number): void => {
    if (activeSessionId) {
      addMediaStudySessionProgress(activeSessionId, {
        positionSec: start,
        sentencesReviewed: 1,
      });
    }
    void openInPlayer(item, start, say);
  };
  const createFlashcards = (): void => {
    if (!analysis) return;
    const added = addMediaStudyFlashcards(item, analysis);
    if (activeSessionId && added) {
      addMediaStudySessionProgress(activeSessionId, {
        positionSec,
        cardsCreated: added,
      });
    }
    const message = added
      ? `Added ${added} cards to the Media folder.`
      : 'No new vocabulary cards were needed.';
    setStatus(message);
    window.dispatchEvent(new CustomEvent('os:toast', {
      detail: { message, kind: added ? 'ok' : 'info' },
    }));
  };

  return (
    <section className="media-study-mode" aria-label="Media study mode">
      <div className="media-study-mode-heading">
        <div>
          <span className="media-study-mode-kicker">Study mode</span>
          <h3>{request.title}</h3>
        </div>
        <button
          type="button"
          onClick={() => {
            if (activeSessionId) endMediaStudySession(activeSessionId, positionSec);
            clearPendingRequest();
            setRequest(null);
          }}
          aria-label="Close study mode"
        >
          Close
        </button>
      </div>
      <p className="muted">Choose a learning action for this media item.</p>
      <div className="media-study-mode-actions">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={!action.enabled}
            title={action.reason}
            aria-pressed={request.action === action.id}
            onClick={() => {
              setRequest({ ...request, action: action.id, requestedAt: Date.now() });
              dispatchMediaStudyAction(item, action.id);
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
      {current?.id !== item.id && <p className="muted">Loading this media item…</p>}
      {request.action === 'study-episode' && (
        <p className="muted">{t('media.study.openingInPlayer')}</p>
      )}
      {needsAnalysis && current?.id === item.id && cues.length === 0 && (
        <div className="media-study-empty">
          <p className="muted">Load or generate Japanese subtitles to use the study tools.</p>
          <button type="button" onClick={() => void onLoadSubtitles()}>Load subtitles</button>
        </div>
      )}
      {busy && <p className="muted" role="status">Analyzing subtitle text…</p>}
      {error && <p className="media-error" role="alert">{error}</p>}
      {analysis && (request.action === 'mine-vocabulary' || request.action === 'create-flashcards') && (
        <div className="media-study-results">
          <div className="media-study-result-head">
            <strong>{analysis.vocabulary.length} vocabulary candidates</strong>
            <button type="button" onClick={createFlashcards}>Create up to 30 flashcards</button>
          </div>
          <ol className="media-study-vocabulary">
            {analysis.vocabulary.slice(0, 40).map((entry) => (
              <li key={entry.word}>
                <button type="button" onClick={() => openSentence(entry.firstSeenAt)}>
                  <strong>{entry.word}</strong>
                  {entry.reading && <span>{entry.reading}</span>}
                  <small>{entry.occurrences}×</small>
                </button>
                <span>{entry.sentence}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {analysis && request.action === 'review-sentences' && (
        <div className="media-study-results">
          <strong>{analysis.sentences.length} Japanese subtitle sentences</strong>
          <ol className="media-study-sentences">
            {analysis.sentences.slice(0, 80).map((sentence, index) => (
              <li key={`${sentence.start}-${index}`}>
                <button type="button" onClick={() => openSentence(sentence.start)}>
                  <time>{formatCueTime(sentence.start)}</time>
                  <span>{sentence.text}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
      {analysis && request.action === 'analyze-japanese' && (
        <div className="media-study-results">
          <div className="media-study-metrics">
            <div><strong>{analysis.level?.label ?? 'Not set'}</strong><span>Estimated JLPT</span></div>
            <div><strong>{Math.round(analysis.comprehensibility.knownRatio * 100)}%</strong><span>Known coverage</span></div>
            <div><strong>{analysis.vocabulary.length}</strong><span>Vocabulary</span></div>
            <div><strong>{analysis.kanji.length}</strong><span>Kanji</span></div>
          </div>
          {analysis.grammar.length > 0 && (
            <div>
              <strong>Grammar signals</strong>
              <ul className="media-study-grammar">
                {analysis.grammar.map((hit) => (
                  <li key={hit.id}>
                    <span>{hit.title}</span>
                    <small>{hit.level} · {hit.meaning}</small>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {analysis.truncated && <p className="muted">Analysis used a bounded subtitle sample.</p>}
          <MediaStudyAssistantPanel
            mediaId={item.id}
            mediaTitle={item.title}
            sentence={activeCue?.text ?? analysis.sentences[0]?.text ?? ''}
            jlptLevel={analysis.level?.label ?? null}
          />
        </div>
      )}
      {status && <p className="muted" role="status">{status}</p>}
      <MediaLanguageProfileCard mediaId={item.id} />
    </section>
  );
}
