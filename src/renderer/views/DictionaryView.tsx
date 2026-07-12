import { useState, type FormEvent } from 'react';
import DictionaryResults, { type DictLang } from '../components/DictionaryResults';

export const DICT_LANG_KEY = 'jp-study-dict-lang';

export default function DictionaryView() {
  const [lang, setLang] = useState<DictLang>(
    () => (localStorage.getItem(DICT_LANG_KEY) as DictLang) || 'ja',
  );
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    setQuery(input.trim());
  }

  function pickLang(l: DictLang) {
    setLang(l);
    localStorage.setItem(DICT_LANG_KEY, l);
  }

  const isZh = lang === 'zh';

  return (
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
  );
}
