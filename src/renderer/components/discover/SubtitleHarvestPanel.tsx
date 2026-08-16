/**
 * "Just the subtitles" — the other half of the download dialog.
 *
 * The torrent path answers "give me the episodes". This answers "give me the
 * *words*": fetch the Japanese subtitle text for the chosen episodes, with no
 * video anywhere in the transaction, and hand it straight to the same analysis
 * every other study surface runs.
 *
 * It reuses, rather than reimplements, three things that already exist:
 *   `planSubtitleHarvest` / `combineSeasonCues` — shared/subtitleHarvest.ts
 *   `parseSubtitles`                            — renderer/subtitles.ts
 *   `analyzeMediaStudyCues` + `addMediaStudyFlashcards` — renderer/mediaStudyWorkflow.ts
 *
 * That last one is the point of the whole panel. It is the same function the
 * media player's Study Mode and the visual-novel panel call, so a season of
 * subtitles produces exactly the vocabulary-with-frequency, kanji, grammar and
 * JLPT breakdown those surfaces produce — not a second, parallel analysis that
 * could disagree with them.
 */

import { useCallback, useMemo, useState } from 'react';
import Icon from '../Icons';
import { useT } from '../../i18n';
import { LANG_TAGS } from '../../../shared/i18n/core';
import {
  combineSeasonCues,
  planSubtitleHarvest,
  toPlainText,
  toSrt,
  type CombinedSeasonSegment,
  type HarvestFileCandidate,
  type NyaaSubtitleCandidateView,
  type SubtitleHarvestListResult,
} from '../../../shared/subtitleHarvest';
import { parseSubtitles, type Cue } from '../../subtitles';
import {
  SEASON_STUDY_LIMITS,
  addMediaStudyFlashcards,
  analyzeMediaStudyCues,
  mineableVocabulary,
  type MediaStudyAnalysis,
} from '../../mediaStudyWorkflow';
import { getLevel } from '../../knownWords';
import { showToast } from '../ui/Toast';
import { acquisitionConfigFrom } from '../../../shared/subtitleNyaa';
import { ipcErrorText } from '../../../shared/ipcErrorText';
import { getActiveScraperSettings } from '../../scraperSettingsStore';

interface Props {
  /** Jimaku keys on this. Null for a Jikan/MAL candidate — see `malId`. */
  anilistId: number | null;
  /**
   * A MAL id for main to resolve an AniList id from, when that is all the
   * catalogue entry has. Keeps a MyAnimeList candidate on the id path rather
   * than dropping it to a fuzzy title search.
   */
  malId?: number | null;
  title: string;
  /** Episode numbers the user selected upstream. Honours range/latest/custom. */
  episodes: number[];
  /** A stable id for deck provenance, so mined cards say where they came from. */
  sourceId: string;
}

type Phase = 'idle' | 'listing' | 'listed' | 'fetching' | 'analysing' | 'done' | 'error';

/** Only the first N vocabulary rows are rendered; mining is not limited to them. */
const VISIBLE_VOCAB = 60;

/**
 * How many cards one click of Mine adds, most frequent first.
 *
 * Passed explicitly rather than inherited: `addMediaStudyFlashcards` defaults to
 * 30 for `MediaStudyMode`, where one video is one sitting. A season harvest of a
 * 100-episode range silently took that same 30 while its button read "Mine 1,352
 * words" — measured live on One Piece 100–104, which added exactly 30. The count
 * is now the batch, and the label says both numbers, so the button cannot
 * promise more than the click delivers. Clicking again continues down the
 * frequency list without repeating a word (P5 gate 21).
 */
const MINE_BATCH = 30;

/** Same reason as the download dialog: the channel name is not a sentence. */
const errorText = ipcErrorText;

export default function SubtitleHarvestPanel({ anilistId, malId, title, episodes, sourceId }: Props) {
  const { t, lang } = useT();
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [needsKey, setNeedsKey] = useState(false);
  const [files, setFiles] = useState<HarvestFileCandidate[]>([]);
  const [combine, setCombine] = useState(true);
  const [segments, setSegments] = useState<CombinedSeasonSegment[]>([]);
  const [cues, setCues] = useState<Cue[]>([]);
  /**
   * Which provider entry answered, and how.
   *
   * Shown rather than kept internal: a fuzzy title search can list a different
   * show entirely, and a confident listing of the wrong series is the failure
   * this panel must not have silently.
   */
  const [source, setSource] = useState<Pick<
    SubtitleHarvestListResult, 'matchedBy' | 'entry' | 'idLookupDown' | 'jimakuDown' | 'nyaa'
  > | null>(null);
  const [analysis, setAnalysis] = useState<MediaStudyAnalysis | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  /**
   * The nyaa fallback, once the user asks for it.
   *
   * Never populated by `find` — Jimaku missing is not consent to search a
   * torrent index, and the fetch below puts a real transfer into the user's own
   * qBittorrent.
   */
  const [nyaaCandidates, setNyaaCandidates] = useState<NyaaSubtitleCandidateView[]>([]);
  /** What the acquired release actually held, against what the range asked for. */
  const [nyaaTaken, setNyaaTaken] = useState<{ files: number; used: number } | null>(null);

  const busy = phase === 'listing' || phase === 'fetching' || phase === 'analysing';

  /**
   * What will be fetched, recomputed from the current selection.
   *
   * Derived rather than stored, so changing the episode range upstream cannot
   * leave a stale plan on screen that no longer describes what the button does.
   */
  const plan = useMemo(
    () => (files.length ? planSubtitleHarvest(files, episodes) : null),
    [files, episodes],
  );

  const find = useCallback(async () => {
    setPhase('listing');
    setMessage('');
    setNeedsKey(false);
    setAnalysis(null);
    setCues([]);
    setSource(null);
    try {
      // The scraper profile lives here, not in main, so the nyaa fallback's
      // availability is answered against the profile the user is actually on.
      const result = await window.api.subtitleHarvestList({
        anilistId,
        malId,
        title,
        acquisition: acquisitionConfigFrom(getActiveScraperSettings()),
      });
      setFiles(result.files);
      setNeedsKey(result.needsKey);
      // An outage gets the translated sentence, not main's English one: it is
      // the only empty result whose cause the user can act on by waiting.
      setMessage(result.jimakuDown ? t('subHarvest.jimakuDown') : result.message);
      setSource({
        matchedBy: result.matchedBy,
        entry: result.entry,
        idLookupDown: result.idLookupDown,
        jimakuDown: result.jimakuDown,
        nyaa: result.nyaa,
      });
      setPhase(result.ok ? 'listed' : 'error');
    } catch (error) {
      setMessage(errorText(error));
      setPhase('error');
    }
  }, [anilistId, malId, title, t]);

  /**
   * The half both providers share: cues in, corpus out.
   *
   * Factored out when nyaa arrived rather than duplicated, because everything
   * downstream of "we have per-episode cues" — the offsetting, the season
   * limits, the segment index the deck reads provenance from — must be
   * identical whichever provider produced the text. A second copy is how one
   * path quietly loses the `SEASON_STUDY_LIMITS` argument and starts building a
   * frequency table from an eighth of the dialogue.
   */
  const analyse = useCallback(async (perEpisode: { episode: number; cues: Cue[] }[]) => {
    // Combining is always run: one episode is just a season of one, and the
    // offsetting is a no-op there. What `combine` decides is only whether the
    // user is *offered* the whole thing as a single corpus below.
    const combined = combineSeasonCues(perEpisode);
    setCues(combined.cues as Cue[]);
    setSegments(combined.segments);

    if (!combined.cues.length) {
      setMessage(t('subHarvest.error.noCues'));
      setPhase('error');
      return;
    }

    setPhase('analysing');
    // Season limits, not the per-episode defaults. `buildMediaStudyCorpus`
    // stops at 800 cues unless told otherwise, which is about episode three
    // of a season — and a frequency table built from an eighth of the
    // dialogue is wrong rather than short.
    const value = await analyzeMediaStudyCues(combined.cues as Cue[], SEASON_STUDY_LIMITS);
    setAnalysis(value);
    setPhase('done');
  }, [t]);

  const harvest = useCallback(async () => {
    if (!plan?.picks.length) return;
    setPhase('fetching');
    setMessage('');
    setFailures([]);
    setNyaaTaken(null);
    try {
      const reply = await window.api.subtitleHarvestFetch(plan.picks.map((pick) => pick.file.id));
      const byId = new Map(reply.files.map((file) => [file.id, file]));
      const problems: string[] = [];
      const perEpisode = plan.picks.map((pick) => {
        const fetched = byId.get(pick.file.id);
        if (!fetched?.text) {
          problems.push(`${pick.episode}: ${fetched?.error || t('subHarvest.error.empty')}`);
          return { episode: pick.episode, cues: [] as Cue[] };
        }
        return { episode: pick.episode, cues: parseSubtitles(fetched.text) };
      });
      setFailures(problems);
      await analyse(perEpisode);
    } catch (error) {
      setMessage(errorText(error));
      setPhase('error');
    }
  }, [analyse, plan, t]);

  /**
   * Ask the index what it has for this title.
   *
   * Only offered when Jimaku filed nothing and `nyaaAvailability` says the
   * fallback could actually run — the alternative is a button that starts a
   * torrent transfer and then reports a misconfiguration.
   */
  const findNyaa = useCallback(async () => {
    setPhase('listing');
    setMessage('');
    setNyaaCandidates([]);
    setNyaaTaken(null);
    setAnalysis(null);
    setCues([]);
    try {
      const result = await window.api.subtitleHarvestNyaaList({
        title,
        acquisition: acquisitionConfigFrom(getActiveScraperSettings()),
      });
      setNyaaCandidates(result.candidates);
      setMessage(result.message);
      setPhase(result.ok ? 'listed' : 'error');
    } catch (error) {
      setMessage(errorText(error));
      setPhase('error');
    }
  }, [title]);

  /**
   * Acquire one release and study whatever of the requested range it holds.
   *
   * The range check is not a filter that can quietly empty the run: a release
   * whose episodes miss the range entirely stops here and says which episodes
   * it *does* carry. Substituting them would hand back a frequency table for
   * episodes the user did not ask about, which is worse than nothing because
   * nothing downstream can tell.
   */
  const takeNyaa = useCallback(async (candidateId: string) => {
    setPhase('fetching');
    setMessage('');
    setFailures([]);
    setNyaaTaken(null);
    try {
      const reply = await window.api.subtitleHarvestNyaaFetch(
        candidateId,
        acquisitionConfigFrom(getActiveScraperSettings()),
      );
      if (!reply.ok) {
        setMessage(reply.message);
        setPhase('error');
        return;
      }
      const wanted = new Set(episodes);
      // No selection upstream means "whatever this release has".
      const inRange = wanted.size
        ? reply.files.filter((file) => file.episode !== null && wanted.has(file.episode))
        : reply.files;
      if (!inRange.length) {
        const held = reply.files
          .map((file) => file.episode)
          .filter((episode): episode is number => episode !== null)
          .sort((a, b) => a - b);
        setMessage(held.length
          ? t('subHarvest.nyaa.outOfRange', { held: `${held[0]}–${held[held.length - 1]}` })
          : t('subHarvest.nyaa.noEpisodes'));
        setPhase('error');
        return;
      }
      setNyaaTaken({ files: reply.files.length, used: inRange.length });
      await analyse(inRange.map((file) => ({
        // A release that numbers nothing — a film, a single file — is still one
        // corpus, and 0 is the episode the segment index then reports.
        episode: file.episode ?? 0,
        cues: parseSubtitles(file.text),
      })));
    } catch (error) {
      setMessage(errorText(error));
      setPhase('error');
    }
  }, [analyse, episodes, t]);

  /**
   * Words worth a card: everything the learner is not already at level 2+ on.
   *
   * The same filter the visual-novel miner applies — mining what you already
   * know is the fastest way to make a deck useless.
   */
  const mineable = useMemo(
    () => (analysis ? mineableVocabulary(analysis.vocabulary) : []),
    [analysis],
  );

  const mine = useCallback(() => {
    if (!analysis) return;
    // `segments` and not just the cues: the analysis ran on the *combined*
    // timeline, so without the segment index every card would record a
    // timestamp measured from the first episode of the range and no episode at
    // all — the one piece of provenance a season harvest owes the deck.
    const added = addMediaStudyFlashcards(
      { id: sourceId, title },
      { ...analysis, vocabulary: mineable },
      { segments, limit: MINE_BATCH },
    );
    showToast({
      kind: added ? 'success' : 'default',
      title,
      message: added
        ? t('subHarvest.mined', { count: added })
        : t('subHarvest.minedNone'),
    });
  }, [analysis, mineable, segments, sourceId, t, title]);

  const save = useCallback((kind: 'srt' | 'txt') => {
    const body = kind === 'srt' ? toSrt(cues) : toPlainText(cues);
    // Kana and kanji are kept rather than stripped: a Japanese title reduced to
    // hyphens makes every harvest of every show save as the same file name.
    const stem = title
      .replace(/[^\w々぀-ヿ一-鿿-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'subtitles';
    const range = episodes.length > 1
      ? `-${Math.min(...episodes)}-${Math.max(...episodes)}`
      : episodes.length === 1 ? `-${episodes[0]}` : '';
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${stem}${range}.${kind}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [cues, episodes, title]);

  const distribution = useMemo(() => {
    if (!analysis) return [];
    const counts = new Map<string, number>();
    for (const hit of analysis.grammar) counts.set(hit.level || '—', (counts.get(hit.level || '—') ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [analysis]);

  return (
    <div className="mal-dl-subs">
      <p className="mal-dl-note" role="status">
        {t('subHarvest.intro')}
      </p>

      <div className="mal-dl-subs-actions">
        <button
          type="button"
          className={`disc-btn ${files.length ? '' : 'disc-btn-primary'}`}
          disabled={busy || (!anilistId && !title.trim())}
          onClick={() => void find()}
        >
          <Icon name="search" size={12} />
          {phase === 'listing' ? t('subHarvest.action.finding') : t('subHarvest.action.find')}
        </button>

        {plan && plan.picks.length > 0 ? (
          <>
            <label className="disc-check">
              <input
                type="checkbox"
                checked={combine}
                disabled={busy}
                onChange={(event) => setCombine(event.target.checked)}
              />
              <span>{t('subHarvest.combine')}</span>
            </label>
            <button
              type="button"
              className="disc-btn disc-btn-primary"
              disabled={busy}
              onClick={() => void harvest()}
            >
              <Icon name="download" size={12} />
              {phase === 'fetching'
                ? t('subHarvest.action.fetching')
                : phase === 'analysing'
                  ? t('subHarvest.action.analysing')
                  : t('subHarvest.action.harvest', { count: plan.picks.length })}
            </button>
          </>
        ) : null}
      </div>

      {/* What the plan covers, before anything is fetched. `missing` is shown
          as loudly as `picks` — a 20-24 request that quietly returns three
          episodes is the failure this whole panel has to not have. */}
      {plan ? (
        <p className="mal-dl-subs-plan">
          <span className={plan.picks.length ? 'mal-dl-hit' : 'mal-dl-miss'}>
            {t('subHarvest.plan.covered', { covered: plan.picks.length, total: episodes.length })}
          </span>
          {plan.missing.length ? (
            <span className="mal-dl-miss">
              {t('subHarvest.plan.missing', { list: plan.missing.join(', ') })}
            </span>
          ) : null}
          <span className="scr-muted">{t('subHarvest.plan.filed', { count: files.length })}</span>
        </p>
      ) : null}

      {/* Which show the files actually came from. An exact id match is stated
          quietly; a title guess is stated as a warning, because it is the one
          that can silently be a different series. */}
      {source?.entry ? (
        <p
          className={`mal-dl-note${source.matchedBy === 'title' ? ' mal-dl-miss' : ' scr-muted'}`}
          role="status"
        >
          {source.matchedBy === 'title'
            ? t('subHarvest.source.titleGuess', { name: source.entry.name })
            : t('subHarvest.source.exact', { name: source.entry.name })}
          {source.idLookupDown ? ` ${t('subHarvest.source.idLookupDown')}` : ''}
        </p>
      ) : null}

      {/* Jimaku had nothing. nyaa runs from here now, but only on a second
          deliberate click: it is a torrent fetch into the user's own client,
          and it ships default-disabled and last for that reason. When it cannot
          run, its own reason is shown — an empty list that means "your indexer
          is off" must not read as "this show has no subtitles". */}
      {source?.nyaa ? (
        <div className="mal-dl-note mal-dl-subs-nyaa" role="status">
          <p>
            <Icon name="info" size={12} />
            {/* The offer is still made during an outage — waiting is the user's
                call — but it is not allowed to rest on "Jimaku has nothing",
                which during a rate limit is a claim nobody measured. */}
            {source.nyaa.available
              ? (source.jimakuDown ? t('subHarvest.nyaa.offeredDown') : t('subHarvest.nyaa.offered'))
              : t('subHarvest.nyaa.unavailable', { detail: source.nyaa.detail })}
          </p>
          {source.nyaa.available && !nyaaCandidates.length ? (
            <button type="button" className="scr-btn" onClick={findNyaa} disabled={busy}>
              {phase === 'listing' ? t('subHarvest.nyaa.searching') : t('subHarvest.nyaa.search')}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Size and swarm health before the click, for the same reason the
          discovery chooser shows them: accepting one of these starts a real
          transfer, and those are the two numbers that decide whether it will
          ever finish. */}
      {nyaaCandidates.length ? (
        <div className="mal-dl-subs-nyaa-list">
          <p className="scr-muted">{t('subHarvest.nyaa.found', { count: nyaaCandidates.length })}</p>
          <ul>
            {nyaaCandidates.map((candidate) => (
              <li key={candidate.id}>
                <span className="mal-dl-subs-nyaa-name" title={candidate.reasons.join(', ')}>
                  {candidate.releaseName}
                </span>
                <span className="scr-muted">
                  {t('subHarvest.nyaa.meta', {
                    size: Math.max(1, Math.round(candidate.sizeBytes / 1_048_576))
                      .toLocaleString(LANG_TAGS[lang]),
                    seeders: candidate.seeders.toLocaleString(LANG_TAGS[lang]),
                  })}
                </span>
                <button
                  type="button"
                  className="scr-btn"
                  onClick={() => { void takeNyaa(candidate.id); }}
                  disabled={busy}
                >
                  {t('subHarvest.nyaa.take')}
                </button>
              </li>
            ))}
          </ul>
          <p className="scr-muted">{t('subHarvest.nyaa.transferNote')}</p>
        </div>
      ) : null}

      {/* What the release turned out to hold, against what was asked for. A
          release that carries a hundred episodes and matches four of them is a
          usable result and a surprising one; both numbers are stated. */}
      {nyaaTaken ? (
        <p className="mal-dl-subs-plan" role="status">
          <span className="mal-dl-hit">
            {t('subHarvest.nyaa.took', { used: nyaaTaken.used, files: nyaaTaken.files })}
          </span>
        </p>
      ) : null}

      {needsKey ? (
        <p className="mal-dl-note mal-dl-subs-key" role="status">
          <Icon name="info" size={12} />
          {t('subHarvest.needsKey')}
        </p>
      ) : null}

      {message && !needsKey ? (
        <p className={`mal-dl-message${phase === 'error' ? ' reading-source-error' : ''}`} role="status">
          {message}
        </p>
      ) : null}

      {failures.length ? (
        <details className="mal-dl-failures">
          <summary>{t('subHarvest.failures', { count: failures.length })}</summary>
          <ul>{failures.map((failure) => <li key={failure}>{failure}</li>)}</ul>
        </details>
      ) : null}

      {analysis ? (
        <div className="mal-dl-subs-result">
          <div className="mal-dl-subs-stats">
            <span><b>{segments.length}</b><small>{t('subHarvest.stat.episodes')}</small></span>
            <span><b>{cues.length.toLocaleString(LANG_TAGS[lang])}</b><small>{t('subHarvest.stat.lines')}</small></span>
            <span><b>{analysis.text.length.toLocaleString(LANG_TAGS[lang])}</b><small>{t('subHarvest.stat.characters')}</small></span>
            <span><b>{analysis.vocabulary.length.toLocaleString(LANG_TAGS[lang])}</b><small>{t('subHarvest.stat.uniqueWords')}</small></span>
            <span><b>{analysis.kanji.length.toLocaleString(LANG_TAGS[lang])}</b><small>{t('subHarvest.stat.uniqueKanji')}</small></span>
            <span>
              <b>{Math.round((analysis.comprehensibility.uniqueTotal
                ? analysis.comprehensibility.uniqueKnown / analysis.comprehensibility.uniqueTotal
                : 0) * 100)}%</b>
              <small>{t('subHarvest.stat.known')}</small>
            </span>
            {analysis.level ? (
              <span><b>{analysis.level.label}</b><small>{t('subHarvest.stat.level')}</small></span>
            ) : null}
          </div>

          {analysis.truncated ? (
            <p className="mal-dl-note" role="status">{t('subHarvest.truncated')}</p>
          ) : null}

          <h4 className="mal-dl-subs-heading">
            {t('subHarvest.frequency')}
            <span className="scr-muted">{t('subHarvest.frequencyHint', { count: mineable.length })}</span>
          </h4>
          <ol className="mal-dl-subs-freq">
            {analysis.vocabulary.slice(0, VISIBLE_VOCAB).map((entry) => (
              <li key={entry.word} className={getLevel(entry.word) >= 2 ? 'is-known' : ''}>
                <span className="mal-dl-subs-word">{entry.word}</span>
                {entry.reading && entry.reading !== entry.word ? (
                  <span className="mal-dl-subs-reading">{entry.reading}</span>
                ) : null}
                <span className="mal-dl-subs-count">{entry.occurrences}</span>
                <span className="mal-dl-subs-sentence">{entry.sentence}</span>
              </li>
            ))}
          </ol>
          {analysis.vocabulary.length > VISIBLE_VOCAB ? (
            <p className="scr-muted">
              {t('subHarvest.more', { count: analysis.vocabulary.length - VISIBLE_VOCAB })}
            </p>
          ) : null}

          {distribution.length ? (
            <p className="mal-dl-subs-grammar">
              {t('subHarvest.grammar')}{' '}
              {distribution.map(([level, count]) => `${level} ×${count}`).join(' · ')}
            </p>
          ) : null}

          <div className="mal-dl-subs-actions">
            <button type="button" className="disc-btn disc-btn-primary" onClick={mine}>
              <Icon name="plus" size={12} />
              {mineable.length > MINE_BATCH
                ? t('subHarvest.action.mineBatch', {
                  count: MINE_BATCH,
                  total: mineable.length,
                })
                : t('subHarvest.action.mine', { count: mineable.length })}
            </button>
            <button type="button" className="disc-btn" onClick={() => save('srt')}>
              <Icon name="download" size={12} />
              {t('subHarvest.action.saveSrt')}
            </button>
            <button type="button" className="disc-btn" onClick={() => save('txt')}>
              <Icon name="file-text" size={12} />
              {t('subHarvest.action.saveText')}
            </button>
          </div>

          {/* Which episode contributed what. The combined corpus is one
              timeline, and without this the user cannot tell whether episode
              23 actually arrived. */}
          {segments.length > 1 ? (
            <ul className="mal-dl-subs-segments">
              {segments.map((segment) => (
                <li key={segment.episode} className={segment.cues ? '' : 'mal-dl-miss'}>
                  {t('subHarvest.segment', { episode: segment.episode, count: segment.cues })}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
