import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { DictLang } from '../components/DictionaryResults';
import LexiconWorkbenchResults from '../components/lexicon/LexiconWorkbenchResults';
import NotesBrowser from '../components/lexicon/NotesBrowser';
import { ContextualSurface } from '../components/liquid/LiquidSurface';
import { AppChrome, StatusBarField, StatusBarSpacer, type MenuBarMenu } from '../components/ui';
import { loadDictionarySavedSearches, removeDictionarySavedSearch, saveDictionarySearch, type DictionarySavedSearch } from '../dictionarySavedSearches';
import { useT } from '../i18n';
import { onLexiconHandoffStaged, takeLexiconHandoff } from '../lexiconHandoffClient';
import { DICTIONARY_QUERY_EVENT, onOpenIntent, takeDictionaryQuery } from '../openIntents';
import { getStudyLang, onStudyLangChanged, setStudyLang, STUDY_LANG_KEY } from '../studyEnvironment';
import { clearLookupHistory, loadLookupHistory, onLookupHistoryChanged, type LookupHistoryEntry } from '../lookupHistory';

/** Recent lookups shown as chips; the store keeps more (Notebook reads all of them). */
const RECENT_CHIPS = 10;

/** The current language's most recent lookups, newest first, one chip per dictionary form. */
export function recentLookupChips(
  history: readonly LookupHistoryEntry[],
  lang: DictLang,
  limit = RECENT_CHIPS,
): LookupHistoryEntry[] {
  return history.filter((entry) => entry.lang === lang).slice(0, limit);
}

/** @deprecated Prefer STUDY_LANG_KEY / getStudyLang — kept for external imports. */
export const DICT_LANG_KEY = STUDY_LANG_KEY;

/** The dictionary switch: each language named in itself (endonyms, not translated). */
const DICT_LANG_BUTTONS: readonly { id: DictLang; label: string }[] = [
  { id: 'ja', label: '日本語' },
  { id: 'zh', label: '中文' },
  { id: 'ru', label: 'Русский' },
];

export default function DictionaryView() {
  const { t } = useT();
  const [lang, setLang] = useState<DictLang>(() => getStudyLang());
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [lookupAttempt, setLookupAttempt] = useState(0);
  const [savedSearches, setSavedSearches] = useState<DictionarySavedSearch[]>(loadDictionarySavedSearches);
  const [history, setHistory] = useState<LookupHistoryEntry[]>(loadLookupHistory);
  const acceptingHandoffRef = useRef(false);

  useEffect(() => onStudyLangChanged(setLang), []);
  // Every lookup (here, in the popup, in a reader) lands in one store; follow it.
  useEffect(() => onLookupHistoryChanged(() => setHistory(loadLookupHistory())), []);

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

  // A saved word or lookup opened from the Files app: search it, don't just open the window.
  useEffect(() => {
    const apply = (): void => {
      const q = takeDictionaryQuery();
      if (!q) return;
      setInput(q);
      setQuery(q);
      setLookupAttempt((attempt) => attempt + 1);
    };
    apply();
    return onOpenIntent(DICTIONARY_QUERY_EVENT, apply);
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
    if (noteLang === 'ja' || noteLang === 'zh' || noteLang === 'ru') pickLang(noteLang);
    setInput(word);
    setQuery(word);
    setLookupAttempt((attempt) => attempt + 1);
  }

  /**
   * Open a word one of the expansion panels points at — today the cross
   * references, tomorrow whichever sibling takes the same callback.
   *
   * Deliberately keeps the current language rather than re-detecting it, unlike
   * `openNotedWord`: the target was resolved *inside* this language's partition
   * by the panel that offered it, so switching would look the word up somewhere
   * it was never claimed to exist. The search box is filled as well as fired, so
   * the box never disagrees with what is on screen and the reader can edit the
   * word they just arrived at.
   */
  // `useCallback` with no deps, and it is load-bearing rather than tidiness:
  // `LexiconWorkbenchResults` is memoised (see its export), and a fresh function
  // identity every render would defeat that on the one prop that is not a
  // primitive. Only the three setters are used, and React guarantees those are
  // stable, so the empty dep list is complete rather than convenient.
  const openRelatedWord = useCallback((word: string) => {
    setInput(word);
    setQuery(word);
    setLookupAttempt((attempt) => attempt + 1);
  }, []);

  // Every study language has its own dictionary and copy. The view was a
  // two-way ja/zh switch, so a Russian learner saw 日本語 selected and the
  // Japanese description, placeholder and source.
  const langKey: DictLang = lang === 'zh' || lang === 'ru' ? lang : 'ja';

  // View menu (language) + source status — Aero only (AppChrome pass-through in
  // the default theme). Drives the existing pickLang handler.
  const dictMenus: MenuBarMenu[] = [
    {
      id: 'view',
      label: t('dict.view.menu.view'),
      items: [
        { id: 'ja', label: t('dict.view.menu.ja'), onSelect: () => pickLang('ja') },
        { id: 'zh', label: t('dict.view.menu.zh'), onSelect: () => pickLang('zh') },
        { id: 'ru', label: t('dict.view.menu.ru'), onSelect: () => pickLang('ru') },
      ],
    },
  ];
  const dictStatus = (
    <>
      <StatusBarField>{t(`dict.view.status.${langKey}`)}</StatusBarField>
      <StatusBarSpacer />
      <StatusBarField>{t(`dict.view.source.${langKey}`)}</StatusBarField>
    </>
  );

  return (
    <AppChrome menus={dictMenus} status={dictStatus} className="aero-dict-chrome">
    <div className="dict-view">
      {/* L5 — contextual, not dense work: a description line and the source toggle.
          `ContextualSurface` is inert until this window is put in Liquid presentation
          (§2’s first non-negotiable), so conventional pixels are unchanged. */}
      <ContextualSurface className="view-head">
        <p className="muted">
          {t(`dict.view.desc.${langKey}`)}
        </p>
        <div className="dict-lang-toggle">
          {DICT_LANG_BUTTONS.map(({ id, label }) => (
            <button
              key={id}
              className={`gram-level-btn ${langKey === id ? 'active' : ''}`}
              aria-pressed={langKey === id}
              lang={id}
              onClick={() => pickLang(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </ContextualSurface>

      <form className="dict-search" onSubmit={submit}>
        <input
          autoFocus
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t(`dict.view.placeholder.${langKey}`)}
          aria-label={t('polish2.dict.searchLabel')}
          lang={lang}
        />
        <button
          className="btn primary"
          type="submit"
          disabled={!input.trim()}
          title={input.trim() ? undefined : t('dict.view.reason.needsQuery')}
        >
          {t('dict.view.search')}
        </button>
      </form>

      {/* Saved-search chips: a navigation shortcut list, not the reading area. */}
      <ContextualSurface className="dict-saved-searches" aria-label={t('dict.saved.title')}>
        <div className="dict-saved-searches-head">
          <span className="muted">{t('dict.saved.title')}</span>
          {query && (() => {
            // A toggle, and it says so: saving a search that is already saved used
            // to look like it did something and leave the list unchanged.
            const isSaved = savedSearches.some(
              (saved) => saved.lang === lang && saved.query.toLocaleLowerCase() === query.toLocaleLowerCase(),
            );
            return (
              <button
                className="btn"
                type="button"
                aria-pressed={isSaved}
                onClick={() =>
                  setSavedSearches(isSaved ? removeDictionarySavedSearch({ query, lang }) : saveDictionarySearch({ query, lang }))
                }
              >
                {isSaved ? t('dict2.saved.savedToggle') : t('dict.saved.save')}
              </button>
            );
          })()}
        </div>
        {savedSearches.length > 0 && (
          <div className="dict-saved-search-list">
            {savedSearches.map((saved) => (
              <span className="dict-saved-search" key={`${saved.lang}:${saved.query}`}>
                <button className="btn" type="button" lang={saved.lang} onClick={() => runSavedSearch(saved)}>{saved.query}</button>
                <button
                  className="btn"
                  type="button"
                  aria-label={t('dict2.saved.removeNamed', { query: saved.query })}
                  title={t('dict.saved.remove')}
                  onClick={() => setSavedSearches(removeDictionarySavedSearch(saved))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Recent lookups: every lookup made anywhere (popup, reader, this page) in this
            dictionary's language, one chip per dictionary form, newest first. Same
            navigation-shortcut region as the saved searches, so it shares their surface. */}
        {recentLookupChips(history, langKey).length > 0 && (
          <div className="dict-recent" role="group" aria-label={t('dict2.history.title')}>
            <div className="dict-saved-searches-head">
              <span className="muted">{t('dict2.history.title')}</span>
              <button className="btn" type="button" onClick={() => clearLookupHistory()}>
                {t('dict2.history.clear')}
              </button>
            </div>
            <div className="dict-saved-search-list">
              {recentLookupChips(history, langKey).map((entry) => (
                <button
                  key={`${entry.lang}:${entry.lemma}`}
                  className="btn dict-recent-chip"
                  type="button"
                  lang={entry.lang}
                  title={[entry.reading, entry.meaning].filter(Boolean).join(' — ') || undefined}
                  onClick={() => openRelatedWord(entry.lemma)}
                >
                  {entry.lemma}
                  {entry.count > 1 && (
                    <span className="muted dict-recent-count"> {t('dict2.history.times', { count: entry.count })}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </ContextualSurface>

      <NotesBrowser lang={lang} onOpen={openNotedWord} />

      {!query ? (
        <p className="dict-hint muted">
          {t(`dict.view.hint.${langKey}`)}
        </p>
      ) : (
        <LexiconWorkbenchResults
          query={query}
          lang={lang}
          lookupAttempt={lookupAttempt}
          onLookup={openRelatedWord}
        />
      )}
    </div>
    </AppChrome>
  );
}
