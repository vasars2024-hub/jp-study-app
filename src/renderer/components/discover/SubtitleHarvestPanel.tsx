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

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { keepJapaneseStyleCues, parseSubtitles, type Cue } from '../../subtitles';
import { ATTACHABLE_SUBTITLE_FORMATS } from '../../../shared/subtitleDiscoveryIpc';
import type { MediaItem } from '../../../shared/types';
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
import { nyaaCannotText } from '../../nyaaUnavailableText';
import { planSubtitleAttach } from '../../../shared/subtitleAttachPlan';
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
  /**
   * The catalogue's other names for this same work.
   *
   * The index does not file every show under the name MAL does — MAL 2596 is
   * `Shinreigari` and nyaa has it only as `Ghost Hound`, so one title string
   * returned an honest-sounding "no release carries subtitles for this title"
   * for a show with a 4-seeder batch sitting on the index.
   */
  altTitles?: string[];
  /** Episode numbers the user selected upstream. Honours range/latest/custom. */
  episodes: number[];
  /** A stable id for deck provenance, so mined cards say where they came from. */
  sourceId: string;
}

type Phase = 'idle' | 'listing' | 'listed' | 'fetching' | 'analysing' | 'done' | 'error';

/**
 * One fetched cue file, kept whole.
 *
 * Everything else on this panel works on the *combined* corpus, which is one
 * flattened timeline with the episode boundaries recorded separately — useful
 * for a frequency table and useless as a subtitle track. Attaching needs the
 * original bytes of one episode, so they are held here rather than rebuilt from
 * `cues`: re-serialising an `.ass` through the SRT writer would drop styling,
 * and re-serialising the combined timeline would offset every cue by however
 * many episodes preceded it.
 */
interface HarvestedFile {
  /** Unique within one harvest; the `<select>` value. */
  key: string;
  /**
   * The episode this file is, carried rather than re-read off `label`.
   *
   * Both fetch paths already know it — jimaku from the plan's pick, nyaa from the
   * release's own file list — and parsing it back out of a display string is how
   * a renamed label would quietly start attaching the wrong episode.
   */
  episode: number | null;
  label: string;
  text: string;
  /** Lower-case extension without the dot, as the provider served it. */
  format: string;
  providerId: string;
  providerItemId: string;
}

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

export default function SubtitleHarvestPanel({
  anilistId,
  malId,
  title,
  altTitles,
  episodes,
  sourceId,
}: Props) {
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
    SubtitleHarvestListResult,
    'matchedBy' | 'entry' | 'idLookupDown' | 'jimakuDown' | 'rejectedEntry' | 'nyaa'
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
  /**
   * The alias the listed releases were found under, when it is not this panel's
   * own title. Shown, because a release list under a heading that names a
   * different show is exactly the kind of thing a user cannot check.
   */
  const [nyaaSearchedAs, setNyaaSearchedAs] = useState<string | null>(null);
  /** What the acquired release actually held, against what the range asked for. */
  const [nyaaTaken, setNyaaTaken] = useState<{ files: number; used: number } | null>(null);
  /** The fetched files themselves, for the attach control below. */
  const [harvested, setHarvested] = useState<HarvestedFile[]>([]);
  /**
   * The library, loaded once a harvest has something to attach.
   *
   * `null` means "not asked yet" and an empty array means "asked, and there is
   * nothing there" — a distinction the empty state depends on, since telling a
   * user their library is empty before looking is the same lie in a friendlier
   * shape.
   */
  const [library, setLibrary] = useState<MediaItem[] | null>(null);
  const [attachTarget, setAttachTarget] = useState('');
  const [attachKey, setAttachKey] = useState('');
  const [attaching, setAttaching] = useState(false);
  const [attachMessage, setAttachMessage] = useState('');
  /** Progress of a whole-range attach, so 39 round trips are not a frozen button. */
  const [attachAllAt, setAttachAllAt] = useState<{ done: number; total: number } | null>(null);

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

  /**
   * Forget the previous harvest's files.
   *
   * Called at the top of every fetch. Without it a failed second run leaves the
   * first run's cues attachable under the second run's heading, which is the
   * one way this control could write the wrong episode onto a video.
   */
  const clearHarvested = useCallback(() => {
    setHarvested([]);
    setAttachKey('');
    setAttachMessage('');
  }, []);

  const find = useCallback(async () => {
    setPhase('listing');
    setMessage('');
    setNeedsKey(false);
    setAnalysis(null);
    setCues([]);
    setSource(null);
    clearHarvested();
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
      setMessage(
        result.jimakuDown
          ? t('subHarvest.jimakuDown')
          : result.rejectedEntry
            ? t('subHarvest.source.noMatch', { name: result.rejectedEntry })
            : result.message,
      );
      setSource({
        matchedBy: result.matchedBy,
        entry: result.entry,
        idLookupDown: result.idLookupDown,
        jimakuDown: result.jimakuDown,
        rejectedEntry: result.rejectedEntry,
        nyaa: result.nyaa,
      });
      setPhase(result.ok ? 'listed' : 'error');
    } catch (error) {
      setMessage(errorText(error));
      setPhase('error');
    }
  }, [anilistId, malId, title, t, clearHarvested]);

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
    // Per file, before anything is combined: a dual-language `.ass` carries two
    // whole subtitle tracks, and the style stats that separate them only mean
    // something inside the file they came from. Both providers go through here
    // for the reason above — a jimaku file has one track, so this is inert on it,
    // and putting it on one branch is how the two paths start disagreeing about
    // what a corpus is.
    let dropped = 0;
    const dropStyles = new Set<string>();
    const japanese = perEpisode.map((entry) => {
      const split = keepJapaneseStyleCues(entry.cues);
      dropped += split.dropped;
      for (const style of split.styles) dropStyles.add(style);
      return { episode: entry.episode, cues: split.cues };
    });
    if (dropped) {
      const note = t('subHarvest.otherScript', {
        count: dropped,
        styles: [...dropStyles].slice(0, 4).join(', '),
      });
      // Appended, not assigned: a partial acquisition has already put its own
      // shortfall here, and these are two independent things the user needs.
      setMessage((prev) => (prev ? `${prev} ${note}` : note));
    }

    // Combining is always run: one episode is just a season of one, and the
    // offsetting is a no-op there. What `combine` decides is only whether the
    // user is *offered* the whole thing as a single corpus below.
    const combined = combineSeasonCues(japanese);
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
    clearHarvested();
    try {
      const reply = await window.api.subtitleHarvestFetch(plan.picks.map((pick) => pick.file.id));
      const byId = new Map(reply.files.map((file) => [file.id, file]));
      const problems: string[] = [];
      const kept: HarvestedFile[] = [];
      const perEpisode = plan.picks.map((pick) => {
        const fetched = byId.get(pick.file.id);
        if (!fetched?.text) {
          problems.push(`${pick.episode}: ${fetched?.error || t('subHarvest.error.empty')}`);
          return { episode: pick.episode, cues: [] as Cue[] };
        }
        kept.push({
          key: pick.file.id,
          episode: pick.episode,
          label: `${pick.episode} · ${pick.file.name}`,
          text: fetched.text,
          format: pick.file.format,
          providerId: 'jimaku',
          providerItemId: pick.file.id,
        });
        return { episode: pick.episode, cues: parseSubtitles(fetched.text) };
      });
      setFailures(problems);
      setHarvested(kept);
      await analyse(perEpisode);
    } catch (error) {
      setMessage(errorText(error));
      setPhase('error');
    }
  }, [analyse, plan, t, clearHarvested]);

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
    setNyaaSearchedAs(null);
    setNyaaTaken(null);
    clearHarvested();
    setAnalysis(null);
    setCues([]);
    try {
      const result = await window.api.subtitleHarvestNyaaList({
        title,
        titles: altTitles ?? [],
        // Sent so main can add the synced library row's own names. The
        // catalogue's aliases arrive as `titles` and come first; MAL's stored
        // synonyms are the fallback, and `HARVEST_ALIAS_LIMIT` bounds the walk.
        malId: malId ?? null,
        acquisition: acquisitionConfigFrom(getActiveScraperSettings()),
      });
      setNyaaCandidates(result.candidates);
      setNyaaSearchedAs(result.searchedAs);
      // Not `result.message`: that is main's English, and for an availability
      // refusal it is also silent about the one thing the user can do next.
      setMessage(nyaaCannotText(t, result.reason, result.message));
      setPhase(result.ok ? 'listed' : 'error');
    } catch (error) {
      setMessage(errorText(error));
      setPhase('error');
    }
    // `lang`, not `t` — `t`'s identity is stable by design, so depending on it
    // would leave this callback holding the old language after a switch.
  }, [title, altTitles, malId, clearHarvested, lang, t]);

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
    clearHarvested();
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
      // Kept on the success path too. `message` is empty on a whole result and
      // carries the shortfall on a partial one, so dropping it here is how a
      // four-of-thirty-nine harvest would look identical to a complete season.
      setMessage(reply.message);
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
      setHarvested(inRange.map((file, index) => ({
        key: `${index}:${file.fileName}`,
        episode: file.episode,
        label: file.episode === null ? file.fileName : `${file.episode} · ${file.fileName}`,
        text: file.text,
        format: file.format,
        providerId: 'nyaa',
        providerItemId: candidateId,
      })));
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
  }, [analyse, episodes, t, clearHarvested]);

  /**
   * Only what this app can actually parse back off disk.
   *
   * A provider can serve a `.zip`, a `.txt` transcript or a `.sub` — all of
   * which mine fine as text and none of which the player reads as a track.
   * Filtering here rather than only in main means the picker never offers a
   * file whose attach is guaranteed to be refused.
   */
  const attachable = useMemo(
    () => harvested.filter((file) => (ATTACHABLE_SUBTITLE_FORMATS as readonly string[]).includes(file.format)),
    [harvested],
  );

  // The library is read only once there is something to attach: this panel is
  // reachable from the catalogue without ever fetching a cue, and listing the
  // whole media library on mount would be an IPC round trip per browse.
  useEffect(() => {
    if (!attachable.length || library !== null) return;
    let live = true;
    void window.api.listMedia().then(
      (items) => { if (live) setLibrary(items); },
      () => { if (live) setLibrary([]); },
    );
    return () => { live = false; };
  }, [attachable.length, library]);

  /** Alphabetical, because the library's own order is by date added. */
  const libraryOptions = useMemo(
    () => [...(library ?? [])].sort((a, b) => a.title.localeCompare(b.title)),
    [library],
  );

  /**
   * Write one harvested file onto a library item as a real subtitle track.
   *
   * The last missing link in the subs-only route: before this, a harvest could
   * be mined and exported but the cues could never reach the player, because
   * every other path into a `SubtitleRecord` starts from a media item the user
   * already owns. Main validates again and its refusal is shown verbatim — a
   * renderer-side check is a convenience, never the gate.
   */
  const attach = useCallback(async () => {
    const file = attachable.find((entry) => entry.key === attachKey) ?? attachable[0];
    const target = libraryOptions.find((item) => item.id === attachTarget);
    if (!file || !target) return;
    setAttaching(true);
    setAttachMessage('');
    try {
      const reply = await window.api.attachSubtitleText({
        mediaId: target.id,
        text: file.text,
        format: file.format,
        lang: 'ja',
        label: file.label,
        providerId: file.providerId,
        providerItemId: file.providerItemId,
      });
      if (reply.ok) {
        setAttachMessage(t('subHarvest.attach.done', { title: target.title }));
        showToast({
          kind: 'success',
          title: target.title,
          message: t('subHarvest.attach.done', { title: target.title }),
        });
      } else {
        setAttachMessage(reply.message);
      }
    } catch (error) {
      setAttachMessage(errorText(error));
    } finally {
      setAttaching(false);
    }
  }, [attachKey, attachTarget, attachable, libraryOptions, t]);

  /**
   * What a whole-range attach would do, recomputed as the harvest and library change.
   *
   * Derived so the button can state its own number before it is pressed. A range
   * is what this pipeline exists for — Route B fetched 39 files in one click —
   * and "attach 12 episodes" is a promise the user can check; "Attach all" alone
   * is not.
   */
  const attachAllPlan = useMemo(
    () => planSubtitleAttach(
      attachable.map((file) => ({ key: file.key, episode: file.episode, label: file.label })),
      libraryOptions.map((item) => ({
        id: item.id,
        title: item.title,
        fileName: item.fileName,
        existingLabels: (item.subtitles ?? []).map((record) => record.label),
      })),
      title,
    ),
    [attachable, libraryOptions, title],
  );

  /**
   * Land every matched episode in one action.
   *
   * Sequential rather than parallel: each call writes a file and rewrites the
   * library record, and 39 concurrent writers against one JSON store is a
   * last-write-wins race that would drop tracks. Failures are counted and the run
   * continues — one refused episode must not strand the other 38 — and the
   * summary reports both numbers so a partial run cannot read as a whole one.
   */
  const attachAll = useCallback(async () => {
    const { pairs, skipped } = attachAllPlan;
    if (!pairs.length) return;
    const byKey = new Map(attachable.map((file) => [file.key, file]));
    setAttaching(true);
    setAttachMessage('');
    setAttachAllAt({ done: 0, total: pairs.length });
    let attached = 0;
    let failed = 0;
    let firstFailure = '';
    for (const pair of pairs) {
      const file = byKey.get(pair.key);
      if (!file) continue;
      try {
        const reply = await window.api.attachSubtitleText({
          mediaId: pair.mediaId,
          text: file.text,
          format: file.format,
          lang: 'ja',
          label: file.label,
          providerId: file.providerId,
          providerItemId: file.providerItemId,
        });
        if (reply.ok) attached += 1;
        else { failed += 1; if (!firstFailure) firstFailure = reply.message; }
      } catch (error) {
        failed += 1;
        if (!firstFailure) firstFailure = errorText(error);
      }
      setAttachAllAt((at) => (at ? { ...at, done: at.done + 1 } : at));
    }
    setAttachAllAt(null);
    setAttaching(false);
    // Re-read rather than patch: main is the authority on what actually landed,
    // and a locally incremented track list would disagree with it after a refusal.
    void window.api.listMedia().then((items) => setLibrary(items), () => undefined);
    const summary = t('subHarvest.attach.allDone', { attached, planned: pairs.length });
    const detail = [
      failed ? t('subHarvest.attach.allFailed', { count: failed, reason: firstFailure }) : '',
      skipped.length ? t('subHarvest.attach.allSkipped', { count: skipped.length }) : '',
    ].filter(Boolean).join(' ');
    setAttachMessage(detail ? `${summary} ${detail}` : summary);
    // A run that landed nothing is a warning, not a success — the toast is the
    // only thing a user who looked away will see.
    showToast({ kind: attached ? 'success' : 'warning', title, message: summary });
  }, [attachAllPlan, attachable, t, title]);

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
              : t('subHarvest.nyaa.unavailable', {
                  detail: nyaaCannotText(t, source.nyaa.reason, source.nyaa.detail),
                })}
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
          {nyaaSearchedAs ? (
            <p className="scr-muted">{t('subHarvest.nyaa.searchedAs', { name: nyaaSearchedAs })}</p>
          ) : null}
          <ul>
            {nyaaCandidates.map((candidate) => (
              <li key={candidate.id}>
                <span className="mal-dl-subs-nyaa-name" title={candidate.reasons.join(', ')}>
                  {candidate.releaseName}
                </span>
                <span className="scr-muted">
                  {/* The route, first: a 400 KB subtitle pack and a 7.8 GB video
                      batch whose subtitles are unconfirmed were offered here
                      identically, with nothing to tell them apart. */}
                  {t(`subHarvest.nyaa.route.${candidate.route}`)}
                  {' · '}
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
          {nyaaCandidates.some((candidate) => candidate.route === 'batch-sidecar') ? (
            <p className="scr-muted">{t('subHarvest.nyaa.sidecarNote')}</p>
          ) : null}
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

      {/* The route out of "mined only". Everything above turns cues into cards;
          this turns them into a track a video can actually show, which the
          subs-only path had no way to reach — it starts from a catalogue entry,
          so there was never a media item to hang a record on. */}
      {attachable.length ? (
        <div className="mal-dl-subs-attach">
          <h4 className="mal-dl-subs-heading">{t('subHarvest.attach.heading')}</h4>
          <p className="scr-muted">{t('subHarvest.attach.hint')}</p>
          {library !== null && !libraryOptions.length ? (
            <p className="mal-dl-note" role="status">{t('subHarvest.attach.empty')}</p>
          ) : (
            <div className="mal-dl-subs-actions">
              <label className="disc-field">
                <span>{t('subHarvest.attach.pickItem')}</span>
                <select
                  value={attachTarget}
                  disabled={attaching || library === null}
                  onChange={(event) => setAttachTarget(event.target.value)}
                >
                  <option value="">{t('subHarvest.attach.choose')}</option>
                  {libraryOptions.map((item) => (
                    <option key={item.id} value={item.id}>{item.title}</option>
                  ))}
                </select>
              </label>
              {attachable.length > 1 ? (
                <label className="disc-field">
                  <span>{t('subHarvest.attach.pickFile')}</span>
                  <select
                    value={attachKey || attachable[0].key}
                    disabled={attaching}
                    onChange={(event) => setAttachKey(event.target.value)}
                  >
                    {attachable.map((file) => (
                      <option key={file.key} value={file.key}>{file.label}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                type="button"
                className="disc-btn"
                disabled={attaching || !attachTarget}
                onClick={() => { void attach(); }}
              >
                <Icon name="plus" size={12} />
                {attaching ? t('subHarvest.attach.attaching') : t('subHarvest.attach.action')}
              </button>
              {/* The range this pipeline was asked for. Offered only once the plan
                  has something to promise, and it states the count rather than
                  saying "all" — the whole point is that some files will not have
                  a home and the user should see how many before pressing it. */}
              {attachAllPlan.pairs.length ? (
                <button
                  type="button"
                  className="disc-btn"
                  disabled={attaching}
                  onClick={() => { void attachAll(); }}
                >
                  <Icon name="plus" size={12} />
                  {attachAllAt
                    ? t('subHarvest.attach.allProgress', { done: attachAllAt.done, total: attachAllAt.total })
                    : t('subHarvest.attach.all', { count: attachAllPlan.pairs.length })}
                </button>
              ) : null}
            </div>
          )}
          {/* Why the whole-range button is not offered, when it is not. Silence
              here reads as "the feature is missing" rather than "nothing in your
              library is an episode of this series", which is the actual answer. */}
          {library !== null && libraryOptions.length > 0 && !attachAllPlan.pairs.length && attachable.length > 1 ? (
            <p className="scr-muted">{t('subHarvest.attach.noneMatched', { title })}</p>
          ) : null}
          {/* Skipped files are named rather than hidden: a `.zip` or a `.sub`
              mines fine and cannot be attached, and silently offering fewer
              files than the harvest fetched is unexplainable from the UI. */}
          {harvested.length > attachable.length ? (
            <p className="scr-muted">
              {t('subHarvest.attach.skipped', { count: harvested.length - attachable.length })}
            </p>
          ) : null}
          {attachMessage ? (
            <p className="mal-dl-message" role="status">{attachMessage}</p>
          ) : null}
        </div>
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
