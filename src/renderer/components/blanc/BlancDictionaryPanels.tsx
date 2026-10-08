/**
 * Blanc dictionary and clipboard auto-lookup panels.
 *
 * One module per Blanc panel: a Blanc lazy chunk is a whole module, so panels
 * that shared a file loaded each other's content stacks (opening Clipboard used
 * to fetch the grammar data set). Pillar 0 still applies — compose the shared
 * content component in Blanc chrome, never a Study OS `*View`, and never
 * import `AppChrome`/`MenuBar`/`StatusBar` here. The Study OS class-name
 * stylesheet these blocks rely on is loaded by the shell's lazy loader
 * (`withStudyOsCompat` in BlancShell.tsx), before first render.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import DictionaryResults, { type DictLang } from '../DictionaryResults';
import {
  BLANC_DICTIONARY_QUERY_EVENT,
  readBlancDictionaryQuery,
  takePendingBlancDictionaryQuery,
} from './blancMasterSources';
import { getStudyLang, onStudyLangChanged, setStudyLang } from '../../studyEnvironment';
import {
  loadClipboardHistory,
  loadClipboardSettings,
  onClipboardHistoryChanged,
  saveClipboardSettings,
  type ClipboardEntry,
} from '../../clipboardHistory';
import { useT } from '../../i18n';

export function BlancDictionaryPanel() {
  const { t } = useT();
  const [lang, setLang] = useState<DictLang>(() => getStudyLang());
  // A query asked for before this panel mounted (Master search, a deep link).
  const [initialQuery] = useState(() => takePendingBlancDictionaryQuery() ?? '');
  const [input, setInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => onStudyLangChanged(setLang), []);
  useEffect(() => {
    const onMasterSearchQuery = (event: Event): void => {
      const next = readBlancDictionaryQuery(event);
      if (!next) return;
      takePendingBlancDictionaryQuery();
      setInput(next);
      setQuery(next);
    };
    window.addEventListener(BLANC_DICTIONARY_QUERY_EVENT, onMasterSearchQuery);
    return () => window.removeEventListener(BLANC_DICTIONARY_QUERY_EVENT, onMasterSearchQuery);
  }, []);

  const isZh = lang === 'zh';

  function submit(e: FormEvent) {
    e.preventDefault();
    setQuery(input.trim());
  }

  function pickLang(next: DictLang) {
    setStudyLang(next);
    setLang(next);
  }

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.study.lookup')}</legend>
        <form className="blanc-command-row" onSubmit={submit}>
          <input
            autoFocus
            type="text"
            value={input}
            lang={lang}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isZh ? t('blanc.study.dict.placeholderZh') : t('blanc.study.dict.placeholderJa')}
          />
          <button type="submit" disabled={!input.trim()}>
            {t('blanc.study.dict.search')}
          </button>
          <span className="blanc-segmented">
            <button
              type="button"
              className={!isZh ? 'active' : ''}
              onClick={() => pickLang('ja')}
            >
              日本語
            </button>
            <button
              type="button"
              className={isZh ? 'active' : ''}
              onClick={() => pickLang('zh')}
            >
              中文
            </button>
          </span>
        </form>
        <div className="blanc-status-row">
          <span>{isZh ? t('blanc.study.dict.langZh') : t('blanc.study.dict.langJa')}</span>
          {/* JMdict / Jisho are product names, identical in every language. */}
          <span>{isZh ? t('blanc.study.dict.sourceZh') : 'JMdict / Jisho'}</span>
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('blanc.study.dict.results')}</legend>
        {query ? (
          <DictionaryResults query={query} variant="page" lang={lang} />
        ) : (
          <p className="blanc-note">
            {isZh ? t('blanc.study.dict.hintZh') : t('blanc.study.dict.hintJa')}
          </p>
        )}
      </fieldset>
    </div>
  );
}

/** Longest run of Japanese script in a clipboard entry, for auto-lookup. */
function japaneseFragment(text: string): string {
  const runs = text.match(/[぀-ヿ㐀-䶿一-鿿]+/g);
  if (!runs || runs.length === 0) return '';
  return runs.sort((a, b) => b.length - a.length)[0];
}

/**
 * Study-native item 1 + the Pillar 0 fix for the `clipboard` tool, which used
 * to host Study OS's `ClipboardWidget` in a bare div.
 *
 * Deliberately does NOT start its own poller or keep its own store: it reads
 * `clipboardHistory`, whose monitor already enforces the ≥4s interval and the
 * skip-while-dragging rule. A second watcher would violate both.
 */
export function BlancClipboardPanel() {
  const { t } = useT();
  const [entries, setEntries] = useState<ClipboardEntry[]>(() => loadClipboardHistory());
  const [monitoring, setMonitoring] = useState(() => loadClipboardSettings().monitoringEnabled);
  const [autoLookup, setAutoLookup] = useState(true);
  const [manual, setManual] = useState<string | null>(null);

  useEffect(() => onClipboardHistoryChanged(() => setEntries(loadClipboardHistory())), []);

  const latest = entries[0];
  const autoTerm = useMemo(() => {
    if (!autoLookup || !latest) return '';
    return latest.dictMeta?.expression ?? japaneseFragment(latest.text);
  }, [autoLookup, latest]);

  const term = manual ?? autoTerm;

  function toggleMonitoring(next: boolean) {
    saveClipboardSettings({ monitoringEnabled: next });
    setMonitoring(next);
  }

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.study.clip.watch')}</legend>
        <div className="blanc-row-actions">
          <label className="blanc-check">
            <input
              type="checkbox"
              checked={monitoring}
              onChange={(e) => toggleMonitoring(e.target.checked)}
            />
            <span>{t('blanc.study.clip.watchClipboard')}</span>
          </label>
          <label className="blanc-check">
            <input
              type="checkbox"
              checked={autoLookup}
              onChange={(e) => {
                setAutoLookup(e.target.checked);
                setManual(null);
              }}
            />
            <span>{t('blanc.study.clip.autoLookup')}</span>
          </label>
        </div>
        <p className="blanc-note">
          {monitoring ? t('blanc.study.clip.watchingOn') : t('blanc.study.clip.watchingOff')}
        </p>
      </fieldset>

      <fieldset>
        <legend>{t('blanc.study.clip.recent')}</legend>
        {entries.length === 0 ? (
          <p className="blanc-note">{t('blanc.study.clip.empty')}</p>
        ) : (
          <ul className="blanc-plain-list">
            {entries.slice(0, 8).map((e) => {
              const label = e.dictMeta?.expression ?? e.text;
              const pick = e.dictMeta?.expression ?? japaneseFragment(e.text);
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    className="blanc-link-btn"
                    disabled={!pick}
                    onClick={() => setManual(pick)}
                    title={
                      pick
                        ? t('blanc.study.clip.lookUpItem', { term: pick })
                        : t('blanc.study.clip.noJapanese')
                    }
                  >
                    {label.slice(0, 80)}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <fieldset>
        <legend>{t('blanc.study.lookup')}</legend>
        {term ? (
          <>
            <div className="blanc-status-row">
              <span lang="ja">{term}</span>
              {manual && (
                <button type="button" onClick={() => setManual(null)}>
                  {t('blanc.study.clip.follow')}
                </button>
              )}
            </div>
            <DictionaryResults query={term} variant="page" lang="ja" />
          </>
        ) : (
          <p className="blanc-note">
            {autoLookup ? t('blanc.study.clip.promptAuto') : t('blanc.study.clip.promptManual')}
          </p>
        )}
      </fieldset>
    </div>
  );
}
