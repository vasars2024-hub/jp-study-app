import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../Icons';
import { Button, IconButton, Input, Toggle } from '../ui';
import { useT } from '../../i18n';
import { getStudyLang, studyContentLang } from '../../studyEnvironment';
import { glossFor } from '../../companionMine';
import { normalizeStudyLang, studyLangOfText } from '../../../shared/studyLang';
import {
  draftSourceLabel,
  type CompanionDraft,
  type CompanionMineOutcome,
} from '../../../shared/companion';
import './companion.css';

/**
 * The card preview (`?companion=preview`): a card drafted over another app,
 * before it is added — word or sentence, reading, meaning, the line it came
 * from, the window it came from, and (from the Lens) a picture of the region.
 *
 * Reading and meaning are filled from the offline dictionary when the draft
 * came without them, so what the user sees is what will be saved. Edit opens
 * the fields; Add (or Ctrl+Enter) hands the card to the main window, which
 * mines it into the deck and Anki (queued when Anki is closed).
 */

type Phase = 'idle' | 'adding' | 'done' | 'error';

export function outcomeMessageKey(outcome: CompanionMineOutcome): string {
  if (outcome.status === 'exists') return 'companion.preview.result.exists';
  if (outcome.status === 'waiting') return 'companion.preview.result.waiting';
  if (outcome.status === 'failed') return 'companion.preview.result.failed';
  if (outcome.anki === 'added') return 'companion.preview.result.addedAnki';
  if (outcome.anki === 'queued') return 'companion.preview.result.queued';
  if (outcome.anki === 'failed') return 'companion.preview.result.addedAnkiFailed';
  return 'companion.preview.result.added';
}

export default function CardPreview() {
  const { t } = useT();
  const [draft, setDraft] = useState<CompanionDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const [attachImage, setAttachImage] = useState(true);
  const [looking, setLooking] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const closeTimer = useRef<number | null>(null);

  const take = useCallback((next: CompanionDraft | null) => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setDraft(next);
    setEditing(false);
    setAttachImage(true);
    setPhase('idle');
    setMessage('');
  }, []);

  useEffect(() => {
    let alive = true;
    window.api
      .companionGetPreview()
      .then((d) => {
        if (alive) take(d);
      })
      .catch(() => undefined);
    const off = window.api.onCompanionPreview((d) => take(d));
    return () => {
      alive = false;
      off();
    };
  }, [take]);

  // A word that arrived without reading or meaning is looked up once, in the
  // language the text is in (a kanji-only word follows the study language).
  const draftId = draft?.id;
  useEffect(() => {
    if (!draft || draft.kind !== 'word' || (draft.reading && draft.meaning)) return;
    let alive = true;
    setLooking(true);
    const lang = normalizeStudyLang(draft.studyLang, studyLangOfText(draft.word, getStudyLang()));
    void glossFor(draft.word, lang).then((found) => {
      if (!alive) return;
      setLooking(false);
      setDraft((d) =>
        d && d.id === draft.id
          ? { ...d, reading: d.reading || found.reading || undefined, meaning: d.meaning || found.meaning || undefined }
          : d,
      );
    });
    return () => {
      alive = false;
    };
    // Only when a new draft arrives, not on every edit.
  }, [draftId]);

  const close = useCallback(() => void window.api.companionPreviewClose(), []);

  const add = useCallback(async () => {
    if (!draft || phase === 'adding' || !draft.word.trim()) return;
    setPhase('adding');
    try {
      const outcome = await window.api.companionMine({ draft, attachImage });
      setMessage(t(outcomeMessageKey(outcome)));
      setPhase(outcome.status === 'failed' ? 'error' : 'done');
      if (outcome.status === 'added' || outcome.status === 'exists') {
        closeTimer.current = window.setTimeout(close, 1400);
      }
    } catch {
      setMessage(t('companion.preview.result.failed'));
      setPhase('error');
    }
  }, [attachImage, close, draft, phase, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void add();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [add, close]);

  if (!draft) return <div className="companion-preview-root" />;

  const patch = (next: Partial<CompanionDraft>): void => setDraft((d) => (d ? { ...d, ...next } : d));
  const source = draftSourceLabel(draft);

  return (
    <div className="companion-preview-root">
      <section className="companion-surface companion-preview" aria-label={t('companion.preview.label')}>
        <header className="companion-preview-head">
          <span className="companion-preview-kind">
            {t(draft.kind === 'sentence' ? 'companion.preview.kind.sentence' : 'companion.preview.kind.word')}
          </span>
          {source && (
            <span className="companion-preview-source" title={source}>
              {t('companion.preview.from', { source })}
            </span>
          )}
          <IconButton
            className="companion-preview-close"
            size="sm"
            label={t('companion.preview.close')}
            onClick={close}
          >
            <Icon name="close" size={16} />
          </IconButton>
        </header>

        {editing ? (
          <div className="companion-preview-form">
            <Input
              label={t(draft.kind === 'sentence' ? 'companion.preview.sentenceField' : 'companion.preview.word')}
              value={draft.word}
              onChange={(e) => patch({ word: e.target.value })}
              autoFocus
            />
            {draft.kind === 'word' && (
              <Input
                label={t('companion.preview.reading')}
                value={draft.reading ?? ''}
                onChange={(e) => patch({ reading: e.target.value })}
              />
            )}
            <label className="ui-field">
              <span className="ui-field__label">{t('companion.preview.meaning')}</span>
              <textarea
                className="ui-textarea companion-preview-textarea"
                rows={2}
                value={draft.meaning ?? ''}
                onChange={(e) => patch({ meaning: e.target.value })}
              />
            </label>
            {draft.kind === 'word' && (
              <label className="ui-field">
                <span className="ui-field__label">{t('companion.preview.sentence')}</span>
                <textarea
                  className="ui-textarea companion-preview-textarea"
                  rows={3}
                  value={draft.sentence ?? ''}
                  onChange={(e) => patch({ sentence: e.target.value })}
                />
              </label>
            )}
          </div>
        ) : (
          <div
            className="companion-preview-card"
            lang={studyContentLang(normalizeStudyLang(draft.studyLang, studyLangOfText(draft.word, getStudyLang())))}
          >
            <div className={`companion-preview-word${draft.kind === 'sentence' ? ' is-sentence' : ''}`}>{draft.word}</div>
            {draft.reading && <div className="companion-preview-reading">{draft.reading}</div>}
            {draft.meaning ? (
              <div className="companion-preview-meaning">{draft.meaning}</div>
            ) : looking ? (
              <div className="companion-preview-meaning muted">{t('companion.preview.looking')}</div>
            ) : null}
            {draft.kind === 'word' && draft.sentence && (
              <div className="companion-preview-sentence">{draft.sentence}</div>
            )}
          </div>
        )}

        {draft.imageDataUrl && (
          <div className="companion-preview-picture">
            <img src={draft.imageDataUrl} alt={t('companion.preview.picture')} />
            <Toggle
              className="os-toggle os-toggle-compact"
              checked={attachImage}
              onChange={(e) => setAttachImage(e.target.checked)}
              label={t('companion.preview.attachPicture')}
            />
          </div>
        )}

        <footer className="companion-preview-foot">
          {message ? (
            <span className={`companion-preview-status${phase === 'error' ? ' is-error' : ''}`} role="status">
              {message}
            </span>
          ) : (
            <span className="companion-preview-status muted">{t('companion.preview.hint')}</span>
          )}
          <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)} disabled={phase === 'adding'}>
            {editing ? t('companion.preview.done') : t('companion.preview.edit')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            data-companion-add
            onClick={() => void add()}
            disabled={phase === 'adding' || phase === 'done' || !draft.word.trim()}
          >
            {phase === 'adding' ? t('companion.preview.adding') : t('companion.preview.add')}
          </Button>
        </footer>
      </section>
    </div>
  );
}
