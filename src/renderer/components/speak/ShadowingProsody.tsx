/**
 * The pitch and rhythm of a shadowing take, measured on the device from the
 * recording (`shared/shadowingProsody.ts`), under the sound comparison:
 *
 * - Japanese pitch accent, word by word: the dictionary's high/low pattern as
 *   dots and the learner's own pitch as a line over the same morae, with the
 *   pattern names and a verdict in words (never colour alone).
 * - Rhythm: morae (Chinese: syllables) per second against the line's, and the
 *   pauses inside the line, placed by word — a pause inside a word, or between
 *   words where the line has no comma, is named.
 *
 * Said as an estimate: each mora's pitch comes from an equal share of the
 * speech. Shown only for a take close enough to the line for that to hold.
 */
import { pitchPatternName } from '../../../shared/pitchAccent';
import { accentHighs, awkwardPauses, type ShadowProsody, type WordAccent } from '../../../shared/shadowingProsody';
import type { StudyLang } from '../../../shared/studyLang';
import { useT } from '../../i18n';

export type ProsodyState =
  | { kind: 'measured'; prosody: ShadowProsody; pitchAvailable: boolean }
  | { kind: 'skipped'; reason: 'not-comparable' | 'no-audio' | 'no-voice' };

const STEP = 22;
const HEIGHT = 40;
const MID = HEIGHT / 2;
/** Pixels per semitone of the learner's line. */
const SCALE = 2.4;

function yOf(semitone: number): number {
  return Math.max(3, Math.min(HEIGHT - 3, MID - semitone * SCALE));
}

/** The dictionary's pattern (dots) and the learner's pitch (line) over one word and the mora after it. */
function AccentContour({ accent, morae }: { accent: WordAccent; morae: number }) {
  const span = accent.contour.length;
  const { word, next } = accentHighs(morae, accent.expected[0] ?? 0);
  const highs = accent.includesNext ? [...word, next] : word;
  const width = Math.max(1, span) * STEP;
  // The learner's line, broken where a mora had no voice.
  const runs: string[] = [];
  let current: string[] = [];
  accent.contour.forEach((value, index) => {
    if (value === null) {
      if (current.length) runs.push(current.join(' '));
      current = [];
      return;
    }
    current.push(`${index * STEP + STEP / 2},${yOf(value)}`);
  });
  if (current.length) runs.push(current.join(' '));
  return (
    <svg className="speak-pitch-svg" width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} aria-hidden="true" focusable="false">
      {highs.map((high, index) => (
        <circle
          key={`e${index}`}
          className={`speak-pitch-dot${index >= morae ? ' is-next' : ''}`}
          cx={index * STEP + STEP / 2}
          cy={high ? 8 : HEIGHT - 8}
          r={4}
        />
      ))}
      {runs.map((points, index) => (
        points.includes(' ')
          ? <polyline key={`h${index}`} className="speak-pitch-line" points={points} />
          : <circle key={`h${index}`} className="speak-pitch-point" cx={Number(points.split(',')[0])} cy={Number(points.split(',')[1])} r={2.5} />
      ))}
    </svg>
  );
}

export function ShadowProsodyView({ state, lang }: { state: ProsodyState; lang: StudyLang }) {
  const { t } = useT();
  const unitKey = lang === 'zh' ? 'zh' : 'ja';
  if (state.kind === 'skipped') {
    return (
      <div className="speak-prosody" data-shadow-prosody="skipped">
        <p className="speak-label">{t('aiSpeak.prosody.title')}</p>
        <p className="speak-note">{t(`aiSpeak.prosody.skipped.${state.reason}`)}</p>
      </div>
    );
  }
  const { prosody, pitchAvailable } = state;
  const { timing } = prosody;
  const pauses = awkwardPauses(prosody);
  const judged = prosody.accents.filter((accent) => accent.verdict !== 'unclear');
  const matched = judged.filter((accent) => accent.verdict === 'match').length;
  return (
    <div className="speak-prosody" data-shadow-prosody="measured">
      <p className="speak-label">{t('aiSpeak.prosody.title')}</p>
      {lang === 'ja' && (
        <>
          {judged.length > 0 && (
            <p className="speak-score" role="status">{t('aiSpeak.prosody.accentScore', { matched, total: judged.length })}</p>
          )}
          {prosody.accentSkipped === 'no-pitch-data' && (
            <p className="speak-note">{t(pitchAvailable ? 'aiSpeak.prosody.noPitchWords' : 'aiSpeak.prosody.noPitchDictionary')}</p>
          )}
          {prosody.accentSkipped === 'unvoiced' && <p className="speak-note">{t('aiSpeak.prosody.unvoiced')}</p>}
          {prosody.accents.length > 0 && (
            <ul className="speak-pitch-list">
              {prosody.accents.map((accent) => {
                const wordMorae = accent.morae;
                const expectedName = t(`aiSpeak.prosody.pattern.${pitchPatternName(accent.expected[0] ?? 0, wordMorae)}`);
                const heardName = accent.heard === null
                  ? ''
                  : t(`aiSpeak.prosody.pattern.${pitchPatternName(accent.heard, wordMorae)}`);
                return (
                  <li key={`${accent.token}-${accent.surface}`} className={`speak-pitch-word is-${accent.verdict}`} data-accent-verdict={accent.verdict}>
                    <span className="speak-pitch-surface" lang="ja">{accent.surface}</span>
                    <AccentContour accent={accent} morae={wordMorae} />
                    <span className="speak-pitch-text">
                      {accent.verdict === 'unclear'
                        ? t('aiSpeak.prosody.verdict.unclear', { expected: expectedName })
                        : t(`aiSpeak.prosody.verdict.${accent.verdict}`, { expected: expectedName, heard: heardName })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {prosody.accents.length > 0 && <p className="speak-meta">{t('aiSpeak.prosody.legend')}</p>}
        </>
      )}
      <ul className="speak-facts">
        <li>
          {timing.cueMoraPerSec !== null
            ? t(`aiSpeak.prosody.rate.${unitKey}`, { rate: timing.moraPerSec, cue: timing.cueMoraPerSec })
            : t(`aiSpeak.prosody.rateOnly.${unitKey}`, { rate: timing.moraPerSec })}
        </li>
        {pauses.map((pause, index) => (
          <li key={`${pause.afterMora}-${index}`}>
            {t(pause.inside ? 'aiSpeak.prosody.pauseInside' : 'aiSpeak.prosody.pauseAfter', { word: pause.word, sec: pause.sec })}
          </li>
        ))}
        {!pauses.length && timing.pauses.length === 0 && <li>{t('aiSpeak.prosody.noPauses')}</li>}
      </ul>
      <p className="speak-meta">{t('aiSpeak.prosody.estimate')}</p>
    </div>
  );
}
