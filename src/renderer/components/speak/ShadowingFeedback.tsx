/**
 * Shadowing feedback in the video player (docs/AI_AUDIT.md N18).
 *
 * After the learner records themselves repeating a line, the recording is
 * transcribed by the LOCAL Whisper model and compared with the line by sound
 * (`shared/shadowingScore.ts`): a score, the line with every word marked heard /
 * partly heard / missed, what Whisper heard with the extra words marked, the
 * named sound issues, and the pace against the original cue — plus Play buttons
 * for the original and the learner's take. All of that works with AI switched off.
 *
 * Round 2: the recording itself is also measured on the device
 * (`shared/shadowingProsody.ts`): the pitch the learner used on each word against
 * the pitch dictionary (Japanese), and the rhythm — morae (syllables) per second
 * and the pauses inside the line, placed by word. Only when the take was close
 * enough to the line for the mora layout to mean anything.
 *
 * "Explain with AI" (a `data-ai-entry`, hidden while AI is off) sends TEXT only —
 * the line, the transcript and the findings — never the audio.
 *
 * Whisper is never downloaded from here without the learner pressing the
 * install button. Lazy-loaded by `VideoCoreStudyOverlay`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ShadowingFeedbackResult } from '../../../shared/aiShadowing';
import {
  compareShadowing,
  shadowExtraWords,
  shadowMissedWords,
  type ShadowingComparison,
} from '../../../shared/shadowingScore';
import {
  analyzeShadowProsody,
  awkwardPauses,
  prosodyComparable,
  trackPitch,
  type ShadowProsody,
} from '../../../shared/shadowingProsody';
import type { StudyLang } from '../../../shared/studyLang';
import type { WhisperModelTier } from '../../../shared/whisperModels';
import { useAiReadiness } from '../../aiSetupClient';
import { cardAudio } from '../../cardAudioPlayback';
import { useT } from '../../i18n';
import { transcribeRecording, whisperReadiness } from '../../speechCapture';
import { AiStudyStatus, AiSuggestionBadge, useAiStudyRequest } from '../ai/aiStudyRequest';
import { WhisperInstallPrompt } from './SpeakParts';
import { ShadowProsodyView, type ProsodyState } from './ShadowingProsody';
import { prosodyWordsFor, shadowTokensFor } from './speakText';
import './speak.css';

export interface ShadowingFeedbackProps {
  /** The learner's recording (an object URL the host owns). */
  audioUrl: string;
  /** The subtitle line, as plain text. */
  expected: string;
  /** The cue's length, seconds (for the pace). */
  cueSec: number;
  studyLang: StudyLang;
  onReplayOriginal: () => void;
}

type Stage =
  | { kind: 'checking' }
  | { kind: 'needs-model'; tier: WhisperModelTier; sizeBytes: number }
  | { kind: 'transcribing' }
  | { kind: 'done'; comparison: ShadowingComparison; heard: string; prosody: ProsodyState }
  | { kind: 'failed'; reason: 'decode-failed' | 'failed' | 'empty' | 'cancelled' | 'no-line' };

export default function ShadowingFeedback({ audioUrl, expected, cueSec, studyLang, onReplayOriginal }: ShadowingFeedbackProps) {
  const { t, lang: uiLang } = useT();
  const ai = useAiReadiness();
  const [stage, setStage] = useState<Stage>({ kind: 'checking' });
  const controller = useRef<AbortController | null>(null);
  /** The take this panel last played, so leaving stops only its own clip. */
  const played = useRef<string | null>(null);
  const request = useAiStudyRequest<ShadowingFeedbackResult>();
  const supported = studyLang === 'ja' || studyLang === 'zh';

  const run = useCallback(async (): Promise<void> => {
    if (studyLang !== 'ja' && studyLang !== 'zh') return;
    controller.current?.abort();
    const mine = new AbortController();
    controller.current = mine;
    request.reset();
    setStage({ kind: 'checking' });
    const readiness = await whisperReadiness(studyLang).catch(() => null);
    if (mine.signal.aborted) return;
    if (!readiness) {
      setStage({ kind: 'failed', reason: 'failed' });
      return;
    }
    if (!readiness.ready) {
      setStage({ kind: 'needs-model', tier: readiness.tier, sizeBytes: readiness.sizeBytes });
      return;
    }
    setStage({ kind: 'transcribing' });
    try {
      const blob = await (await fetch(audioUrl)).blob();
      const transcript = await transcribeRecording(blob, studyLang, mine.signal);
      if (mine.signal.aborted) return;
      if (!transcript.ok) {
        if (transcript.reason === 'not-installed') {
          setStage({ kind: 'needs-model', tier: readiness.tier, sizeBytes: readiness.sizeBytes });
        } else {
          setStage({ kind: 'failed', reason: transcript.reason });
        }
        return;
      }
      const [expectedTokens, heardTokens] = await Promise.all([
        shadowTokensFor(expected, studyLang),
        shadowTokensFor(transcript.text, studyLang),
      ]);
      if (mine.signal.aborted) return;
      const comparison = compareShadowing(expectedTokens, heardTokens, studyLang, {
        cueSec,
        spokenSec: transcript.spokenSec,
      });
      if (!comparison) {
        setStage({ kind: 'failed', reason: 'no-line' });
        return;
      }
      const prosody = await measureProsody(comparison, expectedTokens, transcript, studyLang, cueSec);
      if (mine.signal.aborted) return;
      setStage({ kind: 'done', comparison, heard: transcript.text, prosody });
    } catch {
      if (!mine.signal.aborted) setStage({ kind: 'failed', reason: 'failed' });
    }
  }, [audioUrl, cueSec, expected, studyLang]);

  // A new recording is checked at once: the press of Stop is the request.
  useEffect(() => {
    void run();
    return () => controller.current?.abort();
  }, [run]);

  const cancel = (): void => {
    controller.current?.abort();
    setStage({ kind: 'failed', reason: 'cancelled' });
  };

  // The shared study-clip channel: a second press restarts the take instead of
  // stacking it, and the Soundscape ducks under the learner's own voice.
  const playMine = (): void => {
    played.current = audioUrl;
    void cardAudio.play(audioUrl).catch(() => undefined);
  };
  useEffect(() => () => {
    if (played.current) cardAudio.stop(played.current);
  }, []);

  const explain = (refresh = false): void => {
    if (stage.kind !== 'done' || (studyLang !== 'ja' && studyLang !== 'zh')) return;
    const { comparison, heard, prosody } = stage;
    const measured = prosody.kind === 'measured' ? prosody.prosody : null;
    void request.run((requestId) => window.api.aiSpeakShadowing({
      requestId,
      lang: studyLang,
      expected,
      heard,
      score: comparison.score,
      missed: shadowMissedWords(comparison),
      extra: shadowExtraWords(comparison),
      hints: comparison.hints.map((hint) => hint.kind),
      pace: comparison.timing?.pace ?? '',
      ...(measured ? prosodyForAi(measured, studyLang) : {}),
      answerLang: uiLang,
      ...(refresh ? { refresh: true } : {}),
    }));
  };

  if (!supported) {
    return <p className="speak-note" data-shadow-feedback="unsupported">{t('aiSpeak.shadow.unsupported')}</p>;
  }

  const result = request.state.status === 'done' ? request.state.result : null;

  return (
    <section className="speak-panel speak-shadow" aria-label={t('aiSpeak.shadow.title')} data-shadow-feedback={stage.kind}>
      <div className="speak-actions">
        <button type="button" className="btn small speak-btn" onClick={onReplayOriginal}>
          {t('aiSpeak.shadow.playOriginal')}
        </button>
        <button type="button" className="btn small speak-btn" onClick={playMine}>
          {t('aiSpeak.shadow.playMine')}
        </button>
        {(stage.kind === 'done' || stage.kind === 'failed') && (
          <button type="button" className="btn small speak-btn" onClick={() => void run()}>
            {t('aiSpeak.shadow.checkAgain')}
          </button>
        )}
      </div>

      {(stage.kind === 'checking' || stage.kind === 'transcribing') && (
        <div className="speak-busy" role="status">
          <span className="ai-study-spinner" aria-hidden="true" />
          <span>{t('aiSpeak.shadow.transcribing')}</span>
          <button type="button" className="btn small speak-btn" onClick={cancel}>{t('aiStudy.cancel')}</button>
        </div>
      )}

      {stage.kind === 'needs-model' && (
        <WhisperInstallPrompt tier={stage.tier} sizeBytes={stage.sizeBytes} onInstalled={() => void run()} />
      )}

      {stage.kind === 'failed' && (
        <p className={stage.reason === 'cancelled' ? 'speak-note' : 'speak-error'} role={stage.reason === 'cancelled' ? 'status' : 'alert'}>
          {t(`aiSpeak.shadow.failed.${stage.reason}`)}
        </p>
      )}

      {stage.kind === 'done' && (
        <ShadowResult comparison={stage.comparison} lang={studyLang} />
      )}

      {stage.kind === 'done' && <ShadowProsodyView state={stage.prosody} lang={studyLang} />}

      {stage.kind === 'done' && ai.loaded && ai.enabled && (
        <div className="speak-ai" data-ai-entry>
          <AiStudyStatus state={request.state} onCancel={request.cancel} busyKey="aiSpeak.shadow.explaining" />
          {result && (
            <div className="ai-study-answer" lang={uiLang}>
              <AiSuggestionBadge />
              <p>{result.summary}</p>
              {result.issues.length > 0 && (
                <ul className="ai-study-notes">
                  {result.issues.map((issue, index) => (
                    <li key={`${issue.focus}-${index}`}>
                      <strong>{t(`aiSpeak.shadow.focus.${issue.focus}`)}</strong>{' '}
                      {issue.explanation}
                      {issue.tip && <> {t('aiSpeak.shadow.tip', { tip: issue.tip })}</>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {request.state.status !== 'running' && (
            <div className="speak-actions">
              <button type="button" className="btn small speak-btn" onClick={() => explain(Boolean(result))}>
                {t(result ? 'aiStudy.askAgain' : 'aiSpeak.shadow.explain')}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The on-device pitch and rhythm measurement of a take, when it was close
 * enough to the line (`prosodyComparable`) and the recording could be read.
 */
async function measureProsody(
  comparison: ShadowingComparison,
  expectedTokens: Awaited<ReturnType<typeof shadowTokensFor>>,
  transcript: { pcm?: Float32Array; sampleRate?: number },
  lang: 'ja' | 'zh',
  cueSec: number,
): Promise<ProsodyState> {
  if (!transcript.pcm || !transcript.sampleRate) return { kind: 'skipped', reason: 'no-audio' };
  if (!prosodyComparable(comparison.score, comparison.expectedUnits, comparison.heardUnits)) {
    return { kind: 'skipped', reason: 'not-comparable' };
  }
  try {
    const { words, pitchAvailable } = await prosodyWordsFor(expectedTokens, lang);
    const prosody = analyzeShadowProsody({ track: trackPitch(transcript.pcm, transcript.sampleRate), words, cueSec });
    return prosody ? { kind: 'measured', prosody, pitchAvailable } : { kind: 'skipped', reason: 'no-voice' };
  } catch {
    return { kind: 'skipped', reason: 'no-audio' };
  }
}

/** The measured findings as text for "Explain with AI" (never the audio). */
function prosodyForAi(prosody: ShadowProsody, lang: 'ja' | 'zh'): { accent?: string[]; pauses?: string[] } {
  const accent = lang === 'ja'
    ? prosody.accents.filter((a) => a.verdict === 'mismatch').map((a) => `${a.surface}: ${a.expected.join('/')} → ${a.heard}`)
    : [];
  const pauses = awkwardPauses(prosody).map((p) => `${p.inside ? 'inside' : 'after'} ${p.word} ${p.sec}s`);
  return { ...(accent.length ? { accent } : {}), ...(pauses.length ? { pauses } : {}) };
}

function ShadowResult({ comparison, lang }: { comparison: ShadowingComparison; lang: StudyLang }) {
  const { t } = useT();
  const missed = shadowMissedWords(comparison);
  const extra = shadowExtraWords(comparison);
  return (
    <div className="speak-shadow-result">
      <p className="speak-score" role="status">
        {t('aiSpeak.shadow.score', { score: comparison.score })}
      </p>
      <meter className="speak-meter" min={0} max={100} low={60} high={85} optimum={100} value={comparison.score}
        aria-label={t('aiSpeak.shadow.scoreLabel')} />
      <p className="speak-label">{t('aiSpeak.shadow.line')}</p>
      <p className="speak-tokens" lang={lang}>
        {comparison.expected.map((token, index) => (
          <span key={index} className={`speak-tok is-${token.status}`}>{token.surface}</span>
        ))}
      </p>
      <p className="speak-label">{t('aiSpeak.shadow.heard')}</p>
      <p className="speak-tokens" lang={lang}>
        {comparison.heard.length
          ? comparison.heard.map((token, index) => (
            <span key={index} className={`speak-tok is-${token.status}`}>{token.surface}</span>
          ))
          : <span className="muted">{t('aiSpeak.shadow.heardNothing')}</span>}
      </p>
      <ul className="speak-facts">
        {missed.length > 0 && <li>{t('aiSpeak.shadow.missed', { words: missed.join(lang === 'ja' || lang === 'zh' ? '、' : ', ') })}</li>}
        {extra.length > 0 && <li>{t('aiSpeak.shadow.extra', { words: extra.join(lang === 'ja' || lang === 'zh' ? '、' : ', ') })}</li>}
        {comparison.timing && (
          <li>{t(`aiSpeak.shadow.pace.${comparison.timing.pace}`, {
            spoken: Math.round(comparison.timing.spokenSec * 10) / 10,
            cue: Math.round(comparison.timing.cueSec * 10) / 10,
          })}</li>
        )}
        {comparison.hints.map((hint, index) => (
          <li key={`${hint.kind}-${index}`}>
            {t(`aiSpeak.shadow.hint.${hint.kind}`, { expected: hint.expected, heard: hint.heard, word: hint.word })}
          </li>
        ))}
        {!missed.length && !extra.length && !comparison.hints.length && <li>{t('aiSpeak.shadow.clean')}</li>}
      </ul>
    </div>
  );
}
