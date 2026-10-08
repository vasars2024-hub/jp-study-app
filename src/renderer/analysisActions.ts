/**
 * What a reader can *do* with an analysis, in one place.
 *
 * Mining, snapshotting and copying are the same three operations wherever an
 * analysis appears, and each has a detail that is easy to get subtly wrong per
 * call site — the deck override, which sections a snapshot carries, whether an
 * auto action has already fired for this sentence. Centralising them means the
 * Lens, the app and any future host cannot drift apart, and the auto-run guard
 * has one owner instead of one per component.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { appendNotebookEvent } from './notebookTimeline';
import { mineToStudy, requestStudyInput, type MineToStudyInput } from './studyMining';
import type { MineNoteRequest } from '../shared/anki';
import {
  buildAnalysisMineRequest,
  buildSentenceMineRequest,
} from '../shared/analysisMining';
import { buildAnalysisSnapshot, type AnalysisSnapshot } from '../shared/analysisSnapshot';
import type { SentenceAnalysisResult, SentenceAnnotation } from '../shared/sentenceAnalysisCore';
import {
  DEFAULT_ANALYSIS_PREFS,
  normalizeAnalysisPrefs,
  type SentenceAnalysisPrefs,
} from '../shared/sentenceAnalysisPrefs';

export type ActionState = 'idle' | 'busy' | 'done' | 'error';

/**
 * Live analysis preferences.
 *
 * Preferences are owned by the main process, so this both fetches them and
 * subscribes: the Reading Lens is a separate window and would otherwise keep
 * stale settings until it was closed and reopened.
 */
export function useAnalysisPrefs(): SentenceAnalysisPrefs {
  const [prefs, setPrefs] = useState<SentenceAnalysisPrefs>(DEFAULT_ANALYSIS_PREFS);
  useEffect(() => {
    let alive = true;
    void window.api
      .sentenceGetPrefs()
      .then((next) => {
        if (alive) setPrefs(normalizeAnalysisPrefs(next));
      })
      .catch(() => undefined);
    const off = window.api.onSentencePrefsChanged((next) => setPrefs(normalizeAnalysisPrefs(next)));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return prefs;
}

/** Write a snapshot into the notebook timeline. */
export function fileSnapshot(snapshot: AnalysisSnapshot): void {
  appendNotebookEvent({
    stream: 'highlights',
    title: snapshot.title,
    detail: snapshot.body,
    folder: snapshot.folder,
    origin: snapshot.meta.source === 'extension' ? 'extension' : 'app',
    meta: {
      lang: snapshot.meta.lang,
      difficulty: snapshot.meta.difficulty,
      formality: snapshot.meta.formality,
      annotations: snapshot.meta.annotations,
      source: snapshot.meta.source,
    },
  });
}

/**
 * Subscribe the main window to snapshots raised by the browser extension.
 *
 * Mount this once, at the app root — the extension has no renderer, so without
 * a listener its snapshots are broadcast into nothing.
 */
export function useExtensionSnapshots(): void {
  useEffect(() => window.api.onSentenceSnapshot((snapshot) => fileSnapshot(snapshot)), []);
}

export interface AnalysisActionsApi {
  prefs: SentenceAnalysisPrefs;
  mineState: ActionState;
  saveState: ActionState;
  snapshotState: ActionState;
  /** Mine one annotated span as a card. */
  mine: (annotation: SentenceAnnotation, result: SentenceAnalysisResult) => void;
  /** Mine the whole sentence as a sentence card. */
  saveSentence: (result: SentenceAnalysisResult) => void;
  /** File the analysis, annotations and all, into the notebook. */
  snapshot: (result: SentenceAnalysisResult) => void;
  /** Copy the span with what was said about it. */
  copy: (annotation: SentenceAnnotation, result: SentenceAnalysisResult) => void;
}

export interface AnalysisActionsOpts {
  /** Study language of the sentence. */
  lang: string;
  /** UI language, for picking which translation lands on a card. */
  uiLang: string;
  /** Where this analysis came from, recorded on the snapshot. */
  source: string;
  sourceLabel?: string;
  /** The analysis currently on screen, for the auto-run pass. */
  result?: SentenceAnalysisResult | null;
  /**
   * Where a mined card came from, when the host knows more than "an analysis".
   *
   * The player's grammar panel passes the playing file and line here, so a span mined
   * from it is a `subtitle` card routed like the mining panel's — same deck rules, same
   * "Play in video" — instead of an `analysis` card that has forgotten the video. Absent
   * everywhere else, which keeps the reader and the Lens exactly as they were.
   */
  mineProvenance?: AnalysisMineProvenance | null;
}

/** See `AnalysisActionsOpts.mineProvenance`. */
export interface AnalysisMineProvenance {
  /** Card source and Anki route source. */
  source: 'subtitle';
  sourceTitle?: string;
  sourceUrl?: string;
  sourceId?: string;
  folder?: string;
  sourceRef?: MineToStudyInput['sourceRef'];
}

/** The card fields and the Anki route for one mine, with or without a known origin. */
function withProvenance(
  request: MineNoteRequest,
  provenance: AnalysisMineProvenance | null | undefined,
  lang: string,
  sourceLabel: string | undefined,
): MineToStudyInput {
  if (!provenance) {
    return requestStudyInput(request, 'analysis', {
      sourceTitle: sourceLabel || undefined,
      studyLang: lang as MineToStudyInput['studyLang'],
    });
  }
  const { source, ...origin } = provenance;
  return requestStudyInput(
    { ...request, route: { ...(request.route ?? {}), source } },
    source,
    {
      ...origin,
      sourceTitle: origin.sourceTitle || sourceLabel || undefined,
      studyLang: lang as MineToStudyInput['studyLang'],
    },
  );
}

/**
 * Wire the actions for one host.
 *
 * The auto-mine and auto-snapshot preferences fire from here, keyed on the
 * sentence: re-rendering, switching the selected span, or the panel remounting
 * must not mine the same sentence twice, and the sentence is the only identity
 * that survives all three.
 */
export function useAnalysisActions(opts: AnalysisActionsOpts): AnalysisActionsApi {
  const prefs = useAnalysisPrefs();
  const [mineState, setMineState] = useState<ActionState>('idle');
  const [saveState, setSaveState] = useState<ActionState>('idle');
  const [snapshotState, setSnapshotState] = useState<ActionState>('idle');
  const autoDoneRef = useRef<string>('');

  const { lang, uiLang, source, sourceLabel, result, mineProvenance } = opts;

  const mine = useCallback(
    (annotation: SentenceAnnotation, analysis: SentenceAnalysisResult) => {
      setMineState('busy');
      void (async () => {
        try {
          // The card lands in the local deck first; Anki joins it now or when
          // it next opens. A closed Anki used to be an error and a lost card.
          const mined = await mineToStudy(withProvenance(
            buildAnalysisMineRequest(annotation, analysis, prefs, { lang, uiLang }),
            mineProvenance,
            lang,
            sourceLabel,
          ));
          // A duplicate is a success from the reader's point of view: the card
          // they wanted exists, which is the only thing they asked for.
          setMineState(mined.anki === 'failed' ? 'error' : 'done');
        } catch {
          setMineState('error');
        }
      })();
    },
    [prefs, lang, uiLang, sourceLabel, mineProvenance],
  );

  const saveSentence = useCallback(
    (analysis: SentenceAnalysisResult) => {
      setSaveState('busy');
      void (async () => {
        try {
          const mined = await mineToStudy(withProvenance(
            buildSentenceMineRequest(analysis, prefs, { lang, uiLang }),
            mineProvenance,
            lang,
            sourceLabel,
          ));
          setSaveState(mined.anki === 'failed' ? 'error' : 'done');
        } catch {
          setSaveState('error');
        }
      })();
    },
    [prefs, lang, uiLang, sourceLabel, mineProvenance],
  );

  const snapshot = useCallback(
    (analysis: SentenceAnalysisResult) => {
      try {
        fileSnapshot(buildAnalysisSnapshot(analysis, prefs, { lang, source, sourceLabel }));
        setSnapshotState('done');
      } catch {
        setSnapshotState('error');
      }
    },
    [prefs, lang, source, sourceLabel],
  );

  const copy = useCallback(
    (annotation: SentenceAnnotation, analysis: SentenceAnalysisResult) => {
      const lines = [annotation.headword || annotation.text, annotation.meaning];
      if (annotation.explanation) lines.push(annotation.explanation);
      lines.push(analysis.sentence);
      void navigator.clipboard?.writeText(lines.filter(Boolean).join('\n'));
    },
    [],
  );

  // Auto actions, once per sentence.
  useEffect(() => {
    if (!result) return;
    if (autoDoneRef.current === result.sentence) return;
    autoDoneRef.current = result.sentence;
    setMineState('idle');
    setSaveState('idle');
    setSnapshotState('idle');
    if (prefs.snapshot.auto) snapshot(result);
    if (prefs.anki.auto) saveSentence(result);
  }, [result, prefs.snapshot.auto, prefs.anki.auto, snapshot, saveSentence]);

  return { prefs, mineState, saveState, snapshotState, mine, saveSentence, snapshot, copy };
}
