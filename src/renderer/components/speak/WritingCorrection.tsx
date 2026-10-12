/**
 * Writing help for a note (docs/AI_AUDIT.md N19): "Correct my Japanese/Chinese"
 * on the selection or the whole note, and a journal prompt built from the due
 * words.
 *
 * - Corrections arrive as EDITS — the quoted words, the replacement, a reason —
 *   each shown as a diff. Nothing changes in the note until the learner accepts
 *   edits one by one and presses Apply, or presses Apply all; Undo restores the
 *   text from before. An edit is never applied to a text that changed since it
 *   was checked.
 * - Quick checks (doubled particles, ASCII punctuation, romaji, mixed です/だ…)
 *   run without any model: the fallback with AI off.
 * - The journal prompt is graded deterministically (which words appear, how many
 *   sentences) and, optionally, by the model word by word.
 *
 * Hosts: the note editor (`NoteViewer`) and Blanc's Quick Notes. Lazy-loaded.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  applyWritingEdits,
  checkJournalEntry,
  JOURNAL_SENTENCES_TARGET,
  lintStudyWriting,
  spliceText,
  type JournalGradeResult,
  type JournalWord,
  type WritingCorrectionResult,
} from '../../../shared/aiWritingCorrection';
import { normalizeStudyLang, type StudyLang } from '../../../shared/studyLang';
import { useAiReadiness } from '../../aiSetupClient';
import { dueDeckCards, loadDeck } from '../../flashcardDeck';
import { useT } from '../../i18n';
import { studyTokens } from '../../studyTokens';
import { AiStudyStatus, AiSuggestionBadge, useAiStudyRequest } from '../ai/aiStudyRequest';
import { StudyDiff } from './SpeakParts';
import { prepareStudyText } from './speakText';
import './speak.css';

export interface WritingCorrectionProps {
  /** The whole note. */
  text: string;
  /** The textarea's selection; an empty one means "the whole note". */
  selection?: { start: number; end: number } | null;
  studyLang: StudyLang;
  /** Called only after the learner approved: the whole note with the edits in it. */
  onApply: (next: string) => void;
}

const JOURNAL_WORD_COUNT = 3;

/** Due words of the study language first, then the most recently added ones. */
export function pickJournalWords(lang: StudyLang, round = 0): JournalWord[] {
  try {
    const deck = loadDeck().filter((card) => normalizeStudyLang(card.studyLang) === lang && card.word && [...card.word].length <= 12);
    const due = dueDeckCards(deck);
    const dueIds = new Set(due.map((card) => card.id));
    const recent = deck.filter((card) => !dueIds.has(card.id)).sort((a, b) => b.addedAt - a.addedAt);
    const pool = [...due, ...recent];
    const seen = new Set<string>();
    const unique = pool.filter((card) => !seen.has(card.word) && seen.add(card.word));
    if (!unique.length) return [];
    const start = (round * JOURNAL_WORD_COUNT) % unique.length;
    return [...unique.slice(start), ...unique.slice(0, start)].slice(0, JOURNAL_WORD_COUNT).map((card) => ({
      word: card.word,
      reading: card.reading ?? '',
      meaning: card.meaning ?? '',
    }));
  } catch {
    return [];
  }
}

function targetRange(text: string, selection: WritingCorrectionProps['selection']): { start: number; end: number } {
  const start = selection && selection.end > selection.start ? selection.start : 0;
  const end = selection && selection.end > selection.start ? selection.end : text.length;
  // The request trims; the range must match what was checked, character for character.
  const slice = text.slice(start, end);
  const lead = slice.length - slice.trimStart().length;
  const trail = slice.length - slice.trimEnd().length;
  return { start: start + lead, end: Math.max(start + lead, end - trail) };
}

export default function WritingCorrection({ text, selection, studyLang, onApply }: WritingCorrectionProps) {
  const { t, lang: uiLang } = useT();
  const ai = useAiReadiness();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'correct' | 'journal'>('correct');
  const [base, setBase] = useState<{ start: number; end: number } | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState('');
  const [undo, setUndo] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [textReady, setTextReady] = useState(studyLang !== 'ja');
  const correction = useAiStudyRequest<WritingCorrectionResult>();
  const journal = useAiStudyRequest<JournalGradeResult>();
  const aiUsable = ai.loaded && ai.enabled;

  const range = targetRange(text, selection ?? null);
  const target = text.slice(range.start, range.end);
  const usingSelection = Boolean(selection && selection.end > selection.start);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void prepareStudyText(studyLang).then((ok) => {
      if (alive) setTextReady(ok);
    });
    return () => {
      alive = false;
    };
  }, [open, studyLang]);

  const lints = useMemo(() => (open ? lintStudyWriting(target, studyLang) : []), [open, target, studyLang]);
  const words = useMemo(() => (open && mode === 'journal' ? pickJournalWords(studyLang, round) : []), [open, mode, studyLang, round]);
  const journalCheck = useMemo(() => {
    if (mode !== 'journal' || !words.length || !target.trim()) return null;
    let lemmas: Set<string> | undefined;
    if (textReady) {
      try {
        lemmas = new Set(studyTokens(target, studyLang).map((token) => token.lemma).filter(Boolean));
      } catch {
        lemmas = undefined;
      }
    }
    return checkJournalEntry(target, words, lemmas);
  }, [mode, words, target, textReady, studyLang]);

  const result = correction.state.status === 'done' ? correction.state.result : null;
  const graded = journal.state.status === 'done' ? journal.state.result : null;

  const runCorrection = (refresh = false): void => {
    setNotice('');
    setAccepted(new Set());
    if (!target.trim()) {
      setNotice(t('aiSpeak.write.empty'));
      return;
    }
    setBase(range);
    void correction.run((requestId) => window.api.aiSpeakCorrect({
      requestId,
      text: target,
      studyLang,
      answerLang: uiLang,
      ...(refresh ? { refresh: true } : {}),
    }));
  };

  const apply = (ids: ReadonlySet<string>): void => {
    if (!result || !base) return;
    const current = text.slice(base.start, base.start + result.text.length);
    const outcome = applyWritingEdits(current, result, ids);
    if (!outcome.ok) {
      setNotice(t(outcome.reason === 'text-changed' ? 'aiSpeak.write.changed' : 'aiSpeak.write.noneAccepted'));
      return;
    }
    setUndo(text);
    onApply(spliceText(text, base.start, base.start + result.text.length, outcome.text));
    correction.reset();
    setAccepted(new Set());
    setBase(null);
    setNotice(t('aiSpeak.write.applied', { count: outcome.applied }));
  };

  const toggle = (id: string): void => {
    const next = new Set(accepted);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setAccepted(next);
  };

  if (!open) {
    return (
      <div className="speak-write is-collapsed">
        <button type="button" className="btn small speak-btn" aria-expanded={false} onClick={() => setOpen(true)}>
          {t('aiSpeak.write.open')}
        </button>
      </div>
    );
  }

  return (
    <section className="speak-panel speak-write" aria-label={t('aiSpeak.write.title')} data-writing-correction="">
      <div className="speak-head">
        <h4 className="speak-title">{t('aiSpeak.write.title')}</h4>
        <div className="speak-tabs" role="tablist" aria-label={t('aiSpeak.write.title')}>
          {(['correct', 'journal'] as const).map((id) => (
            <button key={id} type="button" role="tab" aria-selected={mode === id} className={`btn small speak-btn${mode === id ? ' is-active' : ''}`} onClick={() => setMode(id)}>
              {t(`aiSpeak.write.tab.${id}`)}
            </button>
          ))}
        </div>
        <button type="button" className="btn small speak-btn" aria-label={t('aiStudy.close')} title={t('aiStudy.close')} onClick={() => {
          correction.reset();
          journal.reset();
          setOpen(false);
        }}>
          ×
        </button>
      </div>
      <p className="speak-note">{t(usingSelection ? 'aiSpeak.write.scopeSelection' : 'aiSpeak.write.scopeNote')}</p>

      {mode === 'correct' && (
        <>
          <p className="speak-label">{t('aiSpeak.write.quickChecks')}</p>
          <ul className="speak-facts">
            {lints.length
              ? lints.map((lint, index) => <li key={`${lint.kind}-${index}`}>{t(`aiSpeak.write.lint.${lint.kind}`, { quote: lint.quote })}</li>)
              : <li>{t('aiSpeak.write.lintClean')}</li>}
          </ul>
          {aiUsable && (
            <div className="speak-ai" data-ai-entry>
              <AiStudyStatus state={correction.state} onCancel={correction.cancel} busyKey="aiSpeak.write.checking" />
              {correction.state.status !== 'running' && (
                <div className="speak-actions">
                  <button type="button" className="btn small primary speak-btn" onClick={() => runCorrection(Boolean(result))}>
                    {t(result ? 'aiStudy.askAgain' : `aiSpeak.write.correct.${studyLang}`)}
                  </button>
                </div>
              )}
              {result && (
                <div className="ai-study-answer" lang={uiLang}>
                  <AiSuggestionBadge />
                  {result.overall && <p>{result.overall}</p>}
                  {result.edits.length === 0 ? (
                    <p>{t('aiSpeak.write.noEdits')}</p>
                  ) : (
                    <>
                      <ol className="speak-edits">
                        {result.edits.map((edit) => (
                          <li key={edit.id} className={`speak-edit${accepted.has(edit.id) ? ' is-accepted' : ''}`}>
                            <p><StudyDiff before={edit.original} after={edit.corrected} lang={studyLang} /></p>
                            <p className="speak-meta">{t(`aiSpeak.write.kind.${edit.kind}`)}</p>
                            <p>{edit.explanation}</p>
                            <label className="speak-check">
                              <input type="checkbox" checked={accepted.has(edit.id)} onChange={() => toggle(edit.id)} />
                              <span>{t('aiSpeak.write.accept')}</span>
                            </label>
                          </li>
                        ))}
                      </ol>
                      <div className="speak-actions">
                        <button type="button" className="btn small primary speak-btn" disabled={!accepted.size} onClick={() => apply(accepted)}>
                          {t('aiSpeak.write.applyAccepted', { count: accepted.size })}
                        </button>
                        <button type="button" className="btn small speak-btn" onClick={() => apply(new Set(result.edits.map((edit) => edit.id)))}>
                          {t('aiSpeak.write.applyAll', { count: result.edits.length })}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {mode === 'journal' && (
        <div className="speak-journal">
          {words.length === 0 ? (
            <p className="speak-note">{t('aiSpeak.journal.noWords')}</p>
          ) : (
            <>
              <p>
                {t('aiSpeak.journal.prompt', { count: JOURNAL_SENTENCES_TARGET })}{' '}
                <span lang={studyLang} className="speak-journal-words">{words.map((word) => word.word).join(studyLang === 'ru' ? ', ' : '、')}</span>
              </p>
              <div className="speak-actions">
                <button type="button" className="btn small speak-btn" onClick={() => {
                  journal.reset();
                  setRound(round + 1);
                }}>
                  {t('aiSpeak.journal.otherWords')}
                </button>
              </div>
              {journalCheck && (
                <ul className="speak-facts" aria-label={t('aiSpeak.journal.checkLabel')}>
                  {journalCheck.words.map((entry) => (
                    <li key={entry.word}>
                      {t(entry.used ? 'aiSpeak.journal.used' : 'aiSpeak.journal.notUsed', { word: entry.word })}
                    </li>
                  ))}
                  <li>{t('aiSpeak.journal.sentences', { count: journalCheck.sentences, target: JOURNAL_SENTENCES_TARGET })}</li>
                  {journalCheck.complete && <li>{t('aiSpeak.journal.complete')}</li>}
                </ul>
              )}
              {aiUsable && target.trim() && (
                <div className="speak-ai" data-ai-entry>
                  <AiStudyStatus state={journal.state} onCancel={journal.cancel} busyKey="aiSpeak.journal.grading" />
                  {journal.state.status !== 'running' && (
                    <div className="speak-actions">
                      <button type="button" className="btn small primary speak-btn" onClick={() => void journal.run((requestId) => window.api.aiSpeakJournal({
                        requestId,
                        words,
                        text: target,
                        studyLang,
                        answerLang: uiLang,
                        ...(graded ? { refresh: true } : {}),
                      }))}>
                        {t(graded ? 'aiStudy.askAgain' : 'aiSpeak.journal.grade')}
                      </button>
                    </div>
                  )}
                  {graded && (
                    <div className="ai-study-answer" lang={uiLang}>
                      <AiSuggestionBadge />
                      <p>{graded.feedback}</p>
                      <ul className="ai-study-notes">
                        {graded.words.map((entry) => (
                          <li key={entry.word}>
                            <span lang={studyLang}>{entry.word}</span>{' '}
                            {t(!entry.used ? 'aiSpeak.journal.verdict.missing' : entry.correct ? 'aiSpeak.journal.verdict.good' : 'aiSpeak.journal.verdict.check')}
                            {entry.note && <> — {entry.note}</>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {notice && <p className="speak-note" role="status">{notice}</p>}
      {undo !== null && (
        <div className="speak-actions">
          <button type="button" className="btn small speak-btn" onClick={() => {
            onApply(undo);
            setUndo(null);
            setNotice(t('aiSpeak.write.undone'));
          }}>
            {t('aiSpeak.write.undo')}
          </button>
        </div>
      )}
    </section>
  );
}
