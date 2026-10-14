import { useEffect, useRef, useState } from 'react';
import {
  MEDIA_STUDY_ASSISTANT_MODES,
  type MediaStudyAssistantMode,
  type MediaStudyAssistantResult,
} from '../../../shared/mediaStudyAssistant';
import { appendNotebookEvent } from '../../notebookTimeline';
import { useT } from '../../i18n';
import type { TVars } from '../../../shared/i18n/core';
import { AiSetupPrompt } from '../ai/AiSetupPrompt';
import { useAiReadiness } from '../../aiSetupClient';
import { aiErrorKey, isAiErrorCode } from '../../../shared/aiErrorCodes';
import { useStudyLanguage } from '../../useStudyLanguage';
import { AiStreamDraft, aiStreamPreviewText, subscribeAiStream } from '../ai/aiStream';

let assistCounter = 0;

type Translate = (key: string, vars?: TVars) => string;

/**
 * The mode token IS the key suffix, so there is no label table to keep in sync —
 * `MEDIA_STUDY_ASSISTANT_MODES` and `mediaAssistant.mode.*` cannot drift apart
 * the way a module-level `Record<Mode, string>` of English strings did (D178).
 */
function modeLabel(mode: MediaStudyAssistantMode, t: Translate, studyLang = 'ja'): string {
  // "Simplify Japanese" names the language; other learners get the neutral label.
  if (mode === 'simplify-japanese' && studyLang !== 'ja') return t('aiAgent.assistant.mode.simplify');
  return t(`mediaAssistant.mode.${mode}`);
}

function resultAsNote(
  result: MediaStudyAssistantResult,
  sentence: string,
  t: Translate,
): string {
  return [
    sentence,
    result.summary,
    result.translation && t('mediaAssistant.note.translation', { text: result.translation }),
    result.simplifiedJapanese
      && t('mediaAssistant.note.simplified', { text: result.simplifiedJapanese }),
    ...result.grammar.map((entry) => `${entry.pattern}${entry.level ? ` (${entry.level})` : ''}: ${entry.explanation}`),
    ...result.vocabulary.map((entry) => `${entry.word}${entry.reading ? ` [${entry.reading}]` : ''}: ${entry.meaning}`),
    ...result.examples.map((entry) => `${entry.japanese} — ${entry.translation}`),
    ...result.notes,
  ].filter(Boolean).join('\n\n');
}

interface MediaStudyAssistantPanelProps {
  mediaId: string;
  mediaTitle: string;
  sentence: string;
  jlptLevel: string | null;
  /**
   * The line's own id (cue id, capture id). Two lines can share their text
   * ("はい"), so an answer is matched to the line it was asked for by this, and
   * by the text when a mount has no id.
   */
  lineId?: string;
}

/** The line an answer belongs to. */
export function mediaAssistantLineKey(lineId: string | undefined, sentence: string): string {
  return `${lineId ?? ''}\u0000${sentence.trim()}`;
}

/**
 * An answer together with the line it answers. "Save as note" saves THIS pair,
 * never the answer beside whatever line happens to be on screen.
 */
export interface MediaAssistantAnswer {
  lineKey: string;
  sentence: string;
  result: MediaStudyAssistantResult;
}

/** The answer to show for the current line: only one asked for that exact line. */
export function mediaAssistantAnswerForLine(
  answer: MediaAssistantAnswer | null,
  lineKey: string,
): MediaAssistantAnswer | null {
  return answer && answer.lineKey === lineKey ? answer : null;
}

export default function MediaStudyAssistantPanel({
  mediaId,
  mediaTitle,
  sentence,
  jlptLevel,
  lineId,
}: MediaStudyAssistantPanelProps) {
  const { t, lang: uiLang } = useT();
  const { lang: studyLang } = useStudyLanguage();
  const [mode, setMode] = useState<MediaStudyAssistantMode>('explain-dialogue');
  const lineKey = mediaAssistantLineKey(lineId, sentence);
  const [answer, setAnswer] = useState<MediaAssistantAnswer | null>(null);
  // Never render an answer for another line, even for the one render between a
  // line change and the effect below clearing it.
  const shown = mediaAssistantAnswerForLine(answer, lineKey);
  const result = shown?.result ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  // Cloud-only: this assistant needs a provider's JSON mode, so an offline
  // model does not unlock it. Said up front instead of after a click.
  const ai = useAiReadiness();
  const [needsKey, setNeedsKey] = useState(false);
  const blockedOnKey = needsKey || (ai.loaded && ai.enabled && !ai.cloudReady);

  // Every run is numbered; an answer for a run that is no longer the latest
  // (the line moved on, or another mode was asked) is dropped. It used to land
  // under the NEXT line, and "Save to notebook" then saved the wrong analysis.
  const runRef = useRef(0);
  /** The answer as it streams in; after a Cancel, as far as it got (`media-study:cancel`). */
  const [draft, setDraft] = useState('');
  const [stopped, setStopped] = useState(false);
  const activeRequest = useRef<string | null>(null);

  const stopActive = (): void => {
    const requestId = activeRequest.current;
    activeRequest.current = null;
    if (requestId) void window.api.mediaStudyCancel?.(requestId)?.catch(() => undefined);
  };

  useEffect(() => {
    runRef.current += 1;
    // The line moved on: an answer still being written for the old one is not wanted.
    stopActive();
    setAnswer(null);
    setError('');
    setStatus('');
    setBusy(false);
    setDraft('');
    setStopped(false);
  }, [lineKey]);

  useEffect(() => () => stopActive(), []);

  const cancel = (): void => {
    if (!activeRequest.current) return;
    runRef.current += 1;
    stopActive();
    setBusy(false);
    setStopped(true);
  };

  const run = async (nextMode: MediaStudyAssistantMode): Promise<void> => {
    if (!sentence.trim()) return;
    const ticket = ++runRef.current;
    // Captured with the request: the reply is filed under the line it was asked
    // for, whatever is on screen when it arrives.
    const askedKey = lineKey;
    const askedSentence = sentence;
    // Asking for the mode already on screen means "ask again": skip the cache.
    const refresh = Boolean(result && result.mode === nextMode);
    setMode(nextMode);
    setBusy(true);
    setError('');
    setStatus('');
    setDraft('');
    setStopped(false);
    assistCounter += 1;
    const requestId = `msa-${Date.now().toString(36)}-${assistCounter}`;
    activeRequest.current = requestId;
    const unsubscribe = subscribeAiStream(requestId, (raw) => {
      if (ticket === runRef.current) setDraft(aiStreamPreviewText(raw));
    });
    try {
      const response = await window.api.mediaStudyAssist({
        requestId,
        mode: nextMode,
        text: askedSentence,
        context: mediaTitle,
        jlptLevel,
        // The prompt follows the study language and answers in the UI language.
        studyLang,
        answerLang: uiLang,
        ...(refresh ? { refresh: true } : {}),
      });
      if (ticket !== runRef.current) return;
      activeRequest.current = null;
      if (response.code === 'cancelled') {
        setStopped(true);
        return;
      }
      setDraft('');
      if (!response.ok || !response.result) {
        if (response.needsKey) {
          setNeedsKey(true);
          return;
        }
        setError(isAiErrorCode(response.code) ? t(aiErrorKey(response.code)) : t('mediaAssistant.failed'));
        return;
      }
      setAnswer({ lineKey: askedKey, sentence: askedSentence, result: response.result });
      if (response.cached) setStatus(t('mediaAssistant.cached'));
      else if (response.partial) setStatus(t('aiFix.assistant.partial'));
    } catch {
      if (ticket !== runRef.current) return;
      setError(t(aiErrorKey('ipc-failed')));
    } finally {
      unsubscribe();
      if (ticket === runRef.current) {
        activeRequest.current = null;
        setBusy(false);
      }
    }
  };

  const saveNote = (): void => {
    if (!shown) return;
    appendNotebookEvent({
      stream: 'media',
      title: `${mediaTitle}: ${modeLabel(shown.result.mode, t, studyLang)}`,
      // The sentence the answer was asked for, not whatever line is current.
      detail: resultAsNote(shown.result, shown.sentence, t),
      folder: 'Media study',
      href: 'video',
      meta: { mediaId, assistantMode: shown.result.mode },
    });
    setStatus(t('mediaAssistant.saved'));
  };

  if (!sentence.trim()) return null;
  return (
    <section className="media-study-assistant" data-ai-entry aria-label={t('mediaAssistant.aria')}>
      <div>
        <span className="media-study-mode-kicker">{t('mediaAssistant.kicker')}</span>
        <p>{sentence}</p>
      </div>
      {blockedOnKey && <AiSetupPrompt compact reasonKey="mediaAssistant.needsKey" settingId="ai-provider" />}
      <div className="media-study-assistant-actions" hidden={blockedOnKey}>
        {MEDIA_STUDY_ASSISTANT_MODES.map((assistantMode) => (
          <button
            key={assistantMode}
            type="button"
            aria-pressed={mode === assistantMode && Boolean(result)}
            disabled={busy}
            onClick={() => void run(assistantMode)}
          >
            {modeLabel(assistantMode, t, studyLang)}
          </button>
        ))}
      </div>
      {busy && (
        <div className="media-study-assistant-actions">
          <p className="muted" role="status">{t('mediaAssistant.busy')}</p>
          <button type="button" onClick={cancel}>{t('aiStudy.stream.stop')}</button>
        </div>
      )}
      {(busy || stopped) && <AiStreamDraft text={draft} state={stopped ? 'stopped' : 'drafting'} lang={uiLang} />}
      {error && <p className="media-error" role="alert">{error}</p>}
      {result && (
        <div className="media-study-assistant-result">
          {result.summary && <p>{result.summary}</p>}
          {result.translation && <p><strong>{t('mediaAssistant.translation')}</strong><span>{result.translation}</span></p>}
          {result.simplifiedJapanese && <p><strong>{studyLang === 'ja' ? t('mediaAssistant.simplified') : t('aiAgent.assistant.simplified')}</strong><span>{result.simplifiedJapanese}</span></p>}
          {result.grammar.length > 0 && (
            <div><strong>{t('mediaAssistant.grammar')}</strong><ul>{result.grammar.map((entry, index) => <li key={`${entry.pattern}-${index}`}>{entry.pattern}{entry.level ? ` · ${entry.level}` : ''} — {entry.explanation}</li>)}</ul></div>
          )}
          {result.vocabulary.length > 0 && (
            <div><strong>{t('mediaAssistant.vocabulary')}</strong><ul>{result.vocabulary.map((entry, index) => <li key={`${entry.word}-${index}`}>{entry.word}{entry.reading ? ` · ${entry.reading}` : ''} — {entry.meaning}</li>)}</ul></div>
          )}
          {result.examples.length > 0 && (
            <div><strong>{t('mediaAssistant.examples')}</strong><ul>{result.examples.map((entry, index) => <li key={`${entry.japanese}-${index}`}>{entry.japanese} — {entry.translation}</li>)}</ul></div>
          )}
          {result.notes.length > 0 && (
            <div><strong>{t('mediaAssistant.studyNotes')}</strong><ul>{result.notes.map((note, index) => <li key={`${note}-${index}`}>{note}</li>)}</ul></div>
          )}
          <button type="button" onClick={saveNote}>{t('mediaAssistant.saveToNotebook')}</button>
        </div>
      )}
      {status && <p className="muted" role="status">{status}</p>}
    </section>
  );
}
