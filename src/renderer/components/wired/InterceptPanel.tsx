/**
 * ICP — an intercepted transmission. One of the operator's own mined sentences
 * (or a deck word), spoken by the OS voice — or, without a Japanese voice,
 * flashed briefly as a signal burst — to be typed back. Scored with the app's
 * dictation comparison (kana-folded, reading-aware), shown as ACK/NAK with the
 * missed runs marked, and logged to the review log as a practice answer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import WiredConsole from './WiredConsole';
import { speak, stopSpeaking, ttsAvailable } from '../../tts';
import { evaluateDictation } from '../../evaluateDictation';
import { markMissedDictation, type DictationMark } from '../../../shared/listeningTraining';
import { appendReviewLog } from '../../reviewLog';
import { interceptPassed } from '../../wiredMechanics/intercept';
import { noteInterceptAnswered, setActiveIntercept, useActiveIntercept } from '../../wiredMechanics/interceptStore';
import { closeWiredConsole } from '../../wiredMechanics/consoleBus';

type Phase = 'incoming' | 'burst' | 'transcribe' | 'scoring' | 'result';

const BURST_MS = 3500;
const MAX_REPLAYS = 2;

function hasJapaneseVoice(): boolean {
  if (!ttsAvailable()) return false;
  try {
    const voices = window.speechSynthesis.getVoices();
    // Voices load lazily; an empty list means "not known yet" — try speaking.
    return !voices.length || voices.some((v) => v.lang.toLowerCase().startsWith('ja'));
  } catch {
    return false;
  }
}

export default function InterceptPanel({ stackIndex, top }: { stackIndex: number; top: boolean }) {
  const { t } = useT();
  const active = useActiveIntercept();
  const [phase, setPhase] = useState<Phase>('incoming');
  const [answer, setAnswer] = useState('');
  const [replays, setReplays] = useState(0);
  const [spoken, setSpoken] = useState(false);
  const [result, setResult] = useState<{ passed: boolean; score: number; marks: DictationMark[] } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const burstTimer = useRef<number | null>(null);

  const code = active?.code ?? 'ICP-0000';
  const source = active?.source;

  useEffect(() => {
    setPhase('incoming');
    setAnswer('');
    setReplays(0);
    setResult(null);
  }, [active?.raisedAt]);

  useEffect(
    () => () => {
      if (burstTimer.current !== null) window.clearTimeout(burstTimer.current);
      stopSpeaking();
    },
    [],
  );

  useEffect(() => {
    if (phase === 'transcribe') inputRef.current?.focus();
  }, [phase]);

  const close = useCallback(() => {
    stopSpeaking();
    setActiveIntercept(null);
    closeWiredConsole('intercept');
  }, []);

  const transmit = useCallback(() => {
    if (!source) return;
    const voiced = hasJapaneseVoice() && speak(source.text, 'ja');
    setSpoken(voiced);
    if (voiced) {
      setPhase('transcribe');
      return;
    }
    // No voice: the transmission arrives as a short visible burst instead.
    setPhase('burst');
    if (burstTimer.current !== null) window.clearTimeout(burstTimer.current);
    burstTimer.current = window.setTimeout(() => {
      burstTimer.current = null;
      setPhase('transcribe');
    }, BURST_MS);
  }, [source]);

  const replay = useCallback(() => {
    if (!source || replays >= MAX_REPLAYS) return;
    setReplays((n) => n + 1);
    transmit();
  }, [replays, source, transmit]);

  const submit = useCallback(async () => {
    if (!source || !answer.trim() || phase !== 'transcribe') return;
    setPhase('scoring');
    stopSpeaking();
    const evaluation = await evaluateDictation(answer, source.text);
    const passed = interceptPassed(evaluation);
    const cmp = evaluation.comparison;
    const marks = markMissedDictation(cmp?.answer ?? answer, cmp?.expected ?? source.text);
    setResult({ passed, score: evaluation.score, marks });
    setPhase('result');
    noteInterceptAnswered(passed);
    // A practice answer on the card it came from: counts toward today's study
    // and the Statistics practice line, never touches the card's schedule.
    appendReviewLog({ mode: 'write', cardId: source.cardId, word: source.word, correct: passed });
    window.dispatchEvent(new CustomEvent(passed ? 'wired:sync-ok' : 'wired:sync-fail'));
  }, [answer, phase, source]);

  if (!active || !source) return null;

  return (
    <WiredConsole
      id="intercept"
      code="ICP"
      title={t('wiredMech.icp.title')}
      width={460}
      stackIndex={stackIndex}
      top={top}
      className={`wmc-icp is-${phase}`}
      onClose={() => {
        stopSpeaking();
        setActiveIntercept(null);
      }}
      status={
        <>
          <span>{code}</span>
          <span>{source.kind === 'sentence' ? t('wiredMech.icp.kindSentence') : t('wiredMech.icp.kindWord')}</span>
          <span className="wmc-status-right">{spoken ? 'VOX' : 'BURST'}</span>
        </>
      }
    >
      <div className="wmc-icp-body">
        <div className="wmc-icp-kicker">{t('wiredMech.icp.incoming')}</div>

        {phase === 'incoming' && (
          <>
            <p className="wmc-icp-copy">{t('wiredMech.icp.prompt')}</p>
            <div className="wmc-row">
              <button type="button" className="wmc-btn" onClick={transmit} autoFocus>
                {t('wiredMech.icp.receive')}
              </button>
              <button type="button" className="wmc-btn is-ghost" onClick={close}>
                {t('wiredMech.icp.ignore')}
              </button>
            </div>
          </>
        )}

        {phase === 'burst' && (
          <div className="wmc-icp-burst" lang="ja" aria-live="assertive">
            {source.text}
          </div>
        )}

        {(phase === 'transcribe' || phase === 'scoring') && (
          <form
            className="wmc-icp-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className="wmc-icp-copy" htmlFor="wmc-icp-input">
              {t('wiredMech.icp.transcribe')}
            </label>
            <input
              id="wmc-icp-input"
              ref={inputRef}
              lang="ja"
              value={answer}
              onChange={(e) => setAnswer(e.currentTarget.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={phase === 'scoring'}
            />
            <div className="wmc-row">
              <button type="submit" className="wmc-btn" disabled={!answer.trim() || phase === 'scoring'}>
                {t('wiredMech.icp.send')}
              </button>
              {spoken && (
                <button type="button" className="wmc-btn is-ghost" onClick={replay} disabled={replays >= MAX_REPLAYS}>
                  {t('wiredMech.icp.replay', { count: MAX_REPLAYS - replays })}
                </button>
              )}
              <button type="button" className="wmc-btn is-ghost" onClick={close}>
                {t('wiredMech.icp.abort')}
              </button>
            </div>
          </form>
        )}

        {phase === 'result' && result && (
          <div className={`wmc-icp-result ${result.passed ? 'is-ack' : 'is-nak'}`} role="status">
            <div className="wmc-icp-verdict">
              <b>{result.passed ? 'ACK' : 'NAK'}</b>
              <span>{t('wiredMech.icp.score', { score: result.score })}</span>
            </div>
            <div className="wmc-icp-diff" lang="ja" aria-label={t('wiredMech.icp.diffLabel')}>
              {result.marks.map((m, i) => (
                <span key={i} className={m.missed ? 'is-missed' : ''}>
                  {m.text}
                </span>
              ))}
            </div>
            <div className="wmc-icp-source" lang="ja">
              {source.text}
            </div>
            {(source.reading || source.meaning) && (
              <div className="wmc-icp-gloss">
                <span lang="ja">{source.word}</span>
                {source.reading && source.reading !== source.word ? <span lang="ja"> 【{source.reading}】</span> : null}
                {source.meaning ? <span> — {source.meaning}</span> : null}
              </div>
            )}
            <div className="wmc-row">
              <button type="button" className="wmc-btn" onClick={close} autoFocus>
                {t('wiredMech.icp.close')}
              </button>
            </div>
          </div>
        )}
      </div>
    </WiredConsole>
  );
}
