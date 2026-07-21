import { useEffect, useState, type FormEvent } from 'react';
import DictionaryResults, { type DictLang } from '../components/DictionaryResults';
import { AppChrome, StatusBarField, StatusBarSpacer, type MenuBarMenu } from '../components/ui';
import { getStudyLang, onStudyLangChanged, setStudyLang, STUDY_LANG_KEY } from '../studyEnvironment';

/** @deprecated Prefer STUDY_LANG_KEY / getStudyLang — kept for external imports. */
export const DICT_LANG_KEY = STUDY_LANG_KEY;

export default function DictionaryView() {
  const [lang, setLang] = useState<DictLang>(() => getStudyLang());
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => onStudyLangChanged(setLang), []);

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = input.trim();
    setQuery(q);
    // §5.3 LEX: db-blip on a fired search (cue exists only in the wired pack).
    if (q && document.documentElement.getAttribute('data-materials') === 'wired') {
      window.dispatchEvent(new CustomEvent('wired:db-blip'));
    }
  }

  function pickLang(l: DictLang) {
    setStudyLang(l);
    setLang(l);
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

      {!query ? (
        <p className="dict-hint muted">
          {isZh
            ? 'Offline Chinese↔English dictionary (CC-CEDICT). Results show pinyin with tone marks. Highlight a word while reading to look it up, or tap the star icon to save it to Flashcards.'
            : 'Tip: while reading a book you can highlight any word to look it up instantly. Tap the star icon on a result to save it to Flashcards.'}
        </p>
      ) : (
        <DictionaryResults query={query} variant="page" lang={lang} />
      )}
    </div>
    </AppChrome>
  );
}
