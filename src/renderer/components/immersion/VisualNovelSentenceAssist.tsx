import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { LANG_TAGS } from '../../../shared/i18n/core';
import type {
  VisualNovelCapturePatch,
  VisualNovelDatabase,
  VisualNovelEntry,
  VisualNovelTextCapture,
  VisualNovelTextKind,
} from '../../../shared/visualNovel';
import { analyzeMediaStudyCues, type MediaStudyAnalysis } from '../../mediaStudyWorkflow';
import VisualNovelAgentHandoffButton from './VisualNovelAgentHandoffButton';
import { openGrammarPractice } from '../../extensionBridgeUi';
import { getTranslateTarget } from '../../translateTarget';

/**
 * Kanji-link cap. `vnAssist.kanjiCount` two lines above reads the full length, so the
 * overflow is disclosed rather than left to contradict it — D137.
 */
const KANJI_LINKS = 24;

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
  const { t, lang } = useT();
  const [draft, setDraft] = useState(() => draftFromCapture(capture));
  const [analysis, setAnalysis] = useState<MediaStudyAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState('');
  const [audioBusy, setAudioBusy] = useState(false);
  const [confirmRemoveAudio, setConfirmRemoveAudio] = useState(false);

  useEffect(() => {
    setDraft(draftFromCapture(capture));
    setAnalysis(null);
    setConfirmDelete(false);
    setConfirmRemoveAudio(false);
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
      onStatus(response.error ?? t('vnAssist.msg.updateFailed'), true);
      return false;
    }
    onDatabase(response.database);
    onStatus(t('vnAssist.msg.saved'));
    return true;
  };

  const translate = async (): Promise<void> => {
    if (!draft.japanese.trim()) return;
    setBusy(true);
    const response = await window.api.translateRun({
      id: Date.now(),
      text: draft.japanese,
      source: 'ja',
      // The learner's translation language, shared with the Translate view and
      // both readers — this was hard-coded to English.
      target: getTranslateTarget(),
    });
    setBusy(false);
    if (!response.ok || !response.text) {
      onStatus(response.error ?? t('vnAssist.msg.translateUnavailable'), true);
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
      onStatus(t('vnAssist.msg.analyzed'));
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
    onStatus(t('vnAssist.msg.removed'));
  };

  const attachAudio = async (): Promise<void> => {
    // Reaching for the neighbouring control disarms the remove step, so a
    // half-abandoned intent cannot fire on the next click.
    setConfirmRemoveAudio(false);
    setAudioBusy(true);
    const response = await window.api.visualNovelAttachCaptureAudio(capture.id);
    setAudioBusy(false);
    if (response.canceled) return;
    if (!response.ok || !response.database) {
      onStatus(response.error ?? t('vnAssist.msg.attachFailed'), true);
      return;
    }
    onDatabase(response.database);
    onStatus(t('vnAssist.msg.attached'));
  };

  const playAudio = async (): Promise<void> => {
    if (!capture.audioPath) return;
    setAudioBusy(true);
    const response = await window.api.visualNovelReadCaptureAudio(capture.audioPath);
    if (response.ok && response.dataUrl) {
      await new Audio(response.dataUrl).play().catch(() => undefined);
      onStatus(t('vnAssist.msg.playing'));
    } else {
      onStatus(response.error ?? t('vnAssist.msg.playFailed'), true);
    }
    setAudioBusy(false);
  };

  // Two-step arm, matching `remove()` below rather than a modal: this button sat
  // one click from destroying an attachment while its neighbour — the smaller
  // destruction of the whole capture — already asked twice. Re-attaching means
  // the native picker and finding the clip on disk again.
  const removeAudio = async (): Promise<void> => {
    if (!confirmRemoveAudio) {
      setConfirmRemoveAudio(true);
      return;
    }
    setConfirmRemoveAudio(false);
    const response = await window.api.visualNovelRemoveCaptureAudio(capture.id);
    if (!response.ok || !response.database) {
      onStatus(response.error ?? t('vnAssist.msg.removeAudioFailed'), true);
      return;
    }
    onDatabase(response.database);
    onStatus(t('vnAssist.msg.audioRemoved'));
  };

  const lookupKanji = (character: string): void => {
    window.dispatchEvent(new CustomEvent('dict:lookup', { detail: { query: character } }));
  };

  const openGrammarApp = (): void => {
    // Via `openGrammarPractice`, which writes a one-shot handoff before opening
    // the section. The hand-rolled `os:open` + `setTimeout(80)` here raced
    // `GrammarView`'s lazy chunk and lost the link on first use (audit F22).
    const levels = [...new Set(analysis?.grammar.map((item) => item.level).filter(Boolean) ?? [])];
    openGrammarPractice({ levels, lang: 'ja' });
  };

  return (
    <section className="visual-novel-sentence-assist" aria-label={t('vnAssist.aria')}>
      <div className="visual-novel-reading-head">
        <strong>{t('vnAssist.title')}</strong>
        <span>{capture.source} · {new Date(capture.capturedAt).toLocaleString(LANG_TAGS[lang])}</span>
      </div>
      <div className="visual-novel-sentence-fields">
        <label className="is-wide">{t('vnAssist.japanese')}<textarea value={draft.japanese} onChange={(event) => field('japanese', event.target.value)} /></label>
        <label className="is-wide">{t('vnAssist.translation')}<textarea value={draft.translation} onChange={(event) => field('translation', event.target.value)} placeholder={t('vnAssist.translationPlaceholder')} /></label>
        <label>{t('vnAssist.speaker')}<input value={draft.speaker} onChange={(event) => field('speaker', event.target.value)} /></label>
        <label>{t('vnAssist.kindLabel')}<select value={draft.kind} onChange={(event) => field('kind', event.target.value as VisualNovelTextKind)}><option value="dialogue">{t('vnAssist.kind.dialogue')}</option><option value="narration">{t('vnAssist.kind.narration')}</option><option value="choice">{t('vnAssist.kind.choice')}</option><option value="character-name">{t('vnAssist.kind.characterName')}</option><option value="system">{t('vnAssist.kind.system')}</option></select></label>
        {/* Route names are the user's own data. */}
        <label>{t('vnAssist.route')}<select value={draft.routeId} onChange={(event) => field('routeId', event.target.value)}><option value="">{t('vnAssist.noRoute')}</option>{entry.routes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select></label>
        <label>{t('vnAssist.chapter')}<input value={draft.chapter} onChange={(event) => field('chapter', event.target.value)} /></label>
        <label>{t('vnAssist.scene')}<input value={draft.scene} onChange={(event) => field('scene', event.target.value)} /></label>
      </div>
      {screenshotDataUrl && (
        <figure className="visual-novel-sentence-screenshot">
          <img src={screenshotDataUrl} alt={t('vnAssist.screenshotAlt')} />
          <figcaption>{t('vnAssist.screenshotCaption')}</figcaption>
        </figure>
      )}
      <div className="visual-novel-sentence-actions">
        <button className="btn small" type="button" disabled={busy || !draft.japanese.trim()} onClick={() => void persist()}>{t('vnAssist.saveDetails')}</button>
        <button className="btn small" type="button" disabled={busy || !draft.japanese.trim()} onClick={() => void translate()}>{busy ? t('vnAssist.working') : t('vnAssist.translate')}</button>
        <button className="btn small" type="button" disabled={busy || !draft.japanese.trim()} onClick={() => void analyze()}>{t('vnAssist.analyze')}</button>
        <button className="btn small" type="button" onClick={onSaveCard}>{t('vnAssist.saveCard')}</button>
        <VisualNovelAgentHandoffButton capture={capture} screenshotDataUrl={screenshotDataUrl} />
        {capture.audioPath ? (
          <>
            <button className="btn small" type="button" disabled={audioBusy} onClick={() => void playAudio()}>
              {audioBusy ? t('vnAssist.loadingAudio') : t('vnAssist.playClip')}
            </button>
            <button className="btn small" type="button" disabled={audioBusy} onClick={() => void attachAudio()}>{t('vnAssist.replaceClip')}</button>
            <button type="button" className={`btn small${confirmRemoveAudio ? ' is-confirming' : ''}`} disabled={audioBusy} onClick={() => void removeAudio()}>
              {confirmRemoveAudio ? t('vnAssist.confirmRemove') : t('vnAssist.removeClip')}
            </button>
          </>
        ) : (
          <button className="btn small" type="button" disabled={audioBusy} onClick={() => void attachAudio()}>
            {audioBusy ? t('vnAssist.attaching') : t('vnAssist.attachClip')}
          </button>
        )}
        <button type="button" className={`btn small${confirmDelete ? ' is-confirming' : ''}`} onClick={() => void remove()}>
          {confirmDelete ? t('vnAssist.confirmRemove') : t('vnAssist.removeSentence')}
        </button>
      </div>
      {analysis && (
        <div className="visual-novel-sentence-analysis">
          <span>{t('vnAssist.difficulty', { level: analysis.level?.label ?? t('vnAssist.unrated') })}</span>
          <span>{t('vnAssist.knownVocab', { percent: Math.round(analysis.comprehensibility.knownRatio * 100) })}</span>
          <span>{t('vnAssist.uniqueWords', { count: analysis.vocabulary.length })}</span>
          <span>{t('vnAssist.kanjiCount', { count: analysis.kanji.length })}</span>
          {analysis.kanji.length > 0 && (
            <div className="visual-novel-kanji-links" aria-label={t('vnAssist.aria.kanjiLinks')}>
              {analysis.kanji.slice(0, KANJI_LINKS).map((item) => (
                <button key={item.character} type="button" onClick={() => lookupKanji(item.character)}>
                  {item.character}
                </button>
              ))}
              {analysis.kanji.length > KANJI_LINKS && (
                <small>{t('common.moreNotShown', { count: analysis.kanji.length - KANJI_LINKS })}</small>
              )}
            </div>
          )}
          {analysis.grammar.length > 0 && (
            <div>
              <button className="btn small" type="button" onClick={openGrammarApp}>{t('vnAssist.practiceGrammar')}</button>
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
