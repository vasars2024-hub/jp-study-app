import { useEffect, useState } from 'react';
import {
  MEDIA_STUDY_ASSISTANT_MODES,
  type MediaStudyAssistantMode,
  type MediaStudyAssistantResult,
} from '../../../shared/mediaStudyAssistant';
import { appendNotebookEvent } from '../../notebookTimeline';

const LABELS: Record<MediaStudyAssistantMode, string> = {
  'explain-dialogue': 'Explain dialogue',
  'explain-grammar': 'Explain grammar',
  'simplify-japanese': 'Simplify Japanese',
  'generate-examples': 'Generate examples',
  'create-study-notes': 'Create study notes',
};

function resultAsNote(result: MediaStudyAssistantResult, sentence: string): string {
  return [
    sentence,
    result.summary,
    result.translation && `Translation: ${result.translation}`,
    result.simplifiedJapanese && `Simplified: ${result.simplifiedJapanese}`,
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
        setError(response.error ?? 'The assistant could not analyze this sentence.');
        return;
      }
      setResult(response.result);
      if (response.cached) setStatus('Loaded a saved explanation.');
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
      title: `${mediaTitle}: ${LABELS[result.mode]}`,
      detail: resultAsNote(result, sentence),
      folder: 'Media study',
      href: 'video',
      meta: { mediaId, assistantMode: result.mode },
    });
    setStatus('Saved to Notebook.');
  };

  if (!sentence.trim()) return null;
  return (
    <section className="media-study-assistant" aria-label="Optional AI learning assistant">
      <div>
        <span className="media-study-mode-kicker">Optional AI assistant</span>
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
            {LABELS[assistantMode]}
          </button>
        ))}
      </div>
      {busy && <p className="muted" role="status">Requesting an on-demand explanation…</p>}
      {error && <p className="media-error" role="alert">{error}</p>}
      {result && (
        <div className="media-study-assistant-result">
          {result.summary && <p>{result.summary}</p>}
          {result.translation && <p><strong>Translation</strong><span>{result.translation}</span></p>}
          {result.simplifiedJapanese && <p><strong>Simplified Japanese</strong><span>{result.simplifiedJapanese}</span></p>}
          {result.grammar.length > 0 && (
            <div><strong>Grammar</strong><ul>{result.grammar.map((entry, index) => <li key={`${entry.pattern}-${index}`}>{entry.pattern}{entry.level ? ` · ${entry.level}` : ''} — {entry.explanation}</li>)}</ul></div>
          )}
          {result.vocabulary.length > 0 && (
            <div><strong>Vocabulary</strong><ul>{result.vocabulary.map((entry, index) => <li key={`${entry.word}-${index}`}>{entry.word}{entry.reading ? ` · ${entry.reading}` : ''} — {entry.meaning}</li>)}</ul></div>
          )}
          {result.examples.length > 0 && (
            <div><strong>Examples</strong><ul>{result.examples.map((entry, index) => <li key={`${entry.japanese}-${index}`}>{entry.japanese} — {entry.translation}</li>)}</ul></div>
          )}
          {result.notes.length > 0 && (
            <div><strong>Study notes</strong><ul>{result.notes.map((note, index) => <li key={`${note}-${index}`}>{note}</li>)}</ul></div>
          )}
          <button type="button" onClick={saveNote}>Save to Notebook</button>
        </div>
      )}
      {status && <p className="muted" role="status">{status}</p>}
    </section>
  );
}
