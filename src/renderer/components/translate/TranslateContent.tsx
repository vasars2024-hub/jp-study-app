/**
 * Translation state, history, and the shared history panel — used by Study OS's
 * `TranslateView` and Blanc's `BlancTranslatePanel`.
 *
 * Pillar 2 (BLANC_REFINEMENT_PLAN.md): Blanc had no translate surface at all.
 * The model plumbing already lived in `renderer/translator.ts` and history in
 * `renderer/translationHistory.ts`; what was view-local was the language
 * pickers, the two panes, and the history list.
 *
 * Study OS renders two quite different layouts (aero and classic), so only the
 * genuinely shared parts are extracted — the hook and the history list. Nothing
 * here may import `AppChrome`/`MenuBar`/`StatusBar`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { translateTo, onModelProgress, type TransLang } from '../../translator';
import { getStudyLang } from '../../studyEnvironment';
import {
  appendTranslationHistory,
  clearTranslationHistory,
  loadTranslationHistory,
  onTranslationHistoryChanged,
  removeTranslationHistory,
  togglePinTranslationHistory,
  type TranslationHistoryEntry,
} from '../../translationHistory';
import { writeLocalStorage } from '../../localStorageWrite';
import type { TranslateSegment, TranslateStyle } from '../../../shared/translateCore';
import {
  acceptClipboardPassage,
  alignTranslation,
  searchTranslationHistory,
  translationMineFields,
} from '../../../shared/translateWorkbench';
import { appendNotebookEvent, saveTranslationNote } from '../../notebookTimeline';
import { createDeckFolder } from '../../flashcardDeck';
import { mineToStudy } from '../../studyMining';
import { studyLangFromTag, studyLangOfText } from '../../../shared/studyLang';
import { useT } from '../../i18n';
import { confirmDialog } from '../ui';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { getTranslateTarget, onTranslateTargetChanged, setTranslateTarget } from '../../translateTarget';
import { getTranslateSource, onTranslateSourceChanged, setTranslateSource } from '../../translateSource';
import { glossaryTermsForText } from '../../../shared/translateGlossary';
import {
  TRANSLATE_PAIR_CHOICE,
  isTranslateProviderId,
  joinTranslatedSentences,
  translateProviderLabel,
  type TranslateResultMeta,
} from '../../../shared/translateProviders';
import { loadTranslateGlossary } from '../../translateGlossaryStore';

export type TranslateState = 'idle' | 'loading' | 'translating' | 'done' | 'error';
export type TranslateTab = 'translate' | 'history';

export const LANG_LABELS: Record<TransLang, string> = {
  ja: '日本語',
  zh: '中文',
  en: 'English',
  ru: 'Русский',
};

export const LANG_ORDER: TransLang[] = ['ja', 'zh', 'en', 'ru'];

export const PLACEHOLDERS: Record<TransLang, string> = {
  ja: '日本語を貼り付け / 入力してください…',
  zh: '粘贴或输入中文…',
  en: 'Paste or type English…',
  ru: 'Вставьте или введите русский текст…',
};

export interface TranslateController {
  tab: TranslateTab;
  setTab: (t: TranslateTab) => void;
  source: TransLang;
  target: TransLang;
  pickSource: (l: TransLang) => void;
  pickTarget: (l: TransLang) => void;
  swap: () => void;
  input: string;
  setInput: (v: string) => void;
  output: string;
  translatedInput: string;
  state: TranslateState;
  msg: string;
  error: string;
  busy: boolean;
  run: () => Promise<void>;
  clear: () => void;
  history: TranslationHistoryEntry[];
  rerunEntry: (e: TranslationHistoryEntry) => void;
  mineEntry: (e: TranslationHistoryEntry) => void;
  /** The finished translation as sentence pairs (one pair when it cannot be split honestly). */
  segments: TranslateSegment[];
  /** Natural or literal rendering; remembered across sessions. */
  style: TranslateStyle;
  setStyle: (s: TranslateStyle) => void;
  /** Translate the history row again with the model, in its own direction. */
  retranslateEntry: (e: TranslationHistoryEntry) => void;
  togglePin: (e: TranslationHistoryEntry) => void;
  /** Mine the finished translation (the whole passage) as a sentence card. */
  mineResult: () => void;
  /** Mine one aligned sentence. */
  mineSegment: (s: TranslateSegment) => void;
  /** Copy the finished translation; announces the result. */
  copyResult: () => void;
  /** Translate whatever new source-language text lands on the clipboard. */
  clipboardWatch: boolean;
  setClipboardWatch: (on: boolean) => void;
  /**
   * Which engine produced the result on screen, whether the offline model stood
   * in for a cloud provider, and which glossary terms it honours. Null until a
   * translation finishes (and for history rows opened without re-running).
   */
  meta?: TranslateResultMeta | null;
  /** Sentences finished so far while a translation is still running (progressive display). */
  liveSegments?: TranslateSegment[];
}

/** Remembered Translate preferences. Read raw; written through the guarded writer. */
const STYLE_KEY = 'jp-translate-style-v1';
const CLIPBOARD_WATCH_KEY = 'jp-translate-clipboard-watch-v1';
/** How often the clipboard watcher asks main for the clipboard while it is on. */
export const CLIPBOARD_WATCH_INTERVAL_MS = 1200;

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function toast(message: string, kind: 'ok' | 'warn' | 'err' = 'ok'): void {
  window.dispatchEvent(new CustomEvent('os:toast', { detail: { message, kind } }));
}

export function useTranslate(): TranslateController {
  const { t } = useT();
  const [tab, setTab] = useState<TranslateTab>('translate');
  const [source, setSource] = useState<TransLang>(
    () => getTranslateSource(getStudyLang()) as TransLang,
  );
  const [target, setTarget] = useState<TransLang>(
    () => getTranslateTarget() as TransLang,
  );
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [translatedInput, setTranslatedInput] = useState('');
  const [state, setState] = useState<TranslateState>('idle');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<TranslationHistoryEntry[]>(() => loadTranslationHistory());
  const [reported, setReported] = useState<TranslateSegment[] | null>(null);
  const [style, setStyleState] = useState<TranslateStyle>(() => (readPref(STYLE_KEY) === 'literal' ? 'literal' : 'natural'));
  const [clipboardWatch, setClipboardWatchState] = useState(() => readPref(CLIPBOARD_WATCH_KEY) === '1');
  const [meta, setMeta] = useState<TranslateResultMeta | null>(null);
  const [liveSegments, setLiveSegments] = useState<TranslateSegment[]>([]);
  const styleRef = useRef(style);
  const startedRef = useRef(false);
  const requestRef = useRef(0);
  const offModelRef = useRef<(() => void) | null>(null);

  useEffect(() => () => {
    requestRef.current += 1;
    offModelRef.current?.();
    offModelRef.current = null;
  }, []);
  useEffect(() => onTranslationHistoryChanged(() => setHistory(loadTranslationHistory())), []);

  // Settings can now change the defaults while this view is mounted (aero 5.4).
  // Without these two the picker keeps showing the old language until remount,
  // which is the "I changed it and nothing happened" report the single-owner
  // modules exist to prevent.
  //
  // Each ignores a value equal to the OTHER side. `pickSource`/`pickTarget`
  // refuse a same-language pair and an external writer must not be able to route
  // around that — translating ja→ja is not a state this view has an answer for.
  // The listener also fires for this view's own writes; setting state to the
  // value it already holds is a no-op, so no guard is needed for that.
  useEffect(() => onTranslateSourceChanged((code) => {
    setSource((prev) => (code === target ? prev : (code as TransLang)));
  }), [target]);
  useEffect(() => onTranslateTargetChanged((code) => {
    setTarget((prev) => (code === source ? prev : (code as TransLang)));
  }), [source]);

  useEffect(() => {
    const onHist = () => setTab('history');
    window.addEventListener('translate:open-history', onHist);
    return () => window.removeEventListener('translate:open-history', onHist);
  }, []);

  function pickSource(l: TransLang) {
    const next = l === target ? source : l;
    setSource(next);
    setTranslateSource(next);
    // Translating from a language is not studying it: picking Chinese as a
    // source used to switch a Japanese learner's whole study language
    // (dictionaries, known words, subtitles) as a side effect.
  }

  function pickTarget(l: TransLang) {
    const next = l === source ? target : l;
    setTarget(next);
    setTranslateTarget(next);
  }

  function swap() {
    setSource(target);
    setTarget(source);
    setTranslateSource(target);
    setTranslateTarget(source);
    // Until a result exists, keep the learner's draft ready to translate.
    if (output) {
      setInput(output);
      setOutput(input);
    }
    setTranslatedInput('');
    setReported(null);
    setMeta(null);
  }

  /**
   * Translate `raw` in the given direction. `run` is this for the pane's own
   * text; a history re-run and the clipboard watcher pass theirs explicitly, so
   * they never race a state update that has not rendered yet.
   */
  const translateText = useCallback(async (raw: string, from: TransLang, to: TransLang) => {
    const text = raw.trim();
    if (!text) return;
    const request = ++requestRef.current;
    setError('');
    setOutput('');
    setTranslatedInput('');
    setReported(null);
    setMeta(null);
    setLiveSegments([]);
    setState('loading');
    setMsg(t('translate.msg.loadingModel'));
    startedRef.current = false;

    // Drops only this view's subscription, not the popup's or the reader's.
    offModelRef.current?.();
    offModelRef.current = onModelProgress((p) => {
      if (request !== requestRef.current) return;
      if (p.status === 'progress' && typeof p.progress === 'number') {
        const f = (typeof p.file === 'string' ? p.file.split('/').pop() : undefined) ?? 'model';
        setMsg(t('translate.msg.loadingFile', { file: f, pct: Math.round(p.progress) }));
      }
    });

    try {
      let segments: TranslateSegment[] | null = null;
      let resultMeta: TranslateResultMeta | null = null;
      // Sentences as they finish, by index: a cloud reply streams them, the
      // offline model produces them one at a time, and a fallback starts over.
      const live: TranslateSegment[] = [];
      // Only the glossary terms that occur in this passage are sent at all.
      const glossary = glossaryTermsForText(loadTranslateGlossary(), text, from, to);
      const result = await translateTo(text, from, to, (prog) => {
        if (request !== requestRef.current) return;
        startedRef.current = true;
        setState('translating');
        setMsg(t('translate.msg.translating', { pct: Math.round(prog * 100) }));
      }, undefined, {
        style: styleRef.current,
        onSegments: (s) => { segments = s; },
        // The engine the learner chose for this pair (main resolves and enforces consent).
        provider: TRANSLATE_PAIR_CHOICE,
        ...(glossary.length ? { glossary } : {}),
        onSegment: (index, segment, total) => {
          if (request !== requestRef.current) return;
          live[index] = segment;
          const done = live.filter(Boolean);
          startedRef.current = true;
          setState('translating');
          setLiveSegments([...done]);
          // The result pane fills sentence by sentence instead of staying empty until the end.
          setOutput(joinTranslatedSentences(done.map((s) => s.target), to));
          setMsg(t('xlate2.progress.sentences', { done: done.length, total }));
        },
        onMeta: (m) => { resultMeta = m; },
      });
      if (request !== requestRef.current) return;
      setOutput(result);
      setTranslatedInput(text);
      setReported(segments);
      setMeta(resultMeta);
      setLiveSegments([]);
      setState('done');
      setMsg('');
      appendTranslationHistory({
        sourceLang: from,
        targetLang: to,
        sourceText: text,
        resultText: result,
        origin: 'app',
        ...(resultMeta ? { provider: (resultMeta as TranslateResultMeta).provider } : {}),
      });
      appendNotebookEvent({
        stream: 'translations',
        title: text.slice(0, 80),
        detail: result.slice(0, 120),
        folder: 'Translations',
        origin: 'app',
        href: 'translate',
      });
    } catch (e) {
      if (request !== requestRef.current) return;
      // Sentences shown while it ran are not a translation once it failed.
      setOutput('');
      setLiveSegments([]);
      setError(e instanceof Error ? e.message : String(e));
      setState('error');
    } finally {
      if (request === requestRef.current) {
        offModelRef.current?.();
        offModelRef.current = null;
      }
    }
  }, [t]);

  const run = useCallback(() => translateText(input, source, target), [translateText, input, source, target]);

  function rerunEntry(e: TranslationHistoryEntry) {
    setSource(e.sourceLang as TransLang);
    setTarget(e.targetLang as TransLang);
    setInput(e.sourceText);
    setOutput(e.resultText);
    setTranslatedInput(e.sourceText);
    setReported(null);
    setMeta(isTranslateProviderId(e.provider) ? { provider: e.provider } : null);
    setTab('translate');
    setState('done');
  }

  function retranslateEntry(e: TranslationHistoryEntry) {
    setSource(e.sourceLang as TransLang);
    setTarget(e.targetLang as TransLang);
    setInput(e.sourceText);
    setTab('translate');
    void translateText(e.sourceText, e.sourceLang as TransLang, e.targetLang as TransLang);
  }

  function togglePin(e: TranslationHistoryEntry) {
    togglePinTranslationHistory(e.id);
  }

  function mineText(sourceText: string, resultText: string, sourceLang: string) {
    if (!sourceText.trim() || !resultText.trim()) return;
    // The folder is named in the UI language, like every folder the app creates for the learner.
    const folder = t('translate.deckFolder');
    createDeckFolder(folder);
    // Through the one mining gateway (studyMining.ts): it dedupes a second mine
    // of the same line, stamps the study language and keeps the card's identity,
    // which a bare addDeckCards did not — mining twice made two cards.
    void mineToStudy({
      ...translationMineFields(sourceText, resultText),
      source: 'import',
      sourceId: 'translate',
      folder,
      studyLang: studyLangFromTag(sourceLang) ?? studyLangOfText(sourceText, getStudyLang()),
      notify: false,
    }).then((result) => {
      // Mining used to succeed silently; say where the card went (or that it was already there).
      toast(result.created ? t('translate.history.mined', { folder }) : t('polish.mine.alreadyInDeck'));
    }).catch(() => toast(t('xlate.mine.failed'), 'err'));
  }

  function mineEntry(e: TranslationHistoryEntry) {
    mineText(e.sourceText, e.resultText, e.sourceLang);
  }

  function mineResult() {
    if (state !== 'done' || !translatedInput || !output) {
      toast(t('xlate.mine.nothing'), 'warn');
      return;
    }
    mineText(translatedInput, output, source);
  }

  function mineSegment(segment: TranslateSegment) {
    mineText(segment.source, segment.target, source);
  }

  function copyResult() {
    if (!output) return;
    void copyText(output).then((ok) => toast(ok ? t('xlate.copied') : t('xlate.copyFailed'), ok ? 'ok' : 'err'));
  }

  /**
   * Switching natural/literal on a finished translation re-translates it — the
   * toggle is "show me the other rendering", DeepL's alternatives in one click.
   * The ref is written first so the re-run already uses the new style.
   */
  function setStyle(next: TranslateStyle) {
    if (next === styleRef.current) return;
    styleRef.current = next;
    setStyleState(next);
    writeLocalStorage(STYLE_KEY, next);
    if (state === 'done' && translatedInput) void translateText(translatedInput, source, target);
  }

  function setClipboardWatch(on: boolean) {
    setClipboardWatchState(on);
    writeLocalStorage(CLIPBOARD_WATCH_KEY, on ? '1' : '0');
  }

  function clear() {
    requestRef.current += 1;
    offModelRef.current?.();
    offModelRef.current = null;
    setInput('');
    setOutput('');
    setTranslatedInput('');
    setReported(null);
    setMeta(null);
    setLiveSegments([]);
    setError('');
    setMsg('');
    setState('idle');
  }

  const segments = useMemo(
    () => (state === 'done' ? alignTranslation(translatedInput, output, reported) : []),
    [state, translatedInput, output, reported],
  );

  // The clipboard watcher (Migaku / Yomitan's clipboard monitor). Asks main for
  // the clipboard on an interval while it is on — the IPC read works whether or
  // not this window has focus, which is the whole point: the learner copies a
  // line in their browser and the translation is waiting when they look back.
  // The first read only seeds `last`, so turning it on never translates
  // whatever happened to be on the clipboard already.
  const watchRef = useRef({ input, output, source, translateText });
  watchRef.current = { input, output, source, translateText };
  useEffect(() => {
    if (!clipboardWatch) return;
    const read = window.api?.clipboardReadText;
    if (typeof read !== 'function') return;
    let alive = true;
    let last: string | null = null;
    const tick = async (): Promise<void> => {
      let raw = '';
      try {
        raw = (await read()) ?? '';
      } catch {
        return;
      }
      if (!alive) return;
      if (last === null) {
        last = raw.trim();
        return;
      }
      const cur = watchRef.current;
      const accepted = acceptClipboardPassage(raw, {
        last,
        currentInput: cur.input,
        currentOutput: cur.output,
        sourceLang: cur.source,
      });
      last = raw.trim();
      if (!accepted) return;
      setTab('translate');
      setInput(accepted);
      void cur.translateText(accepted, cur.source, target);
    };
    void tick();
    const timer = window.setInterval(() => void tick(), CLIPBOARD_WATCH_INTERVAL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [clipboardWatch, target]);

  return {
    tab,
    setTab,
    source,
    target,
    pickSource,
    pickTarget,
    swap,
    input,
    setInput,
    output,
    translatedInput,
    state,
    msg,
    error,
    busy: state === 'loading' || state === 'translating',
    run,
    clear,
    history,
    rerunEntry,
    mineEntry,
    segments,
    style,
    setStyle,
    retranslateEntry,
    togglePin,
    mineResult,
    mineSegment,
    copyResult,
    clipboardWatch,
    setClipboardWatch,
    meta,
    liveSegments,
  };
}

/**
 * The workbench's own keys, handled on the surface's root so they work from
 * the source pane, the result and the aligned list alike: Alt+M mines the
 * finished translation, Alt+C copies it. (Ctrl+Enter stays on the textarea,
 * where it has always been.) IME composition is left alone.
 */
export function handleTranslateHotkey(
  e: {
    key: string;
    code?: string;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    nativeEvent?: { isComposing?: boolean; keyCode?: number };
    preventDefault: () => void;
  },
  state: Pick<TranslateController, 'mineResult' | 'copyResult'>,
): boolean {
  if (e.nativeEvent?.isComposing || e.nativeEvent?.keyCode === 229) return false;
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false;
  const key = e.code === 'KeyM' || e.key.toLowerCase() === 'm'
    ? 'm'
    : e.code === 'KeyC' || e.key.toLowerCase() === 'c' ? 'c' : '';
  if (!key) return false;
  e.preventDefault();
  if (key === 'm') state.mineResult();
  else state.copyResult();
  return true;
}

/** Copy to the clipboard; resolves false when the write was refused. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * The history list, identical in both shells.
 *
 * `onOpenNotebook` is injected: Study OS dispatches `os:open`, which does not
 * move Blanc's tabs. It receives the id of the note just saved, so the shell
 * can open that note rather than a list to find it in.
 */
export function TranslateHistoryList({
  state,
  onOpenNotebook,
}: {
  state: TranslateController;
  onOpenNotebook: (noteId: string) => void;
}) {
  const { t, lang } = useT();
  const [query, setQuery] = useState('');
  const shown = useMemo(() => searchTranslationHistory(state.history, query), [state.history, query]);
  const pinnedCount = useMemo(() => state.history.filter((e) => e.pinned).length, [state.history]);
  const clearable = state.history.length - pinnedCount;

  if (state.history.length === 0) {
    return (
      <div className="tr-history-empty">
        <p>{t('translate.history.emptyTitle')}</p>
        <p className="muted">{t('translate.history.emptyBody')}</p>
      </div>
    );
  }

  return (
    <>
      <div className="tr-history-actions">
        <input
          type="search"
          className="tr-history-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('xlate.history.searchPlaceholder')}
          aria-label={t('xlate.history.search')}
        />
        <button
          type="button"
          className="btn ghost"
          disabled={clearable === 0}
          title={clearable === 0 ? t('xlate.history.onlyPinned') : undefined}
          onClick={() => {
            void confirmDialog({
              title: t('translate.history.clearConfirmTitle'),
              message: pinnedCount
                ? t('xlate.history.clearKeepsPinned', { count: clearable, pinned: pinnedCount })
                : t('translate.history.clearConfirmBody', { count: state.history.length }),
              confirmLabel: t('translate.history.clear'),
              danger: true,
            }).then((ok) => {
              if (ok) clearTranslationHistory();
            });
          }}
        >
          {t('translate.history.clear')}
        </button>
      </div>
      {shown.length === 0 && (
        <p className="tr-history-nomatch muted" role="status">{t('xlate.history.noMatch', { query: query.trim() })}</p>
      )}
      <ul className="tr-history-list">
        {shown.map((e) => {
          /*
           * Every row's five buttons carried the same five words as every other
           * row's. Measured live 2026-09-06 on the user's own 52-entry history:
           * **52 buttons named exactly "Copy"**, and the same for Re-run, Mine
           * sentence, Send to Notebook and Remove — 260 controls, five distinct
           * names between them. A screen reader user hears "Copy button" 52
           * times with nothing to tell them apart.
           *
           * The visible label stays as it is: sighted users read it from the
           * row it sits in. `aria-label` is what needs the row's own subject,
           * and it is composed from the translated verb plus the user's own
           * sentence rather than a new catalog key.
           */
          const subject = e.sourceText.replace(/\s+/g, ' ').trim().slice(0, 40);
          const named = (key: string): string => `${t(key)} — ${subject}`;
          return (
            <li key={e.id} className={`tr-history-item${e.pinned ? ' is-pinned' : ''}`}>
              <div className="tr-history-meta muted">
                {/* A bare toLocaleString() follows the OS locale, not the UI language,
                    so every one of these history stamps read US-style in a ru desktop. */}
                {e.pinned ? `${t('xlate.history.pinnedTag')} · ` : ''}
                {e.sourceLang} → {e.targetLang} · {new Date(e.ts).toLocaleString(LANG_TAGS[lang])} · {t(`translate.history.origin.${e.origin}`)}
                {isTranslateProviderId(e.provider) ? ` · ${t('xlate2.result.by', { provider: translateProviderLabel(e.provider, t) })}` : ''}
              </div>
              <p className="tr-history-src" lang={e.sourceLang}>{e.sourceText}</p>
              <p className="tr-history-dst muted" lang={e.targetLang}>{e.resultText}</p>
              <div className="tr-history-item-actions">
                <button
                  type="button"
                  className="btn ghost"
                  aria-pressed={!!e.pinned}
                  aria-label={named(e.pinned ? 'xlate.history.unpin' : 'xlate.history.pin')}
                  onClick={() => state.togglePin(e)}
                >
                  {t(e.pinned ? 'xlate.history.unpin' : 'xlate.history.pin')}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  aria-label={named('translate.history.copy')}
                  onClick={() => void copyText(e.resultText)}
                >
                  {t('translate.history.copy')}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  aria-label={named('xlate.history.open')}
                  title={t('xlate.history.openHint')}
                  onClick={() => state.rerunEntry(e)}
                >
                  {t('xlate.history.open')}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  aria-label={named('translate.history.rerun')}
                  title={t('xlate.history.rerunHint')}
                  onClick={() => state.retranslateEntry(e)}
                >
                  {t('translate.history.rerun')}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  aria-label={named('translate.history.mine')}
                  onClick={() => state.mineEntry(e)}
                >
                  {t('translate.history.mine')}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  aria-label={named('translate.history.toNotebook')}
                  onClick={() => {
                    // One note per translation: a second click opens the note
                    // already saved instead of appending another copy.
                    const note = saveTranslationNote(e);
                    onOpenNotebook(note.id);
                  }}
                >
                  {t('translate.history.toNotebook')}
                </button>
                {/*
                 * This said "Close" and called `removeTranslationHistory`. It
                 * does not close anything — it deletes the entry, permanently
                 * and with no undo. `common.remove` already exists in all four
                 * catalogs, so the label can say what the button does without
                 * adding a key to catalogs another track holds dirty.
                 */}
                <button
                  type="button"
                  className="btn ghost"
                  aria-label={named('common.remove')}
                  onClick={() => removeTranslationHistory(e.id)}
                >
                  {t('common.remove')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
