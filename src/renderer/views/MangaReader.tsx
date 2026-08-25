import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { getTranslateTarget, setTranslateTarget } from '../translateTarget';
import type { LibraryItem } from '../../shared/types';
import {
  progressFromReadingLocator,
  readingLocatorFromProgress,
} from '../../shared/readingLibraryAdapter';
import type { MokuroBlock, MokuroBlockKind, MokuroBox, MokuroPage } from '../../shared/mokuroTypes';
import { formatBytes } from '../../shared/assetRegistry';
import DictionaryPopup from '../components/DictionaryPopup';
import SentenceTranslatePopup from '../components/SentenceTranslatePopup';
import MangaOcrOverlay from '../components/MangaOcrOverlay';
import MangaHandwritingPopup from '../components/MangaHandwritingPopup';
import MangaViewModeSwitcher, {
  loadMangaViewMode,
  saveMangaViewMode,
  type MangaViewMode,
} from '../components/manga/MangaViewModeSwitcher';
import MangaCleanTextView from '../components/manga/MangaCleanTextView';
import MangaCompareView from '../components/manga/MangaCompareView';
import RegionEditorModal from '../components/manga/RegionEditorModal';
import MangaRegionDrawLayer from '../components/manga/MangaRegionDrawLayer';
import MangaSidebar from '../components/manga/MangaSidebar';
import { ReadingCanvas, type ReadingCanvasTool } from '../components/liquid/ReadingCanvas';
import { READING_CANVAS_FILL_POLICY } from '../../shared/liquidReadingCanvas';
import Icon from '../components/Icons';
import { runOcr, type OcrLang } from '../ocr';
import {
  buildMangaCaptureTarget,
  LENS_CAPTURE_TARGET_KEY,
} from '../../shared/lensCaptureTarget';
import { stripFuriganaFragments } from '../../shared/mangaOcrText';
import { lookupWordFromMouseUp, isLookupClick, noteLookupPointerDown } from '../wordLookup';
import { registerCommandHandler } from '../keyboardShortcuts';
import { useAssetInstalled } from '../assetStore';
import { useT } from '../i18n';
import { KNOWN_LANGS } from '../../shared/langs';
import { getActiveProfile } from '../profileState';
import { medianBorderColor } from '../mangaBubbleFill';
import { getZoomFactor } from '../appZoom';
import MangaReaderSettingsPanel from '../components/manga/MangaReaderSettingsPanel';
import {
  loadMangaReaderSettings,
  saveMangaReaderSettings,
  type MangaReaderSettings,
} from '../mangaReaderSettings';
import { mangaPageFitStyles } from '../mangaPageFit';

type OcrStatus = 'idle' | 'scanning' | 'done' | 'error';

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 4;

interface Props {
  item: LibraryItem;
  onClose: () => void;
}

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

/** Flatten a page's blocks into the side-panel text string, in their given order. */
function pageToOcrText(page: MokuroPage): string {
  return page.blocks
    .filter((b) => b.kind !== 'ignore')
    .map((b) => b.lines.join('\n'))
    .join('\n\n');
}

/** Pick the block whose box overlaps the drawn rectangle most (after main clamps/rounds). */
function findBlockNearBox(page: MokuroPage, box: MokuroBox): MokuroBlock | null {
  const xmin = Math.min(box[0], box[2]);
  const ymin = Math.min(box[1], box[3]);
  const xmax = Math.max(box[0], box[2]);
  const ymax = Math.max(box[1], box[3]);
  let best: MokuroBlock | null = null;
  let bestArea = -1;
  for (const b of page.blocks) {
    const ix0 = Math.max(xmin, b.box[0]);
    const iy0 = Math.max(ymin, b.box[1]);
    const ix1 = Math.min(xmax, b.box[2]);
    const iy1 = Math.min(ymax, b.box[3]);
    const area = Math.max(0, ix1 - ix0) * Math.max(0, iy1 - iy0);
    if (area > bestArea) {
      bestArea = area;
      best = b;
    }
  }
  return bestArea > 0 ? best : null;
}

/**
 * Shared translation target (same key as EPUB / Translate view). Never equals
 * the study/source language so Japanese UI cannot produce JA→JA duplicates.
 */
function mangaTargetLang(): string {
  const source = getActiveProfile().targetLang;
  const saved = getTranslateTarget();
  if (saved === source) return source === 'en' ? 'ru' : 'en';
  return saved;
}

function writeMangaTargetLang(code: string): void {
  setTranslateTarget(code);
}

/**
 * The saved page, read through the canonical reading model (Phase 5) rather
 * than off `progress.page` directly. The projection refuses a position stored
 * in a form this format cannot mean, so a corrupt or cross-format save opens at
 * page 0 instead of somewhere that does not mean what it says.
 */
function savedPageIndex(item: LibraryItem): number {
  const locator = readingLocatorFromProgress(item, item.progress);
  return locator?.kind === 'page' ? locator.index : 0;
}

export default function MangaReader({ item, onClose }: Props) {
  const { t } = useT();
  const sourceLang = getActiveProfile().targetLang;
  const [targetLang, setTargetLang] = useState(() => mangaTargetLang());
  const targetLangRef = useRef(targetLang);
  targetLangRef.current = targetLang;
  const [pages, setPages] = useState<string[]>([]);
  const [idx, setIdx] = useState(() => savedPageIndex(item));
  const [mangaSettings, setMangaSettingsState] = useState<MangaReaderSettings>(() => loadMangaReaderSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [scrub, setScrub] = useState<number | null>(null);

  const updateMangaSettings = useCallback((patch: Partial<MangaReaderSettings>) => {
    setMangaSettingsState((prev) => {
      const next: MangaReaderSettings = { ...prev, ...patch };
      saveMangaReaderSettings(next);
      return next;
    });
  }, []);

  const [ocrOpen, setOcrOpen] = useState(false);
  const [viewMode, setViewMode] = useState<MangaViewMode>(() => loadMangaViewMode());
  const [sidePanel, setSidePanel] = useState(() => loadMangaReaderSettings().showSidebarByDefault);
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>('idle');
  const [ocrProgress, setOcrProgress] = useState(0);
  const [volumeBusy, setVolumeBusy] = useState(false);
  const [volumeProgress, setVolumeProgress] = useState<{
    phase: string;
    pageIndex: number;
    pageTotal: number;
    message?: string;
  } | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [ocrError, setOcrError] = useState('');
  const [ocrIsFallback, setOcrIsFallback] = useState(false);
  const [ocrLang, setOcrLang] = useState<OcrLang>('jpn_vert');
  const [mokuroPage, setMokuroPage] = useState<MokuroPage | null>(null);
  const [showSfx, setShowSfx] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [hoverRegionId, setHoverRegionId] = useState<string | null>(null);
  const [editingRegionId, setEditingRegionId] = useState<string | null>(null);
  const [handwritingOpen, setHandwritingOpen] = useState(false);
  const [regionBusy, setRegionBusy] = useState(false);
  const [drawRegionMode, setDrawRegionMode] = useState(false);
  const [pageNatSize, setPageNatSize] = useState<{ w: number; h: number } | null>(null);
  const [splitAxis, setSplitAxis] = useState<'x' | 'y'>('y');
  const [splitFraction, setSplitFraction] = useState(0.5);
  const pageWrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  /** Mark intentional page changes so TTB can scrollIntoView without fighting native scroll. */
  const ttbNavIntent = useRef(false);
  const idxRef = useRef(idx);
  idxRef.current = idx;
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const [showTranslated, setShowTranslated] = useState(false);
  const [translatedPage, setTranslatedPage] = useState<MokuroPage | null>(null);
  const [fillByRegion, setFillByRegion] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState('');
  const [pageRangeFrom, setPageRangeFrom] = useState(1);
  const [pageRangeTo, setPageRangeTo] = useState(1);
  const [chapterRangeFrom, setChapterRangeFrom] = useState(1);
  const [chapterRangeTo, setChapterRangeTo] = useState(1);
  // Same shape as the novel reader's popup state: a word click opens the
  // dictionary, a phrase/sentence selection opens the sentence translator.
  const [popup, setPopup] = useState<{
    kind: 'dict' | 'translate';
    query: string;
    x: number;
    y: number;
    context?: string;
  } | null>(null);
  const popupRef = useRef(popup);
  popupRef.current = popup;
  const popupOpenOnDownRef = useRef(false);
  const mediaUrlRef = useRef<string | null>(null);

  // The page-load effect needs the *latest* scan/translate helpers, but their
  // identities change on nearly every render (they close over idx, translating,
  // showSfx…). Depending on them directly would re-fire the effect mid-translate
  // and loop, so route through refs and keep the effect's deps stable.
  const scanRef = useRef<((force?: boolean) => Promise<MokuroPage | null>) | null>(null);
  const translateRef = useRef<((page: MokuroPage) => Promise<boolean>) | null>(null);
  const volumeBusyRef = useRef(false);
  volumeBusyRef.current = volumeBusy;
  const autoTranslateRef = useRef(true);
  autoTranslateRef.current = mangaSettings.autoTranslate;
  /** One background volume analyze per reader open. */
  const autoVolumeStartedRef = useRef(false);

  const mangaOcrAsset = useAssetInstalled('manga-ocr');
  const detectorAsset = useAssetInstalled('comic-text-detector');
  const decoderAsset = useAssetInstalled('manga-ocr-decoder');
  const vocabAsset = useAssetInstalled('manga-ocr-vocab');

  useEffect(() => {
    window.api.getMangaPages(item.id).then((p) => {
      setPages(p);
      ttbNavIntent.current = true;
      setIdx(Math.min(savedPageIndex(item), Math.max(0, p.length - 1)));
    });
  }, [item.id]);

  // Page-fit % only works against a definite stage box; measure it in px.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      setStageSize({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pages.length]);

  useEffect(() => {
    let alive = true;
    void window.api.mangaOcrAvailable().then((ok) => {
      if (alive) setEngineReady(ok);
    });
    const off = window.api.onAssetStatus(() => {
      void window.api.mangaOcrAvailable().then((ok) => {
        if (alive) setEngineReady(ok);
      });
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  const spreadCount = Math.max(1, mangaSettings.spreadPageCount);
  const spreadOffset = Math.min(Math.max(0, mangaSettings.spreadPageOffset), Math.max(0, spreadCount - 1));

  /** Every page index that renders together with `pageIdx` in the current spread. */
  const spreadIndicesFor = useCallback(
    (pageIdx: number): number[] => {
      if (spreadCount <= 1 || pageIdx < spreadOffset) return [pageIdx];
      const rel = pageIdx - spreadOffset;
      const groupStart = spreadOffset + Math.floor(rel / spreadCount) * spreadCount;
      const out: number[] = [];
      for (let i = 0; i < spreadCount && groupStart + i < pages.length; i++) out.push(groupStart + i);
      return out;
    },
    [spreadCount, spreadOffset, pages.length],
  );

  const jumpToPage = useCallback((page: number) => {
    if (mangaSettings.resetScrollOnFlip) ttbNavIntent.current = true;
    setIdx(Math.min(Math.max(page, 0), Math.max(0, pages.length - 1)));
  }, [pages.length, mangaSettings.resetScrollOnFlip]);

  /** `delta` is in READING order (negative = earlier, positive = later) — always, regardless of layout. */
  const go = useCallback(
    (delta: number) => {
      if (mangaSettings.resetScrollOnFlip) ttbNavIntent.current = true;
      setIdx((i) => {
        const groupStart = i < spreadOffset ? i : spreadOffset + Math.floor((i - spreadOffset) / spreadCount) * spreadCount;
        const step = spreadCount * (delta < 0 ? -1 : 1);
        return Math.min(Math.max(groupStart + step, 0), Math.max(0, pages.length - 1));
      });
    },
    [pages.length, spreadCount, spreadOffset, mangaSettings.resetScrollOnFlip],
  );

  const bumpZoom = useCallback((delta: number) => {
    setZoom((z) => clampZoom(z + delta));
  }, []);

  const scanWithMangaOcr = useCallback(
    async (force = false): Promise<MokuroPage | null> => {
      const url = pages[idx];
      if (!url) return null;
      mediaUrlRef.current = url;
      setOcrOpen(true);
      setOcrStatus('scanning');
      setOcrProgress(0);
      setOcrError('');
      setOcrText('');
      setOcrIsFallback(false);
      setEditingRegionId(null);
      try {
        const page = await window.api.mangaOcrScanPage({
          itemId: item.id,
          mediaUrl: url,
          force,
          detectionSensitivity: mangaSettings.detectionSensitivity,
        });
        setMokuroPage(page);
        setOcrText(pageToOcrText(page));
        setOcrStatus(page.blocks.some((b) => b.lines.some((l) => l.trim())) ? 'done' : 'error');
        if (!page.blocks.some((b) => b.lines.some((l) => l.trim()))) {
          setOcrError(t('manga.ocr.noText'));
        }
        setOcrProgress(1);
        setTranslatedPage(null);
        setShowTranslated(false);
        setFillByRegion({});
        return page;
      } catch (err) {
        console.error(err);
        setOcrError(err instanceof Error ? err.message : t('manga.ocr.failed'));
        setOcrStatus('error');
        return null;
      }
    },
    [pages, idx, item.id, t, mangaSettings.detectionSensitivity],
  );
  scanRef.current = scanWithMangaOcr;

  const scanWithTesseract = useCallback(
    async (lang: OcrLang) => {
      const url = pages[idx];
      if (!url) return;
      setOcrOpen(true);
      setSidePanel(true);
      setOcrStatus('scanning');
      setOcrProgress(0);
      setOcrError('');
      setOcrText('');
      setOcrIsFallback(true);
      setMokuroPage(null);
      try {
        const dataUrl = await window.api.readMangaPage(url);
        if (!dataUrl) throw new Error(t('manga.ocr.readFailed'));
        const text = stripFuriganaFragments(await runOcr(dataUrl, lang, setOcrProgress), true);
        setOcrText(text);
        setOcrStatus(text.trim() ? 'done' : 'error');
        if (!text.trim()) setOcrError(t('manga.ocr.noText'));
      } catch (err) {
        console.error(err);
        setOcrError(err instanceof Error ? err.message : t('manga.ocr.failed'));
        setOcrStatus('error');
      }
    },
    [pages, idx, t],
  );

  /**
   * The manga half of the shared ReadingLens pipeline, parked the same way the
   * visual-novel panel parks its own target: the lens is a separate always-on-top
   * window owned by main, so the only channel between the two renderers is this
   * `localStorage` slot on their shared origin.
   *
   * Manga parks provenance and nothing more. The novel additionally offers a
   * save-back because its store is keyed by route/chapter/scene, all of which the
   * panel knows; a manga line would have to land in a `MokuroBlock`, and a block
   * needs a box in *page-image* coordinates that a screen rectangle cannot be
   * converted into without knowing the current zoom, fit and monitor. Guessing
   * that is the defect `fb8ee0ed` just fixed, so the region editor stays the way
   * a manga region is created.
   */
  const captureWithLens = useCallback(async (): Promise<void> => {
    localStorage.setItem(LENS_CAPTURE_TARGET_KEY, JSON.stringify(buildMangaCaptureTarget({
      mangaId: item.id,
      title: item.title,
      chapter: item.readingSource?.chapterNumber ?? '',
      page: String(idx + 1),
    })));
    await window.api.lensOpen('select');
  }, [item.id, item.title, item.readingSource?.chapterNumber, idx]);

  const scanPage = useCallback(
    async (opts?: { force?: boolean; lang?: OcrLang }) => {
      if (engineReady) return scanWithMangaOcr(!!opts?.force);
      return scanWithTesseract(opts?.lang ?? ocrLang);
    },
    [engineReady, scanWithMangaOcr, scanWithTesseract, ocrLang],
  );

  // Progressive OCR updates from main.
  useEffect(() => {
    return window.api.onMangaOcrProgress((p) => {
      if (p.itemId !== item.id) return;
      if (mediaUrlRef.current && p.mediaUrl !== mediaUrlRef.current) return;
      if (p.page) {
        setMokuroPage(p.page);
        setOcrText(pageToOcrText(p.page));
      }
      if (p.phase === 'detect') {
        setOcrStatus('scanning');
        setOcrProgress(0.05);
      } else if (p.phase === 'ocr' && p.total > 0) {
        setOcrStatus('scanning');
        setOcrProgress(p.current / p.total);
      } else if (p.phase === 'done') {
        setOcrStatus('done');
        setOcrProgress(1);
      } else if (p.phase === 'error') {
        setOcrStatus('error');
        setOcrError(p.error || t('manga.ocr.failed'));
      }
    });
  }, [item.id, t]);

  // Load cached overlays when changing page. With Auto-translate on, also fill
  // in whatever this page is missing so the reader never sits on an untranslated
  // page — but only when the background volume job isn't already working, so the
  // two can't run heavy ONNX inference over the same page at once.
  useEffect(() => {
    const url = pages[idx];
    if (!url || !engineReady) return;
    let cancelled = false;
    void (async () => {
      const page = await window.api.mangaOcrLoadCache(item.id, url);
      if (cancelled) return;
      if (!page) {
        if (autoTranslateRef.current && !volumeBusyRef.current && !autoVolumeStartedRef.current) {
          const scanned = await scanRef.current?.(false);
          if (!cancelled && scanned) await translateRef.current?.(scanned);
        }
        return;
      }
      setMokuroPage(page);
      setOcrText(pageToOcrText(page));
      setOcrStatus('done');
      setOcrOpen(true);
      const target = targetLangRef.current;
      const tr = await window.api.mangaOcrLoadTranslateCache(item.id, url, target);
      if (cancelled) return;
      if (!tr) {
        setTranslatedPage(null);
        setShowTranslated(false);
        // OCR is cached but this page was never translated — do it now.
        if (autoTranslateRef.current && !volumeBusyRef.current && !autoVolumeStartedRef.current) {
          await translateRef.current?.(page);
        }
        return;
      }
      setTranslatedPage(tr);
      setShowTranslated(true);
      setViewMode((m) => {
        if (m === 'original' || m === 'regions') {
          saveMangaViewMode('overlay');
          return 'overlay';
        }
        return m;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [pages, idx, item.id, engineReady]);

  useEffect(() => {
    return window.api.onMangaOcrVolumeProgress((p) => {
      if (p.itemId !== item.id) return;
      setVolumeProgress({
        phase: p.phase,
        pageIndex: p.pageIndex,
        pageTotal: p.pageTotal,
        message: p.message || p.error,
      });
      if (p.phase === 'done' || p.phase === 'error' || p.phase === 'cancelled') {
        setVolumeBusy(false);
      }
    });
  }, [item.id]);

  /**
   * Route a lookup hit exactly like the novel reader: a single-word click opens
   * the dictionary popup, a dragged phrase/sentence opens the sentence
   * translator. Shared by the page overlay, clean-text and compare views.
   */
  const handleLookup = useCallback(
    (hit: { query: string; x: number; y: number; context?: string; translate?: boolean }) => {
      setPopup({
        kind: hit.translate ? 'translate' : 'dict',
        query: hit.query,
        x: hit.x,
        y: hit.y,
        context: hit.context,
      });
    },
    [],
  );

  const onOcrSelect = useCallback(
    (e: React.MouseEvent) => {
      const dismissOnly = popupOpenOnDownRef.current && isLookupClick(e);
      const hit = lookupWordFromMouseUp(e);
      if (hit) handleLookup({ ...hit, context: hit.context ?? ocrText });
      else if (dismissOnly) setPopup(null);
    },
    [ocrText, handleLookup],
  );

/** Apply a fresh MokuroPage from any region-editing IPC call (correction/rescan/merge/split/order). */
  const applyUpdatedPage = useCallback((updated: MokuroPage | null) => {
    if (!updated) return;
    setMokuroPage(updated);
    setOcrText(pageToOcrText(updated));
    setTranslatedPage(null);
    setShowTranslated(false);
    setFillByRegion({});
  }, []);

  const commitEdit = useCallback(
    async (regionId: string, lines: string[]) => {
      const url = pages[idx];
      if (!url) return;
      setEditingRegionId(null);
      setRegionBusy(true);
      try {
        const updated = await window.api.mangaOcrSaveCorrection({
          itemId: item.id,
          mediaUrl: url,
          regionId,
          lines,
        });
        if (updated) {
          applyUpdatedPage(updated);
        } else if (mokuroPage) {
          applyUpdatedPage({
            ...mokuroPage,
            blocks: mokuroPage.blocks.map((b) =>
              b.regionId === regionId ? { ...b, lines } : b,
            ),
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setRegionBusy(false);
      }
    },
    [pages, idx, item.id, mokuroPage, applyUpdatedPage],
  );

  const setRegionKind = useCallback(
    async (regionId: string, kind: MokuroBlockKind) => {
      const url = pages[idx];
      if (!url) return;
      setRegionBusy(true);
      try {
        applyUpdatedPage(
          await window.api.mangaOcrSaveCorrection({ itemId: item.id, mediaUrl: url, regionId, kind }),
        );
      } catch (err) {
        console.error(err);
      } finally {
        setRegionBusy(false);
      }
    },
    [pages, idx, item.id, applyUpdatedPage],
  );

  const setRegionVertical = useCallback(
    async (regionId: string, vertical: boolean) => {
      const url = pages[idx];
      if (!url) return;
      setRegionBusy(true);
      try {
        applyUpdatedPage(
          await window.api.mangaOcrSaveCorrection({ itemId: item.id, mediaUrl: url, regionId, vertical }),
        );
      } catch (err) {
        console.error(err);
      } finally {
        setRegionBusy(false);
      }
    },
    [pages, idx, item.id, applyUpdatedPage],
  );

  const rescanRegion = useCallback(
    async (regionId: string) => {
      const url = pages[idx];
      if (!url) return;
      setRegionBusy(true);
      try {
        applyUpdatedPage(await window.api.mangaOcrRescanRegion({ itemId: item.id, mediaUrl: url, regionId }));
      } catch (err) {
        console.error(err);
      } finally {
        setRegionBusy(false);
      }
    },
    [pages, idx, item.id, applyUpdatedPage],
  );

  const mergeRegion = useCallback(
    async (regionId: string, otherRegionId: string) => {
      const url = pages[idx];
      if (!url) return;
      setRegionBusy(true);
      try {
        const updated = await window.api.mangaOcrMergeRegions({
          itemId: item.id,
          mediaUrl: url,
          regionIds: [regionId, otherRegionId],
        });
        applyUpdatedPage(updated);
        setEditingRegionId(null);
      } catch (err) {
        console.error(err);
      } finally {
        setRegionBusy(false);
      }
    },
    [pages, idx, item.id, applyUpdatedPage],
  );

  const confirmSplitRegion = useCallback(
    async (regionId: string, axis: 'x' | 'y', at: number) => {
      const url = pages[idx];
      if (!url) return;
      setRegionBusy(true);
      try {
        const updated = await window.api.mangaOcrSplitRegion({
          itemId: item.id,
          mediaUrl: url,
          regionId,
          axis,
          at,
        });
        applyUpdatedPage(updated);
        setEditingRegionId(null);
      } catch (err) {
        console.error(err);
      } finally {
        setRegionBusy(false);
      }
    },
    [pages, idx, item.id, applyUpdatedPage],
  );

  const openRegionEditor = useCallback(
    (id: string) => {
      setEditingRegionId(id);
      const block = mokuroPage?.blocks.find((b) => b.regionId === id);
      setSplitAxis(block?.vertical ? 'x' : 'y');
      setSplitFraction(0.5);
    },
    [mokuroPage],
  );

  const saveRegionOrder = useCallback(
    async (order: string[]) => {
      const url = pages[idx];
      if (!url) return;
      try {
        applyUpdatedPage(await window.api.mangaOcrSaveOrder({ itemId: item.id, mediaUrl: url, order }));
      } catch (err) {
        console.error(err);
      }
    },
    [pages, idx, item.id, applyUpdatedPage],
  );

  /** Switch Original/Regions → Overlay so translated (or OCR) text is painted on the page. */
  const ensureTextOverlayMode = useCallback(() => {
    setViewMode((m) => {
      if (m === 'original' || m === 'regions') {
        saveMangaViewMode('overlay');
        return 'overlay';
      }
      return m;
    });
  }, []);

  const analyzeMangaRange = useCallback(async (startPage: number, endPage: number) => {
    if (volumeBusy) return;
    if (!pages.length) return;
    const last = pages.length - 1;
    const start = Math.min(last, Math.max(0, Math.floor(startPage)));
    const end = Math.min(last, Math.max(start, Math.floor(endPage)));
    setVolumeBusy(true);
    setOcrOpen(true);
    setOcrError('');
    setVolumeProgress({ phase: 'ocr', pageIndex: 0, pageTotal: end - start + 1 });
    const target = targetLang;
    try {
      const res = await window.api.mangaOcrAnalyzeVolume({
        itemId: item.id,
        translate: true,
        targetLang: target,
        force: false,
        detectionSensitivity: mangaSettings.detectionSensitivity,
        startPage: start,
        endPage: end,
      });
      if (!res.ok) {
        if (!res.cancelled) setOcrError(res.error || t('manga.ocr.volumeFailed'));
        return;
      }
      // A run can succeed at OCR and still translate nothing. Say so — the
      // alternative is a page that looks translated and is not.
      if (res.warning) setOcrError(res.warning);
      const url = pages[idx];
      if (url) {
        const page = await window.api.mangaOcrLoadCache(item.id, url);
        if (page) {
          setMokuroPage(page);
          setOcrText(pageToOcrText(page));
          setOcrStatus('done');
        }
        const tr = await window.api.mangaOcrLoadTranslateCache(item.id, url, target);
        if (tr) {
          setTranslatedPage(tr);
          setShowTranslated(true);
          ensureTextOverlayMode();
        }
      }
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : t('manga.ocr.volumeFailed'));
    } finally {
      setVolumeBusy(false);
    }
  }, [
    volumeBusy,
    pages,
    idx,
    item.id,
    t,
    ensureTextOverlayMode,
    mangaSettings.detectionSensitivity,
    targetLang,
  ]);

  const analyzeEntireManga = useCallback(async () => {
    if (!pages.length) return;
    await analyzeMangaRange(0, pages.length - 1);
  }, [pages, analyzeMangaRange]);

  const translateAheadPages = useCallback(async () => {
    if (!pages.length || idx >= pages.length - 1) {
      setOcrError(t('manga.translate.nothingAhead'));
      return;
    }
    await analyzeMangaRange(idx + 1, pages.length - 1);
  }, [pages, idx, analyzeMangaRange, t]);

  const translatePageRange = useCallback(async () => {
    if (!pages.length) return;
    const start = Math.max(0, pageRangeFrom - 1);
    const end = Math.max(start, pageRangeTo - 1);
    await analyzeMangaRange(start, end);
  }, [pages, pageRangeFrom, pageRangeTo, analyzeMangaRange]);

  /** Manga has no native chapter map — treat chapters as equal page buckets (~20 pages). */
  const mangaChapterCount = Math.max(1, Math.ceil(pages.length / 20) || 1);
  const translateChapterRange = useCallback(async () => {
    if (!pages.length) return;
    const fromCh = Math.min(mangaChapterCount, Math.max(1, chapterRangeFrom));
    const toCh = Math.min(mangaChapterCount, Math.max(fromCh, chapterRangeTo));
    const start = (fromCh - 1) * 20;
    const end = Math.min(pages.length - 1, toCh * 20 - 1);
    await analyzeMangaRange(start, end);
  }, [pages, mangaChapterCount, chapterRangeFrom, chapterRangeTo, analyzeMangaRange]);

  useEffect(() => {
    if (!pages.length) return;
    setPageRangeFrom(1);
    setPageRangeTo(pages.length);
    setChapterRangeFrom(1);
    setChapterRangeTo(Math.max(1, Math.ceil(pages.length / 20)));
  }, [pages.length]);

  const cancelVolumeAnalyze = useCallback(() => {
    void window.api.mangaOcrCancelVolume(item.id);
  }, [item.id]);

  /**
   * "Every page should auto-translate from the first page": once per reader
   * open, run the background volume analyze, which OCRs + translates + persists
   * every page. Pages that are already cached are skipped inside, so reopening
   * a finished manga costs nothing and never re-translates. Turn it off with
   * the Auto-translate setting.
   */
  useEffect(() => {
    if (!mangaSettings.autoTranslate || !engineReady || !pages.length) return;
    if (autoVolumeStartedRef.current) return;
    const meta = item.ocrMeta;
    const alreadyDone =
      !!meta &&
      meta.ocrPages >= pages.length &&
      meta.translatedPages >= pages.length &&
      meta.targetLang === targetLang;
    if (alreadyDone) return;
    autoVolumeStartedRef.current = true;
    void analyzeEntireManga();
  }, [mangaSettings.autoTranslate, engineReady, pages.length, item.ocrMeta, analyzeEntireManga, targetLang]);

  /**
   * Run batch translation for a Mokuro page and show the target-lang overlay.
   * Pass the page explicitly so callers (e.g. draw-region) aren't racing React state.
   */
  const runTranslatePage = useCallback(
    async (page: MokuroPage): Promise<boolean> => {
      if (translating) return false;
      setTranslating(true);
      setTranslateError('');
      try {
        const target = targetLang;
        const items: Array<{ id: string; text: string; source: string; target: string }> = [];
        for (const block of page.blocks) {
          if (block.kind === 'ignore') continue;
          if (block.kind === 'sfx' && !showSfx) continue;
          const id = block.regionId ?? '';
          if (!id) continue;
          const text = block.lines.join(block.vertical ? '' : '\n').trim();
          if (!text) continue;
          items.push({ id, text, source: sourceLang, target });
        }
        if (!items.length) {
          setTranslateError(t('manga.translate.noText'));
          return false;
        }
        const status = await window.api.translateStatus();
        if (!status.modelFound) {
          setTranslateError(t('manga.translate.modelMissing'));
          return false;
        }
        const res = await window.api.translateRunBatch({ items });
        if (!res.ok || !res.results) {
          setTranslateError(res.error || t('manga.translate.failed'));
          return false;
        }
        const byId = new Map(
          res.results.filter((r) => r.text.trim()).map((r) => [r.id, r.text.trim()]),
        );
        if (!byId.size) {
          setTranslateError(t('manga.translate.failed'));
          return false;
        }
        const next: MokuroPage = {
          ...page,
          blocks: page.blocks.map((b) => {
            const id = b.regionId ?? '';
            const tr = byId.get(id);
            if (!tr) return b;
            return { ...b, lines: [tr], vertical: false };
          }),
        };
        const fills: Record<string, string> = {};
        const pageUrl = pages[idx];
        if (pageUrl) {
          await Promise.all(
            page.blocks.map(async (b) => {
              const id = b.regionId;
              if (!id || !byId.has(id)) return;
              fills[id] = await medianBorderColor(pageUrl, b.box, page.img_width, page.img_height);
            }),
          );
        }
        ensureTextOverlayMode();
        setFillByRegion(fills);
        setTranslatedPage(next);
        setShowTranslated(true);
        setOcrText(pageToOcrText(next));
        // `pageUrl` is already resolved above (bubble-fill loop) — reuse it.
        // A second `const pageUrl` here was a duplicate-declaration build error
        // that stopped this whole file from compiling, so the save below never
        // ran and translations were never persisted.
        if (pageUrl) {
          void window.api.mangaOcrSaveTranslateCache(item.id, pageUrl, target, next);
        }
        return true;
      } catch (err) {
        console.error(err);
        setTranslateError(err instanceof Error ? err.message : t('manga.translate.failed'));
        return false;
      } finally {
        setTranslating(false);
      }
    },
    [translating, showSfx, pages, idx, item.id, t, ensureTextOverlayMode, targetLang, sourceLang],
  );
  translateRef.current = runTranslatePage;

  /** Click-drag rubber-band → OCR crop → auto-translate → English overlay on the page. */
  const addDrawnRegion = useCallback(
    async (box: MokuroBox) => {
      const url = pages[idx];
      if (!url || regionBusy) return;
      setRegionBusy(true);
      setOcrError('');
      setTranslateError('');
      try {
        const updated = await window.api.mangaOcrAddRegion({ itemId: item.id, mediaUrl: url, box });
        if (!updated) {
          setOcrError(t('manga.ocr.failed'));
          return;
        }
        applyUpdatedPage(updated);
        setOcrOpen(true);
        setOcrStatus('done');
        setOcrIsFallback(false);
        // Overlay mode paints text; Regions mode is boxes-only and hid translations.
        ensureTextOverlayMode();
        const matched = findBlockNearBox(updated, box);
        const hasText = matched?.lines.some((l) => l.trim());
        if (!hasText) {
          setOcrError(t('manga.ocr.noText'));
          if (matched?.regionId) {
            setEditingRegionId(matched.regionId);
            setSplitAxis(matched.vertical ? 'x' : 'y');
            setSplitFraction(0.5);
          }
          return;
        }
        // Don't open the editor over the page — show the translation overlay instead.
        setEditingRegionId(null);
        const ok = await runTranslatePage(updated);
        // Leave draw mode so the English overlay is clickable (lookup / hover).
        if (ok) setDrawRegionMode(false);
      } catch (err) {
        console.error(err);
        setOcrError(err instanceof Error ? err.message : t('manga.ocr.failed'));
      } finally {
        setRegionBusy(false);
      }
    },
    [pages, idx, item.id, regionBusy, applyUpdatedPage, ensureTextOverlayMode, runTranslatePage, t],
  );

  useEffect(() => {
    if (!pages.length) return;
    // Written through the model so the locator is validated against this
    // edition's format before it reaches the library's loose `Progress` shape.
    window.api.setProgress(
      item.id,
      progressFromReadingLocator(
        item,
        { kind: 'page', index: idx },
        pages.length > 1 ? idx / (pages.length - 1) : 1,
      ),
    );
  }, [idx, pages.length, item]);

  useEffect(() => {
    setOcrStatus('idle');
    setOcrText('');
    setOcrError('');
    setOcrIsFallback(false);
    setMokuroPage(null);
    setPopup(null);
    setEditingRegionId(null);
    setHoverRegionId(null);
    setShowTranslated(false);
    setTranslatedPage(null);
    setFillByRegion({});
    setTranslateError('');
    setHandwritingOpen(false);
    setRegionBusy(false);
    setDrawRegionMode(false);
    setPageNatSize(null);
  }, [idx]);

  const translatePage = useCallback(async () => {
    if (!mokuroPage || translating) return;
    if (translatedPage && showTranslated) {
      setShowTranslated(false);
      setOcrText(pageToOcrText(mokuroPage));
      return;
    }
    if (translatedPage && !showTranslated) {
      setShowTranslated(true);
      setOcrText(pageToOcrText(translatedPage));
      ensureTextOverlayMode();
      return;
    }
    await runTranslatePage(mokuroPage);
  }, [mokuroPage, translating, translatedPage, showTranslated, runTranslatePage, ensureTextOverlayMode]);

  const setTranslateTarget = useCallback((code: string) => {
    const finalTarget = code === sourceLang ? (sourceLang === 'en' ? 'ru' : 'en') : code;
    writeMangaTargetLang(finalTarget);
    setTargetLang(finalTarget);
    setTranslatedPage(null);
    setShowTranslated(false);
    setFillByRegion({});
    autoVolumeStartedRef.current = false;
  }, [sourceLang]);

  const toggleTranslationVisibility = useCallback(() => {
    if (!mokuroPage) return;
    if (translatedPage && showTranslated) {
      setShowTranslated(false);
      setOcrText(pageToOcrText(mokuroPage));
      return;
    }
    if (translatedPage && !showTranslated) {
      setShowTranslated(true);
      setOcrText(pageToOcrText(translatedPage));
      ensureTextOverlayMode();
      return;
    }
    void runTranslatePage(mokuroPage);
  }, [mokuroPage, translatedPage, showTranslated, ensureTextOverlayMode, runTranslatePage]);

  useEffect(() => {
    const offs = [
      registerCommandHandler('manga.nextPage', () => {
        go(1);
      }),
      registerCommandHandler('manga.prevPage', () => {
        go(-1);
      }),
      registerCommandHandler('manga.zoomIn', () => {
        bumpZoom(0.15);
      }),
      registerCommandHandler('manga.zoomOut', () => {
        bumpZoom(-0.15);
      }),
      registerCommandHandler('manga.zoomReset', () => {
        setZoom(1);
      }),
      // Shared with novel/EPUB readers so Ctrl+= / Ctrl+- / Ctrl+0 stay unique OS-wide.
      registerCommandHandler('reader.fontUp', () => {
        bumpZoom(0.15);
      }),
      registerCommandHandler('reader.fontDown', () => {
        bumpZoom(-0.15);
      }),
      registerCommandHandler('reader.zoomReset', () => {
        setZoom(1);
      }),
      registerCommandHandler('reader.toggleTranslation', () => {
        toggleTranslationVisibility();
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [go, bumpZoom, toggleTranslationVisibility]);

  /**
   * Cubari's "browser history/back-button behavior" setting has no real analog
   * here (no browser history stack, no OS-window-title sync) — the only value
   * that's functionally different is 'none' (silent close, today's behavior)
   * vs. anything else (confirm before leaving). See mangaReaderSettings.ts.
   * Defined before the Escape keydown effect so it isn't referenced in the TDZ.
   */
  const requestClose = useCallback(() => {
    if (mangaSettings.historyBehavior === 'none' || window.confirm(t('manga.settings.confirmClose'))) {
      onClose();
    }
  }, [mangaSettings.historyBehavior, onClose, t]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        if (handwritingOpen) {
          setHandwritingOpen(false);
          return;
        }
        if (editingRegionId) {
          setEditingRegionId(null);
          return;
        }
        if (drawRegionMode) {
          setDrawRegionMode(false);
          return;
        }
        if (popup) setPopup(null);
        else if (ocrOpen) {
          setOcrOpen(false);
        } else requestClose();
        return;
      }
      if (e.key === 'e' || e.key === 'E') {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
          return;
        }
        if (hoverRegionId && mokuroPage) {
          e.preventDefault();
          openRegionEditor(hoverRegionId);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    requestClose,
    popup,
    ocrOpen,
    editingRegionId,
    drawRegionMode,
    hoverRegionId,
    mokuroPage,
    handwritingOpen,
    openRegionEditor,
    settingsOpen,
  ]);

  useEffect(() => {
    function onWheel(e: WheelEvent) {
      if (e.ctrlKey) {
        e.preventDefault();
        bumpZoom(e.deltaY < 0 ? 0.15 : -0.15);
      }
    }
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [bumpZoom]);

  // Page preload: warm the browser's image decode cache for upcoming pages
  // (already-local media:// files — no main-process fetch needed), bounded
  // to preloadConcurrency in flight at once.
  useEffect(() => {
    if (!pages.length) return;
    const ahead = mangaSettings.preloadPages < 0 ? pages.length : mangaSettings.preloadPages;
    const targets = pages.slice(idx + 1, idx + 1 + ahead);
    let cancelled = false;
    let inFlight = 0;
    let next = 0;
    function pump() {
      if (cancelled) return;
      while (inFlight < mangaSettings.preloadConcurrency && next < targets.length) {
        const src = targets[next++];
        inFlight++;
        const img = new Image();
        const done = () => {
          inFlight--;
          if (!cancelled) pump();
        };
        img.onload = done;
        img.onerror = done;
        img.src = src;
      }
    }
    pump();
    return () => {
      cancelled = true;
    };
  }, [pages, idx, mangaSettings.preloadPages, mangaSettings.preloadConcurrency]);

  // Auto-hide the page-selector footer when it's not pinned (fades back in on movement).
  const [footerVisible, setFooterVisible] = useState(true);
  useEffect(() => {
    if (mangaSettings.pageSelectorPinned) {
      setFooterVisible(true);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    function onMove() {
      setFooterVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setFooterVisible(false), 2500);
    }
    onMove();
    window.addEventListener('mousemove', onMove);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', onMove);
    };
  }, [mangaSettings.pageSelectorPinned]);

  const [previewHoverIdx, setPreviewHoverIdx] = useState<number | null>(null);

  // ----- TTB (top-to-bottom) continuous-scroll mode -----
  const isTtb = mangaSettings.readerLayout === 'ttb';
  const ttbPageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const ttbProgrammaticScroll = useRef(false);
  const wasTtb = useRef(isTtb);
  if (isTtb && !wasTtb.current) ttbNavIntent.current = true;
  wasTtb.current = isTtb;

  // Track which page is "current" (for progress-saving, page-count, and which
  // page the OCR overlay/sidebar attach to) by finding whichever page wrapper
  // is closest to the top of the scroll viewport.
  useEffect(() => {
    if (!isTtb) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    let raf = 0;
    function onScroll() {
      if (ttbProgrammaticScroll.current) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!container) return;
        const containerTop = container.getBoundingClientRect().top;
        let closest: { idx: number; dist: number } | null = null;
        for (const [key, el] of Object.entries(ttbPageRefs.current)) {
          if (!el) continue;
          const dist = Math.abs(el.getBoundingClientRect().top - containerTop);
          if (!closest || dist < closest.dist) closest = { idx: Number(key), dist };
        }
        // Only update when the nearest page actually changed — setIdx on every
        // scroll frame re-renders the whole reader and feels laggy.
        if (closest && closest.idx !== idxRef.current) setIdx(closest.idx);
      });
    }
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener('scroll', onScroll);
    };
  }, [isTtb, pages.length]);

  // Scroll into view only when ttbNavIntent is set (open / switch to TTB /
  // intentional flip with resetScrollOnFlip). Scroll-driven idx updates must
  // NOT call scrollIntoView or you get a snap-to-next-page feedback loop.
  useEffect(() => {
    if (!isTtb || !pages.length) return;
    if (!ttbNavIntent.current) return;
    const el = ttbPageRefs.current[idx];
    if (!el) return;
    ttbNavIntent.current = false;
    ttbProgrammaticScroll.current = true;
    el.scrollIntoView({ block: 'start' });
    const t = setTimeout(() => {
      ttbProgrammaticScroll.current = false;
    }, 300);
    return () => clearTimeout(t);
  }, [idx, isTtb, pages.length]);

  // TTB arrow-key handling: Up/Down always nudge scroll; Left/Right jump a
  // whole page only when "turn pages with arrow keys in vertical view" is on.
  useEffect(() => {
    if (!isTtb) return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      const container = scrollContainerRef.current;
      if (!container) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        container.scrollBy({ top: e.key === 'ArrowDown' ? mangaSettings.scrollSpeedPx : -mangaSettings.scrollSpeedPx });
      } else if (mangaSettings.arrowKeysInVertical && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        go(e.key === 'ArrowRight' ? 1 : -1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isTtb, mangaSettings.scrollSpeedPx, mangaSettings.arrowKeysInVertical, go]);

  // Swipe gestures on the stage (paginated modes only — TTB already scrolls natively).
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!mangaSettings.swipeGesturesEnabled || mangaSettings.readerLayout === 'ttb') return;
    const stage = stageRef.current;
    if (!stage) return;
    const SWIPE_THRESHOLD = 60;
    function onDown(e: PointerEvent) {
      swipeRef.current = { x: e.clientX, y: e.clientY };
    }
    function onUp(e: PointerEvent) {
      const start = swipeRef.current;
      swipeRef.current = null;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
      const rtl = mangaSettings.readerLayout === 'rtl';
      // Swipe left = next (reading-forward) in LTR, prev in RTL; swipe right is the mirror.
      if (dx < 0) go(rtl ? -1 : 1);
      else go(rtl ? 1 : -1);
    }
    stage.addEventListener('pointerdown', onDown as EventListener);
    stage.addEventListener('pointerup', onUp as EventListener);
    return () => {
      stage.removeEventListener('pointerdown', onDown as EventListener);
      stage.removeEventListener('pointerup', onUp as EventListener);
    };
  }, [mangaSettings.swipeGesturesEnabled, mangaSettings.readerLayout, go]);

  const modelsMissing = !engineReady;
  const clickToTurnPages = mangaSettings.clickToTurnPages;
  const pageFit = mangaSettings.pageFit || 'limit-all';
  const displayPage = showTranslated && translatedPage ? translatedPage : mokuroPage;
  const { wrap: wrapStyle, img: imgFitStyle } = mangaPageFitStyles(
    pageFit,
    zoom,
    mangaSettings.maxPageWidthPct ?? 100,
    stageSize.w,
    stageSize.h,
  );
  // "App default" leaves the app's own theme vars untouched; "Cubari"/"Custom"
  // override them scoped to this reader — every descendant rule already reads
  // var(--panel)/--bg/--text/--accent, so this re-skins the whole reader chrome
  // without duplicating a single existing CSS rule.
  const themeStyle: CSSProperties =
    mangaSettings.theme === 'app-default'
      ? {}
      : ({
          '--panel': mangaSettings.themeColors.interface,
          '--bg': mangaSettings.themeColors.background,
          '--sidebar': mangaSettings.themeColors.interface,
          '--text': mangaSettings.themeColors.text,
          '--accent': mangaSettings.themeColors.accent,
        } as CSSProperties);

  const drawImgW = mokuroPage?.img_width ?? pageNatSize?.w ?? 0;
  const drawImgH = mokuroPage?.img_height ?? pageNatSize?.h ?? 0;

  /** OCR overlay/clean/compare layer for one page — only rendered for the "current" (idx) page. */
  function renderOcrLayer(pageIdx: number) {
    if (pageIdx !== idx) return null;
    // Allow drawing more regions even while a translation overlay is shown.
    const showDraw = drawRegionMode && engineReady && drawImgW > 0 && drawImgH > 0;
    if (!ocrOpen && !showDraw) return null;
    return (
      <>
        {ocrOpen && displayPage && (viewMode === 'overlay' || viewMode === 'regions') && (
          <MangaOcrOverlay
            page={displayPage}
            showSfx={showSfx}
            fillByRegion={showTranslated ? fillByRegion : undefined}
            translateMode={showTranslated}
            // Regions audit mode is boxes-only — but never hide translated text.
            boxesOnly={!showTranslated}
            editingRegionId={showTranslated ? null : editingRegionId}
            splitPreview={
              editingRegionId ? { regionId: editingRegionId, axis: splitAxis, fraction: splitFraction } : null
            }
            onHoverRegion={setHoverRegionId}
            onRequestEdit={openRegionEditor}
            onLookup={handleLookup}
            onDismissLookup={() => setPopup(null)}
            popupOpen={!!popup}
          />
        )}
        {ocrOpen && mokuroPage && viewMode === 'clean' && (
          <MangaCleanTextView
            page={displayPage ?? mokuroPage}
            showSfx={showSfx}
            onLookup={handleLookup}
            onDismissLookup={() => setPopup(null)}
            popupOpen={!!popup}
          />
        )}
        {ocrOpen && mokuroPage && viewMode === 'compare' && (
          <MangaCompareView
            jaPage={mokuroPage}
            enPage={translatedPage}
            translating={translating}
            onRequestTranslate={() => void translatePage()}
            showSfx={showSfx}
            onLookup={handleLookup}
            onDismissLookup={() => setPopup(null)}
            popupOpen={!!popup}
          />
        )}
        {showDraw && (
          <MangaRegionDrawLayer
            active
            imgWidth={drawImgW}
            imgHeight={drawImgH}
            disabled={regionBusy}
            onDrawComplete={(box) => void addDrawnRegion(box)}
          />
        )}
      </>
    );
  }

  /*
   * L6's reading canvas decides where the OCR panel goes — this reader no longer
   * does, and the defect that forced the change is a MEASUREMENT one rather than
   * the cover it looks like.
   *
   * `.ocr-panel` was `position: fixed; right: 0; width: min(380px, 44vw)` and
   * `.manga-stage` never inset for it, so the stage's own box stayed the full
   * viewport while 380px of it was behind the panel. That box is not decorative
   * here: `stageSize` is read straight off `stageRef.current.clientWidth` and fed
   * to `mangaPageFitStyles`, so at a 1264px reader the fit math emitted
   * `max-width: 1264px` for 964px of visible stage and centred the page at 632
   * against a visible centre of 482 — 150px off-centre, toward the panel. A page
   * wider than the visible strip then really is covered. Docking the panel makes
   * the stage's clientWidth the width it actually has, and the same math is right
   * with no change to it.
   *
   * `fixed` also meant the panel was sized and placed by the SCREEN: `44vw` and
   * `right: 0` ignore the reader's own box, so in Blanc's pane or a pop-out the
   * panel sat against the window edge rather than the reader's.
   *
   * FILL POLICY, deliberately. A manga page has its own aspect and the user sets
   * its width in this reader's own settings (`maxPageWidthPct`, `pageFit`, zoom);
   * a 760px prose measure clamp would letterbox every page and silently override
   * a setting they changed on purpose.
   */
  const ocrPanelCompact = !(sidePanel || modelsMissing || !mokuroPage);
  const readingTools: ReadingCanvasTool[] = [];
  if (ocrOpen) {
    readingTools.push({
      id: 'manga-ocr',
      label: t('manga.ocr.panelTitle'),
      // The two widths the old stylesheet had as `min(380px, 44vw)` and
      // `min(300px, 36vw)`; the viewport half of each is now the resolver's job.
      minWidth: ocrPanelCompact ? 240 : 280,
      preferredWidth: ocrPanelCompact ? 300 : 380,
      onClose: () => {
        setDrawRegionMode(false);
        setOcrOpen(false);
      },
      // `.ocr-head` is gone rather than nested: the canvas head renders the title
      // and the close, and keeping both would stack two headings. The fallback
      // badge is state about the tool, so it belongs beside that title.
      actions: ocrIsFallback ? (
        <span className="ocr-fallback-badge" title={t('manga.ocr.fallbackHint')}>
          {t('manga.ocr.fallbackBadge')}
        </span>
      ) : undefined,
      content: (
        <div className="ocr-panel-content" onMouseDown={() => setPopup(null)}>
          <div className="ocr-toolbar">
            {engineReady ? (
              <>
                <label className="ocr-check muted">
                  <input type="checkbox" checked={showSfx} onChange={(e) => setShowSfx(e.target.checked)} />
                  {t('manga.ocr.showSfx')}
                </label>
                <label className="ocr-check muted">
                  <input
                    type="checkbox"
                    checked={sidePanel}
                    onChange={(e) => setSidePanel(e.target.checked)}
                  />
                  {t('manga.ocr.sidePanel')}
                </label>
                <label className="ocr-check muted" title={t('manga.settings.autoTranslate.hint')}>
                  <input
                    type="checkbox"
                    checked={mangaSettings.autoTranslate}
                    onChange={(e) => updateMangaSettings({ autoTranslate: e.target.checked })}
                  />
                  {t('manga.ocr.autoTranslate')}
                </label>
                <label className="ocr-check muted manga-translate-target">
                  <span>{t('manga.translate.target')}</span>
                  <select
                    value={targetLang}
                    disabled={volumeBusy || translating}
                    onChange={(e) => setTranslateTarget(e.target.value)}
                    aria-label={t('manga.translate.target')}
                  >
                    {KNOWN_LANGS.filter((l) => l.code !== sourceLang).map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.nativeLabel}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="btn small"
                  disabled={ocrStatus === 'scanning' || !mokuroPage || translating || volumeBusy}
                  onClick={() => void translatePage()}
                >
                  {translating
                    ? t('manga.translate.working')
                    : showTranslated
                      ? t('manga.translate.showOriginal')
                      : t('manga.translate.page')}
                </button>
                <button
                  className={`btn small${showTranslated ? ' active' : ''}`}
                  disabled={!mokuroPage || translating || volumeBusy}
                  title={t('manga.translate.toggleVisibility')}
                  onClick={() => toggleTranslationVisibility()}
                >
                  <Icon name="eye" size={14} />
                  <span>
                    {showTranslated ? t('manga.translate.hide') : t('manga.translate.show')}
                  </span>
                </button>
                {volumeBusy ? (
                  <button className="btn small" onClick={cancelVolumeAnalyze}>
                    {t('manga.ocr.volumeCancel')}
                  </button>
                ) : (
                  <button
                    className="btn small primary"
                    disabled={ocrStatus === 'scanning' || translating || !engineReady}
                    title={t('manga.ocr.volumeTitle')}
                    onClick={() => void analyzeEntireManga()}
                  >
                    {t('manga.ocr.volumeAnalyze')}
                  </button>
                )}
                <div className="manga-translate-range">
                  <div className="manga-translate-range-actions">
                    <button
                      className="btn small"
                      disabled={
                        volumeBusy ||
                        translating ||
                        !engineReady ||
                        idx >= pages.length - 1
                      }
                      title={t('manga.translate.ahead.hint')}
                      onClick={() => void translateAheadPages()}
                    >
                      {t('manga.translate.ahead')}
                    </button>
                  </div>
                  <div className="manga-translate-range-group">
                    <span className="manga-translate-range-label">
                      {t('manga.translate.chapterRange')}
                    </span>
                    <div className="manga-translate-range-row">
                      <input
                        type="number"
                        min={1}
                        max={mangaChapterCount}
                        value={chapterRangeFrom}
                        disabled={volumeBusy || translating || !engineReady}
                        onChange={(e) => setChapterRangeFrom(Number(e.target.value) || 1)}
                        aria-label={t('manga.translate.rangeFrom')}
                      />
                      <span className="muted">–</span>
                      <input
                        type="number"
                        min={1}
                        max={mangaChapterCount}
                        value={chapterRangeTo}
                        disabled={volumeBusy || translating || !engineReady}
                        onChange={(e) => setChapterRangeTo(Number(e.target.value) || 1)}
                        aria-label={t('manga.translate.rangeTo')}
                      />
                      <button
                        className="btn small"
                        disabled={volumeBusy || translating || !engineReady}
                        onClick={() => void translateChapterRange()}
                      >
                        {t('manga.translate.runRange')}
                      </button>
                    </div>
                    <span className="muted manga-translate-range-label">
                      {t('manga.translate.chapterRange.hint', { size: 20, max: mangaChapterCount })}
                    </span>
                  </div>
                  <div className="manga-translate-range-group">
                    <span className="manga-translate-range-label">
                      {t('manga.translate.pageRange')}
                    </span>
                    <div className="manga-translate-range-row">
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, pages.length)}
                        value={pageRangeFrom}
                        disabled={volumeBusy || translating || !engineReady}
                        onChange={(e) => setPageRangeFrom(Number(e.target.value) || 1)}
                        aria-label={t('manga.translate.rangeFrom')}
                      />
                      <span className="muted">–</span>
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, pages.length)}
                        value={pageRangeTo}
                        disabled={volumeBusy || translating || !engineReady}
                        onChange={(e) => setPageRangeTo(Number(e.target.value) || 1)}
                        aria-label={t('manga.translate.rangeTo')}
                      />
                      <button
                        className="btn small"
                        disabled={volumeBusy || translating || !engineReady}
                        onClick={() => void translatePageRange()}
                      >
                        {t('manga.translate.runRange')}
                      </button>
                    </div>
                    <span className="muted manga-translate-range-label">
                      {t('manga.translate.pageRange.hint', {
                        max: Math.max(1, pages.length),
                        current: idx + 1,
                      })}
                    </span>
                  </div>
                </div>
                <button
                  className={`btn small${handwritingOpen ? ' active' : ''}`}
                  onClick={() => setHandwritingOpen((v) => !v)}
                >
                  {t('manga.hw.open')}
                </button>
                <button
                  className={`btn small${drawRegionMode ? ' active' : ''}`}
                  title={t('manga.ocr.drawRegionTitle')}
                  disabled={regionBusy || ocrStatus === 'scanning' || translating}
                  onClick={() => setDrawRegionMode((v) => !v)}
                >
                  {t('manga.ocr.drawRegion')}
                </button>
                <button
                  className="btn small"
                  disabled={ocrStatus === 'scanning'}
                  onClick={() => void scanPage({ force: true })}
                >
                  {ocrStatus === 'scanning' ? t('manga.ocr.scanning') : t('manga.ocr.rescan')}
                </button>
              </>
            ) : (
              <>
                <div className="sp-seg" role="group" aria-label={t('manga.ocr.direction')}>
                  <button
                    className={`sp-seg-btn ${ocrLang === 'jpn_vert' ? 'active' : ''}`}
                    onClick={() => {
                      setOcrLang('jpn_vert');
                      void scanWithTesseract('jpn_vert');
                    }}
                  >
                    {t('manga.ocr.vertical')}
                  </button>
                  <button
                    className={`sp-seg-btn ${ocrLang === 'jpn' ? 'active' : ''}`}
                    onClick={() => {
                      setOcrLang('jpn');
                      void scanWithTesseract('jpn');
                    }}
                  >
                    {t('manga.ocr.horizontal')}
                  </button>
                </div>
                <button
                  className={`btn small${handwritingOpen ? ' active' : ''}`}
                  onClick={() => setHandwritingOpen((v) => !v)}
                >
                  {t('manga.hw.open')}
                </button>
                <button
                  className="btn small"
                  disabled={ocrStatus === 'scanning'}
                  onClick={() => void scanWithTesseract(ocrLang)}
                >
                  {ocrStatus === 'scanning' ? t('manga.ocr.scanning') : t('manga.ocr.rescan')}
                </button>
              </>
            )}
          </div>

          {translateError && <div className="ocr-msg">{translateError}</div>}
          {modelsMissing && (
            <div className="ocr-msg">
              <p className="muted">{t('manga.ocr.modelsMissing')}</p>
              <button
                className="btn"
                onClick={() => {
                  if (!mangaOcrAsset.installed) void window.api.assetsStart('manga-ocr');
                  if (!detectorAsset.installed) void window.api.assetsStart('comic-text-detector');
                  if (!decoderAsset.installed) void window.api.assetsStart('manga-ocr-decoder');
                  if (!vocabAsset.installed) void window.api.assetsStart('manga-ocr-vocab');
                }}
              >
                {t('manga.ocr.downloadModels', {
                  size: formatBytes(
                    (mangaOcrAsset.status?.totalBytes ?? 343_454_249) +
                      (detectorAsset.status?.totalBytes ?? 94_669_756) +
                      (decoderAsset.status?.totalBytes ?? 117_480_262) +
                      (vocabAsset.status?.totalBytes ?? 30_216),
                  ),
                })}
              </button>
              <p className="muted ocr-hint">{t('manga.ocr.fallbackHint')}</p>
            </div>
          )}

          {ocrStatus === 'scanning' && (
            <div className="ocr-progress">
              <div className="ocr-bar">
                <div className="ocr-bar-fill" style={{ width: `${Math.round(ocrProgress * 100)}%` }} />
              </div>
              <span className="muted">
                {t('manga.ocr.reading', { pct: Math.round(ocrProgress * 100) })}
              </span>
            </div>
          )}
          {volumeBusy && volumeProgress && (
            <div className="ocr-progress">
              <div className="ocr-bar">
                <div
                  className="ocr-bar-fill"
                  style={{
                    width: `${Math.round(
                      (Math.min(volumeProgress.pageIndex + 1, volumeProgress.pageTotal) /
                        Math.max(1, volumeProgress.pageTotal)) *
                        100,
                    )}%`,
                  }}
                />
              </div>
              <span className="muted">
                {volumeProgress.message ||
                  t('manga.ocr.volumeProgress', {
                    phase: volumeProgress.phase,
                    current: Math.min(volumeProgress.pageIndex + 1, volumeProgress.pageTotal),
                    total: volumeProgress.pageTotal,
                  })}
              </span>
            </div>
          )}
          {(ocrStatus === 'error' || (volumeProgress?.phase === 'error' && volumeProgress.message)) && (
            <div className="ocr-msg muted">{ocrError || volumeProgress?.message}</div>
          )}
          {engineReady && drawRegionMode && (
            <p className="ocr-hint muted">{t('manga.ocr.drawRegionHint')}</p>
          )}
          {engineReady && ocrStatus === 'done' && !sidePanel && !drawRegionMode && (
            <p className="ocr-hint muted">{t('manga.ocr.overlayHint')}</p>
          )}
          {sidePanel && engineReady && mokuroPage && ocrStatus === 'done' && (
            <MangaSidebar
              page={displayPage ?? mokuroPage}
              showSfx={showSfx}
              activeRegionId={editingRegionId ?? hoverRegionId}
              onSelectRegion={openRegionEditor}
              onReorder={(order) => void saveRegionOrder(order)}
            />
          )}
          {(modelsMissing || !engineReady) && ocrStatus === 'done' && (
            <>
              <p className="ocr-hint muted">{t('manga.ocr.selectHint')}</p>
              <div
                className="ocr-text"
                lang="ja"
                onMouseDown={(e) => {
                  popupOpenOnDownRef.current = !!popupRef.current;
                  noteLookupPointerDown(e);
                }}
                data-dict-owner=""
                onMouseUp={onOcrSelect}
              >
                {ocrText}
              </div>
            </>
          )}
        </div>
      ),
    });
  }

  return (
    <div className="reader" style={themeStyle}>
      <div className="reader-bar">
        <button className="btn" onClick={requestClose}>
          <Icon name="chevron" size={13} style={{ transform: 'rotate(180deg)', marginRight: 4, verticalAlign: '-2px' }} />
          {t('manga.backLibrary')}
        </button>
        <div className="reader-title">{item.title}</div>
        <div className="reader-controls">
          {mangaSettings.showPageNumber && (
            <span className="muted page-count">
              {pages.length ? (scrub ?? idx) + 1 : 0} / {pages.length}
            </span>
          )}
          <div className="sp-stepper">
            <button className="btn small" onClick={() => bumpZoom(-0.15)} disabled={zoom <= ZOOM_MIN}>
              −
            </button>
            <span className="sp-value">{Math.round(zoom * 100)}%</span>
            <button className="btn small" onClick={() => bumpZoom(0.15)} disabled={zoom >= ZOOM_MAX}>
              +
            </button>
          </div>
          <button
            className="btn small"
            title={t('manga.settings.open')}
            onClick={() => setSettingsOpen(true)}
          >
            <Icon name="settings" size={13} />
          </button>
          {ocrOpen && mokuroPage && (
            <MangaViewModeSwitcher
              value={viewMode}
              onChange={(m) => {
                setViewMode(m);
                saveMangaViewMode(m);
              }}
            />
          )}
          <button
            className={`btn manga-ocr-toggle${ocrOpen ? ' active' : ''}`}
            // A toggle, so it reports its state: without `aria-pressed` the only
            // signal that the panel is open is a colour, and the only stable
            // handle on this control was a localised `title`.
            aria-pressed={ocrOpen}
            title={t('manga.ocr.scanTitle')}
            disabled={!pages.length}
            onClick={() => {
              if (ocrOpen && mokuroPage) {
                setDrawRegionMode(false);
                setOcrOpen(false);
              } else {
                void scanPage();
              }
            }}
          >
            <Icon name="search" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
            {t('manga.ocr.scan')}
          </button>
          <button
            className="btn"
            title={t('manga.lens.captureTitle')}
            disabled={!pages.length}
            onClick={() => void captureWithLens()}
          >
            <Icon name="eye" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
            {t('manga.lens.capture')}
          </button>
        </div>
      </div>
      <ReadingCanvas
        className="manga-canvas"
        tools={readingTools}
        closeLabel={t('manga.ocr.close')}
        policy={READING_CANVAS_FILL_POLICY}
      >
        <div className={`reader-stage manga-stage${isTtb ? ' manga-stage-ttb' : ''}`} ref={stageRef}>
          {!isTtb && (
            <button
              className={`nav-zone left${mangaSettings.hoverHintsEnabled ? ' hint-enabled' : ''}`}
              onClick={() => clickToTurnPages && go(mangaSettings.readerLayout === 'rtl' ? 1 : -1)}
              aria-label={t('manga.prevPage')}
            />
          )}
          {pages.length === 0 ? (
            <div className="reader-msg">{t('manga.noPages')}</div>
          ) : isTtb ? (
            <div
              className={`manga-ttb-scroll${mangaSettings.removeGapsVertical ? ' no-gaps' : ''}`}
              ref={scrollContainerRef}
            >
              {pages.map((src, pageIdx) => (
                <div
                  className="manga-page-wrap manga-ttb-page"
                  style={wrapStyle}
                  ref={(el) => {
                    ttbPageRefs.current[pageIdx] = el;
                    if (pageIdx === idx) pageWrapRef.current = el;
                  }}
                  key={pageIdx}
                >
                  <img
                    className="manga-page"
                    style={imgFitStyle}
                    src={src}
                    alt={t('manga.pageAlt', { n: pageIdx + 1 })}
                    draggable={false}
                    loading="lazy"
                    onLoad={(e) => {
                      if (pageIdx !== idx) return;
                      const img = e.currentTarget;
                      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                        setPageNatSize({ w: img.naturalWidth, h: img.naturalHeight });
                      }
                    }}
                  />
                  {renderOcrLayer(pageIdx)}
                </div>
              ))}
            </div>
          ) : (
            <div className={`manga-spread${mangaSettings.readerLayout === 'rtl' ? ' rtl' : ''}`}>
              {spreadIndicesFor(idx).map((pageIdx) => (
                <div
                  className="manga-page-wrap"
                  style={wrapStyle}
                  ref={pageIdx === idx ? pageWrapRef : undefined}
                  key={pageIdx}
                >
                  <img
                    className="manga-page"
                    style={imgFitStyle}
                    src={pages[pageIdx]}
                    alt={t('manga.pageAlt', { n: pageIdx + 1 })}
                    draggable={false}
                    onLoad={(e) => {
                      if (pageIdx !== idx) return;
                      const img = e.currentTarget;
                      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                        setPageNatSize({ w: img.naturalWidth, h: img.naturalHeight });
                      }
                    }}
                  />
                  {renderOcrLayer(pageIdx)}
                </div>
              ))}
            </div>
          )}
          {!isTtb && (
            <button
              className={`nav-zone right${mangaSettings.hoverHintsEnabled ? ' hint-enabled' : ''}`}
              onClick={() => clickToTurnPages && go(mangaSettings.readerLayout === 'rtl' ? -1 : 1)}
              aria-label={t('manga.nextPage')}
            />
          )}
        </div>
      </ReadingCanvas>
      <div
        className={`reader-footer${mangaSettings.pageSelectorPosition === 'left' ? ' reader-footer-left' : ''}${!footerVisible ? ' reader-footer-hidden' : ''}`}
      >
        <button
          className="btn small"
          title={t('manga.firstPage')}
          disabled={!pages.length || idx === 0}
          onClick={() => jumpToPage(0)}
        >
          <Icon name="skip-back" size={13} />
        </button>
        <div className="reader-seek-wrap">
          <input
            className="reader-seek"
            type="range"
            min={1}
            max={Math.max(1, pages.length)}
            value={Math.min((scrub ?? idx) + 1, Math.max(1, pages.length))}
            disabled={!pages.length}
            title={t('manga.seek')}
            aria-label={t('a11y.slider.pagePosition')}
            onChange={(e) => setScrub(Number(e.target.value) - 1)}
            onMouseMove={(e) => {
              if (!mangaSettings.showPagePreviews || !pages.length) return;
              const rect = (e.target as HTMLInputElement).getBoundingClientRect();
              const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
              setPreviewHoverIdx(Math.round(frac * (pages.length - 1)));
            }}
            onMouseLeave={() => setPreviewHoverIdx(null)}
            onPointerUp={() => {
              setPreviewHoverIdx(null);
              if (scrub != null) {
                jumpToPage(scrub);
                setScrub(null);
              }
            }}
            onKeyUp={() => {
              if (scrub != null) {
                jumpToPage(scrub);
                setScrub(null);
              }
            }}
          />
          {mangaSettings.showPagePreviews && previewHoverIdx != null && pages[previewHoverIdx] && (
            <img className="reader-seek-preview" src={pages[previewHoverIdx]} alt="" draggable={false} />
          )}
        </div>
        <button
          className="btn small"
          title={t('manga.lastPage')}
          disabled={!pages.length || idx >= pages.length - 1}
          onClick={() => jumpToPage(pages.length - 1)}
        >
          <Icon name="skip-forward" size={13} />
        </button>
        <span className="reader-pct muted">
          {pages.length ? Math.round((((scrub ?? idx) + 1) / pages.length) * 100) : 0}%
        </span>
      </div>

      {settingsOpen && (
        <MangaReaderSettingsPanel
          settings={mangaSettings}
          onChange={updateMangaSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {editingRegionId && mokuroPage && (() => {
        const block = mokuroPage.blocks.find((b) => b.regionId === editingRegionId);
        const pageUrl = pages[idx];
        if (!block || !pageUrl) return null;
        const wrapRect = pageWrapRef.current?.getBoundingClientRect();
        const zoom = getZoomFactor();
        const anchor = wrapRect
          ? {
              x: (wrapRect.left + (block.box[0] / mokuroPage.img_width) * wrapRect.width) / zoom,
              y: (wrapRect.top + (block.box[1] / mokuroPage.img_height) * wrapRect.height) / zoom,
            }
          : { x: 120, y: 80 };
        return (
          <RegionEditorModal
            page={mokuroPage}
            block={block}
            pageUrl={pageUrl}
            anchor={anchor}
            busy={regionBusy}
            onClose={() => setEditingRegionId(null)}
            onSaveLines={(lines) => void commitEdit(editingRegionId, lines)}
            onSetKind={(kind) => void setRegionKind(editingRegionId, kind)}
            onSetVertical={(vertical) => void setRegionVertical(editingRegionId, vertical)}
            onRescan={() => void rescanRegion(editingRegionId)}
            onMerge={(otherId) => void mergeRegion(editingRegionId, otherId)}
            splitAxis={splitAxis}
            splitFraction={splitFraction}
            onSplitAxisChange={setSplitAxis}
            onSplitFractionChange={setSplitFraction}
            onConfirmSplit={() => void confirmSplitRegion(editingRegionId, splitAxis, splitFraction)}
          />
        );
      })()}

      {handwritingOpen && (
        <MangaHandwritingPopup
          x={Math.round(window.innerWidth / 2 - 160)}
          y={120}
          engineReady={engineReady}
          onLookup={(query, px, py) => {
            setPopup({ kind: 'dict', query, x: px, y: py });
            setHandwritingOpen(false);
          }}
          onClose={() => setHandwritingOpen(false)}
        />
      )}

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
  );
}
