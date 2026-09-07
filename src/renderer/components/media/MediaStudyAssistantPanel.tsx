import { useEffect, useState } from 'react';
import {
  MEDIA_STUDY_ASSISTANT_MODES,
  type MediaStudyAssistantMode,
  type MediaStudyAssistantResult,
} from '../../../shared/mediaStudyAssistant';
import { appendNotebookEvent } from '../../notebookTimeline';
import { useT } from '../../i18n';
import type { TVars } from '../../../shared/i18n/core';

type Translate = (key: string, vars?: TVars) => string;

/**
 * The mode token IS the key suffix, so there is no label table to keep in sync —
 * `MEDIA_STUDY_ASSISTANT_MODES` and `mediaAssistant.mode.*` cannot drift apart
 * the way a module-level `Record<Mode, string>` of English strings did (D178).
 */
function modeLabel(mode: MediaStudyAssistantMode, t: Translate): string {
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
}

export default function MediaStudyAssistantPanel({
  mediaId,
  mediaTitle,
  sentence,
  jlptLevel,
}: MediaStudyAssistantPanelProps) {
  const { t } = useT();
  const [mode, setMode] = useState<MediaStudyAssistantMode>('explain-dialogue');
  const [result, setResult] = useState<MediaStudyAssistantResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    setResult(null);
    setError('');
    setStatus('');
  }, [sentence]);

  const run = async (nextMode: MediaStudyAssistantMode): Promise<void> => {
    if (!sentence.trim()) return;
    setMode(nextMode);
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const response = await window.api.mediaStudyAssist({
        mode: nextMode,
        text: sentence,
        context: mediaTitle,
        jlptLevel,
      });
      if (!response.ok || !response.result) {
        setError(response.error ?? t('mediaAssistant.failed'));
        return;
      }
      setResult(response.result);
      if (response.cached) setStatus(t('mediaAssistant.cached'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const saveNote = (): void => {
    if (!result) return;
    appendNotebookEvent({
      stream: 'media',
      title: `${mediaTitle}: ${modeLabel(result.mode, t)}`,
      detail: resultAsNote(result, sentence, t),
      folder: 'Media study',
      href: 'video',
      meta: { mediaId, assistantMode: result.mode },
    });
    setStatus(t('mediaAssistant.saved'));
  };

  if (!sentence.trim()) return null;
  return (
    <section className="media-study-assistant" aria-label={t('mediaAssistant.aria')}>
      <div>
        <span className="media-study-mode-kicker">{t('mediaAssistant.kicker')}</span>
        <p>{sentence}</p>
      </div>
      <div className="media-study-assistant-actions">
        {MEDIA_STUDY_ASSISTANT_MODES.map((assistantMode) => (
          <button
            key={assistantMode}
            type="button"
            aria-pressed={mode === assistantMode && Boolean(result)}
            disabled={busy}
            onClick={() => void run(assistantMode)}
          >
            {modeLabel(assistantMode, t)}
          </button>
        ))}
      </div>
      {busy && <p className="muted" role="status">{t('mediaAssistant.busy')}</p>}
      {error && <p className="media-error" role="alert">{error}</p>}
      {result && (
        <div className="media-study-assistant-result">
          {result.summary && <p>{result.summary}</p>}
          {result.translation && <p><strong>{t('mediaAssistant.translation')}</strong><span>{result.translation}</span></p>}
          {result.simplifiedJapanese && <p><strong>{t('mediaAssistant.simplified')}</strong><span>{result.simplifiedJapanese}</span></p>}
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
