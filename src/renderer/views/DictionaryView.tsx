import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { DictLang } from '../components/DictionaryResults';
import LexiconWorkbenchResults from '../components/lexicon/LexiconWorkbenchResults';
import NotesBrowser from '../components/lexicon/NotesBrowser';
import { AppChrome, StatusBarField, StatusBarSpacer, type MenuBarMenu } from '../components/ui';
import { loadDictionarySavedSearches, removeDictionarySavedSearch, saveDictionarySearch, type DictionarySavedSearch } from '../dictionarySavedSearches';
import { useT } from '../i18n';
import { onLexiconHandoffStaged, takeLexiconHandoff } from '../lexiconHandoffClient';
import { getStudyLang, onStudyLangChanged, setStudyLang, STUDY_LANG_KEY } from '../studyEnvironment';

/** @deprecated Prefer STUDY_LANG_KEY / getStudyLang — kept for external imports. */
export const DICT_LANG_KEY = STUDY_LANG_KEY;

export default function DictionaryView() {
  const { t } = useT();
  const [lang, setLang] = useState<DictLang>(() => getStudyLang());
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [lookupAttempt, setLookupAttempt] = useState(0);
  const [savedSearches, setSavedSearches] = useState<DictionarySavedSearch[]>(loadDictionarySavedSearches);
  const acceptingHandoffRef = useRef(false);

  useEffect(() => onStudyLangChanged(setLang), []);

  /**
   * The receiving end of `shared/lexiconHandoff.ts`: a word captured by the
   * Reading Lens, looked up here.
   *
   * Claimed on mount *and* on main's announcement, and both are needed. `popOut`
   * focuses an already-open Dictionary rather than remounting it, so mount alone
   * would deliver the first lookup of a session and silently drop every one
   * after it; the announcement alone would lose the very first, which is staged
   * before this window exists.
   *
   * The claim is single-use in main, so a stale word can never reappear, and it
   * runs the search rather than only filling the box — the user asked for a
   * lookup, and stopping one click short of it would be the same half-gesture as
   * opening the window and leaving it empty.
   */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('popout') !== 'dictionary') return;
    // React StrictMode replays this effect as setup → cleanup → setup. A local
    // `alive` flag makes the first setup consume main's single-use handoff and
    // then discard its reply after the replay cleanup; this component-level ref
    // is true again by the time that reply settles. A real unmount leaves it
    // false, so the ordinary post-unmount state-update guard still holds.
    acceptingHandoffRef.current = true;
    const claim = (): void => {
      void takeLexiconHandoff('lookup').then((result) => {
        if (!acceptingHandoffRef.current || !result.ok || !result.handoff) return;
        setInput(result.handoff.text);
        setQuery(result.handoff.text);
        setLookupAttempt((attempt) => attempt + 1);
      });
    };
    claim();
    const off = onLexiconHandoffStaged(claim);
    return () => {
      acceptingHandoffRef.current = false;
      off();
    };
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = input.trim();
    setQuery(q);
    if (q) setLookupAttempt((attempt) => attempt + 1);
    // §5.3 LEX: db-blip on a fired search (cue exists only in the wired pack).
    if (q && document.documentElement.getAttribute('data-materials') === 'wired') {
      window.dispatchEvent(new CustomEvent('wired:db-blip'));
    }
  }

  function pickLang(l: DictLang) {
    setStudyLang(l);
    setLang(l);
  }

  function runSavedSearch(saved: DictionarySavedSearch) {
    pickLang(saved.lang);
    setInput(saved.query);
    setQuery(saved.query);
    setLookupAttempt((attempt) => attempt + 1);
  }

  /**
   * Open the word a stored note hangs off.
   *
   * The note's own language wins over whatever the toggle currently says: a
   * Chinese note looked up under the Japanese lens would find a different word or
   * none at all, and the reader asked for *that* note's word.
   */
  function openNotedWord(word: string, noteLang: string) {
    if (noteLang === 'ja' || noteLang === 'zh') pickLang(noteLang);
    setInput(word);
    setQuery(word);
    setLookupAttempt((attempt) => attempt + 1);
  }

  const isZh = lang === 'zh';

  // View menu (language) + source status — Aero only (AppChrome pass-through in
  // the default theme). Drives the existing pickLang handler.
  const dictMenus: MenuBarMenu[] = [
    {
      id: 'view',
      label: 'View',
      items: [
        { id: 'ja', label: '日本語 (Japanese)', onSelect: () => pickLang('ja') },
        { id: 'zh', label: '中文 (Chinese)', onSelect: () => pickLang('zh') },
      ],
    },
  ];
  const dictStatus = (
    <>
      <StatusBarField>{isZh ? 'Chinese' : 'Japanese'}</StatusBarField>
      <StatusBarSpacer />
      <StatusBarField>{isZh ? 'CC-CEDICT' : 'JMdict / Jisho'}</StatusBarField>
    </>
  );

  return (
    <AppChrome menus={dictMenus} status={dictStatus} className="aero-dict-chrome">
    <div className="dict-view">
      <div className="view-head">
        <p className="muted">
          {isZh
            ? 'Search Chinese or English — offline, powered by CC-CEDICT.'
            : 'Search Japanese or English — powered by Jisho (JMdict).'}
        </p>
        <div className="dict-lang-toggle">
          <button
            className={`gram-level-btn ${!isZh ? 'active' : ''}`}
            onClick={() => pickLang('ja')}
          >
            日本語
          </button>
          <button
            className={`gram-level-btn ${isZh ? 'active' : ''}`}
            onClick={() => pickLang('zh')}
          >
            中文
          </button>
        </div>
      </div>

      <form className="dict-search" onSubmit={submit}>
        <input
          autoFocus
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isZh ? 'Type a word, e.g. 你好 or “hello”…' : 'Type a word, e.g. 食べる or “eat”…'}
          lang={lang}
        />
        <button className="btn primary" type="submit" disabled={!input.trim()}>
          Search
        </button>
      </form>

      <div className="dict-saved-searches" aria-label={t('dict.saved.title')}>
        <div className="dict-saved-searches-head">
          <span className="muted">{t('dict.saved.title')}</span>
          {query && (
            <button className="btn" type="button" onClick={() => setSavedSearches(saveDictionarySearch({ query, lang }))}>
              {t('dict.saved.save')}
            </button>
          )}
        </div>
        {savedSearches.length > 0 && (
          <div className="dict-saved-search-list">
            {savedSearches.map((saved) => (
              <span className="dict-saved-search" key={`${saved.lang}:${saved.query}`}>
                <button className="btn" type="button" onClick={() => runSavedSearch(saved)}>{saved.query}</button>
                <button className="btn" type="button" aria-label={t('dict.saved.remove')} onClick={() => setSavedSearches(removeDictionarySavedSearch(saved))}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <NotesBrowser lang={lang} onOpen={openNotedWord} />

      {!query ? (
        <p className="dict-hint muted">
          {isZh
            ? 'Offline Chinese↔English dictionary (CC-CEDICT). Results show pinyin with tone marks. Highlight a word while reading to look it up, or tap the star icon to save it to Flashcards.'
            : 'Tip: while reading a book you can highlight any word to look it up instantly. Tap the star icon on a result to save it to Flashcards.'}
        </p>
      ) : (
        <LexiconWorkbenchResults query={query} lang={lang} lookupAttempt={lookupAttempt} />
      )}
    </div>
    </AppChrome>
  );
}
