/**
 * Pre-study for one YouTube video (7.5): pick a caption track (manual vs
 * auto-generated, ranked for the study language), then see the comprehension
 * estimate, the unknown words in order of how often they are said, and the i+1
 * lines — before pressing play.
 *
 * Captions come through yt-dlp metadata only (`--skip-download`). Nothing here
 * touches the YouTube player.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import { getLevel, onKnowledgeChanged, setLevel } from '../../knownWords';
import { getTokenizer } from '../../tokenizer';
import { studyTokens, studyTokensReady } from '../../studyTokens';
import { parseSubtitles } from '../../subtitles';
import { mineToStudy } from '../../studyMining';
import { openSceneAt } from '../../sceneRoundTrip';
import { writeLocalStorageJson } from '../../localStorageWrite';
import type { StudyLang } from '../../../shared/studyLang';
import { parseCaptionTracks } from '../../../shared/youtubeDiscovery';
import {
  yt5BestStudyTrack,
  yt5Clock,
  yt5MiningMeta,
  yt5RankCaptionTracks,
  yt5RememberComprehension,
  yt5SanitizeComprehensionCache,
  yt5StudyVideo,
  yt5TimestampUrl,
  yt5TrackKindKey,
  type Yt5ComprehensionEntry,
  type Yt5RankedTrack,
  type Yt5VideoStudy,
} from '../../../shared/youtubeStudy5';
import './yt5.css';

const COMPREHENSION_KEY = 'jp-yt5-comprehension';

/** The pre-watch brief (summary, questions, best lines): its own chunk, loaded when captions are analysed. */
const MediaBriefPanel = lazy(() => import('../media/MediaBriefPanel'));

export function loadYt5Comprehension(): Record<string, Yt5ComprehensionEntry> {
  try {
    const raw = localStorage.getItem(COMPREHENSION_KEY);
    return yt5SanitizeComprehensionCache(raw ? JSON.parse(raw) : null);
  } catch {
    return {};
  }
}

function rememberComprehension(videoId: string, knownRatio: number): void {
  writeLocalStorageJson(COMPREHENSION_KEY, yt5RememberComprehension(loadYt5Comprehension(), videoId, knownRatio, Date.now()));
  window.dispatchEvent(new CustomEvent('yt5:comprehension'));
}

/** Re-renders when any video's estimate changes. */
export function useYt5Comprehension(): Record<string, Yt5ComprehensionEntry> {
  const [cache, setCache] = useState(loadYt5Comprehension);
  useEffect(() => {
    const refresh = () => setCache(loadYt5Comprehension());
    window.addEventListener('yt5:comprehension', refresh);
    return () => window.removeEventListener('yt5:comprehension', refresh);
  }, []);
  return cache;
}

type Phase = 'idle' | 'probing' | 'fetching' | 'analysing' | 'ready' | 'error';

export default function YoutubePreStudyPanel({
  videoId,
  title,
  studyLang,
  localPath,
  onClose,
}: {
  videoId: string;
  title: string;
  studyLang: StudyLang;
  /** The downloaded file, when there is one: a timestamp then opens the study player there, offline. */
  localPath?: string;
  onClose: () => void;
}) {
  const { t, lang } = useT();
  const [tracks, setTracks] = useState<Yt5RankedTrack[] | null>(null);
  const [trackKey, setTrackKey] = useState('');
  const [captionText, setCaptionText] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [study, setStudy] = useState<Yt5VideoStudy | null>(null);
  const [knowledgeStamp, setKnowledgeStamp] = useState(0);
  const [saved, setSaved] = useState<Set<string>>(new Set());

  useEffect(() => onKnowledgeChanged(() => setKnowledgeStamp((n) => n + 1)), []);

  // Captions already cached by "Fetch subtitles" need no network at all.
  useEffect(() => {
    let active = true;
    setCaptionText(null);
    setStudy(null);
    setTracks(null);
    void window.api.ytCachedCaptionText(videoId).then((cached) => {
      if (active && cached.text) setCaptionText(cached.text);
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [videoId]);

  const probe = useCallback(async () => {
    setPhase('probing');
    setError('');
    try {
      const result = await window.api.ytDiscoveryProbe(videoId);
      const ranked = yt5RankCaptionTracks(result.probe?.captions ?? parseCaptionTracks(null, null), studyLang);
      setTracks(ranked);
      const best = yt5BestStudyTrack(ranked) ?? ranked[0];
      setTrackKey((current) => current || (best ? `${best.kind}:${best.key}` : ''));
      setPhase('idle');
      if (result.state !== 'ready') setError(result.message ?? t('yt5.pre.probeFailed'));
    } catch {
      setPhase('error');
      setError(t('yt5.pre.probeFailed'));
    }
  }, [studyLang, t, videoId]);

  const chosen = tracks?.find((track) => `${track.kind}:${track.key}` === trackKey) ?? null;

  const fetchTrack = useCallback(async () => {
    if (!chosen || typeof window.api.yt5FetchCaptionTrack !== 'function') return;
    setPhase('fetching');
    setError('');
    const result = await window.api.yt5FetchCaptionTrack(videoId, chosen.key, chosen.kind);
    if (result.ok) {
      setCaptionText(result.text);
      setPhase('idle');
    } else {
      setPhase('error');
      setError(result.error);
    }
  }, [chosen, videoId]);

  // Parsed once per caption text, so a knowledge change re-analyses without
  // handing the brief a "new" transcript.
  const cues = useMemo(() => (captionText ? parseSubtitles(captionText) : []), [captionText]);

  // Analyse whenever the captions or the learner's knowledge change.
  useEffect(() => {
    if (!captionText) return undefined;
    let cancelled = false;
    setPhase('analysing');
    const run = async (): Promise<void> => {
      if (!studyTokensReady(studyLang)) {
        try {
          await getTokenizer();
        } catch {
          /* fall through: studyTokens copes with an empty tokenizer */
        }
      }
      if (cancelled) return;
      const next = yt5StudyVideo(cues, (text) => studyTokens(text, studyLang), getLevel);
      setStudy(next);
      setPhase('ready');
      if (next.knownRatio != null) rememberComprehension(videoId, next.knownRatio);
    };
    const timer = window.setTimeout(() => void run(), 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [captionText, cues, studyLang, videoId, knowledgeStamp]);

  const saveWord = useCallback(async (lemma: string, reading: string, sentence: string, startSec: number) => {
    const meta = yt5MiningMeta({ videoId, title, startSec });
    await mineToStudy({
      word: lemma,
      reading,
      sentence,
      source: 'media',
      sourceId: `youtube:${videoId}`,
      sourceTitle: meta?.sourceTitle ?? title,
      sourceUrl: meta?.webUrl,
      sceneReference: meta?.sceneReference,
      sourceRef: { mediaId: `youtube:${videoId}`, cueStartSec: startSec, webUrl: meta?.webUrl },
      folder: 'Media',
      studyKind: 'vocabulary',
      studyLang,
    });
    setSaved((prev) => new Set(prev).add(lemma));
  }, [studyLang, title, videoId]);

  const percent = study?.knownRatio != null ? Math.round(study.knownRatio * 100) : null;
  const bandLabel = useMemo(() => (study?.band ? t(`yt5.band.${study.band}`) : ''), [study?.band, t, lang]);
  // A downloaded video plays in the study player (auto-pause, loop, mining) from the line,
  // with the usual run-up; only a video that is not downloaded goes to youtube.com.
  const openAt = (sec: number) => {
    if (localPath) void openSceneAt({ localFilePath: localPath, cueStartSec: sec });
    else void window.api.openExternal(yt5TimestampUrl(videoId, sec));
  };
  const openAtTitle = (sec: number) => (localPath
    ? t('yt5.pre.playAt', { time: yt5Clock(sec) })
    : t('yt5.pre.openAt', { time: yt5Clock(sec) }));

  return (
    <section className="yt5-prestudy" aria-label={t('yt5.pre.aria', { title })} data-yt5-prestudy={videoId}>
      <header className="yt5-prestudy-head">
        <strong>{t('yt5.pre.head')}</strong>
        <span className="yt5-prestudy-title">{title}</span>
        <button type="button" className="btn small" onClick={onClose}>{t('yt5.pre.close')}</button>
      </header>

      <div className="yt5-prestudy-tracks">
        {!tracks && (
          <button type="button" className="btn small" disabled={phase === 'probing'} onClick={() => void probe()}>
            {phase === 'probing' ? t('yt5.pre.probing') : t('yt5.pre.chooseTrack')}
          </button>
        )}
        {tracks && tracks.length === 0 && <p className="muted">{t('yt5.pre.noTracks')}</p>}
        {tracks && tracks.length > 0 && (
          <>
            <label>
              <span>{t('yt5.pre.track')}</span>
              <select
                value={chosen ? `${chosen.kind}:${chosen.key}` : ''}
                aria-label={t('yt5.pre.track')}
                onChange={(event) => setTrackKey(event.target.value)}
              >
                {tracks.map((track) => (
                  <option key={`${track.kind}:${track.key}`} value={`${track.kind}:${track.key}`}>
                    {t('yt5.pre.trackOption', {
                      key: track.key,
                      kind: t(`yt5.kind.${yt5TrackKindKey(track)}`),
                      role: t(`yt5.role.${track.role}`),
                    })}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn small primary"
              disabled={!chosen || phase === 'fetching'}
              onClick={() => void fetchTrack()}
            >
              {phase === 'fetching' ? t('yt5.pre.fetching') : t('yt5.pre.load')}
            </button>
            {chosen && chosen.kind === 'auto' && <small className="muted">{t('yt5.pre.autoWarning')}</small>}
          </>
        )}
      </div>

      {error && <p className="media-error" role="alert">{error}</p>}
      {!captionText && phase !== 'fetching' && <p className="muted">{t('yt5.pre.noCaptions')}</p>}
      {captionText && phase === 'analysing' && <p className="muted" role="status">{t('yt5.pre.analysing')}</p>}

      {study && percent != null && (
        <>
          <p className={`yt5-comprehension is-${study.band ?? 'none'}`} data-yt5-band={study.band ?? ''}>
            <strong>{t('yt5.pre.knownPct', { percent })}</strong>
            <span>{bandLabel}</span>
            <span>{t('yt5.pre.unknownUnique', { count: study.unknownUnique })}</span>
          </p>
          {study.vocabulary.length > 0 && (
            <>
              <h4>{t('yt5.pre.vocabHead')}</h4>
              <ul className="yt5-vocab" aria-label={t('yt5.pre.vocabHead')}>
                {study.vocabulary.map((row) => (
                  <li key={row.lemma} data-yt5-word={row.lemma}>
                    <span className="yt5-vocab-word" lang={studyLang}>{row.lemma}</span>
                    <span className="yt5-vocab-reading" lang={studyLang}>{row.reading}</span>
                    <span className="yt5-vocab-count">{t('yt5.pre.times', { count: row.count })}</span>
                    <button
                      type="button"
                      className="btn ghost small"
                      title={openAtTitle(row.firstSec)}
                      onClick={() => openAt(row.firstSec)}
                    >
                      {yt5Clock(row.firstSec)}
                    </button>
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => setLevel(row.lemma, 3)}
                    >
                      {t('yt5.pre.known')}
                    </button>
                    <button
                      type="button"
                      className="btn small"
                      disabled={saved.has(row.lemma)}
                      onClick={() => void saveWord(row.lemma, row.reading, row.sentence, row.firstSec)}
                    >
                      {saved.has(row.lemma) ? t('yt5.pre.saved') : t('yt5.pre.save')}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {study.iPlusOne.length > 0 && (
            <>
              <h4>{t('yt5.pre.iPlusOneHead', { count: study.iPlusOne.length })}</h4>
              <ul className="yt5-iplus1">
                {study.iPlusOne.map((line) => (
                  <li key={`${line.start}:${line.text}`}>
                    <button
                      type="button"
                      className="btn ghost small"
                      title={openAtTitle(line.start)}
                      onClick={() => openAt(line.start)}
                    >
                      {yt5Clock(line.start)}
                    </button>
                    <span lang={studyLang}>{line.text}</span>
                    <mark lang={studyLang}>{line.lemma}</mark>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {/* The pre-watch brief: deterministic best lines and quiz always, the AI summary,
          questions and line pick on request (hidden while AI is off). */}
      {study && cues.length > 0 && (
        <Suspense fallback={null}>
          <MediaBriefPanel
            cues={cues}
            title={title}
            studyLang={studyLang}
            variant="pre"
            study={study}
            onSeek={openAt}
            seekLabel={openAtTitle}
            onMineLine={(line) => void saveWord(line.target, '', line.text, line.start)}
          />
        </Suspense>
      )}
    </section>
  );
}
