/**
 * N9 + N10 — the video brief: a summary, comprehension questions and the best
 * i+1 lines to mine, from the subtitle cues of the current video or episode.
 *
 * Two hosts: the YouTube pre-study panel (a pre-watch brief) and the video study
 * overlay's AI workspace (a post-watch quiz). Clicking a question or a line
 * seeks to its cue.
 *
 * What runs without AI, always: the deterministic i+1 ranking ("best lines") and
 * a vocabulary quiz that blanks each i+1 line's unknown word. What AI adds, on
 * request only: the summary and questions (one request per transcript chunk,
 * with progress and Cancel) and a pick of the most teachable lines — each pick
 * re-checked here against the learner's current known words before it is shown.
 *
 * Lazy-loaded by both hosts. The AI controls are `data-ai-entry`, so they are
 * not offered while "Use AI features" is off.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  LINE_PICK_MAX_PICKS,
  chunkMediaBriefCues,
  mediaBriefFallbackQuiz,
  mediaBriefQuestionsPerChunk,
  mergeMediaBriefChunks,
  rankLinePickCandidates,
  validateLinePicks,
  type LinePickCandidate,
  type MediaBrief,
  type MediaBriefChunkResult,
  type ValidatedLinePick,
} from '../../../shared/aiMediaBrief';
import { immerseLevelLine } from '../../../shared/aiImmerseCommon';
import type { StudyLang } from '../../../shared/studyLang';
import { yt5Clock, yt5StudyVideo, type Yt5VideoStudy } from '../../../shared/youtubeStudy5';
import { useAiReadiness } from '../../aiSetupClient';
import { useT } from '../../i18n';
import { getLevel, onKnowledgeChanged } from '../../knownWords';
import { studyTokens, studyTokensReady } from '../../studyTokens';
import { getTokenizer } from '../../tokenizer';
import { AiSetupPrompt } from '../ai/AiSetupPrompt';
import {
  AiImmerseBadge,
  AiImmerseStatus,
  useAiImmerseRequest,
} from '../ai/aiImmerseRequest';

export interface MediaBriefLine {
  start: number;
  end: number;
  text: string;
  /** The line's one unknown word. */
  target: string;
}

export interface MediaBriefPanelProps {
  /** The study track's cues, in seconds, in playback order. */
  cues: readonly { start: number; end: number; text: string }[];
  title: string;
  studyLang: StudyLang;
  /** `pre`: before watching (YouTube pre-study). `post`: the episode quiz in the player. */
  variant: 'pre' | 'post';
  onSeek: (sec: number) => void;
  /** Tooltip for a seek button ("Open at 1:23" / "Play from 1:23"). */
  seekLabel?: (sec: number) => string;
  /** Mine a picked line; the button is absent without it. */
  onMineLine?: (line: MediaBriefLine) => void;
  /** The host's own analysis of these cues, when it has one; computed here otherwise. */
  study?: Yt5VideoStudy | null;
}

const DEFAULT_PICKS = 4;

export default function MediaBriefPanel({
  cues,
  title,
  studyLang,
  variant,
  onSeek,
  seekLabel,
  onMineLine,
  study: hostStudy,
}: MediaBriefPanelProps) {
  const { t, lang: uiLang } = useT();
  const ai = useAiReadiness();
  const [open, setOpen] = useState(variant === 'pre');
  const [ownStudy, setOwnStudy] = useState<Yt5VideoStudy | null>(null);
  const [knowledgeStamp, setKnowledgeStamp] = useState(0);
  const brief = useAiImmerseRequest<MediaBrief>();
  const pick = useAiImmerseRequest<ValidatedLinePick[]>();

  useEffect(() => onKnowledgeChanged(() => setKnowledgeStamp((n) => n + 1)), []);

  // The overlay has no analysis of its own track: make one when the panel opens.
  useEffect(() => {
    if (hostStudy || !open || !cues.length) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        if (!studyTokensReady(studyLang)) {
          try {
            await getTokenizer();
          } catch {
            /* studyTokens copes with an empty tokenizer */
          }
        }
        if (cancelled) return;
        setOwnStudy(yt5StudyVideo(cues, (text) => studyTokens(text, studyLang), getLevel));
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cues, hostStudy, open, studyLang, knowledgeStamp]);

  const study = hostStudy ?? ownStudy;
  const knownPct = study?.knownRatio != null ? Math.round(study.knownRatio * 100) : null;
  const level = immerseLevelLine(knownPct, studyLang);
  const chunking = useMemo(() => chunkMediaBriefCues(cues), [cues]);
  const lines = useMemo(
    () => (study?.iPlusOne ?? []).map((line) => ({ start: line.start, text: line.text, lemma: line.lemma })),
    [study],
  );
  const candidates: LinePickCandidate[] = useMemo(() => {
    const counts = new Map((study?.vocabulary ?? []).map((row) => [row.lemma, row.count]));
    return rankLinePickCandidates(lines, (lemma) => counts.get(lemma) ?? 1);
  }, [lines, study]);
  const quiz = useMemo(() => mediaBriefFallbackQuiz(lines), [lines]);
  const bestLines = useMemo(() => candidates.filter((_, index) => index < DEFAULT_PICKS), [candidates]);

  // A new video or track makes every answer about the old one meaningless.
  useEffect(() => {
    brief.reset();
    pick.reset();
  }, [cues]);

  const aiOn = ai.loaded && ai.enabled;
  const aiReady = aiOn && ai.ready;

  const runBrief = (refresh = false): void => {
    const { chunks } = chunking;
    if (!chunks.length) return;
    const perChunk = mediaBriefQuestionsPerChunk(chunks.length);
    void brief.runSteps<MediaBriefChunkResult>(
      chunks.length,
      (step, requestId) => window.api.aiImmerseBrief({
        requestId,
        title,
        studyLang,
        answerLang: uiLang,
        level,
        chunkIndex: step,
        chunkCount: chunks.length,
        questionCount: perChunk,
        cues: chunks[step].cues.map((cue) => ({ id: cue.id, text: cue.text })),
        ...(refresh ? { refresh: true } : {}),
      }),
      (answers) => {
        const merged = mergeMediaBriefChunks(answers, (id) => {
          const cue = cues[id];
          return cue ? cue.start : null;
        });
        return merged.questions.length ? merged : null;
      },
    );
  };

  const runPick = (refresh = false): void => {
    if (!candidates.length) return;
    void pick.run(async (requestId) => {
      const reply = await window.api.aiImmersePickLines({
        requestId,
        studyLang,
        answerLang: uiLang,
        level,
        pickCount: Math.min(LINE_PICK_MAX_PICKS, DEFAULT_PICKS),
        candidates: candidates.map((c) => ({ id: c.id, text: c.text, target: c.target })),
        ...(refresh ? { refresh: true } : {}),
      });
      if (!reply.ok || !reply.result) return { ...reply, result: undefined };
      // The local check: re-tokenized against the CURRENT known words.
      const valid = validateLinePicks(reply.result.picks, candidates, (text) => studyTokens(text, studyLang), getLevel);
      return { ...reply, result: valid };
    });
  };

  const briefResult = brief.state.status === 'done' ? brief.state.result : null;
  const pickResult = pick.state.status === 'done' ? pick.state.result : null;
  const headingKey = variant === 'pre' ? 'aiImmerse.brief.preTitle' : 'aiImmerse.brief.postTitle';

  if (!open) {
    return (
      <div className="ai-immerse is-inline" data-media-brief={variant}>
        <button
          type="button"
          className="btn small ai-immerse-btn"
          aria-expanded={false}
          data-media-brief-open=""
          onClick={() => setOpen(true)}
        >
          {t(headingKey)}
        </button>
      </div>
    );
  }

  const seekButton = (sec: number, text: string, lang?: string) => (
    <button
      type="button"
      className="ai-immerse-seek"
      title={seekLabel ? seekLabel(sec) : t('aiImmerse.brief.seek', { time: yt5Clock(sec) })}
      onClick={() => onSeek(sec)}
    >
      <span className="ai-immerse-time">{yt5Clock(sec)}</span>{' '}
      <span lang={lang}>{text}</span>
    </button>
  );

  const lineItem = (line: LinePickCandidate, reason?: string) => (
    <li key={`${line.id}:${line.start}`} className="ai-immerse-item" data-media-brief-line={line.id}>
      <div className="ai-immerse-row">
        {seekButton(line.start, line.text, studyLang)}
        <mark className="ai-immerse-target" lang={studyLang}>{line.target}</mark>
        {onMineLine && (
          <button
            type="button"
            className="btn small ai-immerse-btn"
            onClick={() => onMineLine({ start: line.start, end: line.start, text: line.text, target: line.target })}
          >
            {t('aiImmerse.brief.mine')}
          </button>
        )}
      </div>
      {reason ? <p className="ai-immerse-note">{reason}</p> : (
        <p className="muted ai-immerse-meta">{t('aiImmerse.brief.heardTimes', { count: line.targetCount })}</p>
      )}
    </li>
  );

  return (
    <section
      className="ai-immerse ai-immerse-brief"
      aria-label={t(headingKey)}
      data-media-brief={variant}
    >
      <div className="ai-immerse-head">
        <h4>{t(headingKey)}</h4>
        {variant === 'post' && (
          <button
            type="button"
            className="btn small ai-immerse-btn"
            aria-label={t('aiImmerse.close')}
            title={t('aiImmerse.close')}
            onClick={() => {
              brief.reset();
              pick.reset();
              setOpen(false);
            }}
          >
            ×
          </button>
        )}
      </div>

      {!cues.length && <p className="muted ai-immerse-note">{t('aiImmerse.brief.noCues')}</p>}

      {cues.length > 0 && (
        <>
          {/* ---- AI: summary + questions ---- */}
          <div className="ai-immerse-actions" data-ai-entry>
            {aiReady && brief.state.status !== 'running' && (
              <button
                type="button"
                className="btn small primary ai-immerse-btn"
                data-media-brief-run=""
                onClick={() => runBrief(Boolean(briefResult))}
              >
                {t(briefResult ? 'aiImmerse.askAgain' : 'aiImmerse.brief.run')}
              </button>
            )}
            {aiReady && pick.state.status !== 'running' && candidates.length > 0 && (
              <button
                type="button"
                className="btn small ai-immerse-btn"
                data-media-brief-pick=""
                onClick={() => runPick(Boolean(pickResult))}
              >
                {t(pickResult ? 'aiImmerse.brief.pickAgain' : 'aiImmerse.brief.pick')}
              </button>
            )}
          </div>
          {aiOn && !ai.ready && (
            <div data-ai-entry>
              <AiSetupPrompt compact reasonKey="aiImmerse.notReady" />
            </div>
          )}
          {aiOn && chunking.truncated && (
            <p className="muted ai-immerse-meta" data-ai-entry>
              {t('aiImmerse.brief.truncated', { time: yt5Clock(chunking.coveredUntilSec), parts: chunking.chunks.length })}
            </p>
          )}

          <div data-ai-entry>
            <AiImmerseStatus state={brief.state} onCancel={brief.cancel} busyKey="aiImmerse.brief.busy" />
          </div>
          {briefResult && (
            <div className="ai-immerse-answer" data-ai-entry data-media-brief-result="">
              <AiImmerseBadge />
              <p className="ai-immerse-section-label">{t('aiImmerse.brief.summary')}</p>
              {briefResult.summaries.map((paragraph, index) => (
                <p key={index} lang={uiLang}>{paragraph}</p>
              ))}
              <p className="ai-immerse-section-label">{t('aiImmerse.brief.questions', { count: briefResult.questions.length })}</p>
              <ol className="ai-immerse-list">
                {briefResult.questions.map((item, index) => (
                  <li key={`${item.cueId}:${index}`} className="ai-immerse-item" data-media-brief-question={item.cueId}>
                    {seekButton(item.start, item.question, studyLang)}
                    <details className="ai-immerse-reveal">
                      <summary>{t('aiImmerse.brief.showAnswer')}</summary>
                      <p lang={studyLang}>{item.answer}</p>
                    </details>
                  </li>
                ))}
              </ol>
              {brief.state.status === 'done' && brief.state.cached && (
                <p className="muted ai-immerse-meta">{t('aiImmerse.cached')}</p>
              )}
            </div>
          )}

          {/* ---- AI: line pick (validated locally) ---- */}
          <div data-ai-entry>
            <AiImmerseStatus state={pick.state} onCancel={pick.cancel} busyKey="aiImmerse.brief.pickBusy" />
          </div>
          {pickResult && (
            <div className="ai-immerse-answer" data-ai-entry data-media-brief-picks={pickResult.length}>
              <AiImmerseBadge />
              <p className="ai-immerse-section-label">{t('aiImmerse.brief.pickedHead')}</p>
              {pickResult.length > 0 ? (
                <ul className="ai-immerse-list">{pickResult.map((line) => lineItem(line, line.reason))}</ul>
              ) : (
                <p className="muted ai-immerse-note">{t('aiImmerse.brief.pickNoneValid')}</p>
              )}
            </div>
          )}

          {/* ---- Always: the deterministic best lines and quiz ---- */}
          {!study && <p className="muted ai-immerse-note" role="status">{t('aiImmerse.brief.analysing')}</p>}
          {study && (!pickResult || pickResult.length === 0) && (
            <>
              <p className="ai-immerse-section-label">{t('aiImmerse.brief.bestLines')}</p>
              {bestLines.length > 0 ? (
                <ul className="ai-immerse-list" data-media-brief-best={bestLines.length}>
                  {bestLines.map((line) => lineItem(line))}
                </ul>
              ) : (
                <p className="muted ai-immerse-note">{t('aiImmerse.brief.noLines')}</p>
              )}
            </>
          )}
          {study && !briefResult && quiz.length > 0 && (
            <>
              <p className="ai-immerse-section-label">{t('aiImmerse.brief.vocabQuiz', { count: quiz.length })}</p>
              <ol className="ai-immerse-list" data-media-brief-quiz={quiz.length}>
                {quiz.map((item) => (
                  <li key={`${item.start}:${item.answer}`} className="ai-immerse-item">
                    {seekButton(item.start, item.cloze, studyLang)}
                    <details className="ai-immerse-reveal">
                      <summary>{t('aiImmerse.brief.showAnswer')}</summary>
                      <p lang={studyLang}>{item.answer}</p>
                    </details>
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
    </section>
  );
}
