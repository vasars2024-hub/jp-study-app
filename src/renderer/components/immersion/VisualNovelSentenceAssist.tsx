import { useEffect, useState } from 'react';
import type {
  VisualNovelCapturePatch,
  VisualNovelDatabase,
  VisualNovelEntry,
  VisualNovelTextCapture,
  VisualNovelTextKind,
} from '../../../shared/visualNovel';
import { analyzeMediaStudyCues, type MediaStudyAnalysis } from '../../mediaStudyWorkflow';
import VisualNovelAgentHandoffButton from './VisualNovelAgentHandoffButton';

function draftFromCapture(capture: VisualNovelTextCapture): Required<VisualNovelCapturePatch> {
  return {
    kind: capture.kind,
    japanese: capture.japanese,
    translation: capture.translation,
    speaker: capture.speaker,
    routeId: capture.routeId,
    chapter: capture.chapter,
    scene: capture.scene,
  };
}

export default function VisualNovelSentenceAssist({
  entry,
  capture,
  onDatabase,
  onStatus,
  onSaveCard,
}: {
  entry: VisualNovelEntry;
  capture: VisualNovelTextCapture;
  onDatabase: (database: VisualNovelDatabase) => void;
  onStatus: (message: string, error?: boolean) => void;
  onSaveCard: () => void;
}) {
  const [draft, setDraft] = useState(() => draftFromCapture(capture));
  const [analysis, setAnalysis] = useState<MediaStudyAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState('');
  const [audioBusy, setAudioBusy] = useState(false);

  useEffect(() => {
    setDraft(draftFromCapture(capture));
    setAnalysis(null);
    setConfirmDelete(false);
  }, [capture.id]);

  useEffect(() => {
    let active = true;
    setScreenshotDataUrl('');
    if (capture.screenshotPath) {
      void window.api.visualNovelReadCaptureImage(capture.screenshotPath).then((result) => {
        if (active && result.ok && result.dataUrl) setScreenshotDataUrl(result.dataUrl);
      });
    }
    return () => {
      active = false;
    };
  }, [capture.screenshotPath]);

  const field = <K extends keyof Required<VisualNovelCapturePatch>>(
    key: K,
    value: Required<VisualNovelCapturePatch>[K],
  ): void => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const persist = async (patch: VisualNovelCapturePatch = draft): Promise<boolean> => {
    const response = await window.api.visualNovelUpdateCapture(capture.id, patch);
    if (!response.ok || !response.database) {
      onStatus(response.error ?? 'The captured line could not be updated.', true);
      return false;
    }
    onDatabase(response.database);
    onStatus('Sentence details saved.');
    return true;
  };

  const translate = async (): Promise<void> => {
    if (!draft.japanese.trim()) return;
    setBusy(true);
    const response = await window.api.translateRun({
      id: Date.now(),
      text: draft.japanese,
      source: 'ja',
      target: 'en',
    });
    setBusy(false);
    if (!response.ok || !response.text) {
      onStatus(response.error ?? 'Translation is unavailable.', true);
      return;
    }
    const translation = response.text.trim();
    setDraft((current) => ({ ...current, translation }));
    await persist({ translation });
  };

  const analyze = async (): Promise<void> => {
    setBusy(true);
    try {
      const result = await analyzeMediaStudyCues([{
        start: 0,
        end: 1,
        text: draft.japanese,
      }]);
      setAnalysis(result);
      onStatus('Sentence grammar and difficulty analyzed.');
    } catch (reason) {
      onStatus(reason instanceof Error ? reason.message : String(reason), true);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDatabase(await window.api.visualNovelRemoveCapture(capture.id));
    onStatus('Captured sentence removed.');
  };

  const attachAudio = async (): Promise<void> => {
    setAudioBusy(true);
    const response = await window.api.visualNovelAttachCaptureAudio(capture.id);
    setAudioBusy(false);
    if (response.canceled) return;
    if (!response.ok || !response.database) {
      onStatus(response.error ?? 'The voice clip could not be attached.', true);
      return;
    }
    onDatabase(response.database);
    onStatus('Voice clip attached to the sentence.');
  };

  const playAudio = async (): Promise<void> => {
    if (!capture.audioPath) return;
    setAudioBusy(true);
    const response = await window.api.visualNovelReadCaptureAudio(capture.audioPath);
    if (response.ok && response.dataUrl) {
      await new Audio(response.dataUrl).play().catch(() => undefined);
      onStatus('Playing the attached voice clip.');
    } else {
      onStatus(response.error ?? 'The voice clip could not be played.', true);
    }
    setAudioBusy(false);
  };

  const removeAudio = async (): Promise<void> => {
    const response = await window.api.visualNovelRemoveCaptureAudio(capture.id);
    if (!response.ok || !response.database) {
      onStatus(response.error ?? 'The voice clip could not be removed.', true);
      return;
    }
    onDatabase(response.database);
    onStatus('Voice clip removed from the sentence.');
  };

  const lookupKanji = (character: string): void => {
    window.dispatchEvent(new CustomEvent('dict:lookup', { detail: { query: character } }));
  };

  const openGrammarApp = (): void => {
    window.dispatchEvent(new CustomEvent('os:open', { detail: 'grammar' }));
    const levels = [...new Set(analysis?.grammar.map((item) => item.level).filter(Boolean) ?? [])];
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('grammar:open-practice', { detail: { levels, lang: 'ja' } }));
    }, 80);
  };

  return (
    <section className="visual-novel-sentence-assist" aria-label="Selected sentence reading assist">
      <div className="visual-novel-reading-head">
        <strong>Sentence details</strong>
        <span>{capture.source} · {new Date(capture.capturedAt).toLocaleString()}</span>
      </div>
      <div className="visual-novel-sentence-fields">
        <label className="is-wide">Japanese<textarea value={draft.japanese} onChange={(event) => field('japanese', event.target.value)} /></label>
        <label className="is-wide">Translation<textarea value={draft.translation} onChange={(event) => field('translation', event.target.value)} placeholder="Add or generate an English translation" /></label>
        <label>Speaker<input value={draft.speaker} onChange={(event) => field('speaker', event.target.value)} /></label>
        <label>Kind<select value={draft.kind} onChange={(event) => field('kind', event.target.value as VisualNovelTextKind)}><option value="dialogue">Dialogue</option><option value="narration">Narration</option><option value="choice">Choice</option><option value="character-name">Character name</option><option value="system">System text</option></select></label>
        <label>Route<select value={draft.routeId} onChange={(event) => field('routeId', event.target.value)}><option value="">No route</option>{entry.routes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select></label>
        <label>Chapter<input value={draft.chapter} onChange={(event) => field('chapter', event.target.value)} /></label>
        <label>Scene<input value={draft.scene} onChange={(event) => field('scene', event.target.value)} /></label>
      </div>
      {screenshotDataUrl && (
        <figure className="visual-novel-sentence-screenshot">
          <img src={screenshotDataUrl} alt="Captured visual novel scene" />
          <figcaption>This scene will be attached when the sentence is saved as a card.</figcaption>
        </figure>
      )}
      <div className="visual-novel-sentence-actions">
        <button type="button" disabled={busy || !draft.japanese.trim()} onClick={() => void persist()}>Save details</button>
        <button type="button" disabled={busy || !draft.japanese.trim()} onClick={() => void translate()}>{busy ? 'Working…' : 'Translate'}</button>
        <button type="button" disabled={busy || !draft.japanese.trim()} onClick={() => void analyze()}>Analyze sentence</button>
        <button type="button" onClick={onSaveCard}>Save card</button>
        <VisualNovelAgentHandoffButton capture={capture} screenshotDataUrl={screenshotDataUrl} />
        {capture.audioPath ? (
          <>
            <button type="button" disabled={audioBusy} onClick={() => void playAudio()}>
              {audioBusy ? 'Loading audio…' : 'Play voice clip'}
            </button>
            <button type="button" disabled={audioBusy} onClick={() => void attachAudio()}>Replace voice clip</button>
            <button type="button" disabled={audioBusy} onClick={() => void removeAudio()}>Remove voice clip</button>
          </>
        ) : (
          <button type="button" disabled={audioBusy} onClick={() => void attachAudio()}>
            {audioBusy ? 'Attaching…' : 'Attach voice clip'}
          </button>
        )}
        <button type="button" className={confirmDelete ? 'is-confirming' : ''} onClick={() => void remove()}>
          {confirmDelete ? 'Confirm remove' : 'Remove sentence'}
        </button>
      </div>
      {analysis && (
        <div className="visual-novel-sentence-analysis">
          <span>{analysis.level?.label ?? 'Unrated'} difficulty</span>
          <span>{Math.round(analysis.comprehensibility.knownRatio * 100)}% known vocabulary</span>
          <span>{analysis.vocabulary.length} unique words</span>
          <span>{analysis.kanji.length} kanji</span>
          {analysis.kanji.length > 0 && (
            <div className="visual-novel-kanji-links" aria-label="Kanji dictionary links">
              {analysis.kanji.slice(0, 24).map((item) => (
                <button key={item.character} type="button" onClick={() => lookupKanji(item.character)}>
                  {item.character}
                </button>
              ))}
            </div>
          )}
          {analysis.grammar.length > 0 && (
            <div>
              <button type="button" onClick={openGrammarApp}>Practice in Grammar app</button>
              {analysis.grammar.map((grammar) => (
                <article key={grammar.id}>
                  <strong>{grammar.title}</strong>
                  <small>{grammar.level}</small>
                  <p>{grammar.meaning}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
