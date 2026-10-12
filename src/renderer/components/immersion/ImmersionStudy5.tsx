/**
 * The immersion browser's study layer (7.5), driven from `useImmersion`:
 *
 * - Reader Mode tools: furigana on/off (the SAME `hideFurigana` setting as the
 *   EPUB reader, so the two never disagree), i+1 sentence highlighting, Save
 *   for later with an offline snapshot;
 * - Mine from the dictionary popup, counted as "mined" for the site and day;
 * - "new words met" per page, per site, per day;
 * - the Reading list rail view and the per-site / per-day stats table.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useT } from '../../i18n';
import { getLevel, onKnowledgeChanged } from '../../knownWords';
import { loadSettings, onReaderSettingsChanged, READER_SETTINGS_CHANGED, saveSettings } from '../../readerSettings';
import { mineToStudy } from '../../studyMining';
import { writeLocalStorageJson } from '../../localStorageWrite';
import { fetchReadableArticle, articleBodyHtml } from '../../wikiArticle';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { immersionHostOf, immersionStatsId } from '../../../shared/immersion';
import type { StudyLang } from '../../../shared/studyLang';
import { yt5ComprehensionBand } from '../../../shared/youtubeStudy5';
import {
  imm5DayRows,
  imm5SearchReadingList,
  imm5SiteRows,
  type Imm5PageCoverage,
  type Imm5ReadingItem,
} from '../../../shared/immersionStudy5';
import {
  imm5ExportReadingListJson,
  imm5ImportReadingList,
  imm5MarkRead,
  imm5NoteWordsMet,
  imm5OpenSnapshot,
  imm5ReadingList,
  imm5RecordSiteDay,
  imm5RemoveFromReadingList,
  imm5SaveForLater,
  imm5SiteDays,
  loadImm5Store,
  onImm5Changed,
  type Imm5OfflineOpen,
} from '../../immersionStudy5Store';
import { imm5ApplyIPlusOne, imm5ClearIPlusOne, imm5PageLemmas, imm5ReaderCoverage } from '../../immersionStudy5Dom';
import './imm5.css';

const PREFS_KEY = 'jp-imm5-reader-prefs';
/** Re-check the reader after the article lands: the tokenizer may still be loading. */
const SCAN_DELAYS_MS = [250, 1200, 3000];

interface Imm5ReaderPrefs {
  iPlusOne: boolean;
  /** 縦書き: the article set vertically, right to left, like a printed book. */
  vertical: boolean;
}

function loadReaderPrefs(): Imm5ReaderPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Imm5ReaderPrefs>) : {};
    return { iPlusOne: parsed.iPlusOne === true, vertical: parsed.vertical === true };
  } catch {
    return { iPlusOne: false, vertical: false };
  }
}

function saveReaderPrefs(patch: Partial<Imm5ReaderPrefs>): void {
  writeLocalStorageJson(PREFS_KEY, { ...loadReaderPrefs(), ...patch });
}

/** The same extensive-reading bands the YouTube estimate uses (95 / 90 / 80 %). */
function coverageBand(percent: number): string {
  return yt5ComprehensionBand(percent / 100) ?? 'hard';
}

/** Re-render on any store change (site stats, reading list). */
export function useImm5Store(): number {
  const [stamp, setStamp] = useState(0);
  useEffect(() => {
    void loadImm5Store();
    return onImm5Changed(() => setStamp((n) => n + 1));
  }, []);
  return stamp;
}

export interface Imm5StudyParams {
  readerRef: RefObject<HTMLDivElement | null>;
  readerHtml: string;
  showReader: boolean;
  currentUrl: string;
  title: string;
  studyLang: StudyLang;
  /** Show an offline snapshot in the reader (no network). */
  showOffline: (html: string, title: string) => void;
}

export function useImm5Study({ readerRef, readerHtml, showReader, currentUrl, title, studyLang, showOffline }: Imm5StudyParams) {
  const [hideFurigana, setHideFurigana] = useState(() => loadSettings().hideFurigana);
  const [iPlusOne, setIPlusOne] = useState(() => loadReaderPrefs().iPlusOne);
  const [vertical, setVertical] = useState(() => loadReaderPrefs().vertical);
  const [iPlusOneCount, setIPlusOneCount] = useState(0);
  const [coverage, setCoverage] = useState<Imm5PageCoverage | null>(null);
  const [saving, setSaving] = useState(false);
  const [readingOpen, setReadingOpen] = useState(false);
  const stamp = useImm5Store();

  useEffect(() => onReaderSettingsChanged((s) => setHideFurigana(s.hideFurigana)), []);

  const toggleFurigana = useCallback(() => {
    const next = { ...loadSettings(), hideFurigana: !loadSettings().hideFurigana };
    saveSettings(next);
    window.dispatchEvent(new CustomEvent(READER_SETTINGS_CHANGED, { detail: next }));
    setHideFurigana(next.hideFurigana);
  }, []);

  const toggleIPlusOne = useCallback(() => {
    setIPlusOne((on) => {
      saveReaderPrefs({ iPlusOne: !on });
      return !on;
    });
  }, []);

  const toggleVertical = useCallback(() => {
    setVertical((on) => {
      saveReaderPrefs({ vertical: !on });
      return !on;
    });
  }, []);

  // Vertical text scrolls sideways; the wheel moves along the lines as a reader expects
  // (down = onward = leftward), instead of doing nothing.
  useEffect(() => {
    const root = readerRef.current;
    if (!root || !vertical || !showReader) return undefined;
    const onWheel = (event: WheelEvent): void => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      if (root.scrollWidth <= root.clientWidth) return;
      event.preventDefault();
      root.scrollBy({ left: -event.deltaY });
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, [readerRef, vertical, showReader, readerHtml]);

  // i+1 painting and "new words met", once the known-word spans exist.
  const metForUrl = useMemo(() => ({ url: '' }), []);
  useEffect(() => {
    const root = readerRef.current;
    if (!root || !showReader || !readerHtml) {
      setIPlusOneCount(0);
      setCoverage(null);
      return undefined;
    }
    const timers: number[] = [];
    const scan = (): void => {
      const lemmas = imm5PageLemmas(root);
      if (!lemmas.length) return;
      setCoverage(imm5ReaderCoverage(root));
      if (iPlusOne) setIPlusOneCount(imm5ApplyIPlusOne(root));
      else {
        imm5ClearIPlusOne(root);
        setIPlusOneCount(0);
      }
      if (currentUrl && metForUrl.url !== currentUrl) {
        metForUrl.url = currentUrl;
        void imm5NoteWordsMet(currentUrl, lemmas, getLevel);
      }
    };
    for (const delay of SCAN_DELAYS_MS) timers.push(window.setTimeout(scan, delay));
    const off = onKnowledgeChanged(() => window.setTimeout(scan, 60));
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      off();
      imm5ClearIPlusOne(root);
    };
  }, [readerRef, readerHtml, showReader, iPlusOne, currentUrl, metForUrl]);

  const savedHere = useMemo(
    () => !!currentUrl && imm5ReadingList().some((item) => item.url === currentUrl),
    // stamp is the store's change signal, not an input.
    [currentUrl, stamp],
  );

  const saveForLater = useCallback(async () => {
    if (!currentUrl || saving) return;
    setSaving(true);
    try {
      let snapshotHtml = readerHtml || undefined;
      if (!snapshotHtml) {
        try {
          const article = await fetchReadableArticle(currentUrl);
          snapshotHtml = articleBodyHtml(article.title, article.html, article.meta);
        } catch {
          /* saved without an offline copy */
        }
      }
      await imm5SaveForLater({ url: currentUrl, title, snapshotHtml });
    } finally {
      setSaving(false);
    }
  }, [currentUrl, readerHtml, saving, title]);

  /** Open the checked offline copy; says why when there is none to show. */
  const openOffline = useCallback(async (item: Imm5ReadingItem): Promise<Imm5OfflineOpen['status']> => {
    const opened = await imm5OpenSnapshot(item);
    if (opened.status === 'ok') showOffline(opened.html, item.title);
    return opened.status;
  }, [showOffline]);

  /** Mine the popup's word with its sentence; counted for the site and the day. */
  const mine = useCallback(async (word: string, context?: string) => {
    const query = word.trim().slice(0, 80);
    if (!query) return;
    // Lazy: the gloss helper lives with the VN mining code, which the browser need not load up front.
    const glosses = await import('../../visualNovelMining')
      .then(({ lookupGlosses }) => lookupGlosses([query]))
      .catch(() => new Map<string, string>());
    const result = await mineToStudy({
      word: query,
      meaning: glosses.get(query) ?? '',
      sentence: context?.trim() || undefined,
      source: 'reader',
      sourceUrl: currentUrl || undefined,
      sourceTitle: title || immersionHostOf(currentUrl) || undefined,
      sourceId: currentUrl ? immersionStatsId(currentUrl) : undefined,
      studyKind: 'vocabulary',
      studyLang,
    });
    if (result.created && currentUrl) {
      void window.api.immersionBumpMetrics?.({ wordsMined: 1 });
      void imm5RecordSiteDay(currentUrl, { mined: 1 });
    }
  }, [currentUrl, studyLang, title]);

  return {
    hideFurigana,
    toggleFurigana,
    iPlusOne,
    toggleIPlusOne,
    iPlusOneCount,
    vertical,
    toggleVertical,
    coverage,
    saveForLater,
    saving,
    savedHere,
    readingOpen,
    setReadingOpen,
    openOffline,
    mine,
  };
}

export type Imm5Study = ReturnType<typeof useImm5Study>;

/** Reader Mode tools above the article. */
export function Imm5ReaderBar({ study, canSave }: { study: Imm5Study; canSave: boolean }) {
  const { t } = useT();
  return (
    <div className="imm5-reader-bar" role="toolbar" aria-label={t('imm5.reader.aria')} data-imm5-reader-bar="">
      <button
        type="button"
        className="btn small"
        aria-pressed={!study.hideFurigana}
        data-imm5-action="furigana"
        onClick={study.toggleFurigana}
      >
        {t('imm5.reader.furigana')}
      </button>
      <button
        type="button"
        className="btn small"
        aria-pressed={study.iPlusOne}
        data-imm5-action="iplus1"
        title={t('imm5.reader.iPlusOneTitle')}
        onClick={study.toggleIPlusOne}
      >
        {t('imm5.reader.iPlusOne')}
      </button>
      {study.iPlusOne && (
        <span className="imm5-reader-count" role="status">{t('imm5.reader.iPlusOneCount', { count: study.iPlusOneCount })}</span>
      )}
      <button
        type="button"
        className="btn small"
        aria-pressed={study.vertical}
        data-imm5-action="vertical"
        title={t('imm5.reader.verticalTitle')}
        onClick={study.toggleVertical}
      >
        {t('imm5.reader.vertical')}
      </button>
      {study.coverage?.knownPct != null && (
        <span
          className={`imm5-reader-coverage is-${coverageBand(study.coverage.knownPct)}`}
          data-imm5-coverage={study.coverage.knownPct}
          title={t('imm5.reader.coverageTitle', { count: study.coverage.unknownUnique })}
        >
          {t('imm5.reader.coverage', { percent: study.coverage.knownPct })}
        </span>
      )}
      <button
        type="button"
        className="btn small"
        data-imm5-action="save-later"
        disabled={!canSave || study.saving || study.savedHere}
        onClick={() => void study.saveForLater()}
      >
        {study.savedHere ? t('imm5.reader.saved') : study.saving ? t('imm5.reader.saving') : t('imm5.reader.saveLater')}
      </button>
    </div>
  );
}

/** The Reading list rail view: saved articles, unread first, searchable, with an offline copy. */
export function Imm5ReadingListView({
  study,
  query,
  onOpen,
}: {
  study: Imm5Study;
  query: string;
  onOpen: (url: string) => void;
}) {
  const { t, lang } = useT();
  const stamp = useImm5Store();
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const items = useMemo(
    () => imm5SearchReadingList(imm5ReadingList(), query),
    [query, stamp],
  );
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(LANG_TAGS[lang], { month: 'short', day: 'numeric' }), [lang]);

  const exportList = async (): Promise<void> => {
    const json = await imm5ExportReadingListJson();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    link.download = `gum-reading-list-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    setNotice(t('imm5.list.exported', { count: imm5ReadingList().length }));
  };

  const importList = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    const result = await imm5ImportReadingList(await file.text()).catch(() => null);
    setNotice(result
      ? t('imm5.list.imported', { count: result.added, updated: result.updated })
      : t('imm5.list.importFailed'));
  };

  const transfer = (
    <div className="imm5-reading-transfer">
      <button type="button" className="btn small" data-imm5-action="import" onClick={() => fileRef.current?.click()}>
        {t('imm5.list.import')}
      </button>
      {imm5ReadingList().length > 0 && (
        <button type="button" className="btn small" data-imm5-action="export" onClick={() => void exportList()}>
          {t('imm5.list.export')}
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".json,.html,.htm,.txt,.csv,application/json,text/html,text/plain,text/csv"
        hidden
        data-imm5-import-input=""
        aria-label={t('imm5.list.import')}
        onChange={(event) => {
          void importList(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </div>
  );

  if (!imm5ReadingList().length) {
    return (
      <div className="imm5-reading-list" data-imm5-reading-list="">
        <p className="immersion-rail-empty muted" data-imm5-reading-empty="">{t('imm5.list.empty')}</p>
        {notice && <p className="muted" role="status">{notice}</p>}
        {transfer}
      </div>
    );
  }
  return (
    <div className="imm5-reading-list" data-imm5-reading-list="">
      {transfer}
      {notice && <p className="muted" role="status" data-imm5-reading-notice="">{notice}</p>}
      {items.length === 0 && <p className="muted">{t('imm5.list.noMatch')}</p>}
      <ul>
        {items.map((item) => (
          <li key={item.id} className={item.readAt ? 'is-read' : undefined} data-imm5-reading={item.id}>
            <button type="button" className="imm5-reading-open" onClick={() => onOpen(item.url)} title={item.url}>
              <strong>{item.title}</strong>
              <small className="muted">
                {item.host}
                {' · '}
                {t('imm5.list.saved', { date: dateFormat.format(new Date(item.savedAt)) })}
              </small>
              {item.excerpt && <span className="imm5-reading-excerpt">{item.excerpt}</span>}
            </button>
            <div className="imm5-reading-actions">
              {item.snapshotChars > 0 && (
                <button
                  type="button"
                  className="btn small"
                  data-imm5-action="offline"
                  onClick={() => void study.openOffline(item).then((status) => setNotice(
                    status === 'ok' ? '' : status === 'damaged' ? t('imm5.list.damagedSnapshot') : t('imm5.list.noSnapshot'),
                  ))}
                >
                  {t('imm5.list.offline')}
                </button>
              )}
              <button
                type="button"
                className="btn small"
                data-imm5-action="mark-read"
                onClick={() => void imm5MarkRead(item.id, !item.readAt)}
              >
                {item.readAt ? t('imm5.list.markUnread') : t('imm5.list.markRead')}
              </button>
              <button
                type="button"
                className="btn small"
                data-imm5-action="remove"
                aria-label={t('imm5.list.removeNamed', { title: item.title })}
                onClick={() => void imm5RemoveFromReadingList(item.id)}
              >
                {t('imm5.list.remove')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

type RangeDays = 1 | 7 | 30;

/** Per-site and per-day study stats: time, lookups, words mined, new words met. */
export function Imm5SiteDayStats() {
  const { t, lang } = useT();
  const stamp = useImm5Store();
  const [days, setDays] = useState<RangeDays>(7);
  const now = Date.now();
  const rows = useMemo(
    () => imm5SiteRows(imm5SiteDays(), now, days).slice(0, 8),
    [stamp, days],
  );
  const dayRows = useMemo(
    () => imm5DayRows(imm5SiteDays(), now, 7),
    [stamp],
  );
  const nf = useMemo(() => new Intl.NumberFormat(LANG_TAGS[lang]), [lang]);
  const dayFormat = useMemo(() => new Intl.DateTimeFormat(LANG_TAGS[lang], { weekday: 'short' }), [lang]);
  const minutes = (s: number) => nf.format(Math.round(s / 60));
  return (
    <section className="imm5-site-stats" aria-label={t('imm5.stats.aria')} data-imm5-site-stats="">
      <div className="imm5-site-stats-head">
        <strong>{t('imm5.stats.head')}</strong>
        <div role="group" aria-label={t('imm5.stats.range')}>
          {([1, 7, 30] as RangeDays[]).map((n) => (
            <button
              key={n}
              type="button"
              className="btn small"
              aria-pressed={days === n}
              onClick={() => setDays(n)}
            >
              {n === 1 ? t('imm5.stats.today') : t('imm5.stats.days', { count: n })}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="muted">{t('imm5.stats.none')}</p>
      ) : (
        <table className="imm5-site-table">
          <thead>
            <tr>
              <th scope="col">{t('imm5.stats.col.site')}</th>
              <th scope="col">{t('imm5.stats.col.minutes')}</th>
              <th scope="col">{t('imm5.stats.col.lookups')}</th>
              <th scope="col">{t('imm5.stats.col.mined')}</th>
              <th scope="col">{t('imm5.stats.col.newWords')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.host} data-host={row.host}>
                <th scope="row">{row.host}</th>
                <td>{minutes(row.seconds)}</td>
                <td>{nf.format(row.lookups)}</td>
                <td>{nf.format(row.mined)}</td>
                <td>{nf.format(row.newWords)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ol className="imm5-day-strip" aria-label={t('imm5.stats.week')}>
        {dayRows.map((row) => (
          <li key={row.day} title={t('imm5.stats.dayTitle', {
            day: dayFormat.format(new Date(`${row.day}T12:00:00`)),
            minutes: minutes(row.seconds),
            count: row.newWords,
          })}
          >
            <span className="imm5-day-label">{dayFormat.format(new Date(`${row.day}T12:00:00`))}</span>
            <span className="imm5-day-value">{minutes(row.seconds)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
