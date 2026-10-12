import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { alignFurigana, hasKanji, toHiragana } from '../../../shared/furigana';
import {
  SNIP_HISTORY_MAX_BYTES,
  type SnipEntry,
  type SnipWord,
} from '../../../shared/snipToCards';
import { normalizeStudyLang, type StudyLang } from '../../../shared/studyLang';
import { SNIP_FOCUS_EVENT, takeSnipFocus } from '../../snipToCards';
import { requestFlashcardsFocus } from '../../openIntents';
import { openGrammarPoint } from '../../extensionBridgeUi';
import { confirmDialog } from '../ui/dialogService';
import DeinflectTrace from '../lexicon/DeinflectTrace';
import SnipSettingsForm, { useSnipStatus } from './SnipSettingsForm';
import './snip.css';

/** IPADIC parts of speech → catalog keys; anything else is shown as the analyser wrote it. */
const POS_KEYS: Record<string, string> = {
  名詞: 'snip.pos.noun',
  動詞: 'snip.pos.verb',
  形容詞: 'snip.pos.adjective',
  副詞: 'snip.pos.adverb',
  助詞: 'snip.pos.particle',
  助動詞: 'snip.pos.auxiliary',
  記号: 'snip.pos.symbol',
  連体詞: 'snip.pos.adnominal',
  接続詞: 'snip.pos.conjunction',
  感動詞: 'snip.pos.interjection',
  接頭詞: 'snip.pos.prefix',
};

/** Words worth a row in the breakdown's table (punctuation stays in the text above it). */
const ROW_HIDDEN = new Set<SnipWord['status']>(['punct']);
/** Words the toggle can make a card. */
const ADDABLE = new Set<SnipWord['status']>(['candidate', 'removed', 'overLimit', 'known', 'inDeck', 'duplicate', 'name', 'failed', 'noise', 'function']);

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function firstLine(entry: SnipEntry): string {
  return entry.text.split('\n').find((line) => line.trim())?.trim().slice(0, 80) ?? '';
}

/** The sentence with readings over its words (Japanese furigana, Chinese pinyin). */
function RubyText({ words, lang, show }: { words: readonly SnipWord[]; lang: StudyLang; show: boolean }) {
  return (
    <p className="snip-text" lang={lang}>
      {words.map((word, i) => {
        if (!show) return <span key={i}>{word.surface}</span>;
        if (lang === 'ja' && word.surfaceReading && hasKanji(word.surface)) {
          return (
            <span key={i}>
              {alignFurigana(word.surface, word.surfaceReading).map((seg, k) => (seg.reading
                ? <ruby key={k}>{seg.text}<rt>{seg.reading}</rt></ruby>
                : <span key={k}>{seg.text}</span>))}
            </span>
          );
        }
        if (lang === 'zh' && word.reading) {
          return <ruby key={i}>{word.surface}<rt>{word.reading}</rt></ruby>;
        }
        return <span key={i}>{word.surface}{lang === 'ru' ? ' ' : ''}</span>;
      })}
    </p>
  );
}

function WordRow({
  entry,
  word,
  index,
  lang,
  folder,
}: {
  entry: SnipEntry;
  word: SnipWord;
  index: number;
  lang: StudyLang;
  folder: string;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const label = word.lemma || word.surface;
  const run = async (action: 'addWord' | 'removeWord') => {
    setBusy(true);
    try {
      await window.api.snipAction({ id: entry.id, action, index });
    } finally {
      // The row re-renders from the history once the main window has acted.
      window.setTimeout(() => setBusy(false), 400);
    }
  };
  const pos = word.pos ? (POS_KEYS[word.pos] ? t(POS_KEYS[word.pos]) : word.pos) : '';
  const reading = word.reading ? (lang === 'ja' ? toHiragana(word.reading) : word.reading) : '';
  return (
    <tr className={`snip-word is-${word.status}`}>
      <th scope="row" lang={lang}>
        <span className="snip-word-surface">{word.surface}</span>
        {word.lemma && word.lemma !== word.surface && <span className="snip-word-lemma"> → {word.lemma}</span>}
      </th>
      <td lang={lang}>{reading}</td>
      <td>
        {word.meaning ? <span className="snip-word-meaning">{word.meaning}</span> : <span className="muted">—</span>}
        {word.deinflection?.length ? (
          <DeinflectTrace source={word.surface} term={label} reasons={word.deinflection} contentLang={lang} compact />
        ) : null}
      </td>
      <td>
        {pos}
        {word.level && <span className="snip-chip">{word.level}</span>}
        {word.freq ? <span className="snip-chip muted">{t('snip.word.freq', { rank: word.freq })}</span> : null}
      </td>
      <td>
        <span className={`snip-status is-${word.status}`}>{t(`snip.wstatus.${word.status}`)}</span>
      </td>
      <td className="snip-word-actions">
        {word.status === 'added' && word.cardId && (
          <button
            type="button"
            className="btn small snip-btn"
            aria-label={t('snip.word.open', { word: label })}
            onClick={() => requestFlashcardsFocus({ folder, cardId: word.cardId ?? null })}
          >
            {t('snip.word.openShort')}
          </button>
        )}
        {word.status === 'added' ? (
          <button
            type="button"
            className="btn small snip-btn"
            disabled={busy}
            aria-label={t('snip.word.remove', { word: label })}
            onClick={() => void run('removeWord')}
          >
            {t('snip.word.removeShort')}
          </button>
        ) : ADDABLE.has(word.status) && entry.status === 'done' ? (
          <button
            type="button"
            className="btn small snip-btn"
            disabled={busy}
            aria-label={t('snip.word.add', { word: label })}
            onClick={() => void run('addWord')}
          >
            {t('snip.word.addShort')}
          </button>
        ) : null}
      </td>
    </tr>
  );
}

function SnipDetail({ entry, folder, maxWords }: { entry: SnipEntry; folder: string; maxWords: number }) {
  const { t, lang: uiLang } = useT();
  const lang = normalizeStudyLang(entry.lang);
  const [image, setImage] = useState<string | null>(null);
  const [furigana, setFurigana] = useState(true);
  const [installState, setInstallState] = useState<'idle' | 'started' | 'failed'>('idle');
  const headingId = useId();

  useEffect(() => {
    let alive = true;
    setImage(null);
    window.api.snipImage(entry.id).then((url) => {
      if (alive) setImage(url);
    }).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [entry.id]);

  const install = async () => {
    const id = entry.installIds?.[0];
    if (!id) return;
    try {
      const res = await window.api.assetsStart(id);
      setInstallState(res.ok ? 'started' : 'failed');
    } catch {
      setInstallState('failed');
    }
  };

  const rows = entry.words.filter((w) => !ROW_HIDDEN.has(w.status));
  const added = entry.words.filter((w) => w.status === 'added').length;
  // Product names stay as they are; only the descriptions are translated.
  const engine = !entry.engine
    ? ''
    : entry.engine === 'basic'
      ? t('snip.engine.basic')
      : entry.engine === 'manga'
        ? 'manga-ocr'
        : entry.engine === 'web'
          ? 'PaddleOCR'
          : t('snip.engine.other');
  const errorKey = entry.error === 'models-missing'
    ? 'snip.error.modelsMissing'
    : entry.error === 'no-text'
      ? 'snip.error.noText'
      : entry.error === 'garbage'
        ? 'snip.error.garbage'
        : entry.error === 'low-confidence'
          ? 'snip.error.lowConfidence'
          : entry.error === 'cancelled'
            ? 'snip.error.cancelled'
            : 'snip.error.ocrFailed';

  return (
    <article className="snip-detail" aria-labelledby={headingId}>
      <header className="snip-detail-head">
        <h3 id={headingId}>{new Date(entry.createdAt).toLocaleString(LANG_TAGS[uiLang])}</h3>
        <p className="muted snip-detail-meta">
          {engine && t('snip.detail.engine', { engine })}
          {typeof entry.confidence === 'number' && ` · ${t('snip.detail.confidence', { percent: Math.round(entry.confidence * 100) })}`}
        </p>
      </header>
      {image ? (
        <img className="snip-image" src={image} alt={t('snip.detail.image')} />
      ) : (
        <div className="snip-image is-empty" aria-hidden="true" />
      )}

      <div aria-live="polite">
        {entry.status === 'processing' && <p className="snip-note">{t('snip.history.processing')}</p>}
        {entry.status === 'error' && (
          <div className="snip-note is-error" role="status">
            <p>{t(errorKey, { lang: t(`snip.lang.${lang}`) })}</p>
            {entry.error === 'models-missing' && entry.installIds?.length ? (
              <p>
                <button type="button" className="btn small snip-btn" disabled={installState === 'started'} onClick={() => void install()}>
                  {t('snip.detail.install', { lang: t(`snip.lang.${lang}`) })}
                </button>
                {installState === 'started' && <span className="muted"> {t('snip.detail.installStarted')}</span>}
                {installState === 'failed' && <span className="muted"> {t('snip.detail.installFailed')}</span>}
              </p>
            ) : null}
          </div>
        )}
        {entry.undone && <p className="snip-note">{t('snip.detail.undone')}</p>}
      </div>

      {entry.text && (
        <section className="snip-section" aria-label={t('snip.detail.text')}>
          <div className="snip-section-head">
            <h4>{t('snip.detail.text')}</h4>
            {lang !== 'ru' && entry.words.length > 0 && (
              <label className="snip-inline-toggle">
                <input type="checkbox" checked={furigana} onChange={(e) => setFurigana(e.target.checked)} />
                {t('snip.detail.furigana')}
              </label>
            )}
          </div>
          {entry.words.length ? (
            <RubyText words={entry.words} lang={lang} show={furigana} />
          ) : (
            <p className="snip-text" lang={lang}>{entry.text}</p>
          )}
        </section>
      )}

      {entry.status === 'done' && (
        <section className="snip-section" aria-label={t('snip.detail.translation')}>
          <h4>{t('snip.detail.translation')}</h4>
          {entry.translation ? (
            <p className="snip-translation">{entry.translation}</p>
          ) : entry.translationError ? (
            <p className="muted">{t('snip.detail.noTranslation', { reason: entry.translationError })}</p>
          ) : (
            <p className="muted">{t('snip.detail.translating')}</p>
          )}
        </section>
      )}

      {rows.length > 0 && (
        <section className="snip-section" aria-label={t('snip.detail.words')}>
          <div className="snip-section-head">
            <h4>{t('snip.detail.words')}</h4>
            {added > 0 && !entry.undone && (
              <button
                type="button"
                className="btn small snip-btn"
                onClick={() => void window.api.snipAction({ id: entry.id, action: 'undo' })}
              >
                {t('snip.detail.undo', { count: added })}
              </button>
            )}
          </div>
          {entry.overLimit ? (
            <p className="muted">{t('snip.detail.overLimit', { count: entry.overLimit, max: maxWords })}</p>
          ) : null}
          <div className="snip-table-wrap">
            <table className="snip-words">
              <thead>
                <tr>
                  <th scope="col">{t('snip.col.word')}</th>
                  <th scope="col">{t('snip.col.reading')}</th>
                  <th scope="col">{t('snip.col.meaning')}</th>
                  <th scope="col">{t('snip.col.pos')}</th>
                  <th scope="col">{t('snip.col.status')}</th>
                  <th scope="col"><span className="snip-sr">{t('snip.col.actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {entry.words.map((word, index) => (ROW_HIDDEN.has(word.status) ? null : (
                  <WordRow key={`${index}-${word.surface}`} entry={entry} word={word} index={index} lang={lang} folder={folder} />
                )))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {entry.status === 'done' && (
        <section className="snip-section" aria-label={t('snip.detail.grammar')}>
          <h4>{t('snip.detail.grammar')}</h4>
          {entry.grammar.length ? (
            <ul className="snip-grammar">
              {entry.grammar.map((g) => (
                <li key={g.title}>
                  {g.id ? (
                    <button type="button" className="btn small snip-btn snip-grammar-link" onClick={() => openGrammarPoint(g.id as string)}>
                      <span lang={lang}>{g.title}</span>
                    </button>
                  ) : (
                    <span lang={lang}>{g.title}</span>
                  )}
                  {g.level && <span className="snip-chip">{g.level}</span>}
                  {g.meaning && <span className="snip-grammar-meaning"> — {g.meaning}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t('snip.detail.noGrammar')}</p>
          )}
        </section>
      )}
    </article>
  );
}

/**
 * The Snips app: every snip newest first (searchable, deletable, capped), and
 * the selected one's analysis — the picture, the text with furigana, the
 * translation, a word-by-word breakdown with readings, meanings, part of
 * speech, conjugation, level and frequency, the grammar points found, and
 * which words became cards (each with Open / Remove / Add).
 *
 * Shared by the Study OS view (`views/SnipsView.tsx`, every theme) and Blanc's
 * panel; updates live from main's history as snips arrive.
 */
export default function SnipPanel({ compact = false }: { compact?: boolean }) {
  const { t, lang: uiLang } = useT();
  const [status, save] = useSnipStatus();
  const [entries, setEntries] = useState<SnipEntry[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(() => takeSnipFocus());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const queryRef = useRef(query);
  queryRef.current = query;
  const searchId = useId();

  const refresh = useCallback(async () => {
    try {
      const list = await window.api.snipHistoryList({ search: queryRef.current });
      setEntries(list);
    } catch {
      setEntries([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void refresh(), query ? 180 : 0);
    return () => window.clearTimeout(id);
  }, [query, refresh]);

  useEffect(() => {
    // Live: with nothing picked the newest snip is shown, so a new one comes forward by
    // itself; a snip the user picked stays until a new snip is brought forward for them.
    const off = window.api?.onSnipHistoryChanged?.(() => void refresh()) ?? (() => undefined);
    const onFocus = (e: Event) => {
      const id = (e as CustomEvent<string | null>).detail;
      takeSnipFocus();
      if (id) setSelected(id);
      void refresh();
    };
    window.addEventListener(SNIP_FOCUS_EVENT, onFocus);
    return () => {
      off();
      window.removeEventListener(SNIP_FOCUS_EVENT, onFocus);
    };
  }, [refresh]);

  const current = useMemo(
    () => entries.find((e) => e.id === selected) ?? (query ? null : entries[0] ?? null),
    [entries, selected, query],
  );

  const removeEntry = async (entry: SnipEntry) => {
    await window.api.snipHistoryRemove(entry.id);
    if (selected === entry.id) setSelected(null);
  };

  const clearAll = async () => {
    const ok = await confirmDialog({
      title: t('snip.history.clear'),
      message: t('snip.history.clearConfirm', { count: status.historyCount }),
      confirmLabel: t('snip.history.clear'),
      danger: true,
    });
    if (!ok) return;
    await window.api.snipHistoryClear();
    setSelected(null);
  };

  const lang = normalizeStudyLang(current?.lang);

  return (
    <div className={`snip-app${compact ? ' is-compact' : ''}`}>
      <header className="snip-app-head">
        <div>
          <h2 className="snip-app-title">{t('snip.view.title')}</h2>
          <p className="muted snip-app-status" role="status">
            {status.enabled ? t('snip.status.watching') : t('snip.status.paused')}
          </p>
        </div>
        <div className="snip-app-actions">
          <button type="button" className="btn small snip-btn" onClick={() => void save({ enabled: !status.enabled })}>
            {status.enabled ? t('snip.action.pause') : t('snip.action.resume')}
          </button>
          <button
            type="button"
            className="btn small snip-btn"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            {t('snip.view.settings')}
          </button>
        </div>
      </header>
      {settingsOpen && (
        <section className="snip-settings-panel" aria-label={t('snip.settings.title')}>
          <SnipSettingsForm showShortcut={!compact} />
        </section>
      )}
      <p className="muted snip-app-intro">{t('snip.view.intro', { lang: t(`snip.lang.${lang}`) })}</p>

      <div className="snip-app-body">
        <nav className="snip-history" aria-label={t('snip.history.title')}>
          <label className="snip-sr" htmlFor={searchId}>{t('snip.history.search')}</label>
          <input
            id={searchId}
            className="ui-input snip-search"
            type="search"
            value={query}
            placeholder={t('snip.history.search')}
            onChange={(e) => setQuery(e.target.value)}
          />
          <p className="muted snip-usage">
            {t('snip.history.usage', {
              count: status.historyCount,
              size: formatBytes(status.historyBytes),
              max: formatBytes(SNIP_HISTORY_MAX_BYTES),
            })}
          </p>
          {loaded && entries.length === 0 && (
            <p className="muted snip-empty">
              {query ? t('snip.history.noMatch', { query }) : t('snip.history.empty')}
            </p>
          )}
          <ul className="snip-history-list">
            {entries.map((entry) => {
              const cards = entry.words.filter((w) => w.status === 'added').length;
              const active = current?.id === entry.id;
              return (
                <li key={entry.id} className={`snip-history-item${active ? ' is-active' : ''}`}>
                  <button
                    type="button"
                    className="snip-history-open"
                    aria-current={active ? 'true' : undefined}
                    onClick={() => setSelected(entry.id)}
                  >
                    <span className="snip-history-text" lang={entry.lang}>
                      {firstLine(entry) || t('snip.history.untitled')}
                    </span>
                    <span className="snip-history-meta muted">
                      {new Date(entry.createdAt).toLocaleTimeString(LANG_TAGS[uiLang])}
                      {' · '}
                      {entry.status === 'processing'
                        ? t('snip.history.processing')
                        : entry.status === 'error'
                          ? t('snip.history.failed')
                          : t('snip.history.cards', { count: cards })}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn small snip-btn snip-history-delete"
                    aria-label={t('snip.history.delete')}
                    title={t('snip.history.delete')}
                    onClick={() => void removeEntry(entry)}
                  >
                    {t('common.remove')}
                  </button>
                </li>
              );
            })}
          </ul>
          {entries.length > 0 && !query && (
            <button type="button" className="btn small snip-btn" onClick={() => void clearAll()}>
              {t('snip.history.clear')}
            </button>
          )}
        </nav>
        <div className="snip-detail-wrap">
          {current ? (
            <SnipDetail entry={current} folder={status.deck} maxWords={status.maxWords} />
          ) : (
            <p className="muted snip-empty">{t('snip.detail.select')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
