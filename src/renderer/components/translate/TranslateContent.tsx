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
import { useCallback, useEffect, useRef, useState } from 'react';
import { translateTo, onModelProgress, type TransLang } from '../../translator';
import { getStudyLang, setStudyLang } from '../../studyEnvironment';
import {
  appendTranslationHistory,
  clearTranslationHistory,
  loadTranslationHistory,
  onTranslationHistoryChanged,
  removeTranslationHistory,
  type TranslationHistoryEntry,
} from '../../translationHistory';
import { appendNotebookEvent } from '../../notebookTimeline';
import { addDeckCards, createDeckFolder } from '../../flashcardDeck';
import { useT } from '../../i18n';
import { getTranslateTarget, onTranslateTargetChanged, setTranslateTarget } from '../../translateTarget';
import { getTranslateSource, onTranslateSourceChanged, setTranslateSource } from '../../translateSource';

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
  const startedRef = useRef(false);
  const offModelRef = useRef<(() => void) | null>(null);

  useEffect(() => () => {
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
    if (next === 'ja' || next === 'zh') setStudyLang(next);
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
    if (target === 'ja' || target === 'zh') setStudyLang(target);
    setInput(output);
    setOutput(input);
    setTranslatedInput('');
  }

  const run = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setError('');
    setOutput('');
    setTranslatedInput('');
    setState('loading');
    setMsg(t('translate.msg.loadingModel'));
    startedRef.current = false;

    // Drops only this view's subscription, not the popup's or the reader's.
    offModelRef.current?.();
    offModelRef.current = onModelProgress((p) => {
      if (p.status === 'progress' && typeof p.progress === 'number') {
        const f = typeof p.file === 'string' ? p.file.split('/').pop() : 'model';
        setMsg(t('translate.msg.loadingFile', { file: f, pct: Math.round(p.progress) }));
      }
    });

    try {
      const result = await translateTo(text, source, target, (prog) => {
        startedRef.current = true;
        setState('translating');
        setMsg(t('translate.msg.translating', { pct: Math.round(prog * 100) }));
      });
      setOutput(result);
      setTranslatedInput(text);
      setState('done');
      setMsg('');
      appendTranslationHistory({
        sourceLang: source,
        targetLang: target,
        sourceText: text,
        resultText: result,
        origin: 'app',
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
      setError(e instanceof Error ? e.message : String(e));
      setState('error');
    } finally {
      offModelRef.current?.();
      offModelRef.current = null;
    }
  }, [input, source, target, t]);

  function rerunEntry(e: TranslationHistoryEntry) {
    setSource(e.sourceLang as TransLang);
    setTarget(e.targetLang as TransLang);
    setInput(e.sourceText);
    setOutput(e.resultText);
    setTranslatedInput(e.sourceText);
    setTab('translate');
    setState('done');
  }

  function mineEntry(e: TranslationHistoryEntry) {
    createDeckFolder('Translations');
    addDeckCards([
      {
        word: e.sourceText.slice(0, 80),
        reading: '',
        meaning: e.resultText.slice(0, 400),
        sentence: e.sourceText.slice(0, 2000),
        source: 'import',
        folder: 'Translations',
      },
    ]);
  }

  function clear() {
    setInput('');
    setOutput('');
    setError('');
    setMsg('');
    setState('idle');
  }

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
  };
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

/**
 * The history list, identical in both shells.
 *
 * `onOpenNotebook` is injected: Study OS dispatches `os:open`, which does not
 * move Blanc's tabs.
 */
export function TranslateHistoryList({
  state,
  onOpenNotebook,
}: {
  state: TranslateController;
  onOpenNotebook: () => void;
}) {
  const { t } = useT();

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
        <button type="button" className="btn ghost" onClick={() => clearTranslationHistory()}>
          {t('translate.history.clear')}
        </button>
      </div>
      <ul className="tr-history-list">
        {state.history.map((e) => (
          <li key={e.id} className="tr-history-item">
            <div className="tr-history-meta muted">
              {e.sourceLang} → {e.targetLang} · {new Date(e.ts).toLocaleString()} · {e.origin}
            </div>
            <p className="tr-history-src">{e.sourceText}</p>
            <p className="tr-history-dst muted">{e.resultText}</p>
            <div className="tr-history-item-actions">
              <button type="button" className="btn ghost" onClick={() => void copyText(e.resultText)}>
                {t('translate.history.copy')}
              </button>
              <button type="button" className="btn ghost" onClick={() => state.rerunEntry(e)}>
                {t('translate.history.rerun')}
              </button>
              <button type="button" className="btn ghost" onClick={() => state.mineEntry(e)}>
                {t('translate.history.mine')}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  appendNotebookEvent({
                    stream: 'translations',
                    title: e.sourceText.slice(0, 80),
                    detail: e.resultText.slice(0, 120),
                    folder: 'Translations',
                    origin: e.origin,
                    href: 'files',
                  });
                  onOpenNotebook();
                }}
              >
                {t('translate.history.toNotebook')}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => removeTranslationHistory(e.id)}
              >
                {t('common.close')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
