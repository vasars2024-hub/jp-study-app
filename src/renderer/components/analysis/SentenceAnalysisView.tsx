import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { useT } from '../../i18n';
import {
  primaryTranslation,
  sentencePieces,
  type SentenceAnalysisResult,
  type SentenceAnnotation,
} from '../../../shared/sentenceAnalysisCore';
import {
  DEFAULT_ANALYSIS_PREFS,
  hasSection,
  type SentenceAnalysisPrefs,
} from '../../../shared/sentenceAnalysisPrefs';
import {
  ANALYSIS_SHORTCUT_HINTS,
  type AnalysisCommand,
} from '../../../shared/analysisShortcuts';
import './sentenceAnalysis.css';

/**
 * Presentational renderer for one whole-sentence AI annotation.
 *
 * The sentence itself is the interface. It is drawn once, with every annotated
 * span painted in its category's colour, and clicking a span opens its detail
 * card underneath — so the reader keeps the line they were reading in view
 * while the explanation appears next to it, instead of trading the sentence for
 * a wall of prose.
 *
 * Which sections appear is the user's call (Settings → AI analysis), and this
 * honours the same preference object the prompt was built from. That matters
 * beyond tidiness: a cached analysis produced under older preferences may still
 * carry a section that is now switched off, and rendering it would contradict
 * the settings screen.
 *
 * Keyboard control lives in the host (it owns Escape, focus and the window), so
 * this exposes an imperative handle rather than binding keys itself — two
 * panels binding the same global keys is the bug that pattern avoids.
 */

export interface AnalysisActionHandlers {
  onCopy?: (annotation: SentenceAnnotation, result: SentenceAnalysisResult) => void;
  onMine?: (annotation: SentenceAnnotation, result: SentenceAnalysisResult) => void;
  onSaveSentence?: (result: SentenceAnalysisResult) => void;
  onSnapshot?: (result: SentenceAnalysisResult) => void;
  onSpeak?: (text: string) => void;
  /** Opens the dictionary for a span — the AI view as a way *into* the dictionary. */
  onLookup?: (term: string, context: string) => void;
  onReanalyze?: () => void;
}

export interface AnalysisActionStates {
  mine?: 'idle' | 'busy' | 'done' | 'error';
  save?: 'idle' | 'busy' | 'done' | 'error';
  snapshot?: 'idle' | 'busy' | 'done' | 'error';
}

/** What a host can drive from the keyboard. */
export interface SentenceAnalysisHandle {
  /** Run a shortcut command. Returns false when it did not apply. */
  run: (command: AnalysisCommand) => boolean;
}

interface Props {
  result: SentenceAnalysisResult;
  /** Study language — sets `lang` on original-script runs and picks the translation. */
  lang: string;
  prefs?: SentenceAnalysisPrefs;
  actions?: AnalysisActionHandlers;
  actionState?: AnalysisActionStates;
  /** Renders the keyboard legend under the panel. */
  showShortcuts?: boolean;
  /**
   * Controlled selection. Omitted, the view owns which span is open — which is
   * what the Lens and the extension want. The video player passes it because
   * the sentence is also drawn on the subtitle overlay, and two copies of the
   * same sentence disagreeing about which word is open reads as a bug.
   */
  selectedIndex?: number;
  onSelectedIndexChange?: (index: number) => void;
  ref?: Ref<SentenceAnalysisHandle>;
}

export default function SentenceAnalysisView({
  result,
  lang,
  prefs = DEFAULT_ANALYSIS_PREFS,
  actions,
  actionState,
  showShortcuts,
  selectedIndex,
  onSelectedIndexChange,
  ref,
}: Props) {
  const { t, lang: uiLang } = useT();
  // Opening on the first annotation means the card is never an empty frame, and
  // the first span is the one the reader's eye is already on.
  const [internalSelected, setInternalSelected] = useState(0);
  const selected = selectedIndex ?? internalSelected;
  const select = useCallback(
    (index: number) => {
      setInternalSelected(index);
      onSelectedIndexChange?.(index);
    },
    [onSelectedIndexChange],
  );
  const [showTranslations, setShowTranslations] = useState(false);
  useEffect(() => {
    select(0);
    setShowTranslations(false);
  }, [result.sentence, select]);

  const pieces = useMemo(
    () => sentencePieces(result.sentence, result.annotations),
    [result.sentence, result.annotations],
  );
  const active = result.annotations[selected];
  const translation = hasSection(prefs, 'translations')
    ? primaryTranslation(result, uiLang, lang)
    : '';

  useImperativeHandle(
    ref,
    (): SentenceAnalysisHandle => ({
      run: (command) => {
        const count = result.annotations.length;
        if (typeof command === 'object') {
          if (command.select >= count) return false;
          select(command.select);
          return true;
        }
        switch (command) {
          case 'next':
            if (!count) return false;
            select((selected + 1) % count);
            return true;
          case 'prev':
            if (!count) return false;
            select((selected - 1 + count) % count);
            return true;
          case 'translations':
            setShowTranslations((v) => !v);
            return true;
          case 'copy':
            if (!active || !actions?.onCopy) return false;
            actions.onCopy(active, result);
            return true;
          case 'mine':
            if (!active || !actions?.onMine) return false;
            actions.onMine(active, result);
            return true;
          case 'saveSentence':
            if (!actions?.onSaveSentence) return false;
            actions.onSaveSentence(result);
            return true;
          case 'snapshot':
            if (!actions?.onSnapshot) return false;
            actions.onSnapshot(result);
            return true;
          case 'listen':
            if (!actions?.onSpeak) return false;
            actions.onSpeak(active ? active.text : result.sentence);
            return true;
          case 'dictionary':
            if (!active || !actions?.onLookup) return false;
            actions.onLookup(active.text, result.sentence);
            return true;
          case 'reanalyze':
            if (!actions?.onReanalyze) return false;
            actions.onReanalyze();
            return true;
          default:
            return false;
        }
      },
    }),
    [result, active, actions, selected, select],
  );

  return (
    <div className="sa-view">
      <section className="sa-card sa-sentence-card">
        <div className="sa-card-head">
          <h4 className="sa-head">{t('analysis.recognized')}</h4>
          {result.difficulty && <span className="sa-band">{result.difficulty}</span>}
        </div>
        <p className="sa-sentence" lang={lang}>
          {pieces.map((piece, i) =>
            piece.kind === 'plain' ? (
              <span key={i}>{piece.text}</span>
            ) : (
              <button
                key={i}
                type="button"
                className={`sa-seg sa-cat-${piece.annotation.category}${
                  piece.index === selected ? ' active' : ''
                }`}
                aria-pressed={piece.index === selected}
                title={piece.annotation.meaning}
                onClick={() => select(piece.index)}
              >
                {piece.text}
              </button>
            ),
          )}
        </p>
        {result.annotations.length > 0 && (
          <>
            <p className="sa-sentence-hint">{t('analysis.clickHint')}</p>
            <CategoryLegend annotations={result.annotations} />
          </>
        )}
      </section>

      {translation && (
        <section className="sa-card">
          <Translations
            result={result}
            lang={lang}
            primary={translation}
            open={showTranslations}
            onToggle={() => setShowTranslations((v) => !v)}
          />
          {hasSection(prefs, 'literal') && result.literal && (
            <div className="sa-field">
              <span className="sa-label">{t('analysis.literal')}</span>
              <span className="sa-literal">{result.literal}</span>
            </div>
          )}
        </section>
      )}

      {hasSection(prefs, 'formality') && result.formality && (
        <section className="sa-card sa-formality">
          <div className="sa-card-head">
            <h4 className="sa-head">{t('analysis.formality')}</h4>
            <span className="sa-band sa-band-formality">{result.formality.level}</span>
          </div>
          {result.formality.note && <p className="sa-prose">{result.formality.note}</p>}
        </section>
      )}

      {active && (
        <AnnotationCard
          annotation={active}
          result={result}
          lang={lang}
          prefs={prefs}
          actions={actions}
          actionState={actionState}
        />
      )}

      {hasSection(prefs, 'structure') && result.structure && (
        <Section title={t('analysis.structure')}>
          <p className="sa-prose">{result.structure}</p>
        </Section>
      )}

      {hasSection(prefs, 'nuance') && result.nuance.length > 0 && (
        <Section title={t('analysis.nuance')}>
          <NoteList notes={result.nuance} />
        </Section>
      )}

      {hasSection(prefs, 'pitfalls') && result.pitfalls.length > 0 && (
        <Section title={t('analysis.pitfalls')}>
          <NoteList notes={result.pitfalls} tone="warn" />
        </Section>
      )}

      {showShortcuts && <ShortcutLegend />}
    </div>
  );
}

/**
 * All three translations, the most useful one first and the rest folded away.
 * A Japanese learner wants English; a Chinese speaker reading Japanese wants
 * Chinese; the easy-Japanese paraphrase is a study aid in its own right. Which
 * is which depends on the reader, so all three ship and the UI only decides the
 * order. Open state is lifted so the T shortcut can drive it.
 */
function Translations({
  result,
  lang,
  primary,
  open,
  onToggle,
}: {
  result: SentenceAnalysisResult;
  lang: string;
  primary: string;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useT();
  const others = (['en', 'ja', 'zh'] as const)
    .map((code) => ({ code, text: result.translations[code] }))
    .filter((entry): entry is { code: 'en' | 'ja' | 'zh'; text: string } =>
      Boolean(entry.text && entry.text !== primary),
    );

  return (
    <>
      <p className="sa-translation">{primary}</p>
      {others.length > 0 && (
        <>
          <button type="button" className="sa-more" onClick={onToggle}>
            {open ? t('analysis.hideTranslations') : t('analysis.showTranslations')}
          </button>
          {open && (
            <ul className="sa-translations">
              {others.map((entry) => (
                <li key={entry.code}>
                  <span className="sa-lang-tag">{t(`analysis.lang.${entry.code}`)}</span>
                  <span lang={entry.code}>{entry.text}</span>
                  {entry.code === lang && (
                    <span className="sa-paraphrase-tag">{t('analysis.paraphrase')}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

/** Only the categories actually present — a legend for absent colours is noise. */
function CategoryLegend({ annotations }: { annotations: readonly SentenceAnnotation[] }) {
  const { t } = useT();
  const present = Array.from(new Set(annotations.map((a) => a.category)));
  if (present.length < 2) return null;
  return (
    <ul className="sa-legend">
      {present.map((category) => (
        <li key={category}>
          <span className={`sa-dot sa-cat-${category}`} />
          {t(`analysis.category.${category}`)}
        </li>
      ))}
    </ul>
  );
}

function ShortcutLegend() {
  const { t } = useT();
  return (
    <section className="sa-card sa-shortcuts">
      <h4 className="sa-head">{t('analysis.shortcuts')}</h4>
      <ul>
        {ANALYSIS_SHORTCUT_HINTS.map((hint) => (
          <li key={hint.command}>
            <kbd>{hint.keys}</kbd>
            {t(`analysis.shortcut.${hint.command}`)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AnnotationCard({
  annotation,
  result,
  lang,
  prefs,
  actions,
  actionState,
}: {
  annotation: SentenceAnnotation;
  result: SentenceAnalysisResult;
  lang: string;
  prefs: SentenceAnalysisPrefs;
  actions?: AnalysisActionHandlers;
  actionState?: AnalysisActionStates;
}) {
  const { t } = useT();
  const hasActions = !!(
    actions?.onCopy ||
    actions?.onMine ||
    actions?.onSpeak ||
    actions?.onSnapshot
  );

  return (
    <section className={`sa-card sa-detail sa-cat-edge-${annotation.category}`}>
      <div className="sa-detail-head">
        <span className="sa-detail-term" lang={lang}>
          {annotation.text}
        </span>
        {actions?.onSpeak && (
          <button
            type="button"
            className="sa-icon-btn"
            aria-label={t('analysis.listen')}
            title={`${t('analysis.listen')} · L`}
            onClick={() => actions.onSpeak?.(annotation.text)}
          >
            ♪
          </button>
        )}
        <span className={`sa-cat-badge sa-cat-${annotation.category}`}>
          {t(`analysis.category.${annotation.category}`)}
        </span>
      </div>

      <div className="sa-detail-body">
        <div className="sa-detail-meta">
          <Field label={t(`analysis.point.${annotation.category}`)}>
            <span className="sa-point-headword" lang={lang}>
              {annotation.headword || annotation.text}
              {annotation.reading && !annotation.headword && (
                <span className="sa-point-reading" lang={lang}>
                  （{annotation.reading}）
                </span>
              )}
            </span>
          </Field>
          {annotation.level && (
            <Field label={t('analysis.level')}>
              <span className="sa-level-value">{annotation.level}</span>
            </Field>
          )}
          <Field label={t('analysis.meaning')}>
            <span>{annotation.meaning}</span>
          </Field>
          {hasSection(prefs, 'formality') && annotation.formality && (
            <Field label={t('analysis.formality')}>
              <span className="sa-dim">{annotation.formality}</span>
            </Field>
          )}
          {actions?.onLookup && (
            <button
              type="button"
              className="sa-more"
              onClick={() => actions.onLookup?.(annotation.text, result.sentence)}
            >
              {t('analysis.openDictionary')}
            </button>
          )}
        </div>

        <div className="sa-detail-main">
          {annotation.explanation && (
            <>
              <h5 className="sa-head">{t('analysis.inDepth')}</h5>
              <p className="sa-prose">{annotation.explanation}</p>
            </>
          )}

          {hasSection(prefs, 'examples') && annotation.examples.length > 0 && (
            <ul className="sa-examples">
              {annotation.examples.map((example, i) => (
                <li key={i}>
                  <span className="sa-example-src" lang={lang}>
                    {example.text}
                  </span>
                  {example.translation && (
                    <span className="sa-example-dst">{example.translation}</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {hasSection(prefs, 'vocabulary') && annotation.vocabulary.length > 0 && (
            <>
              <h5 className="sa-head">{t('analysis.vocabNotes')}</h5>
              <ul className="sa-vocab">
                {annotation.vocabulary.map((note, i) => (
                  <li key={i}>
                    <span className="sa-vocab-term" lang={lang}>
                      {note.term}
                      {note.reading && <span className="sa-vocab-reading">（{note.reading}）</span>}
                    </span>
                    <span className="sa-vocab-gloss">— {note.gloss}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {hasActions && (
        <div className="sa-actions">
          {actions?.onCopy && (
            <button
              type="button"
              title="C"
              onClick={() => actions.onCopy?.(annotation, result)}
            >
              {t('analysis.copy')}
            </button>
          )}
          {actions?.onMine && (
            <button
              type="button"
              title="A"
              disabled={actionState?.mine === 'busy'}
              onClick={() => actions.onMine?.(annotation, result)}
            >
              {t(`analysis.mine.${actionState?.mine ?? 'idle'}`)}
            </button>
          )}
          {actions?.onSpeak && (
            <button type="button" title="L" onClick={() => actions.onSpeak?.(annotation.text)}>
              {t('analysis.listen')}
            </button>
          )}
          {actions?.onSnapshot && (
            <button
              type="button"
              title="S"
              disabled={actionState?.snapshot === 'busy'}
              onClick={() => actions.onSnapshot?.(result)}
            >
              {t(`analysis.snapshot.${actionState?.snapshot ?? 'idle'}`)}
            </button>
          )}
        </div>
      )}

      {actions?.onSaveSentence && (
        <div className="sa-actions sa-actions-secondary">
          <button
            type="button"
            title="W"
            disabled={actionState?.save === 'busy'}
            onClick={() => actions.onSaveSentence?.(result)}
          >
            {t(`analysis.saveSentence.${actionState?.save ?? 'idle'}`)}
          </button>
          {prefs.anki.deck && <span className="sa-deck-hint">→ {prefs.anki.deck}</span>}
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sa-field">
      <span className="sa-label">{label}</span>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sa-card">
      <h4 className="sa-head">{title}</h4>
      {children}
    </section>
  );
}

function NoteList({ notes, tone }: { notes: string[]; tone?: 'warn' }) {
  return (
    <ul className={`sa-notes${tone === 'warn' ? ' sa-notes-warn' : ''}`}>
      {notes.map((note, i) => (
        <li key={i}>{note}</li>
      ))}
    </ul>
  );
}
