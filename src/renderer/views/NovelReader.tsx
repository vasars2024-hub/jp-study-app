import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { getTranslateTarget, setTranslateTarget } from '../translateTarget';
import type { LibraryItem } from '../../shared/types';
import {
  progressFromReadingLocator,
  readingLocatorFromProgress,
} from '../../shared/readingLibraryAdapter';
import ReaderSettingsPanel from '../components/ReaderSettingsPanel';
import DictionaryPopup from '../components/DictionaryPopup';
import Icon from '../components/Icons';
import SentenceTranslatePopup from '../components/SentenceTranslatePopup';
import {
  AppChrome,
  StatusBarField,
  StatusBarSpacer,
  type MenuBarMenu,
  useAeroMaterials,
} from '../components/ui';
import {
  buildNovelCss,
  clampFontSize,
  loadSettings,
  onReaderSettingsChanged,
  saveSettings,
  THEMES,
  type ReaderSettings,
} from '../readerSettings';
import { addBookmark, loadBookmarks, removeBookmark, type Bookmark } from '../bookmarks';
import { recordReading } from '../stats';
import { loadEpub, type LoadedEpub } from '../epubLoader';
import { loadPdf } from '../pdfLoader';
import {
  buildDocumentCaptureTarget,
  LENS_CAPTURE_TARGET_KEY,
} from '../../shared/lensCaptureTarget';
import { documentCapturePage, documentCaptureSection } from '../novelLensCapture';
import { getTokenizer, tokenizerReady } from '../tokenizer';
import { highlightEl, recolorEl, resetHighlightRoot } from '../wordHighlight';
import { onKnowledgeChanged } from '../knownWords';
import {
  lookupWordFromMouseUp,
  isLookupClick,
  noteLookupPointerDown,
  selectSentenceAtPoint,
} from '../wordLookup';
import {
  ANNO_COLORS,
  addAnnotation,
  applyAnnotationsToRoot,
  flushAnnotationsMirror,
  loadAnnotations,
  removeAnnotation,
  type AnnoColor,
  type Annotation,
} from '../annotations';
import { detectSentenceBounds, sentenceAt } from '../../shared/sentenceBounds';
import { registerCommandHandler } from '../keyboardShortcuts';
import { recordReaderCopy } from '../clipboardHistory';
import ReaderCollectionPanel, {
  type CollectionAddPayload,
} from '../components/ReaderCollectionPanel';
import {
  articleBodyHtml,
  fetchReadableArticle,
  isJaWikiArticleUrl,
  resolveWikiUrl,
  type WikiNavEntry,
} from '../wikiArticle';
import { getActiveProfile } from '../profileState';
import {
  handOffToAgent,
  readingPassageAgentContext,
  routeAgentContext,
  selectedTextAgentContext,
} from '../agentContextHandoff';
import { AGENT_NAVIGATION_SECTION_LABEL_KEYS } from '../../shared/agentNavigation';
import { useT } from '../i18n';
import { KNOWN_LANGS } from '../../shared/langs';
import { recordEpubPageRead } from '../readingGardenProgress';

interface Props {
  item: LibraryItem;
  onClose: () => void;
}

// A PDF file starts with the bytes "%PDF".
function isPdf(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf, 0, Math.min(5, buf.byteLength));
  return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
}

const GUTTER = 24;

// Stable empty-HTML object for out-of-range parts (see chapterHtml below).
const EMPTY_HTML = { __html: '' };
const EPUB_TRANSLATE_AUTO_KEY = 'jp-study-epub-auto-translate';
const EPUB_TRANSLATE_MODE_KEY = 'jp-study-epub-translate-mode';
type EpubTranslateMode = 'original' | 'translation' | 'bilingual';

/** Shared app-wide translation target; never equals the study/source language. */
function readTranslateTarget(sourceLang: string): string {
  const saved = getTranslateTarget();
  if (saved === sourceLang) return sourceLang === 'en' ? 'ru' : 'en';
  return saved;
}

function writeTranslateTarget(code: string): void {
  setTranslateTarget(code);
}

/** Resolve the text language for EPUB translation (script detection beats a wrong library tag). */
function resolveEpubSourceLang(item: LibraryItem, sampleHtml: string, profileLang: string): string {
  // Kana is decisive — a Japanese book mistagged as zh must still translate as ja.
  if (/[\u3040-\u30ff]/u.test(sampleHtml)) return 'ja';
  if (item.lang === 'ja' || item.lang === 'zh' || item.lang === 'en') return item.lang;
  if (profileLang) return profileLang;
  return 'ja';
}

function sampleEpubHtml(chapters: Array<{ html?: string }> | undefined): string {
  if (!chapters?.length) return '';
  // Prefer the current-ish middle of the book over a title-only first spine item.
  const idxs = [0, Math.min(1, chapters.length - 1), Math.min(9, chapters.length - 1)];
  return idxs.map((i) => chapters[i]?.html ?? '').join('\n');
}

async function translateChapterHtml(
  html: string,
  sourceLang: string,
  targetLang: string,
): Promise<{ html: string; count: number; cancelled?: boolean }> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const selector = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,td,th';
  const blocks = Array.from(doc.body.querySelectorAll<HTMLElement>(selector)).filter((element) => {
    if (element.querySelector(selector)) return false;
    const text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
    return text.length > 0 && /[\u3040-\u30ff\u3400-\u9fff]/u.test(text);
  });
  if (!blocks.length) return { html, count: 0 };
  const target = targetLang === sourceLang ? (sourceLang === 'en' ? 'ru' : 'en') : targetLang;
  const items = blocks.map((element, index) => ({
    id: String(index),
    text: (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim(),
    source: sourceLang,
    target,
  }));
  const response = await window.api.translateRunBatch({ items });
  if (response.cancelled) return { html, count: 0, cancelled: true };
  if (!response.ok) throw new Error(response.error ?? 'Translation failed.');
  const results = new Map((response.results ?? []).map((result) => [result.id, result.text]));
  blocks.forEach((element, index) => {
    const text = results.get(String(index))?.trim();
    if (!text) return;
    element.classList.add('novel-original-block');
    const translation = doc.createElement('div');
    translation.className = 'novel-translation-block';
    translation.lang = target;
    translation.textContent = text;
    element.insertAdjacentElement('afterend', translation);
  });
  return { html: doc.body.innerHTML, count: blocks.length };
}

// Saved-position format: "p:<partIndex>:<fractionWithinPart>". Older saves were
// a bare number (fraction of the whole book) — both are handled on restore.
function parseLoc(loc: string | undefined): { part: number; frac: number } | null {
  if (!loc) return null;
  const m = /^p:(\d+):([\d.]+)$/.exec(loc);
  if (!m) return null;
  const frac = Number(m[2]);
  return { part: Number(m[1]), frac: Math.min(1, Math.max(0, Number.isFinite(frac) ? frac : 0)) };
}

/**
 * The custom novel reader.
 *
 * The loader pre-splits the book into small "parts". Pages mode renders ONE
 * part at a time on an exact page grid (state-driven flips — the wheel can't
 * drift mid-page). Scroll modes render a SLIDING WINDOW of parts (current ±1,
 * growing as you approach an edge, trimmed when it gets long) inside a single
 * scroll container — so scrolling is endless across the whole book while the
 * DOM stays small enough that huge books never freeze.
 */
export default function NovelReader({ item, onClose }: Props) {
  const aero = useAeroMaterials();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [loaded, setLoaded] = useState<LoadedEpub | null>(null);
  const [title, setTitle] = useState(item.title);
  const [loading, setLoading] = useState(true);
  const [pdfProgress, setPdfProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ReaderSettings>(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);
  const [translateMode, setTranslateMode] = useState<EpubTranslateMode>(() => {
    try {
      const saved = localStorage.getItem(EPUB_TRANSLATE_MODE_KEY);
      return saved === 'translation' || saved === 'bilingual' ? saved : 'original';
    } catch {
      return 'original';
    }
  });
  const sourceLang = useMemo(
    () => resolveEpubSourceLang(item, sampleEpubHtml(loaded?.chapters), getActiveProfile().targetLang),
    [item, loaded],
  );
  const [targetLang, setTargetLang] = useState(() =>
    readTranslateTarget(getActiveProfile().targetLang),
  );
  const translateVisibleModeRef = useRef<EpubTranslateMode>(
    translateMode === 'original' ? 'bilingual' : translateMode,
  );
  const [autoTranslate, setAutoTranslate] = useState(() => {
    try {
      return localStorage.getItem(EPUB_TRANSLATE_AUTO_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [translatedChapters, setTranslatedChapters] = useState<Record<number, string>>({});
  const translatedChaptersRef = useRef(translatedChapters);
  translatedChaptersRef.current = translatedChapters;
  const [translateBusy, setTranslateBusy] = useState(false);
  const [translateStatus, setTranslateStatus] = useState('');
  const [bookTranslateProgress, setBookTranslateProgress] = useState<{
    done: number;
    total: number;
    blockDone?: number;
    blockTotal?: number;
  } | null>(null);
  const cancelBookTranslateRef = useRef(false);
  const translateTickRef = useRef(0);
  const [chapterRangeFrom, setChapterRangeFrom] = useState(1);
  const [chapterRangeTo, setChapterRangeTo] = useState(1);
  const [pageRangeFrom, setPageRangeFrom] = useState(1);
  const [pageRangeTo, setPageRangeTo] = useState(1);
  const { t, lang } = useT();
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => loadBookmarks(item.id));
  const [part, setPart] = useState(0);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  /** Parts currently mounted in scroll modes (inclusive range). */
  const [win, setWin] = useState({ start: 0, end: 0 });
  const [progress, setProgress] = useState(item.progress?.percent ?? 0);
  const [seek, setSeek] = useState<number | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [popup, setPopup] = useState<
    { query: string; x: number; y: number; kind: 'dict' | 'translate'; context?: string } | null
  >(null);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [annoColor, setAnnoColor] = useState<AnnoColor>('yellow');
  const [annotations, setAnnotations] = useState<Annotation[]>(() => loadAnnotations(item.id));
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  const [pendingAdd, setPendingAdd] = useState<CollectionAddPayload | null>(null);

  // In-app web/wiki article opened from EPUB hyperlinks (keeps the book underneath).
  const [linkView, setLinkView] = useState<{
    url: string;
    title: string;
    bodyHtml: string;
  } | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [canLinkBack, setCanLinkBack] = useState(false);
  const linkHistoryRef = useRef<WikiNavEntry[]>([]);
  const linkBusyRef = useRef(false);
  const linkViewRef = useRef(linkView);
  linkViewRef.current = linkView;
  const canLinkBackRef = useRef(false);
  canLinkBackRef.current = canLinkBack;
  const bookTitleRef = useRef(item.title);
  bookTitleRef.current = title;
  /** Stable ref so keyboard handlers can call leaveLinkView before its declaration. */
  // Initialised to a no-op so callers can invoke it before a real leave handler
  // is installed; `undefined` keeps the () => void signature without an empty body.
  const leaveLinkViewRef = useRef<() => void>(() => undefined);

  // Reload from storage when switching books; flush durable mirror on exit.
  useEffect(() => {
    setAnnotations(loadAnnotations(item.id));
    setTranslatedChapters({});
    setTranslateStatus('');
    setBookTranslateProgress(null);
    cancelBookTranslateRef.current = true;
    // Clear any in-app web navigation from a previous book.
    linkHistoryRef.current = [];
    setLinkView(null);
    setCanLinkBack(false);
    setLinkBusy(false);
    linkBusyRef.current = false;
    return () => {
      const list = annotationsRef.current;
      if (list.length) {
        try {
          localStorage.setItem(`jp-annotations:${item.id}`, JSON.stringify(list));
        } catch {
          /* ignore */
        }
      }
      flushAnnotationsMirror();
    };
  }, [item.id]);

  // ----- layout mode -----
  const vertical =
    settings.writingMode === 'vertical' ||
    (settings.writingMode === 'auto' && loaded?.direction === 'rtl');
  const paged = settings.flow === 'paginated';
  // Horizontal + Scroll is the only mode that scrolls vertically; everything
  // else moves along the horizontal axis (vertical text flows right-to-left).
  const axis: 'x' | 'y' = !vertical && !paged ? 'y' : 'x';
  const rtl = vertical;

  // ----- refs mirrored for stable handlers -----
  const layoutRef = useRef({ axis, rtl, paged, vertical });
  layoutRef.current = { axis, rtl, paged, vertical };
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const partRef = useRef(part);
  partRef.current = part;
  const winRef = useRef(win);
  winRef.current = win;
  const popupRef = useRef(popup);
  popupRef.current = popup;
  const titleRef = useRef(title);
  titleRef.current = title;

  const pageRef = useRef(0);
  const pageCountRef = useRef(1);
  const stepRef = useRef(0);
  /** Paged mode: where to land (0..1) after the next part/layout pass. */
  const pendingPosRef = useRef<number | null>(null);
  /** Scroll modes: part + fraction to land on after the next window pass. */
  const pendingTargetRef = useRef<{ pi: number; lf: number } | null>(null);
  /** Scroll modes: keep this part visually fixed across a window mutation. */
  const anchorRef = useRef<{ pi: number; old: number } | null>(null);
  /** Cached part geometry so the scroll handler avoids layout reads every frame. */
  const partGeomRef = useRef<{ startIdx: number; starts: number[]; extents: number[] } | null>(
    null,
  );
  /** Defer word-highlight DOM work while the user is actively scrolling. */
  const scrollingRef = useRef(false);
  const scrollEndTimerRef = useRef(0);
  /** Window grow/trim queued while scrolling — applied once scroll settles. */
  const pendingWinRef = useRef<{ start: number; end: number } | null>(null);
  /** Last typography key used for localFrac reflow (font size etc.). */
  const typoKeyRef = useRef('');
  /** Current position within the current part (0..1). */
  const localFracRef = useRef(0);
  /**
   * True once the stored position has been restored into `partRef` /
   * `localFracRef`. Until then those refs hold their initial `0`, which is not a
   * position — it is "nothing read yet" — and must never be persisted. The
   * close-handler save below is gated on this: the book load is async, so an
   * unmount before it resolves would otherwise write `p:0:0.0000` over a real
   * saved locator. React.StrictMode tears the first mount down every time in
   * development, so without this guard *opening* a book destroys its position.
   */
  const positionRestoredRef = useRef(false);

  // stats + progress
  const totalCharsRef = useRef(0);
  const curGlobalRef = useRef(progress);
  const maxGlobalRef = useRef<number | null>(null);
  const pendingCharsRef = useRef(0);
  const readStartRef = useRef(Date.now());
  const activeReadingRef = useRef(true);
  const sourceIsPdfRef = useRef(false);
  const gardenPagesRef = useRef(new Set<string>());

  const countGardenPage = useCallback(
    (partIndex: number, pageIndex: number) => {
      if (sourceIsPdfRef.current) return;
      const key = `${partIndex}:${pageIndex}`;
      if (gardenPagesRef.current.has(key)) return;
      gardenPagesRef.current.add(key);
      recordEpubPageRead({ bookId: item.id, partIndex, pageIndex });
    },
    [item.id],
  );

  const bumpFont = useCallback((delta: number) => {
    setSettings((s) => ({ ...s, fontSize: clampFontSize(s.fontSize + delta) }));
  }, []);

  // ----- char-weighted progress across parts -----
  const weights = useMemo(() => {
    const w = (loaded?.chapters ?? []).map((c) => Math.max(c.chars, 1));
    const cum: number[] = [];
    let t = 0;
    for (const x of w) {
      cum.push(t);
      t += x;
    }
    return { w, cum, total: Math.max(t, 1) };
  }, [loaded]);

  // Stable dangerouslySetInnerHTML objects — one per chapter, memoized so their
  // reference never changes between renders. React 19 diffs this prop by object
  // identity (not by the HTML string), so passing a fresh `{ __html }` literal
  // every render makes React re-set innerHTML on every re-render — which wipes
  // the word-highlight <span>s the highlighter injects into this DOM by hand.
  // A constant reference lets React skip the node, so the highlights survive
  // scrolling, paging, and every other state change.
  const chapterHtml = useMemo(
    () => (loaded?.chapters ?? []).map((chapter, index) => ({
      __html: translateMode === 'original'
        ? chapter.html ?? ''
        : translatedChapters[index] ?? chapter.html ?? '',
    })),
    [loaded, translateMode, translatedChapters],
  );

  const translateChapter = useCallback(async (index: number): Promise<number | 'cancelled'> => {
    const chapter = loaded?.chapters[index];
    if (!chapter) return 0;
    if (translatedChaptersRef.current[index]) return 0;
    const result = await translateChapterHtml(chapter.html ?? '', sourceLang, targetLang);
    if (result.cancelled) return 'cancelled';
    setTranslatedChapters((current) => (
      current[index] ? current : { ...current, [index]: result.html }
    ));
    return result.count;
  }, [loaded, sourceLang, targetLang]);

  const setTranslateTarget = useCallback((code: string) => {
    const finalTarget = code === sourceLang ? (sourceLang === 'en' ? 'ru' : 'en') : code;
    writeTranslateTarget(finalTarget);
    setTargetLang(finalTarget);
    // Cached chapter HTML is tied to the previous target — drop it.
    setTranslatedChapters({});
    setTranslateStatus(t('epub.translate.targetChanged'));
  }, [sourceLang, t, lang]);

  // Keep target valid when book source language resolves after load.
  useEffect(() => {
    setTargetLang((prev) => (prev === sourceLang ? readTranslateTarget(sourceLang) : prev));
  }, [sourceLang]);

  const toggleTranslationVisibility = useCallback(() => {
    setTranslateMode((mode) => {
      if (mode === 'original') {
        const restore = translateVisibleModeRef.current;
        return restore === 'original' ? 'bilingual' : restore;
      }
      translateVisibleModeRef.current = mode;
      return 'original';
    });
  }, []);

  const onTranslateModeChange = useCallback((mode: EpubTranslateMode) => {
    if (mode !== 'original') translateVisibleModeRef.current = mode;
    setTranslateMode(mode);
  }, []);

  const stopBookTranslate = useCallback(() => {
    cancelBookTranslateRef.current = true;
    void window.api.translateCancelBatch();
  }, []);

  const translateChapterRange = useCallback(async (from: number, to: number, label: string) => {
    if (!loaded) return;
    const last = loaded.chapters.length - 1;
    if (last < 0) return;
    const start = Math.min(last, Math.max(0, Math.floor(from)));
    const end = Math.min(last, Math.max(start, Math.floor(to)));
    const total = end - start + 1;
    cancelBookTranslateRef.current = false;
    setTranslateBusy(true);
    setBookTranslateProgress({ done: 0, total });
    setTranslateStatus(label);

    const offModel = window.api.onTranslateModelProgress((p) => {
      if (p.status === 'ready') return;
      const pct = typeof p.progress === 'number' ? Math.round(p.progress) : 0;
      setTranslateStatus(t('epub.translate.status.loadingModelPct', { pct }));
    });

    try {
      const status = await window.api.translateStatus();
      if (!status.modelFound) {
        setTranslateStatus(t('epub.translate.modelMissing'));
        return;
      }
      if (!status.ready) {
        setTranslateStatus(t('epub.translate.status.loadingModel'));
        const ready = await window.api.translateEnsureReady();
        if (!ready.ok) {
          setTranslateStatus(ready.error || t('epub.translate.failed'));
          return;
        }
      }

      for (let index = start; index <= end; index += 1) {
        if (cancelBookTranslateRef.current) break;
        // Bump immediately so the counter never sits at 0 while the first chapter runs.
        setBookTranslateProgress({ done: index - start + 1, total, blockDone: 0, blockTotal: 0 });
        setTranslateStatus(
          t('epub.translate.status.section', {
            current: index + 1,
            total: loaded.chapters.length,
          }),
        );

        const chapterPromise = translateChapter(index);
        // Stall watchdog, not a total-time budget: a long chapter is many
        // sequential batch prompts, so a fixed wall made big chapters always
        // time out. Give up only when no batch progress arrives for a while.
        const STALL_MS = 150_000;
        translateTickRef.current = Date.now();
        let timedOut = false;
        const timer = window.setInterval(() => {
          if (Date.now() - translateTickRef.current < STALL_MS) return;
          timedOut = true;
          void window.api.translateCancelBatch();
        }, 5_000);
        const count = await chapterPromise;
        window.clearInterval(timer);

        if (timedOut) {
          setTranslateStatus(
            t('epub.translate.status.sectionTimeout', {
              current: index + 1,
              total: loaded.chapters.length,
            }),
          );
          // Continue with later sections instead of freezing the whole job.
          continue;
        }
        if (count === 'cancelled' || cancelBookTranslateRef.current) {
          cancelBookTranslateRef.current = true;
          break;
        }
      }
      setTranslateStatus(
        cancelBookTranslateRef.current
          ? t('epub.translate.stopped')
          : t('epub.translate.rangeReady'),
      );
      if (!cancelBookTranslateRef.current && translateMode === 'original') setTranslateMode('bilingual');
    } catch (err) {
      setTranslateStatus(err instanceof Error ? err.message : t('epub.translate.failed'));
    } finally {
      offModel();
      setTranslateBusy(false);
      setBookTranslateProgress(null);
    }
  }, [loaded, translateChapter, translateMode, t, lang]);

  const translateCurrentChapter = useCallback(async () => {
    if (!loaded) return;
    setTranslateBusy(true);
    setTranslateStatus(t('epub.translate.status.current'));

    // The single-chapter path used to skip everything the range path does about loading, so a cold
    // model meant "Translating current chapter…" sitting still for the 15 s a 1,223 MB GGUF takes
    // — the same dishonest state the Dictionary example panel shipped and had fixed. It also meant
    // a failed load surfaced as whatever `translateChapter` happened to throw, instead of the
    // reason. Same three steps as `translateChapterRange`, and the listener is detached in the
    // `finally` below so a later load cannot write over this surface's status.
    const offModel = window.api.onTranslateModelProgress((p) => {
      if (p.status === 'ready') return;
      const pct = typeof p.progress === 'number' ? Math.round(p.progress) : 0;
      setTranslateStatus(t('epub.translate.status.loadingModelPct', { pct }));
    });

    try {
      const status = await window.api.translateStatus();
      if (!status.modelFound) {
        setTranslateStatus(t('epub.translate.modelMissing'));
        return;
      }
      if (!status.ready) {
        setTranslateStatus(t('epub.translate.status.loadingModel'));
        const ready = await window.api.translateEnsureReady();
        if (!ready.ok) {
          setTranslateStatus(ready.error || t('epub.translate.failed'));
          return;
        }
        setTranslateStatus(t('epub.translate.status.current'));
      }
      const count = await translateChapter(partRef.current);
      if (count === 'cancelled') {
        setTranslateStatus(t('epub.translate.stopped'));
        return;
      }
      setTranslateStatus(
        count
          ? t('epub.translate.status.blocks', { count })
          : t('epub.translate.status.chapterReady'),
      );
      if (translateMode === 'original') setTranslateMode('bilingual');
    } catch (err) {
      setTranslateStatus(err instanceof Error ? err.message : t('epub.translate.failed'));
    } finally {
      offModel();
      setTranslateBusy(false);
    }
  }, [loaded, translateChapter, translateMode, t, lang]);

  const translateAhead = useCallback(async () => {
    if (!loaded) return;
    const start = Math.min(loaded.chapters.length - 1, partRef.current + 1);
    if (start >= loaded.chapters.length || partRef.current >= loaded.chapters.length - 1) {
      setTranslateStatus(t('epub.translate.nothingAhead'));
      return;
    }
    await translateChapterRange(start, loaded.chapters.length - 1, t('epub.translate.status.ahead'));
  }, [loaded, translateChapterRange, t, lang]);

  const translateSelectedChapters = useCallback(async () => {
    if (!loaded) return;
    const toc = loaded.toc;
    let start: number;
    let end: number;
    if (toc.length > 0) {
      const fromIdx = Math.min(toc.length, Math.max(1, chapterRangeFrom)) - 1;
      const toIdx = Math.min(toc.length, Math.max(fromIdx + 1, chapterRangeTo)) - 1;
      start = toc[fromIdx].chapterIndex;
      end = toc[toIdx].chapterIndex;
      if (end < start) {
        const tmp = start;
        start = end;
        end = tmp;
      }
    } else {
      start = Math.max(0, chapterRangeFrom - 1);
      end = Math.max(start, chapterRangeTo - 1);
    }
    await translateChapterRange(start, end, t('epub.translate.status.chapterRange'));
  }, [loaded, chapterRangeFrom, chapterRangeTo, translateChapterRange, t, lang]);

  const translateSelectedPages = useCallback(async () => {
    if (!loaded) return;
    const start = Math.max(0, pageRangeFrom - 1);
    const end = Math.max(start, pageRangeTo - 1);
    await translateChapterRange(start, end, t('epub.translate.status.pageRange'));
  }, [loaded, pageRangeFrom, pageRangeTo, translateChapterRange, t, lang]);

  const translateWholeBook = useCallback(async () => {
    if (!loaded) return;
    await translateChapterRange(0, loaded.chapters.length - 1, t('epub.translate.status.full'));
  }, [loaded, translateChapterRange, t, lang]);

  // Live block-level progress while a chapter batch is running.
  useEffect(() => {
    if (!translateBusy) return;
    return window.api.onTranslateBatchProgress(({ done, total }) => {
      translateTickRef.current = Date.now();
      setBookTranslateProgress((prev) =>
        prev ? { ...prev, blockDone: done, blockTotal: total } : prev,
      );
    });
  }, [translateBusy]);

  // Keep range inputs within the loaded book.
  useEffect(() => {
    if (!loaded) return;
    const chapterMax = Math.max(1, loaded.toc.length || loaded.chapters.length);
    const pageMax = Math.max(1, loaded.chapters.length);
    setChapterRangeFrom(1);
    setChapterRangeTo(chapterMax);
    setPageRangeFrom(1);
    setPageRangeTo(pageMax);
  }, [loaded]);

  const globalFor = useCallback(
    (p: number, lf: number): number => {
      if (!weights.w.length) return 0;
      const i = Math.min(Math.max(p, 0), weights.w.length - 1);
      return Math.min(1, (weights.cum[i] + lf * weights.w[i]) / weights.total);
    },
    [weights],
  );

  const mapGlobal = useCallback(
    (f: number): { pi: number; lf: number } => {
      if (!weights.w.length) return { pi: 0, lf: 0 };
      const target = Math.min(1, Math.max(0, f)) * weights.total;
      let pi = 0;
      for (let i = weights.w.length - 1; i >= 0; i--) {
        if (weights.cum[i] <= target) {
          pi = i;
          break;
        }
      }
      const lf = Math.min(1, Math.max(0, (target - weights.cum[pi]) / weights.w[pi]));
      return { pi, lf };
    },
    [weights],
  );

  const updateGlobal = useCallback((g: number) => {
    curGlobalRef.current = g;
    if (maxGlobalRef.current == null) {
      maxGlobalRef.current = g;
    } else if (g > maxGlobalRef.current && totalCharsRef.current > 0) {
      pendingCharsRef.current += Math.round((g - maxGlobalRef.current) * totalCharsRef.current);
      maxGlobalRef.current = g;
    }
  }, []);

  const saveNow = useCallback(
    (g: number, lf: number) => {
      // Through the canonical reading model (Phase 5). The projection emits the
      // exact `p:<part>:<frac>` string this reader has always written, so no
      // stored position changes shape; what it adds is a format check on the
      // way out. A fraction is within one part, so it cannot exceed 1 — float
      // drift past the edge would otherwise be stored as an unreadable save.
      window.api.setProgress(
        item.id,
        progressFromReadingLocator(
          item,
          { kind: 'part', part: partRef.current, fraction: Math.min(1, Math.max(0, lf)) },
          g,
        ),
      );
    },
    [item],
  );

  // ----- offset helpers (abstract over axis + RTL sign) -----
  const axisMax = useCallback((): number => {
    const el = scrollerRef.current;
    if (!el) return 0;
    return layoutRef.current.axis === 'y'
      ? el.scrollHeight - el.clientHeight
      : el.scrollWidth - el.clientWidth;
  }, []);

  const getOffsetPx = useCallback((): number => {
    const el = scrollerRef.current;
    if (!el) return 0;
    // vertical-rl scrollers use negative scrollLeft in Chromium; abs() covers both.
    return layoutRef.current.axis === 'y' ? el.scrollTop : Math.abs(el.scrollLeft);
  }, []);

  const setOffsetPx = useCallback((px: number, smooth = false): void => {
    const el = scrollerRef.current;
    if (!el) return;
    const L = layoutRef.current;
    const behavior = smooth ? ('smooth' as const) : ('auto' as const);
    if (L.axis === 'y') el.scrollTo({ top: px, behavior });
    else el.scrollTo({ left: L.rtl ? -px : px, behavior });
  }, []);

  // ----- part-element geometry (scroll modes) -----
  const partEl = useCallback(
    (i: number): HTMLElement | null =>
      contentRef.current?.querySelector<HTMLElement>(`[data-pi="${i}"]`) ?? null,
    [],
  );

  /** A part's start offset along the reading axis (layout px from content origin). */
  const startOffset = useCallback((el: HTMLElement): number => {
    const L = layoutRef.current;
    // offsetTop/Left is stable during scroll; getBoundingClientRect is not.
    return L.axis === 'y' ? el.offsetTop : el.offsetLeft;
  }, []);

  const extentOf = useCallback((el: HTMLElement): number => {
    const L = layoutRef.current;
    return Math.max(1, L.axis === 'y' ? el.offsetHeight : el.offsetWidth);
  }, []);

  const measureWin = useCallback((): void => {
    const w = winRef.current;
    const starts: number[] = [];
    const extents: number[] = [];
    for (let i = w.start; i <= w.end; i++) {
      const pe = partEl(i);
      if (!pe) continue;
      starts.push(startOffset(pe));
      extents.push(extentOf(pe));
    }
    partGeomRef.current = starts.length ? { startIdx: w.start, starts, extents } : null;
  }, [partEl, startOffset, extentOf]);

  /** Grow/shrink the window while keeping the current part visually fixed. */
  const mutateWin = useCallback(
    (next: { start: number; end: number }) => {
      if (anchorRef.current || pendingTargetRef.current) return; // one change at a time
      const cur = winRef.current;
      if (next.start === cur.start && next.end === cur.end) return;
      partGeomRef.current = null;
      const keep = Math.min(Math.max(partRef.current, next.start), next.end);
      const pe = partEl(keep);
      anchorRef.current = pe ? { pi: keep, old: startOffset(pe) } : null;
      setWin(next);
    },
    [partEl, startOffset],
  );

  const flushPendingWin = useCallback(() => {
    const next = pendingWinRef.current;
    if (!next) return;
    pendingWinRef.current = null;
    mutateWin(next);
  }, [mutateWin]);

  /** Queue a window change. All mutations wait until scroll settles (or bottom pinch). */
  const queueWinMutation = useCallback(
    (next: { start: number; end: number }) => {
      const cur = winRef.current;
      if (next.start === cur.start && next.end === cur.end) return;
      pendingWinRef.current = next;
      if (!scrollingRef.current) flushPendingWin();
    },
    [flushPendingWin],
  );

  // ----- load the book -----
  useEffect(() => {
    let dead = false;
    let handle: LoadedEpub | null = null;
    gardenPagesRef.current = new Set();
    // A different book means the refs still describe the previous one; nothing
    // may be persisted for this id until its own position is restored.
    positionRestoredRef.current = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const buf = (await window.api.readBook(item.id)) as ArrayBuffer;
        if (dead) return;
        if (!buf) throw new Error('The book file is missing from the library.');
        sourceIsPdfRef.current = isPdf(buf);
        if (sourceIsPdfRef.current) {
          setPdfProgress(0);
          handle = await loadPdf(buf, (f) => {
            if (!dead) setPdfProgress(f);
          });
        } else {
          handle = await loadEpub(buf);
        }
        if (dead) {
          handle.destroy();
          return;
        }
        setPdfProgress(null);
        totalCharsRef.current = handle.totalChars;
        if (handle.title) setTitle(handle.title);

        // Restore the reading position: exact part+fraction when available,
        // else map an old global fraction; a ~100% stale save restarts fresh.
        // Read through the model. It declines a legacy bare-number save (a
        // fraction of the whole book), and the else-branch below is exactly the
        // code that can map one, using chapter weights only this reader has.
        const restored = readingLocatorFromProgress(item, item.progress);
        const savedLoc =
          restored?.kind === 'part' ? { part: restored.part, frac: restored.fraction } : null;
        let pi = 0;
        let lf = 0;
        if (savedLoc && savedLoc.part < handle.chapters.length) {
          pi = savedLoc.part;
          lf = savedLoc.frac;
        } else {
          let pct = item.progress?.percent ?? 0;
          const asNum = Number(item.progress?.location);
          if (Number.isFinite(asNum) && asNum > 0 && asNum <= 1) pct = asNum;
          if (!Number.isFinite(pct) || pct > 0.995 || pct < 0) pct = 0;
          const weightsL = handle.chapters.map((c) => Math.max(c.chars, 1));
          const totalL = Math.max(
            weightsL.reduce((a, b) => a + b, 0),
            1,
          );
          let acc = 0;
          const target = pct * totalL;
          for (let i = 0; i < weightsL.length; i++) {
            if (acc + weightsL[i] >= target) {
              pi = i;
              lf = Math.min(1, Math.max(0, (target - acc) / weightsL[i]));
              break;
            }
            acc += weightsL[i];
          }
        }
        maxGlobalRef.current = null;
        localFracRef.current = lf;
        partRef.current = pi;
        positionRestoredRef.current = true;
        pendingPosRef.current = lf; // consumed by paged layout
        pendingTargetRef.current = { pi, lf }; // consumed by scroll layout
        setPart(pi);
        setLoaded(handle);
        setLoading(false);
      } catch (err) {
        if (dead) return;
        console.error(err);
        setError(`Could not open this book.\n${err instanceof Error ? err.message : String(err)}`);
        setLoading(false);
      }
    })();
    return () => {
      dead = true;
      handle?.destroy();
      // Final position save on close, through the same projection as saveNow —
      // but only once there is a position to save. Before the async load
      // restores it, partRef/localFracRef are still 0, and writing that would
      // replace a real `p:<part>:<frac>` with `p:0:0.0000` while `percent`
      // survives (it is seeded from item.progress). See positionRestoredRef.
      if (!positionRestoredRef.current) return;
      window.api.setProgress(
        item.id,
        progressFromReadingLocator(
          item,
          {
            kind: 'part',
            part: partRef.current,
            fraction: Math.min(1, Math.max(0, localFracRef.current)),
          },
          curGlobalRef.current,
        ),
      );
    };
  }, [item.id]);

  // ----- track the viewport size -----
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded]);

  // ----- persist settings -----
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => onReaderSettingsChanged(setSettings), []);

  useEffect(() => {
    try {
      localStorage.setItem(EPUB_TRANSLATE_MODE_KEY, translateMode);
      localStorage.setItem(EPUB_TRANSLATE_AUTO_KEY, autoTranslate ? '1' : '0');
    } catch {
      /* persistence is optional */
    }
  }, [autoTranslate, translateMode]);

  useEffect(() => {
    if (!autoTranslate || !loaded || translatedChapters[part]) return;
    void translateChapter(part).catch((err) => {
      setTranslateStatus(err instanceof Error ? err.message : 'Automatic translation failed');
    });
  }, [autoTranslate, loaded, part, translateChapter, translatedChapters]);

  // ----- word-knowledge highlighting -----
  const [hlTick, setHlTick] = useState(0);
  // Build the tokenizer lazily the first time highlighting is turned on.
  useEffect(() => {
    if (!settings.wordHighlight || tokenizerReady()) return;
    let dead = false;
    getTokenizer()
      .then(() => !dead && setHlTick((t) => t + 1))
      .catch(() => undefined);
    return () => {
      dead = true;
    };
  }, [settings.wordHighlight]);
  // Re-process when highlighting is turned back on (roots are marked done after first pass).
  useEffect(() => {
    if (!settings.wordHighlight || !contentRef.current) return;
    const root = contentRef.current;
    const els = paged
      ? [root]
      : Array.from(root.querySelectorAll<HTMLElement>('.novel-part'));
    for (const el of els.length ? els : [root]) resetHighlightRoot(el);
    setHlTick((t) => t + 1);
  }, [settings.wordHighlight, paged]);
  // Wrap content words after each part/window renders (post-paint; inline spans
  // don't shift layout so the page grid stays correct). Deferred while scrolling
  // so kuromoji work doesn't fight the sliding-window anchor corrections.
  // Personal annotations always re-apply — independent of vocabulary colors.
  useEffect(() => {
    const content = contentRef.current;
    if (!content || !loaded) return;
    if (scrollingRef.current) return;
    const run = () => {
      if (scrollingRef.current || !contentRef.current) return;
      const root = contentRef.current;
      const els = paged
        ? [root]
        : Array.from(root.querySelectorAll<HTMLElement>('.novel-part'));
      for (const el of els.length ? els : [root]) {
        if (settings.wordHighlight && tokenizerReady()) highlightEl(el);
        // Personal H-key highlights (annotations) — always, even if vocab colors off.
        const pi = el.dataset.pi != null ? Number(el.dataset.pi) : paged ? partRef.current : undefined;
        applyAnnotationsToRoot(el, annotations, pi);
      }
    };
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback;
    if (idle) {
      const id = idle(run, { timeout: 400 });
      return () => {
        (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
      };
    }
    const t = window.setTimeout(run, 0);
    return () => window.clearTimeout(t);
  }, [loaded, win, paged, settings.wordHighlight, hlTick, size.w, annotations]);
  // Recolour when a word's level changes elsewhere (e.g. graded in a popup).
  useEffect(() => onKnowledgeChanged((words) => {
    recolorEl(document, words.length ? new Set(words) : undefined);
  }), []);

  // ----- (re)build the scroll window when entering a scroll mode / new book -----
  useEffect(() => {
    if (!loaded || paged) return;
    const last = loaded.chapters.length - 1;
    const cp = Math.min(Math.max(partRef.current, 0), last);
    if (!pendingTargetRef.current) {
      pendingTargetRef.current = { pi: cp, lf: localFracRef.current };
    }
    anchorRef.current = null;
    partGeomRef.current = null;
    // Mount a wide slice up front — avoids grow/trim churn on image-heavy openings.
    setWin({ start: Math.max(0, cp - 2), end: Math.min(last, cp + 8) });
  }, [loaded, paged, vertical]);

  // ----- PAGED layout: page grid + position (runs after the part is committed) -----
  useLayoutEffect(() => {
    if (!paged) return;
    const el = scrollerRef.current;
    const content = contentRef.current;
    if (!el || !content || !loaded) return;

    const W = el.clientWidth;
    const H = el.clientHeight;
    // Assert the FULL base padding every pass. (Mutating only paddingLeft, as
    // the previous version did, permanently erased the React-set shorthand —
    // the page grid shifted and words were cut off at the right edge.)
    const vmPx = Math.round((H * settings.sideMargin) / 100);
    const hmPx = Math.round((W * settings.sideMargin) / 100);
    const g = GUTTER + hmPx;
    content.style.padding = vertical ? `${GUTTER + vmPx}px 0px` : `${GUTTER}px ${g}px`;

    let step = 0;
    let pages = 1;
    if (W > 0) {
      if (vertical) {
        // Quantize the page step to whole text lines so a flip never slices a
        // line of tategaki down the middle.
        const cs = getComputedStyle(content);
        let advance = parseFloat(cs.lineHeight);
        if (!Number.isFinite(advance) || advance <= 4) {
          advance = (parseFloat(cs.fontSize) || 16) * 1.8;
        }
        step = Math.max(advance, Math.floor(W / advance) * advance);
        const natural = el.scrollWidth;
        pages = natural <= W + 1 ? 1 : Math.ceil((natural - W) / step) + 1;
        // Pad the far edge so even the last page lands exactly on the grid.
        const pad = (pages - 1) * step + W - natural;
        if (pad > 0.5) content.style.paddingLeft = `${pad}px`;
      } else {
        // Horizontal pages are CSS columns sized so scrollWidth = pages × W.
        step = W;
        pages = Math.max(1, Math.round(el.scrollWidth / W));
      }
    }
    stepRef.current = step;
    pageCountRef.current = pages;
    setPageCount(pages);

    const target = pendingPosRef.current ?? localFracRef.current;
    pendingPosRef.current = null;
    const frac = Number.isFinite(target) ? Math.min(1, Math.max(0, target)) : 0;
    const p = Math.min(pages - 1, Math.max(0, Math.round(frac * (pages - 1))));
    pageRef.current = p;
    setPage(p);
    setOffsetPx(p * step, false);
    localFracRef.current = pages > 1 ? p / (pages - 1) : 0;
    const g2 = globalFor(partRef.current, localFracRef.current);
    updateGlobal(g2);
    setProgress(g2);
  }, [loaded, part, size.w, size.h, paged, vertical, settings]);

  // ----- SCROLL layout: window anchoring + explicit targets -----
  useLayoutEffect(() => {
    if (paged || !loaded) return;
    const el = scrollerRef.current;
    const content = contentRef.current;
    if (!el || !content) return;

    // 1) A window mutation (grow/trim) — keep the anchored part where it was.
    const a = anchorRef.current;
    anchorRef.current = null;
    if (a) {
      const pe = partEl(a.pi);
      if (pe) {
        const d = startOffset(pe) - a.old;
        if (Math.abs(d) > 0.5) setOffsetPx(getOffsetPx() + d);
      }
      measureWin();
      return;
    }

    // 2) An explicit destination (restore / seek / chapter jump / mode switch).
    const t = pendingTargetRef.current;
    if (t) {
      pendingTargetRef.current = null;
      const pe = partEl(t.pi);
      if (pe) {
        const off = Math.min(Math.max(startOffset(pe) + t.lf * extentOf(pe), 0), axisMax());
        setOffsetPx(off);
        partRef.current = t.pi;
        localFracRef.current = t.lf;
        const g = globalFor(t.pi, t.lf);
        updateGlobal(g);
        setProgress(g);
        saveNow(g, t.lf);
      }
      measureWin();
      return;
    }

    // 3) Bare rerun (font / margins / resize reflowed the text).
    if (scrollingRef.current) {
      measureWin();
      return;
    }
    const typoKey = `${settings.fontSize}|${settings.lineHeight}|${settings.sideMargin}|${settings.contentWidth}|${settings.fontWeight}`;
    const typoReflow = typoKeyRef.current !== typoKey;
    typoKeyRef.current = typoKey;
    if (typoReflow) {
      const pe = partEl(partRef.current);
      if (pe) {
        const off = Math.min(
          Math.max(startOffset(pe) + localFracRef.current * extentOf(pe), 0),
          axisMax(),
        );
        setOffsetPx(off);
      }
    } else {
      // Image load / resize: keep the same scroll pixel — don't recompute from
      // localFrac (extent changes make that jump backward through images).
      const off = getOffsetPx();
      const max = axisMax();
      if (off > max) setOffsetPx(max);
    }
    measureWin();
  }, [win, loaded, paged, vertical, size.w, size.h, settings]);

  // Remeasure part geometry when content height changes (e.g. images finishing
  // load). Never reposition — the browser's scroll anchor handles the rest.
  useEffect(() => {
    if (paged || !loaded) return;
    const root = contentRef.current;
    if (!root) return;
    let prev = root.offsetHeight;
    let timer = 0;
    const ro = new ResizeObserver(() => {
      const h = root.offsetHeight;
      if (Math.abs(h - prev) < 2) return;
      prev = h;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        partGeomRef.current = null;
        measureWin();
      }, 150);
    });
    ro.observe(root);
    return () => {
      ro.disconnect();
      window.clearTimeout(timer);
    };
  }, [loaded, paged, win, measureWin]);

  // ----- page / screen navigation -----
  const flip = useCallback(
    (dir: 1 | -1) => {
      const book = loadedRef.current;
      const el = scrollerRef.current;
      if (!book || !el) return;
      setPopup(null);
      const L = layoutRef.current;
      const lastPart = book.chapters.length - 1;

      if (L.paged) {
        const next = pageRef.current + dir;
        if (next < 0) {
          if (partRef.current > 0) {
            pendingPosRef.current = 1;
            const pi = partRef.current - 1;
            partRef.current = pi;
            setPart(pi);
          }
          return;
        }
        if (next >= pageCountRef.current) {
          if (partRef.current < lastPart) {
            pendingPosRef.current = 0;
            const pi = partRef.current + 1;
            if (dir > 0) countGardenPage(pi, 0);
            partRef.current = pi;
            setPart(pi);
          }
          return;
        }
        pageRef.current = next;
        setPage(next);
        setOffsetPx(next * stepRef.current, true);
        const lf = pageCountRef.current > 1 ? next / (pageCountRef.current - 1) : 0;
        localFracRef.current = lf;
        const g = globalFor(partRef.current, lf);
        updateGlobal(g);
        setProgress(g);
        saveNow(g, lf);
        if (dir > 0) countGardenPage(partRef.current, next);
        return;
      }

      // Scroll modes: move ~a screen. The sliding window supplies more book as
      // the scroll approaches either edge, so no part-jumps are needed here.
      const max = axisMax();
      const cur = getOffsetPx();
      const screen = (L.axis === 'y' ? el.clientHeight : el.clientWidth) - 40;
      const target = Math.min(max, Math.max(0, cur + dir * screen));
      setOffsetPx(target, true);
      if (dir > 0 && target > cur + 1) {
        countGardenPage(partRef.current, Math.max(0, Math.floor(target / Math.max(1, screen))));
      }
    },
    [axisMax, getOffsetPx, setOffsetPx, globalFor, updateGlobal, saveNow, countGardenPage],
  );
  const flipRef = useRef(flip);
  flipRef.current = flip;

  /** Paged mode: jump within the current part (0..1). */
  const applyLocal = useCallback(
    (lf: number) => {
      setPopup(null);
      const pages = pageCountRef.current;
      const p = Math.min(pages - 1, Math.max(0, Math.round(lf * (pages - 1))));
      pageRef.current = p;
      setPage(p);
      setOffsetPx(p * stepRef.current, false);
      localFracRef.current = pages > 1 ? p / (pages - 1) : 0;
      const g = globalFor(partRef.current, localFracRef.current);
      updateGlobal(g);
      setProgress(g);
      saveNow(g, localFracRef.current);
    },
    [setOffsetPx, globalFor, updateGlobal, saveNow],
  );

  const goTo = useCallback(
    (piRaw: number, lf: number) => {
      const book = loadedRef.current;
      if (!book) return;
      const last = book.chapters.length - 1;
      const pi = Math.min(Math.max(piRaw, 0), last);
      setPopup(null);

      if (layoutRef.current.paged) {
        if (pi === partRef.current) {
          applyLocal(lf);
          return;
        }
        pendingPosRef.current = lf;
        partRef.current = pi;
        setPart(pi);
        return;
      }

      partRef.current = pi;
      setPart(pi);
      const w = winRef.current;
      if (pi < w.start || pi > w.end) {
        // Jump outside the mounted window: rebuild it around the destination.
        anchorRef.current = null;
        pendingTargetRef.current = { pi, lf };
        partGeomRef.current = null;
        setWin({ start: Math.max(0, pi - 2), end: Math.min(last, pi + 3) });
      } else {
        const pe = partEl(pi);
        if (pe) {
          const off = Math.min(Math.max(startOffset(pe) + lf * extentOf(pe), 0), axisMax());
          setOffsetPx(off);
          localFracRef.current = lf;
          const g = globalFor(pi, lf);
          updateGlobal(g);
          setProgress(g);
          saveNow(g, lf);
        }
      }
    },
    [applyLocal, partEl, startOffset, extentOf, axisMax, setOffsetPx, globalFor, updateGlobal, saveNow],
  );

  const seekGlobal = useCallback(
    (f: number) => {
      const { pi, lf } = mapGlobal(f);
      goTo(pi, lf);
    },
    [mapGlobal, goTo],
  );

  // ----- wheel -----
  // Pages mode: the wheel flips whole pages. Vertical scroll mode: the wheel
  // is mapped onto the right-to-left axis. Horizontal scroll mode: native.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !loaded) return;
    let acc = 0;
    let lastFlip = 0;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        bumpFont(e.deltaY < 0 ? 10 : -10);
        return;
      }
      const L = layoutRef.current;
      if (L.paged) {
        e.preventDefault();
        const now = performance.now();
        acc += e.deltaY !== 0 ? e.deltaY : e.deltaX;
        if (Math.abs(acc) >= 45 && now - lastFlip > 140) {
          flipRef.current(acc > 0 ? 1 : -1);
          acc = 0;
          lastFlip = now;
        }
        return;
      }
      if (L.vertical) {
        // Advance = leftward. scrollLeft is ≤ 0 in a vertical-rl scroller; the
        // browser clamps at both ends and the window keeps feeding new parts.
        e.preventDefault();
        const d = e.deltaY !== 0 ? e.deltaY : e.deltaX;
        el.scrollLeft -= d;
      }
      // horizontal scroll mode: let the browser scroll natively
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [loaded, bumpFont]);

  // ----- scroll → progress + sliding-window upkeep (scroll modes only) -----
  useEffect(() => {
    if (paged || !loaded) return;
    const el = scrollerRef.current;
    if (!el) return;
    let raf = 0;
    let lastUi = 0;
    let lastSave = 0;
    const onScroll = () => {
      scrollingRef.current = true;
      window.clearTimeout(scrollEndTimerRef.current);
      scrollEndTimerRef.current = window.setTimeout(() => {
        scrollingRef.current = false;
        setHlTick((t) => t + 1);
        flushPendingWin();
        measureWin();
      }, 320);

      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const book = loadedRef.current;
        if (!book) return;
        const off = getOffsetPx();
        const w = winRef.current;

        // Which mounted part is at the viewport start, and how far through it?
        let cp = w.start;
        let tf = 0;
        const geom = partGeomRef.current;
        if (geom && geom.startIdx === w.start && geom.starts.length === w.end - w.start + 1) {
          for (let j = 0; j < geom.starts.length; j++) {
            const s = geom.starts[j];
            if (s <= off + 4) {
              cp = w.start + j;
              tf = Math.min(1, Math.max(0, (off - s) / geom.extents[j]));
            } else {
              break;
            }
          }
        } else {
          for (let i = w.start; i <= w.end; i++) {
            const pe = partEl(i);
            if (!pe) continue;
            const s = startOffset(pe);
            if (s <= off + 4) {
              cp = i;
              tf = Math.min(1, Math.max(0, (off - s) / extentOf(pe)));
            } else {
              break;
            }
          }
        }
        partRef.current = cp;
        localFracRef.current = tf;
        const g = globalFor(cp, tf);
        const priorMax = maxGlobalRef.current;
        updateGlobal(g);
        const viewportExtent =
          layoutRef.current.axis === 'y' ? el.clientHeight : el.clientWidth;
        if (priorMax !== null && g > priorMax + 0.0001) {
          const currentPart = partEl(cp);
          const screensInPart = currentPart
            ? Math.max(1, Math.ceil(extentOf(currentPart) / Math.max(1, viewportExtent)))
            : 1;
          countGardenPage(cp, Math.min(screensInPart - 1, Math.floor(tf * screensInPart)));
        }

        const now = performance.now();
        if (now - lastUi > 200) {
          lastUi = now;
          setProgress(g);
          setPart((p) => (p === cp ? p : cp));
          if (popupRef.current) setPopup(null);
        }
        if (now - lastSave > 1000) {
          lastSave = now;
          saveNow(g, tf);
        }

        // Sliding window: extend toward the edge being approached; trim when
        // the window gets long. All changes are queued until scroll settles,
        // except a pinch-grow when the reader is physically stuck at the bottom.
        if (!anchorRef.current && !pendingTargetRef.current) {
          const last = book.chapters.length - 1;
          const view = viewportExtent;
          const max = axisMax();
          const edge = Math.min(view * 2, max * 0.35);
          const stuckAtBottom = max > 8 && off >= max - 4;
          if (stuckAtBottom && pendingWinRef.current) flushPendingWin();
          if (max > view * 1.1 && w.end < last && off > max - edge) {
            queueWinMutation({ start: w.start, end: Math.min(last, w.end + 2) });
          } else if (w.start > 0 && off < edge) {
            queueWinMutation({ start: Math.max(0, w.start - 2), end: w.end });
          } else if (w.end - w.start >= 12) {
            const s = Math.max(0, cp - 4);
            const e2 = Math.min(last, cp + 4);
            if (s > w.start || e2 < w.end) queueWinMutation({ start: s, end: e2 });
          }
        }
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
      window.clearTimeout(scrollEndTimerRef.current);
    };
  }, [
    paged,
    loaded,
    getOffsetPx,
    partEl,
    startOffset,
    extentOf,
    globalFor,
    updateGlobal,
    saveNow,
    axisMax,
    queueWinMutation,
    flushPendingWin,
    measureWin,
    countGardenPage,
  ]);

  // ----- keyboard (page turns via shortcut manager; Escape local) -----
  useEffect(() => {
    const offs = [
      registerCommandHandler('reader.pageNext', (e) => {
        // Vertical layout: ArrowLeft is forward (RTL-style); manager may send ArrowRight.
        // Always flip forward for the registered pageNext binding.
        void e;
        flipRef.current(1);
      }),
      registerCommandHandler('reader.pagePrev', (e) => {
        void e;
        flipRef.current(-1);
      }),
    ];
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (popupRef.current) {
          setPopup(null);
          return;
        }
        if (linkViewRef.current || canLinkBackRef.current) {
          e.preventDefault();
          leaveLinkViewRef.current();
          return;
        }
        onClose();
        return;
      }
      if (
        (linkViewRef.current || canLinkBackRef.current) &&
        (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft'))
      ) {
        e.preventDefault();
        leaveLinkViewRef.current();
        return;
      }
      // Layout-aware horizontal arrows (not in the global defaults as L/R).
      const v = layoutRef.current.vertical;
      if (v && e.key === 'ArrowLeft' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        flipRef.current(1);
      } else if (v && e.key === 'ArrowRight' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        flipRef.current(-1);
      } else if (!v && e.key === 'ArrowRight' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // Covered by reader.pageNext defaults only if ArrowRight is bound — keep fallback
        // when user unbound pageNext but still expects arrows in reader.
        // Handled by manager when bound; no double-fire: manager preventDefaults first.
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      offs.forEach((off) => off());
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // ----- reading time + characters → statistics -----
  useEffect(() => {
    const flush = () => {
      const now = Date.now();
      let secs = (now - readStartRef.current) / 1000;
      readStartRef.current = now;
      if (!activeReadingRef.current || secs < 0 || secs > 3600) secs = 0;
      const chars = pendingCharsRef.current;
      pendingCharsRef.current = 0;
      if (secs > 0 || chars > 0) recordReading(item.id, titleRef.current, secs, chars);
    };
    const setActive = (on: boolean) => {
      if (on) {
        activeReadingRef.current = true;
        readStartRef.current = Date.now();
      } else {
        flush();
        activeReadingRef.current = false;
      }
    };
    activeReadingRef.current = true;
    readStartRef.current = Date.now();
    const iv = window.setInterval(flush, 20000);
    const onFocus = () => setActive(true);
    const onBlur = () => setActive(false);
    const onVis = () => setActive(!document.hidden);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(iv);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVis);
      flush();
    };
  }, [item.id]);

  const popupOpenOnDownRef = useRef(false);
  /** Skip dictionary lookup on the next mouseup (sentence-select chord just ran). */
  const skipLookupRef = useRef(false);
  /** Last pointer over the reader (for H when no selection / click target). */
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  /**
   * Precise offsets for the last clicked/looked-up word, relative to its
   * annotation block (.novel-part / .novel-content). Survives selection clear.
   */
  const lastAnnoTargetRef = useRef<{
    start: number;
    end: number;
    text: string;
    pi?: number;
  } | null>(null);

  type AnnoTarget = { text: string; start: number; end: number; block: HTMLElement };

  const annoBlockOf = useCallback((el: Element | null, root: HTMLElement): HTMLElement => {
    return (
      (el?.closest('.novel-part, .novel-content') as HTMLElement | null) ?? root
    );
  }, []);

  /** Offsets of a DOM Range inside an annotation block (textContent model). */
  const offsetsFromRange = useCallback(
    (block: HTMLElement, range: Range): AnnoTarget | null => {
      try {
        if (!block.contains(range.commonAncestorContainer) && range.commonAncestorContainer !== block) {
          // Still allow if start is inside block
          if (!block.contains(range.startContainer)) return null;
        }
        const pre = document.createRange();
        pre.selectNodeContents(block);
        pre.setEnd(range.startContainer, range.startOffset);
        const start = pre.toString().length;
        const raw = range.toString();
        const blockLen = (block.textContent ?? '').length;
        // A selection that runs past this block's own text (e.g. a long
        // sentence spanning two windowed .novel-part chunks) would otherwise
        // compute an out-of-range end and silently fail to render — clamp to
        // what this block actually contains.
        const end = Math.min(start + raw.length, blockLen);
        if (end <= start) return null;
        const text = (raw.trim() || raw).slice(0, 200);
        return { text, start, end, block };
      } catch {
        return null;
      }
    },
    [],
  );

  /** Offsets spanning one or more consecutive elements inside a block. */
  const offsetsFromElements = useCallback(
    (block: HTMLElement, els: HTMLElement[]): AnnoTarget | null => {
      if (!els.length) return null;
      const first = els[0]!;
      const last = els[els.length - 1]!;
      if (!block.contains(first) || !block.contains(last)) return null;
      try {
        const pre = document.createRange();
        pre.selectNodeContents(block);
        pre.setEndBefore(first);
        const start = pre.toString().length;
        const mid = document.createRange();
        mid.setStartBefore(first);
        mid.setEndAfter(last);
        const raw = mid.toString();
        const end = start + raw.length;
        if (end <= start) return null;
        const text = (raw.trim() || raw).slice(0, 200);
        return { text, start, end, block };
      } catch {
        return null;
      }
    },
    [],
  );

  /** Capture the currently marked lookup (.lookup-active / mark.lookup-mark). */
  const captureLookupAnnoTarget = useCallback(
    (root: HTMLElement): AnnoTarget | null => {
      const actives = Array.from(
        root.querySelectorAll<HTMLElement>('span.wk.lookup-active, mark.lookup-mark'),
      );
      if (!actives.length) return null;
      const block = annoBlockOf(actives[0]!, root);
      return offsetsFromElements(block, actives);
    },
    [annoBlockOf, offsetsFromElements],
  );

  /** Resolve a word at viewport coords (hover / last pointer). */
  const resolveWordAtPoint = useCallback(
    (root: HTMLElement, clientX: number, clientY: number): AnnoTarget | null => {
      const el = document.elementFromPoint(clientX, clientY);
      if (!el || !root.contains(el)) return null;

      const wk = el.closest('span.wk') as HTMLElement | null;
      if (wk && root.contains(wk)) {
        const block = annoBlockOf(wk, root);
        return offsetsFromElements(block, [wk]);
      }

      const doc = root.ownerDocument;
      const caret =
        doc.caretRangeFromPoint?.(clientX, clientY) ??
        (() => {
          const pos = (
            doc as Document & {
              caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
            }
          ).caretPositionFromPoint?.(clientX, clientY);
          if (!pos) return null;
          const r = doc.createRange();
          r.setStart(pos.offsetNode, pos.offset);
          r.collapse(true);
          return r;
        })();
      if (!caret) return null;
      const node = caret.startContainer;
      if (node.nodeType !== Node.TEXT_NODE) return null;
      const block = annoBlockOf(node.parentElement, root);
      if (!block.contains(node)) return null;
      const text = node.textContent ?? '';
      const off = caret.startOffset;
      const isWord = (ch: string) => /[一-龯ぁ-ゖァ-ヺー々ゝゞa-zA-Z0-9]/.test(ch);
      let a = off;
      let b = off;
      while (a > 0 && isWord(text[a - 1]!)) a--;
      while (b < text.length && isWord(text[b]!)) b++;
      if (b <= a) return null;
      try {
        const range = doc.createRange();
        range.setStart(node, a);
        range.setEnd(node, b);
        return offsetsFromRange(block, range);
      } catch {
        return null;
      }
    },
    [annoBlockOf, offsetsFromRange],
  );

  const rememberAnnoTarget = useCallback(
    (t: AnnoTarget | null) => {
      if (!t || t.end <= t.start) {
        lastAnnoTargetRef.current = null;
        return;
      }
      const partEl = t.block.closest?.('[data-pi]') as HTMLElement | null;
      const pi =
        partEl?.dataset.pi != null
          ? Number(partEl.dataset.pi)
          : paged
            ? partRef.current
            : undefined;
      lastAnnoTargetRef.current = {
        start: t.start,
        end: t.end,
        text: t.text,
        pi,
      };
    },
    [paged],
  );

  const onMouseUp = useCallback(
    (e: React.MouseEvent) => {
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      // Sentence-select keybind (e.g. Alt+MouseLeft) already selected text —
      // do not open dictionary on the same click.
      if (skipLookupRef.current) {
        skipLookupRef.current = false;
        return;
      }
      const dismissOnly = popupOpenOnDownRef.current && isLookupClick(e);
      const hit = lookupWordFromMouseUp(e);
      if (hit) {
        // Capture exact offsets NOW (before any later DOM/selection clear).
        const root = contentRef.current;
        if (root && !hit.translate) {
          const captured = captureLookupAnnoTarget(root) ?? resolveWordAtPoint(root, e.clientX, e.clientY);
          rememberAnnoTarget(captured);
        }
        setPopup({
          kind: hit.translate ? 'translate' : 'dict',
          query: hit.query,
          x: hit.x,
          y: hit.y,
          context: hit.context,
        });
        return;
      }
      if (dismissOnly) {
        lastAnnoTargetRef.current = null;
        setPopup(null);
      }
    },
    [captureLookupAnnoTarget, resolveWordAtPoint, rememberAnnoTarget],
  );

  /** Exit all in-app link history and show the EPUB again. */
  const exitLinkViewToBook = useCallback(() => {
    linkHistoryRef.current = [];
    setCanLinkBack(false);
    setLinkView(null);
    setTitle(item.title);
    setLinkBusy(false);
    linkBusyRef.current = false;
  }, [item.title]);

  /** One step back in link history, or return to the book. */
  const leaveLinkView = useCallback(() => {
    const prev = linkHistoryRef.current.pop();
    setCanLinkBack(linkHistoryRef.current.length > 0);
    if (!prev || prev.url === 'book://current' || !prev.bodyHtml) {
      exitLinkViewToBook();
      return;
    }
    setLinkView({ url: prev.url, title: prev.title, bodyHtml: prev.bodyHtml });
    setTitle(prev.title);
  }, [exitLinkViewToBook]);
  leaveLinkViewRef.current = leaveLinkView;

  const [linkStatus, setLinkStatus] = useState('');

  /**
   * When hyperlinks are enabled: Wikipedia → import as EPUB into the library
   * (and open in-app for reading). Other https → system browser.
   */
  const importWikiAsEpub = useCallback(
    async (url: string) => {
      if (linkBusyRef.current) return;
      linkBusyRef.current = true;
      setLinkBusy(true);
      setLinkStatus('Importing page as EPUB…');
      setPopup(null);
      try {
        const art = await fetchReadableArticle(url);
        const bodyHtml = articleBodyHtml(art.title, art.html, art.meta);
        const next = await window.api.importGenerated({
          title: art.title,
          html: bodyHtml,
          source: art.url,
        });
        // Open in-app for immediate reading (book stays under history).
        const cur = linkViewRef.current;
        if (cur) {
          linkHistoryRef.current.push({
            url: cur.url,
            title: cur.title,
            bodyHtml: cur.bodyHtml,
          });
        } else {
          linkHistoryRef.current.push({
            url: 'book://current',
            title: item.title,
            bodyHtml: '',
          });
        }
        setCanLinkBack(true);
        setLinkView({ url: art.url, title: art.title, bodyHtml });
        setTitle(art.title);
        const saved = next.find((i) => i.sourcePath === art.url) ?? next[0];
        setLinkStatus(saved ? `Saved to library: ${art.title}` : `Saved: ${art.title}`);
        window.setTimeout(() => setLinkStatus(''), 4000);
      } catch (err) {
        console.error(err);
        setLinkStatus(err instanceof Error ? err.message : 'Import failed');
        void window.api.openExternal(url);
        window.setTimeout(() => setLinkStatus(''), 5000);
      } finally {
        linkBusyRef.current = false;
        setLinkBusy(false);
      }
    },
    [item.title],
  );

  /** Intercept hyperlinks in EPUB / article HTML so the app window never leaves. */
  const onContentClick = useCallback(
    (e: React.MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href) return;

      // In-page anchors always work (navigation within the current document).
      if (href.startsWith('#')) {
        e.preventDefault();
        e.stopPropagation();
        const id = decodeURIComponent(href.slice(1));
        if (!id) return;
        const scope = (e.currentTarget as HTMLElement) ?? contentRef.current;
        const target =
          scope?.querySelector?.(`[id="${CSS.escape(id)}"]`) ?? document.getElementById(id);
        target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      // Master switch — when off, external / wiki links do nothing.
      if (!settingsRef.current.hyperlinksEnabled) {
        setLinkStatus('Hyperlinks disabled (enable in reader Aa settings)');
        window.setTimeout(() => setLinkStatus(''), 2500);
        return;
      }

      let resolved = href;
      try {
        resolved = resolveWikiUrl(href, a.href || a.baseURI || undefined);
      } catch {
        resolved = href;
      }

      if (/^https?:\/\//i.test(resolved)) {
        if (isJaWikiArticleUrl(resolved) || /wikipedia\.org/i.test(resolved)) {
          void importWikiAsEpub(resolved);
        } else {
          void window.api.openExternal(resolved);
        }
        return;
      }

      // Relative internal fragment (path#id)
      const hash = href.includes('#') ? href.slice(href.indexOf('#') + 1) : '';
      if (hash) {
        const scope = (e.currentTarget as HTMLElement) ?? contentRef.current;
        const el = scope?.querySelector?.(`[id="${CSS.escape(hash)}"]`);
        if (el) {
          el.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
      }
    },
    [importWikiAsEpub],
  );

  /**
   * Select full sentence at a click (or last pointer). Bound via
   * reader.selectSentence — default Alt+MouseLeft so it never fights dict click.
   */
  const selectSentenceAtClick = useCallback((e?: Event) => {
    const root = contentRef.current;
    if (!root) return false;
    let x = lastPointerRef.current?.x;
    let y = lastPointerRef.current?.y;
    if (e && 'clientX' in e) {
      const me = e as MouseEvent;
      x = me.clientX;
      y = me.clientY;
      lastPointerRef.current = { x: me.clientX, y: me.clientY };
    }
    if (x == null || y == null) return false;
    // Only act when the click is inside the reader content.
    const el = document.elementFromPoint(x, y);
    if (!el || !root.contains(el)) return false;
    const text = selectSentenceAtPoint(x, y);
    if (!text) return false;
    skipLookupRef.current = true;
    // Clear any stale lookup highlight so selection is the only emphasis.
    try {
      root.querySelectorAll('.lookup-active').forEach((n) => n.classList.remove('lookup-active'));
    } catch {
      /* ignore */
    }
    return true;
  }, []);

  /** Current selection or popup query → local collection (never Anki). */
  const addSelectionToCollection = useCallback(
    (mode: 'word' | 'sentence' | 'selection') => {
      const sel = window.getSelection()?.toString().trim() ?? '';
      let word = '';
      let sentence = '';
      if (mode === 'selection' && sel) {
        word = sel.slice(0, 80);
        sentence = sel.slice(0, 200);
      } else if (popupRef.current?.kind === 'dict') {
        word = popupRef.current.query;
        sentence = popupRef.current.context ?? '';
      } else if (sel) {
        word = sel.slice(0, 40);
        sentence = mode === 'sentence' ? sentenceAt(sel, 0, 200) : sel.slice(0, 200);
      } else {
        return;
      }
      if (!word) return;
      setPendingAdd({ word, sentence: sentence || undefined });
      setCollectionOpen(true);
    },
    [],
  );

  /**
   * Personal color highlight (annotations) — not vocabulary levels.
   * Priority: selection → last clicked word → live lookup mark → caret →
   * word under last pointer → popup query (surface search in correct part).
   */
  const highlightSelectionAsAnno = useCallback(() => {
    const root = contentRef.current;
    if (!root) return;

    let target: AnnoTarget | null = null;

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const text = sel.toString().trim();
      if (text) {
        const range = sel.getRangeAt(0);
        const block = annoBlockOf(
          range.startContainer.nodeType === Node.TEXT_NODE
            ? range.startContainer.parentElement
            : (range.startContainer as Element),
          root,
        );
        target = offsetsFromRange(block, range);
        if (!target) {
          const full = block.textContent ?? '';
          const idx = full.indexOf(text);
          if (idx >= 0) {
            target = {
              text: text.slice(0, 200),
              start: idx,
              end: idx + text.length,
              block,
            };
          }
        }
      }
    }

    // Remembered click (selection is usually cleared by click-to-lookup)
    if (!target && lastAnnoTargetRef.current) {
      const mem = lastAnnoTargetRef.current;
      let block: HTMLElement | null = null;
      if (mem.pi != null) {
        block = root.querySelector<HTMLElement>(`[data-pi="${mem.pi}"]`);
      }
      if (!block) {
        block = root.querySelector('.novel-part, .novel-content') ?? root;
      }
      // Prefer live lookup mark if it still matches the same surface form
      const live = captureLookupAnnoTarget(root);
      if (live && live.text === mem.text) {
        target = live;
      } else if (mem.end > mem.start) {
        target = {
          text: mem.text,
          start: mem.start,
          end: mem.end,
          block,
        };
      }
    }

    // Live lookup highlight (click mark still visible)
    if (!target) {
      target = captureLookupAnnoTarget(root);
    }

    // Hovered .wk (mouse still over word)
    if (!target) {
      const hovered = root.querySelector<HTMLElement>('span.wk:hover');
      if (hovered) {
        target = offsetsFromElements(annoBlockOf(hovered, root), [hovered]);
      }
    }

    // Collapsed caret → expand to Japanese/word under caret
    if (!target && sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      const block = annoBlockOf(
        node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element),
        root,
      );
      const wk =
        (node.nodeType === Node.TEXT_NODE
          ? node.parentElement
          : (node as Element)
        )?.closest?.('span.wk') as HTMLElement | null;
      if (wk && block.contains(wk)) {
        target = offsetsFromElements(block, [wk]);
      } else if (node.nodeType === Node.TEXT_NODE && block.contains(node)) {
        const text = node.textContent ?? '';
        const off = range.startOffset;
        const isWord = (ch: string) => /[一-龯ぁ-ゖァ-ヺー々ゝゞa-zA-Z0-9]/.test(ch);
        let a = off;
        let b = off;
        while (a > 0 && isWord(text[a - 1]!)) a--;
        while (b < text.length && isWord(text[b]!)) b++;
        if (b > a) {
          try {
            const r = document.createRange();
            r.setStart(node, a);
            r.setEnd(node, b);
            target = offsetsFromRange(block, r);
          } catch {
            /* ignore */
          }
        }
      }
    }

    // Word under last pointer position (hover without click)
    if (!target && lastPointerRef.current) {
      const { x, y } = lastPointerRef.current;
      target = resolveWordAtPoint(root, x, y);
    }

    // Popup query — search the part that had the click, use surface text only
    if (!target && popupRef.current?.kind === 'dict' && popupRef.current.query) {
      const q = popupRef.current.query.trim();
      const memPi = lastAnnoTargetRef.current?.pi;
      const candidates: HTMLElement[] = [];
      if (memPi != null) {
        const pe = root.querySelector<HTMLElement>(`[data-pi="${memPi}"]`);
        if (pe) candidates.push(pe);
      }
      root.querySelectorAll<HTMLElement>('.novel-part, .novel-content').forEach((el) => {
        if (!candidates.includes(el)) candidates.push(el);
      });
      if (!candidates.length) candidates.push(root);
      for (const block of candidates) {
        // Prefer surface of last mark if lemma ≠ surface
        const needle = lastAnnoTargetRef.current?.text || q;
        const full = block.textContent ?? '';
        const idx = full.indexOf(needle);
        if (idx >= 0) {
          target = {
            text: needle.slice(0, 200),
            start: idx,
            end: idx + needle.length,
            block,
          };
          break;
        }
        if (needle !== q) {
          const idx2 = full.indexOf(q);
          if (idx2 >= 0) {
            target = { text: q.slice(0, 200), start: idx2, end: idx2 + q.length, block };
            break;
          }
        }
      }
    }

    if (!target || target.end <= target.start) return;

    const partEl = target.block.closest?.('[data-pi]') as HTMLElement | null;
    const pi =
      partEl?.dataset.pi != null
        ? Number(partEl.dataset.pi)
        : paged
          ? partRef.current
          : undefined;

    // Keep last target in sync so repeated H is stable
    rememberAnnoTarget(target);

    // Toggle: pressing H again over an already-highlighted spot removes it,
    // instead of silently no-op'ing (the old dedup in addAnnotation) or
    // stacking a duplicate highlight underneath.
    const overlapping = annotations.filter(
      (a) => a.part === pi && a.startOffset < target!.end && a.endOffset > target!.start,
    );
    if (overlapping.length) {
      let list = annotations;
      for (const a of overlapping) list = removeAnnotation(item.id, a.id);
      setAnnotations(list);
      return;
    }

    setAnnotations(
      addAnnotation(item.id, {
        part: pi,
        startOffset: target.start,
        endOffset: target.end,
        text: target.text,
        color: annoColor,
      }),
    );
  }, [
    item.id,
    annoColor,
    annotations,
    paged,
    annoBlockOf,
    offsetsFromRange,
    offsetsFromElements,
    captureLookupAnnoTarget,
    resolveWordAtPoint,
    rememberAnnoTarget,
  ]);

  /** Locate the selection inside its reader block: block text + start offset. */
  const selectionInBlock = useCallback((): {
    full: string;
    start: number;
    text: string;
    pi?: number;
  } | null => {
    const selObj = window.getSelection();
    if (!selObj || selObj.rangeCount === 0 || selObj.isCollapsed) return null;
    const text = selObj.toString().trim();
    if (!text) return null;
    const range = selObj.getRangeAt(0);
    const block =
      (range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : (range.startContainer as Element)
      )?.closest('.novel-part, .novel-content') ?? contentRef.current;
    if (!block) return null;
    const full = block.textContent ?? '';
    const start = full.indexOf(text);
    if (start < 0) return null;
    const partEl = (block as HTMLElement).closest?.('[data-pi]') as HTMLElement | null;
    const pi =
      partEl?.dataset.pi != null ? Number(partEl.dataset.pi) : paged ? partRef.current : undefined;
    return { full, start, text, pi };
  }, [paged]);

  const annotateSentenceAroundSelection = useCallback(() => {
    const info = selectionInBlock();
    if (!info) return;
    const b = detectSentenceBounds(info.full, info.start);
    if (b.end <= b.start) return;
    setAnnotations(
      addAnnotation(item.id, {
        part: info.pi,
        startOffset: b.start,
        endOffset: b.end,
        text: info.full.slice(b.start, b.end).slice(0, 200),
        color: annoColor,
      }),
    );
  }, [selectionInBlock, item.id, annoColor]);

  /** Full sentence around the selection (or the popup's context sentence). */
  const currentSentence = useCallback((): string => {
    const info = selectionInBlock();
    if (info) {
      const b = detectSentenceBounds(info.full, info.start);
      return info.full.slice(b.start, b.end).trim();
    }
    return popupRef.current?.kind === 'dict' ? popupRef.current.context ?? '' : '';
  }, [selectionInBlock]);

  const currentWord = useCallback((): string => {
    const sel = window.getSelection()?.toString().trim() ?? '';
    return sel || (popupRef.current?.kind === 'dict' ? popupRef.current.query : '');
  }, []);

  /**
   * Hands the selection to the Agent as session-only context.
   *
   * The sentence around the selection travels as the preview, so the model sees
   * the fragment in its sentence rather than alone. Nothing is written to disk:
   * `selected-text` is above the retention floor, so this lives in main's session
   * context for the life of the process and no longer.
   *
   * `lang` is in the dependency list rather than `t` — `t`'s identity is stable by
   * design, so depending on it would go stale after a language switch instead of
   * erroring.
   */
  const askAgentAboutSelection = useCallback((): void => {
    const selection = currentWord();
    if (!selection) return;
    void handOffToAgent(
      selectedTextAgentContext(selection, currentSentence(), item.id),
      // The **book**, not the selection. A conversation title is persisted, and
      // titling it with the highlighted sentence would write the very `personal`
      // material the context item is refused permission to store — measured live,
      // where the sentence reached workspace-v1.json through the title while the
      // item itself correctly did not. The book's name is already in the library.
      t('agent.conversation.fromReading', { label: item.title }),
      // The reader is reached through the Library and is not a section of its
      // own, so Library is the honest place to offer going back to — it is where
      // the user's books are. The label is the section's own catalog name.
      routeAgentContext('library', t(AGENT_NAVIGATION_SECTION_LABEL_KEYS.library)),
    );
  }, [currentWord, currentSentence, item.id, item.title, lang]);

  /**
   * The paragraph the selection sits in.
   *
   * `selectionInBlock()` is deliberately *not* used for this. Its block resolution
   * ends at `.novel-part, .novel-content`, and in scroll mode there is no
   * `.novel-part`, so it falls back to the whole loaded chapter — measured live at
   * 1,684 characters for a six-character selection. A control that says "this
   * paragraph" must not hand over the entire page, so the nearest real paragraph
   * element is resolved here and the block is only the fallback.
   */
  const passageAroundSelection = useCallback((): string => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return '';
    const start = selection.getRangeAt(0).startContainer;
    const element = start.nodeType === Node.TEXT_NODE
      ? start.parentElement
      : (start as Element);
    const paragraph = element?.closest('p, li, blockquote, h1, h2, h3, h4, .novel-part');
    const text = (paragraph?.textContent ?? '').trim();
    return text || (selectionInBlock()?.full ?? '').trim();
  }, [selectionInBlock]);

  /**
   * The same gesture at paragraph scale: the paragraph around the selection rather
   * than the selection itself.
   *
   * It still needs a selection or caret to know *which* paragraph is meant, and
   * refuses rather than guessing when there is none.
   */
  const askAgentAboutPassage = useCallback((): void => {
    const passage = passageAroundSelection();
    if (!passage) return;
    void handOffToAgent(
      readingPassageAgentContext(passage, item.id),
      // The book, for the reason spelled out above: a title is persisted.
      t('agent.conversation.fromReading', { label: item.title }),
      routeAgentContext('library', t(AGENT_NAVIGATION_SECTION_LABEL_KEYS.library)),
    );
  }, [passageAroundSelection, item.id, item.title, lang]);

  /**
   * The document half of the shared ReadingLens pipeline.
   *
   * The lens is a separate always-on-top window main owns, so — exactly as in
   * `MangaReader.tsx`, `VisualNovelPanel.tsx`, `ImmersionContent.tsx` and
   * `MediaLensCaptureButton.tsx` — the only channel between the two renderers
   * is this `localStorage` slot on their shared origin.
   *
   * A reader with selectable text already has a dictionary popup, so what the
   * lens adds here is what selection cannot reach: a scanned page inside a PDF,
   * an image of a table or a diagram, furigana drawn into the artwork, and any
   * page a font renders without extractable text. `pdfLoader.ts` turns each PDF
   * page into a chapter of the same `LoadedEpub` shape, so both formats arrive
   * at one derivation.
   *
   * DECISION — `page` is the 1-based ordinal of the open **part**, never the
   * screen page inside it. For a PDF that ordinal IS the page number (the
   * loader emits one chapter per page, labelled `Page N`), which is what makes
   * a PDF capture addressable at all. For an EPUB the screen page is a function
   * of font size and window width, so writing it would produce a ref that
   * resolves somewhere else on the next launch. The section label carries the
   * finer position instead.
   *
   * Provenance only, no save-back: this reader's own store is annotations and
   * bookmarks, both keyed to a text range in the DOM, and a screen rectangle
   * cannot be converted into one — the same reason `bb165db8` gave for manga.
   */
  const captureWithLens = useCallback(async (): Promise<void> => {
    localStorage.setItem(LENS_CAPTURE_TARGET_KEY, JSON.stringify(buildDocumentCaptureTarget({
      documentId: item.id,
      title: item.title,
      // Only these two are reachable here: `isPdf` sniffs the bytes and
      // everything else goes to `loadEpub`. `text` belongs to a plain-text
      // importer, and claiming it from here would name the wrong loader.
      format: sourceIsPdfRef.current ? 'pdf' : 'epub',
      section: documentCaptureSection(loaded?.toc ?? [], partRef.current),
      page: documentCapturePage(partRef.current),
    })));
    await window.api.lensOpen('select');
  }, [loaded, item.id, item.title]);

  const openPopupFromSelection = useCallback(
    (kind: 'dict' | 'translate') => {
      const selObj = window.getSelection();
      if (!selObj || selObj.rangeCount === 0 || selObj.isCollapsed) return;
      const text = selObj.toString().trim();
      if (!text) return;
      const r = selObj.getRangeAt(0).getBoundingClientRect();
      setPopup({
        kind,
        query: kind === 'dict' ? text.slice(0, 40) : text.slice(0, 500),
        x: r.left,
        y: r.bottom,
        context: kind === 'dict' ? currentSentence() || undefined : undefined,
      });
    },
    [currentSentence],
  );

  // Metadata attached to clipboard-history entries copied from this reader
  // (book/chapter/position/language) — shown in the entry's expandable
  // "Reader details" section rather than cluttering the main card.
  const readerMetaNow = useCallback((): { book?: string; chapter?: string; position?: string } => {
    const toc = loaded?.toc ?? [];
    const chapter = [...toc].reverse().find((t) => t.chapterIndex <= partRef.current)?.label;
    return {
      book: title,
      chapter,
      position: `${Math.round(curGlobalRef.current * 100)}%`,
    };
  }, [loaded, title]);

  // Reader commands — registered with the central shortcut manager so every
  // binding is user-configurable (clipboard-only copy; collection never Anki).
  useEffect(() => {
    const offs = [
      registerCommandHandler('reader.copySentence', () => {
        const s = currentSentence();
        if (s) {
          void navigator.clipboard.writeText(s);
          recordReaderCopy(s, 'sentence', readerMetaNow());
        }
      }),
      registerCommandHandler('reader.copyWord', () => {
        const w = currentWord();
        if (w) {
          void navigator.clipboard.writeText(w);
          recordReaderCopy(w, 'word', readerMetaNow());
        }
      }),
      registerCommandHandler('reader.highlightWord', () => highlightSelectionAsAnno()),
      registerCommandHandler('reader.highlightSentence', () => annotateSentenceAroundSelection()),
      registerCommandHandler('reader.saveToCollection', () => addSelectionToCollection('selection')),
      registerCommandHandler('reader.selectSentence', (e) => {
        // Return false so other chords can run if we missed the reader text.
        return selectSentenceAtClick(e);
      }),
      registerCommandHandler('reader.dictLookup', () => openPopupFromSelection('dict')),
      registerCommandHandler('reader.translateSel', () => openPopupFromSelection('translate')),
      registerCommandHandler('reader.toggleTranslation', () => toggleTranslationVisibility()),
      registerCommandHandler('reader.fontUp', () => bumpFont(10)),
      registerCommandHandler('reader.fontDown', () => bumpFont(-10)),
      registerCommandHandler('reader.zoomReset', () =>
        setSettings((s) => ({ ...s, fontSize: clampFontSize(100) })),
      ),
    ];
    return () => offs.forEach((off) => off());
  }, [
    currentSentence,
    currentWord,
    highlightSelectionAsAnno,
    annotateSentenceAroundSelection,
    addSelectionToCollection,
    selectSentenceAtClick,
    openPopupFromSelection,
    bumpFont,
    readerMetaNow,
    toggleTranslationVisibility,
  ]);

  // Ctrl+H "Return home" → close the reader back to the desktop.
  useEffect(() => {
    const h = () => onClose();
    window.addEventListener('os:home', h);
    return () => window.removeEventListener('os:home', h);
  }, [onClose]);

  const wkClass = settings.wordHighlight ? 'wk-on' : 'wk-off';

  // ----- bookmarks -----
  const addCurrent = useCallback(() => {
    const lf = localFracRef.current;
    const g = curGlobalRef.current;
    let snippet = '';
    try {
      const el = scrollerRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const caret = document.caretRangeFromPoint?.(r.left + r.width / 2, r.top + r.height / 2);
        snippet = (caret?.startContainer?.textContent ?? '').replace(/\s+/g, '').slice(0, 30);
      }
    } catch {
      /* fall back to % */
    }
    const label = snippet || `${Math.round(g * 100)}%`;
    setBookmarks(
      addBookmark(item.id, {
        cfi: `p:${partRef.current}:${lf.toFixed(4)}`,
        label,
        percent: g,
        createdAt: Date.now(),
      }),
    );
  }, [item.id]);

  const jumpTo = useCallback(
    (cfi: string) => {
      setBookmarksOpen(false);
      const t = parseLoc(cfi);
      if (t) {
        goTo(t.part, t.frac);
        return;
      }
      const f = Number(cfi);
      if (Number.isFinite(f)) seekGlobal(Math.min(1, Math.max(0, f)));
    },
    [goTo, seekGlobal],
  );
  const removeAt = useCallback(
    (cfi: string) => setBookmarks(removeBookmark(item.id, cfi)),
    [item.id],
  );

  // ----- styles -----
  const theme = THEMES[settings.theme] ?? THEMES.light;
  const injectedCss = useMemo(() => {
    const imgCap = size.h > 0 ? `${Math.max(120, size.h - 2 * GUTTER - 48)}px` : '85vh';
    return [
      buildNovelCss(settings),
      `.novel-content a { color: ${theme.link} !important; }`,
      `.novel-content img, .novel-content svg, .novel-content image { max-height: ${imgCap}; }`,
      '.novel-content ::selection { background: #6c7bff; color: #fff; }',
    ].join('\n');
  }, [settings, theme.link, size.h]);

  const vm = Math.round(((size.h || 0) * settings.sideMargin) / 100); // vertical modes: top/bottom
  const hm = Math.round(((size.w || 0) * settings.sideMargin) / 100); // horizontal paged: sides

  let contentStyle: CSSProperties = {
    color: theme.fg,
    fontSize: `${settings.fontSize}%`,
    boxSizing: 'border-box',
  };
  if (vertical) {
    contentStyle = {
      ...contentStyle,
      writingMode: 'vertical-rl',
      height: '100%',
      // Paged: padding is owned by the layout effect (page-grid math).
      ...(paged ? {} : { padding: `${GUTTER + vm}px 16px` }),
    };
  } else if (paged) {
    const g = GUTTER + hm;
    contentStyle = {
      ...contentStyle,
      height: '100%',
      // padding owned by the layout effect; columns sized to match it.
      ...(size.w > 0
        ? { columnWidth: `${size.w - 2 * g}px`, columnGap: `${2 * g}px`, columnFill: 'auto' }
        : {}),
    };
  } else {
    contentStyle = {
      ...contentStyle,
      maxWidth: `${settings.contentWidth}rem`,
      margin: '0 auto',
      padding: `${GUTTER}px calc(${settings.sideMargin}% + ${GUTTER}px)`,
    };
  }

  const scrollerStyle: CSSProperties = {
    background: theme.bg,
    // The writing mode lives on the SCROLLER so the browser lays the overflow
    // out right-to-left: position 0 is the book's beginning (right edge).
    writingMode: vertical ? 'vertical-rl' : undefined,
    overflowX: paged ? 'hidden' : axis === 'x' ? 'auto' : 'hidden',
    overflowY: paged ? 'hidden' : axis === 'y' ? 'auto' : 'hidden',
  };

  const chapters = loaded?.chapters ?? [];
  const winParts: number[] = [];
  if (!paged && loaded) {
    for (let i = Math.max(0, win.start); i <= Math.min(chapters.length - 1, win.end); i++) {
      winParts.push(i);
    }
  }

  const readerMenus: MenuBarMenu[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'library', label: 'Return to library', icon: <Icon name="library" size={14} />, onSelect: onClose },
        {
          id: 'book',
          label: 'Back to book',
          icon: <Icon name="novels" size={14} />,
          disabled: !linkView,
          onSelect: exitLinkViewToBook,
        },
      ],
    },
    {
      id: 'navigate',
      label: 'Navigate',
      items: [
        {
          id: 'previous',
          label: 'Previous',
          icon: <Icon name="chevron" size={14} style={{ transform: 'rotate(180deg)' }} />,
          disabled: !!linkView || !loaded,
          onSelect: () => flip(-1),
        },
        {
          id: 'next',
          label: 'Next',
          icon: <Icon name="chevron" size={14} />,
          disabled: !!linkView || !loaded,
          onSelect: () => flip(1),
        },
        {
          id: 'back-link',
          label: 'Back through article history',
          disabled: !linkView && !canLinkBack,
          onSelect: leaveLinkView,
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        {
          id: 'settings',
          label: settingsOpen ? 'Hide reading settings' : 'Reading settings',
          icon: <Icon name="settings" size={14} />,
          onSelect: () => setSettingsOpen((o) => !o),
        },
        {
          id: 'bookmarks',
          label: bookmarksOpen ? 'Hide bookmarks' : 'Bookmarks',
          icon: <Icon name="bookmark" size={14} />,
          onSelect: () => setBookmarksOpen((o) => !o),
        },
        {
          id: 'collection',
          label: collectionOpen ? 'Hide collection' : 'Flashcard collection',
          icon: <Icon name="flashcards" size={14} />,
          onSelect: () => setCollectionOpen((o) => !o),
        },
      ],
    },
    {
      id: 'study',
      label: 'Study',
      items: [
        {
          id: 'bookmark-current',
          label: 'Bookmark current position',
          icon: <Icon name="bookmark" size={14} />,
          disabled: !loaded || !!linkView,
          onSelect: addCurrent,
        },
        {
          id: 'collect-selection',
          label: 'Collect selection',
          icon: <Icon name="flashcards" size={14} />,
          onSelect: () => addSelectionToCollection('selection'),
        },
        {
          // Translated even though its neighbours in this menu are not: the repo
          // rule is that new UI text goes through the catalog from the moment it
          // is written, so this does not join the hardcoded-string backlog.
          id: 'ask-agent-selection',
          label: t('epub.askAgent'),
          icon: <Icon name="sparkle" size={14} />,
          onSelect: askAgentAboutSelection,
        },
        {
          id: 'ask-agent-passage',
          label: t('epub.askAgentPassage'),
          icon: <Icon name="sparkle" size={14} />,
          onSelect: askAgentAboutPassage,
        },
        {
          id: 'lens-capture',
          label: t('epub.readWithLens'),
          icon: <Icon name="scan" size={14} />,
          // Nothing is loaded means nothing names the page, and the contract
          // drops a target whose document has no id or title on read.
          disabled: !loaded,
          onSelect: () => void captureWithLens(),
        },
      ],
    },
  ];
  const readerStatus = (
    <>
      <StatusBarField>{linkView ? 'Article view' : loaded ? 'Book view' : 'Loading'}</StatusBarField>
      <StatusBarField>{vertical ? 'Vertical' : 'Horizontal'}</StatusBarField>
      <StatusBarField>{paged ? 'Pages' : 'Scroll'}</StatusBarField>
      <StatusBarSpacer />
      {paged && pageCount > 1 && <StatusBarField>{page + 1}/{pageCount}</StatusBarField>}
      <StatusBarField>{Math.round((seek ?? progress) * 100)}%</StatusBarField>
    </>
  );

  return (
    <AppChrome menus={readerMenus} status={readerStatus} className="aero-reader-chrome">
    <div className={`reader${aero ? ' aero-reader' : ''}`}>
      <style>{injectedCss}</style>
      <div className="reader-bar">
        <button className="btn" onClick={onClose} title="Return to library">
          <Icon name="chevron" size={13} style={{ transform: 'rotate(180deg)', marginRight: 4, verticalAlign: '-2px' }} />
          Library
        </button>
        {(linkView || canLinkBack) && (
          <button
            type="button"
            className="btn"
            title="Back to previous page or book (Alt+← / Backspace / Esc)"
            onClick={leaveLinkView}
          >
            <Icon name="chevron" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
            Back
          </button>
        )}
        {linkView && (
          <button type="button" className="btn" title="Close article and return to the book" onClick={exitLinkViewToBook}>
            Book
          </button>
        )}
        <div className="reader-title">{title}</div>
        <div className="reader-controls">
          {!linkView && (
            <>
          <button className="btn" onClick={() => flip(-1)}>
            ‹ Prev
          </button>
          <button className="btn" onClick={() => flip(1)}>
            Next ›
          </button>
            </>
          )}
          <div className="settings-anchor">
            <button
              className={`btn ${bookmarksOpen ? 'active' : ''}`}
              title="Bookmarks"
              onClick={() => setBookmarksOpen((o) => !o)}
            >
              <Icon name="bookmark" size={14} />
            </button>
            {bookmarksOpen && (
              <>
                <div className="panel-backdrop" onClick={() => setBookmarksOpen(false)} />
                <div className="settings-panel bookmarks-panel">
                  <div className="bm-head">
                    <span>Bookmarks</span>
                    <button className="btn small primary" onClick={addCurrent}>
                      + Add here
                    </button>
                  </div>
                  {bookmarks.length === 0 ? (
                    <div className="bm-empty">
                      No bookmarks yet. “+ Add here” saves your spot so you can jump back later.
                    </div>
                  ) : (
                    <ul className="bm-list">
                      {bookmarks.map((b) => (
                        <li key={b.cfi} className="bm-row">
                          <button className="bm-jump" title="Jump here" onClick={() => jumpTo(b.cfi)}>
                            <span className="bm-pct">{Math.round(b.percent * 100)}%</span>
                            <span className="bm-label">{b.label}</span>
                          </button>
                          <button className="bm-del" title="Remove" onClick={() => removeAt(b.cfi)}>
                            <Icon name="close" size={12} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="settings-anchor">
            <button
              type="button"
              className={`btn ${translateOpen ? 'active' : ''}`}
              title={t('epub.translate.panelTitle')}
              onClick={() => setTranslateOpen((open) => !open)}
            >
              <Icon name="translate" size={14} />
            </button>
            <button
              type="button"
              className={`btn ${translateMode !== 'original' ? 'active' : ''}`}
              title={t('epub.translate.toggleVisibility')}
              onClick={() => toggleTranslationVisibility()}
            >
              <Icon name="eye" size={14} />
            </button>
            {/* Also in the Study menu — but that menu only exists under the Aero
                and Wired material sets (`AppChrome` renders bare children when
                `useAppMaterialSet()` is null), so a menu-only control is dead in
                the default theme. This toolbar renders in every theme. */}
            <button
              type="button"
              className="btn"
              title={t('epub.readWithLens')}
              disabled={!loaded}
              onClick={() => void captureWithLens()}
            >
              <Icon name="scan" size={14} />
            </button>
            {translateOpen && (
              <>
                <div className="panel-backdrop" onClick={() => setTranslateOpen(false)} />
                <div className="settings-panel epub-translate-panel">
                  <div className="epub-translate-head">
                    <strong>{t('epub.translate.title')}</strong>
                    <span className="muted">{sourceLang.toUpperCase()} → {targetLang.toUpperCase()}</span>
                  </div>
                  <label>
                    {t('epub.translate.target')}
                    <select
                      value={targetLang}
                      onChange={(event) => setTranslateTarget(event.target.value)}
                    >
                      {KNOWN_LANGS.filter((l) => l.code !== sourceLang).map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.nativeLabel}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('epub.translate.view')}
                    <select
                      value={translateMode}
                      onChange={(event) => onTranslateModeChange(event.target.value as EpubTranslateMode)}
                    >
                      <option value="original">{t('epub.translate.view.original')}</option>
                      <option value="translation">{t('epub.translate.view.translation')}</option>
                      <option value="bilingual">{t('epub.translate.view.bilingual')}</option>
                    </select>
                  </label>
                  <button
                    className="btn small"
                    type="button"
                    onClick={() => toggleTranslationVisibility()}
                  >
                    {translateMode === 'original'
                      ? t('epub.translate.show')
                      : t('epub.translate.hide')}
                  </button>
                  <label className="epub-translate-check">
                    <input
                      type="checkbox"
                      checked={autoTranslate}
                      onChange={(event) => setAutoTranslate(event.target.checked)}
                    />
                    {t('epub.translate.auto')}
                  </label>
                  <button className="btn small" disabled={translateBusy || !loaded} onClick={() => void translateCurrentChapter()}>
                    {t('epub.translate.currentChapter')}
                  </button>
                  <button
                    className="btn small"
                    disabled={translateBusy || !loaded || part >= (loaded?.chapters.length ?? 1) - 1}
                    onClick={() => void translateAhead()}
                  >
                    {t('epub.translate.ahead')}
                  </button>
                  {bookTranslateProgress ? (
                    <button className="btn small" onClick={stopBookTranslate}>
                      {t('epub.translate.stop', {
                        done: bookTranslateProgress.done,
                        total: bookTranslateProgress.total,
                      })}
                      {bookTranslateProgress.blockTotal
                        ? ` · ${bookTranslateProgress.blockDone ?? 0}/${bookTranslateProgress.blockTotal}`
                        : ''}
                    </button>
                  ) : (
                    <button className="btn small primary" disabled={translateBusy || !loaded} onClick={() => void translateWholeBook()}>
                      {t('epub.translate.fullBook')}
                    </button>
                  )}
                  <div className="epub-translate-range">
                    <span className="epub-translate-range-label">{t('epub.translate.chapterRange')}</span>
                    <div className="epub-translate-range-row">
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, loaded?.toc.length || loaded?.chapters.length || 1)}
                        value={chapterRangeFrom}
                        disabled={translateBusy || !loaded}
                        onChange={(e) => setChapterRangeFrom(Number(e.target.value) || 1)}
                        aria-label={t('epub.translate.rangeFrom')}
                      />
                      <span className="muted">–</span>
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, loaded?.toc.length || loaded?.chapters.length || 1)}
                        value={chapterRangeTo}
                        disabled={translateBusy || !loaded}
                        onChange={(e) => setChapterRangeTo(Number(e.target.value) || 1)}
                        aria-label={t('epub.translate.rangeTo')}
                      />
                      <button
                        className="btn small"
                        disabled={translateBusy || !loaded}
                        onClick={() => void translateSelectedChapters()}
                      >
                        {t('epub.translate.runRange')}
                      </button>
                    </div>
                    <p className="muted epub-translate-range-hint">
                      {t('epub.translate.chapterRange.hint', {
                        max: Math.max(1, loaded?.toc.length || loaded?.chapters.length || 1),
                      })}
                    </p>
                  </div>
                  <div className="epub-translate-range">
                    <span className="epub-translate-range-label">{t('epub.translate.pageRange')}</span>
                    <div className="epub-translate-range-row">
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, loaded?.chapters.length || 1)}
                        value={pageRangeFrom}
                        disabled={translateBusy || !loaded}
                        onChange={(e) => setPageRangeFrom(Number(e.target.value) || 1)}
                        aria-label={t('epub.translate.rangeFrom')}
                      />
                      <span className="muted">–</span>
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, loaded?.chapters.length || 1)}
                        value={pageRangeTo}
                        disabled={translateBusy || !loaded}
                        onChange={(e) => setPageRangeTo(Number(e.target.value) || 1)}
                        aria-label={t('epub.translate.rangeTo')}
                      />
                      <button
                        className="btn small"
                        disabled={translateBusy || !loaded}
                        onClick={() => void translateSelectedPages()}
                      >
                        {t('epub.translate.runRange')}
                      </button>
                    </div>
                    <p className="muted epub-translate-range-hint">
                      {t('epub.translate.pageRange.hint', {
                        max: Math.max(1, loaded?.chapters.length || 1),
                        current: part + 1,
                      })}
                    </p>
                  </div>
                  {translateStatus && <p className="muted epub-translate-status">{translateStatus}</p>}
                </div>
              </>
            )}
          </div>
          <div className="settings-anchor">
            <button
              className={`btn ${settingsOpen ? 'active' : ''}`}
              title="Reading settings"
              onClick={() => setSettingsOpen((o) => !o)}
            >
              Aa
            </button>
            {settingsOpen && (
              <>
                <div className="panel-backdrop" onClick={() => setSettingsOpen(false)} />
                <ReaderSettingsPanel settings={settings} onChange={setSettings} />
              </>
            )}
          </div>
          <div className="reader-anno-swatches" title="Personal highlight color — press H on a word or selection">
            {ANNO_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`reader-anno-swatch anno-${c}${annoColor === c ? ' active' : ''}`}
                title={c}
                onClick={() => setAnnoColor(c)}
              />
            ))}
          </div>
          <button
            type="button"
            className="btn small"
            title="Add selection to collection (Ctrl+Shift+S)"
            onClick={() => addSelectionToCollection('selection')}
          >
            Collect
          </button>
          {/*
            The AppChrome "Study" menu carries this action too, but that menu bar
            is not rendered when the reader is embedded in the desktop shell —
            measured live, where no element with the text "Study" exists at all.
            "Collect" is duplicated here for exactly the same reason, so the
            hand-off follows it rather than being reachable only in one embedding.
          */}
          <button
            type="button"
            className="btn small"
            title={t('epub.askAgent')}
            aria-label={t('epub.askAgent')}
            onClick={askAgentAboutSelection}
          >
            <Icon name="sparkle" size={14} />
          </button>
          {/*
            A separate icon rather than a second `sparkle`: two identical buttons
            side by side would be a coin toss. Selection sends the fragment, this
            sends the paragraph around it — different questions, so they read as
            different controls.
          */}
          <button
            type="button"
            className="btn small"
            title={t('epub.askAgentPassage')}
            aria-label={t('epub.askAgentPassage')}
            onClick={askAgentAboutPassage}
          >
            <Icon name="note" size={14} />
          </button>
          <button
            type="button"
            className={`btn ${collectionOpen ? 'active' : ''}`}
            title="Flashcard collection"
            onClick={() => setCollectionOpen((o) => !o)}
          >
            <Icon name="flashcards" size={14} />
          </button>
        </div>
      </div>

      <div className="reader-stage" style={{ background: theme.bg }}>
        {loading && !linkView && (
          <div className="reader-msg">
            {pdfProgress != null
              ? `Reading PDF… ${Math.round(pdfProgress * 100)}%`
              : 'Opening book…'}
          </div>
        )}
        {error && !linkView && <div className="reader-msg error">{error}</div>}
        {linkBusy && <div className="reader-msg">Importing article…</div>}
        {linkStatus && !linkBusy && (
          <div className="reader-link-status" role="status">
            {linkStatus}
          </div>
        )}

        {linkView ? (
          <div
            className="novel-scroller novel-link-view"
            onClick={onContentClick}
            onMouseDown={(e) => {
              popupOpenOnDownRef.current = !!popupRef.current;
              noteLookupPointerDown(e);
              lastPointerRef.current = { x: e.clientX, y: e.clientY };
            }}
            data-dict-owner=""
            onMouseUp={onMouseUp}
          >
            <div
              className={`novel-content novel-link-article ${wkClass}`}
              style={contentStyle}
              lang="ja"
              dangerouslySetInnerHTML={{ __html: linkView.bodyHtml }}
            />
          </div>
        ) : (
          <div
            ref={scrollerRef}
            className="novel-scroller"
            style={scrollerStyle}
            onClick={onContentClick}
            onMouseDown={(e) => {
              popupOpenOnDownRef.current = !!popupRef.current;
              noteLookupPointerDown(e);
              lastPointerRef.current = { x: e.clientX, y: e.clientY };
            }}
            onMouseMove={(e) => {
              lastPointerRef.current = { x: e.clientX, y: e.clientY };
            }}
            data-dict-owner=""
            onMouseUp={onMouseUp}
          >
            {paged ? (
              <div
                key={`p${part}`}
                ref={contentRef}
                className={`novel-content novel-translate-${translateMode} ${wkClass}${settings.hyperlinksEnabled ? '' : ' links-off'}`}
                style={contentStyle}
                lang="ja"
                dangerouslySetInnerHTML={chapterHtml[part] ?? EMPTY_HTML}
              />
            ) : (
              <div
                key="scrollwin"
                ref={contentRef}
                className={`novel-content novel-translate-${translateMode} ${wkClass}${settings.hyperlinksEnabled ? '' : ' links-off'}`}
                style={contentStyle}
                lang="ja"
              >
                {winParts.map((i) => (
                  <div
                    key={i}
                    className="novel-part"
                    data-pi={i}
                    dangerouslySetInnerHTML={chapterHtml[i] ?? EMPTY_HTML}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <ReaderCollectionPanel
          bookId={item.id}
          bookTitle={item.title}
          open={collectionOpen}
          onClose={() => setCollectionOpen(false)}
          pendingAdd={pendingAdd}
          onPendingConsumed={() => setPendingAdd(null)}
        />
      </div>

      <div className="reader-footer">
        <select
          className="chapter-select"
          value=""
          title="Jump to chapter"
          onChange={(e) => e.target.value !== '' && goTo(Number(e.target.value), 0)}
        >
          <option value="" disabled>
            {loaded?.toc.length ? 'Jump to chapter…' : 'Chapters'}
          </option>
          {loaded?.toc.map((t, i) => (
            <option key={i} value={t.chapterIndex}>
              {'　'.repeat(t.depth)}
              {t.label}
            </option>
          ))}
        </select>
        <input
          className="reader-seek"
          type="range"
          min={0}
          max={1000}
          value={Math.round((seek ?? progress) * 1000)}
          disabled={!loaded}
          title={t('novel.seek')}
          aria-label={t('a11y.slider.readingPosition')}
          onChange={(e) => setSeek(Number(e.target.value) / 1000)}
          onPointerUp={() => {
            if (seek != null) {
              seekGlobal(seek);
              setSeek(null);
            }
          }}
          onKeyUp={() => {
            if (seek != null) {
              seekGlobal(seek);
              setSeek(null);
            }
          }}
        />
        {paged && pageCount > 1 && (
          <span className="reader-pagecount muted">
            {page + 1}/{pageCount}
          </span>
        )}
        <span className="reader-pct muted">{Math.round((seek ?? progress) * 100)}%</span>
      </div>

      {popup &&
        (popup.kind === 'translate' ? (
          <SentenceTranslatePopup text={popup.query} onClose={() => setPopup(null)} />
        ) : (
          <DictionaryPopup
            query={popup.query}
            x={popup.x}
            y={popup.y}
            context={popup.context}
            onClose={() => setPopup(null)}
          />
        ))}
    </div>
    </AppChrome>
  );
}
