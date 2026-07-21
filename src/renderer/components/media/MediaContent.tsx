/**
 * Media library, video learning player, Whisper transcription, and the YouTube
 * intake — shared by Study OS's `MediaView` and Blanc's `BlancMediaPanel`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OWNERSHIP: **Media & Cards** work stream. See BLANC_REFINEMENT_PLAN.md,
 * "Parallel split". The Library & Arcade stream must not edit this file.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Pillar 0 (BLANC_REFINEMENT_PLAN.md): `player` and `video` were tab bail-outs
 * that mounted `MediaView` inside `BlancViewHost`, which drags `AppChrome` into
 * a Blanc window. The library/tree/search helpers already lived in
 * `renderer/mediaLibrary.ts` and the Whisper plumbing in `whisperSettings` /
 * `whisperModelCache` / `whisperWorker`; what was view-local was the toolbar,
 * the player stage with its subtitle bar, and the library grid.
 *
 * `mode` is preserved verbatim ('full' | 'library' | 'video') so Study OS's
 * three entry points keep behaving identically; Blanc picks a mode per panel.
 *
 * The library grid stays on `VirtualGrid` in both shells — a large media folder
 * must not drop frames while the window is dragged (CLAUDE.md performance rule,
 * and Pillar 1 item 4).
 *
 * Nothing here may import `AppChrome`/`MenuBar`/`StatusBar`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DictionaryPopup from '../DictionaryPopup';
import Icon from '../Icons';
import MediaLibraryActions from '../MediaLibraryActions';
import SubtitleCueLine from '../SubtitleCueLine';
import VirtualGrid from '../VirtualGrid';
import { translate } from '../../translator';
import type { MediaItem, MediaOpen, YouTubeSubtitleLang } from '../../../shared/types';
import type { MediaKind } from '../../../shared/mediaKind';
import { WHISPER_MODEL_SPECS, type WhisperModelTier } from '../../../shared/whisperModels';
import { parseSubtitles, type Cue } from '../../subtitles';
import { cuesToSrt, cuesToVtt, downloadSubtitles } from '../../subtitlesExport';
import {
  loadWhisperDevice,
  loadWhisperModelTier,
  onWhisperDeviceChanged,
  onWhisperModelChanged,
  setWhisperModelTier,
  whisperHfId,
} from '../../whisperSettings';
import {
  isDownloadedIn,
  loadDownloaded,
  markTierDownloaded,
  onDownloadedChanged,
} from '../../whisperModelCache';
import { getStudyLang, onStudyLangChanged, setStudyLang } from '../../studyEnvironment';
import { useDebouncedValue } from '../../hooks';
import {
  buildMediaTree,
  buildMediaFileSearchIndex,
  collectTreeItems,
  filterItemsById,
  flattenFolderNav,
  searchMediaByFileName,
} from '../../mediaLibrary';
import { lookupWordFromMouseUp, isLookupClick, noteLookupPointerDown } from '../../wordLookup';
import { registerCommandHandler } from '../../keyboardShortcuts';
import { useT } from '../../i18n';

const CARD_MIN_WIDTH = 230;
const CARD_GAP = 12;
const CARD_ROW_HEIGHT = 108; // card content height + gap, generous enough to never clip
const COLLAPSED_KEY = 'jp-media-collapsed';
export const RATE_PRESETS = [0.7, 0.75, 0.85, 0.9, 1, 1.25, 1.5] as const;

function loadCollapsed(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((v) => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

export type GenState = 'idle' | 'extracting' | 'loading' | 'transcribing' | 'done' | 'error';

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function malUrl(title: string): string {
  return `https://myanimelist.net/anime.php?cat=anime&q=${encodeURIComponent(title)}`;
}

export type MediaViewMode = 'full' | 'library' | 'video';

export interface MediaState {
  mode: MediaViewMode;
  showLibrary: boolean;
  showPlayer: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  sigBurst: boolean;
  fireSigBurst: () => void;
  items: MediaItem[];
  setItems: (items: MediaItem[]) => void;
  watchFolder: string | null;
  current: MediaItem | null;
  src: string | null;
  cues: Cue[];
  subName: string;
  subStatus: string;
  subOffset: number;
  active: Cue | null;
  popup: { query: string; x: number; y: number; context?: string } | null;
  setPopup: (p: { query: string; x: number; y: number; context?: string } | null) => void;
  popupRef: React.MutableRefObject<{ query: string; x: number; y: number; context?: string } | null>;
  popupOpenOnDownRef: React.MutableRefObject<boolean>;
  error: string;
  setError: (s: string) => void;
  converting: boolean;
  modelTier: WhisperModelTier;
  setModelTier: (t: WhisperModelTier) => void;
  prefer: ReturnType<typeof loadWhisperDevice>;
  downloaded: ReturnType<typeof loadDownloaded>;
  subLang: 'ja' | 'zh';
  setSubLang: (l: 'ja' | 'zh') => void;
  genState: GenState;
  genMsg: string;
  genProgress: number;
  genError: string;
  generating: boolean;
  ytUrl: string;
  setYtUrl: (u: string) => void;
  ytSubLang: YouTubeSubtitleLang;
  setYtSubLang: (l: YouTubeSubtitleLang) => void;
  yt: { stage: string; percent: number } | null;
  ytError: string;
  lineTrans: string;
  lineBusy: boolean;
  query: string;
  setQuery: (q: string) => void;
  debouncedQuery: string;
  searchActive: boolean;
  selectedFolder: string | null;
  setSelectedFolder: (f: string | null) => void;
  kindFilter: MediaKind | 'all';
  setKindFilter: (k: MediaKind | 'all') => void;
  displayedItems: MediaItem[];
  folderRows: ReturnType<typeof flattenFolderNav>;
  hasFolders: boolean;
  toggleFolder: (key: string, e: React.MouseEvent) => void;
  playbackRate: number;
  setPlaybackRate: (r: number) => void;
  autoPause: boolean;
  setAutoPause: React.Dispatch<React.SetStateAction<boolean>>;
  loopLine: boolean;
  setLoopLine: React.Dispatch<React.SetStateAction<boolean>>;
  furigana: boolean;
  setFurigana: React.Dispatch<React.SetStateAction<boolean>>;
  dualSubs: boolean;
  setDualSubs: (v: boolean) => void;
  openFile: () => Promise<void>;
  openItem: (id: string) => Promise<void>;
  removeItem: (id: string, e: React.MouseEvent) => Promise<void>;
  downloadYouTube: () => Promise<void>;
  chooseWatchFolder: () => Promise<void>;
  clearWatch: () => Promise<void>;
  openSubs: () => Promise<void>;
  convertAndPlay: () => Promise<void>;
  runGeneration: (url: string) => Promise<void>;
  jumpLine: (delta: number) => void;
  replayLine: () => void;
  translateLine: () => Promise<void>;
  lookupAt: (e: React.MouseEvent) => void;
  saveProgress: () => void;
  nudge: (delta: number) => void;
  exportSubs: (format: 'srt' | 'vtt') => void;
  clearPlayback: () => void;
  clearPlayer: () => void;
  resumeRef: React.MutableRefObject<number>;
}

export function useMedia(mode: MediaViewMode = 'full', wired = false): MediaState {
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  // §5.1 SIG-VID: 300ms static burst on load/seek = "signal acquisition".
  const [sigBurst, setSigBurst] = useState(false);
  const sigBurstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fireSigBurst = () => {
    if (!wired) return;
    if (sigBurstTimer.current) clearTimeout(sigBurstTimer.current);
    setSigBurst(true);
    sigBurstTimer.current = setTimeout(() => setSigBurst(false), 300);
  };
  useEffect(
    () => () => {
      if (sigBurstTimer.current) clearTimeout(sigBurstTimer.current);
    },
    [],
  );
  const workerRef = useRef<Worker | null>(null);
  const resumeRef = useRef(0);
  const cuesRef = useRef<Cue[]>([]);
  const offsetRef = useRef(0);
  const autoPauseRef = useRef(false);
  const loopLineRef = useRef(false);
  const lastCueEndRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  const currentYoutubeIdRef = useRef<string | undefined>(undefined);

  const [items, setItems] = useState<MediaItem[]>([]);
  const [watchFolder, setWatchFolder] = useState<string | null>(null);
  const [current, setCurrent] = useState<MediaItem | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [cues, setCues] = useState<Cue[]>([]);
  const [subName, setSubName] = useState('');
  const [subStatus, setSubStatus] = useState('');
  const [subOffset, setSubOffset] = useState(0);
  const [active, setActive] = useState<Cue | null>(null);
  const [popup, setPopup] = useState<{
    query: string;
    x: number;
    y: number;
    context?: string;
  } | null>(null);
  const popupRef = useRef(popup);
  popupRef.current = popup;
  const popupOpenOnDownRef = useRef(false);
  const [error, setError] = useState('');
  const [converting, setConverting] = useState(false);
  const [modelTier, setModelTier] = useState<WhisperModelTier>(() =>
    loadWhisperModelTier(getStudyLang()),
  );
  const [prefer, setPrefer] = useState(loadWhisperDevice);
  const [downloaded, setDownloaded] = useState(loadDownloaded);
  const [subLang, setSubLang] = useState<'ja' | 'zh'>(() => getStudyLang());
  const [genState, setGenState] = useState<GenState>('idle');
  const [genMsg, setGenMsg] = useState('');
  const [genProgress, setGenProgress] = useState(0);
  const [genError, setGenError] = useState('');
  const [ytUrl, setYtUrl] = useState('');
  const [ytSubLang, setYtSubLang] = useState<YouTubeSubtitleLang>('none');
  const [yt, setYt] = useState<{ stage: string; percent: number } | null>(null);
  const [ytError, setYtError] = useState('');
  const [lineTrans, setLineTrans] = useState('');
  const [lineBusy, setLineBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);
  const [kindFilter, setKindFilter] = useState<MediaKind | 'all'>('all');
  const [playbackRate, setPlaybackRate] = useState(1);
  const [autoPause, setAutoPause] = useState(false);
  const [loopLine, setLoopLine] = useState(false);
  const [furigana, setFurigana] = useState(false);
  const [dualSubs, setDualSubs] = useState(true);

  const showLibrary = mode === 'full' || mode === 'library';
  const showPlayer = mode === 'full' || mode === 'video';
  const generating =
    genState === 'extracting' || genState === 'loading' || genState === 'transcribing';

  useEffect(() => {
    autoPauseRef.current = autoPause;
  }, [autoPause]);
  useEffect(() => {
    loopLineRef.current = loopLine;
  }, [loopLine]);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(Array.from(collapsed)));
  }, [collapsed]);

  const tree = useMemo(() => buildMediaTree(items), [items]);
  const searchIndex = useMemo(() => buildMediaFileSearchIndex(items), [items]);
  const debouncedQuery = useDebouncedValue(query, 80);
  const searchActive = debouncedQuery.trim().length > 0;

  const displayedItems = useMemo(() => {
    let list = items;
    if (mode === 'video') list = list.filter((i) => (i.kind ?? 'video') === 'video');
    else if (mode === 'library' && kindFilter !== 'all') {
      list = list.filter((i) => (i.kind ?? 'video') === kindFilter);
    }
    if (searchActive) {
      const hit = new Set(searchMediaByFileName(searchIndex, debouncedQuery).map((i) => i.id));
      return list.filter((i) => hit.has(i.id));
    }
    if (selectedFolder) {
      const inFolder = collectTreeItems(tree, selectedFolder);
      return filterItemsById(list, new Set(inFolder.map((it) => it.id)));
    }
    return list;
  }, [searchActive, searchIndex, debouncedQuery, selectedFolder, tree, items, mode, kindFilter]);

  const folderRows = useMemo(() => flattenFolderNav(tree, collapsed), [tree, collapsed]);
  const hasFolders = folderRows.length > 0;

  useEffect(() => {
    if (selectedFolder && collectTreeItems(tree, selectedFolder).length === 0) {
      setSelectedFolder(null);
    }
  }, [tree, selectedFolder]);

  const toggleFolder = useCallback((key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  useEffect(() => onWhisperDeviceChanged(setPrefer), []);
  useEffect(() => onWhisperModelChanged(setModelTier), []);
  useEffect(() => onDownloadedChanged(setDownloaded), []);

  // Apply study-language defaults when idle — never interrupt an in-flight job.
  useEffect(() => {
    return onStudyLangChanged((lang) => {
      if (genState === 'extracting' || genState === 'loading' || genState === 'transcribing') return;
      setSubLang(lang);
      setModelTier(loadWhisperModelTier(lang));
    });
  }, [genState]);

  useEffect(() => {
    cuesRef.current = cues;
  }, [cues]);
  useEffect(() => {
    offsetRef.current = subOffset;
  }, [subOffset]);
  useEffect(() => {
    setLineTrans('');
  }, [active]);

  useEffect(() => {
    window.api.listMedia().then(setItems);
    window.api.getMediaWatchFolder().then(setWatchFolder);
    const offItems = window.api.onMediaChanged(setItems);
    const offYt = window.api.onYoutubeProgress(setYt);
    return () => {
      offItems();
      offYt();
      workerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    if (current && !items.some((i) => i.id === current.id)) {
      setSrc(null);
      setCurrent(null);
      currentYoutubeIdRef.current = undefined;
    }
  }, [items, current]);

  const loadOpened = useCallback((r: MediaOpen) => {
    setCurrent(r.item);
    currentYoutubeIdRef.current = r.item.youtubeId;
    setSrc(r.url);
    resumeRef.current = r.item.positionSec ?? 0;
    setError('');
    setActive(null);
    setCues([]);
    setSubName('');
    setSubStatus('');
    setSubOffset(r.item.subOffsetSec ?? 0);
    setGenState('idle');
    setGenMsg('');
    setGenError('');
    setLineTrans('');
  }, []);

  // Deep-open from playlist manager / external open request.
  useEffect(() => {
    if (mode !== 'video' && mode !== 'full') return;
    let pending: string | null = null;
    try {
      pending = sessionStorage.getItem('jp-pending-media-id');
      if (pending) sessionStorage.removeItem('jp-pending-media-id');
    } catch {
      pending = null;
    }
    if (!pending) return;
    void window.api.openMedia(pending).then((r) => {
      if (r) loadOpened(r);
    });
  }, [mode, loadOpened]);

  // Run Whisper on a given playable URL (used by the button and by YouTube auto-transcribe).
  const runGeneration = useCallback(
    async (targetUrl: string) => {
      setGenError('');
      setCues([]);
      setSubName('');
      setSubStatus('');
      setSubOffset(0);
      setGenProgress(0);
      setGenState('extracting');
      setGenMsg(t('media.gen.extractingAudio'));
      let audio: Float32Array;
      try {
        const buf = await window.api.extractAudio(targetUrl);
        audio = new Float32Array(buf);
        if (audio.length === 0) throw new Error('no audio track found');
      } catch (e) {
        setGenState('error');
        setGenError(t('media.gen.extractAudioFailed', { detail: msg(e) }));
        return;
      }
      setGenState('loading');
      setGenMsg(t('media.gen.loadingModel'));

      const worker = new Worker(new URL('../../whisperWorker.ts', import.meta.url), {
        type: 'module',
      });
      workerRef.current = worker;
      worker.onmessage = (ev: MessageEvent) => {
        const m = ev.data;
        if (m.type === 'progress' && m.status === 'progress' && typeof m.progress === 'number') {
          const f = typeof m.file === 'string' ? m.file.split('/').pop() : 'model';
          setGenMsg(t('media.gen.downloadingModel', { file: f, percent: Math.round(m.progress) }));
        } else if (m.type === 'status' && m.status === 'transcribing') {
          // The pipeline is loaded, so this tier's files are now fully cached —
          // for whichever backend actually won (auto can fall back to wasm).
          markTierDownloaded(modelTier, m.device === 'webgpu' ? 'webgpu' : 'wasm', prefer);
          setGenState('transcribing');
          setGenMsg(
            t('media.gen.transcribingOn', {
              device: m.device === 'webgpu' ? t('media.device.gpu') : t('media.device.cpu'),
            }),
          );
        } else if (m.type === 'partial') {
          setCues((prev) => [...prev, ...(m.cues as Cue[])]);
          setGenProgress(m.progress ?? 0);
        } else if (m.type === 'done') {
          setGenState('done');
          setGenMsg('');
          setGenProgress(1);
          setSubName(t('media.subName.whisperGenerated'));
          setCues((prev) => {
            setSubStatus(t('media.subStatus.generated', { count: prev.length }));
            const ytId = currentYoutubeIdRef.current;
            if (ytId) {
              void window.api.ytMarkTranscribed(ytId, JSON.stringify(prev));
            }
            return prev;
          });
          worker.terminate();
          workerRef.current = null;
        } else if (m.type === 'error') {
          setGenState('error');
          setGenError(t('media.gen.subtitleFailed', { detail: m.message }));
          worker.terminate();
          workerRef.current = null;
        }
      };
      worker.onerror = (err) => {
        setGenState('error');
        setGenError(t('media.gen.transcriberStartFailed', { detail: err.message }));
      };
      worker.postMessage(
        { audio, model: whisperHfId(modelTier), prefer, lang: subLang },
        [audio.buffer],
      );
    },
    [modelTier, prefer, subLang, t],
  );

  const openFile = useCallback(async () => {
    const r = await window.api.pickMedia();
    if (r) loadOpened(r);
  }, [loadOpened]);

  const openItem = useCallback(
    async (id: string) => {
      // §5.1 SIG-VID: tape-seek cue on library row open (wired pack only).
      if (document.documentElement.getAttribute('data-materials') === 'wired') {
        window.dispatchEvent(new CustomEvent('wired:tape-seek'));
      }
      const r = await window.api.openMedia(id);
      if (r) loadOpened(r);
      else setError('That file has moved or been deleted.');
    },
    [loadOpened],
  );

  const removeItem = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const next = await window.api.removeMedia(id);
      setItems(next);
      if (current?.id === id) {
        setSrc(null);
        setCurrent(null);
      }
    },
    [current],
  );

  const downloadYouTube = useCallback(async () => {
    const url = ytUrl.trim();
    if (!url) return;
    setYtError('');
    setYt({ stage: 'starting', percent: 0 });
    const r = await window.api.downloadYouTube(url, false, { subtitleLang: ytSubLang });
    setYt(null);
    if ('error' in r) {
      setYtError(r.error);
      return;
    }
    setYtUrl('');
    loadOpened(r);
    if (r.subtitle) {
      const parsed = parseSubtitles(r.subtitle.text);
      setCues(parsed);
      setSubName(r.subtitle.name);
      setSubOffset(0);
      setSubStatus(
        parsed.length
          ? t('media.subStatus.loaded', { count: parsed.length })
          : t('media.subStatus.noLines', { name: r.subtitle.name }),
      );
    } else {
      if (ytSubLang !== 'none')
        setSubStatus('No matching existing subtitles found. Generating subtitles instead.');
      void runGeneration(r.url);
    }
  }, [ytUrl, ytSubLang, loadOpened, runGeneration, t]);

  const chooseWatchFolder = useCallback(async () => {
    const r = await window.api.setMediaWatchFolder();
    setWatchFolder(r.folder);
    setItems(r.items);
  }, []);
  const clearWatch = useCallback(async () => {
    await window.api.clearMediaWatchFolder();
    setWatchFolder(null);
  }, []);

  const openSubs = useCallback(async () => {
    const r = await window.api.pickSubtitle();
    if (!r) return;
    const parsed = parseSubtitles(r.text);
    setCues(parsed);
    setSubName(r.name);
    setSubOffset(0);
    setSubStatus(
      parsed.length
        ? t('media.subStatus.loaded', { count: parsed.length })
        : t('media.subStatus.noLines', { name: r.name }),
    );
  }, [t]);

  const convertAndPlay = useCallback(async () => {
    if (!src) return;
    setConverting(true);
    setError('');
    try {
      const r = await window.api.convertMedia(src);
      if (r) setSrc(r.url);
      else setError(t('media.conversionFailedGeneric'));
    } catch (e) {
      setError(t('media.conversionFailed', { detail: msg(e) }));
    }
    setConverting(false);
  }, [src, t]);

  // High-resolution cue sync (timeupdate is too coarse for auto-pause).
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !src) return;

    const tick = (): void => {
      const tNow = v.currentTime - offsetRef.current;
      const list = cuesRef.current;
      let found: Cue | null = null;
      for (let i = 0; i < list.length; i++) {
        if (tNow >= list[i].start && tNow < list[i].end) {
          found = list[i];
          break;
        }
      }
      setActive((prev) =>
        prev?.start === found?.start && prev?.text === found?.text ? prev : found,
      );

      if (found) {
        const end = found.end + offsetRef.current;
        if (loopLineRef.current && v.currentTime >= end - 0.04) {
          v.currentTime = found.start + offsetRef.current;
        } else if (
          autoPauseRef.current &&
          !v.paused &&
          lastCueEndRef.current !== found.end &&
          v.currentTime >= end - 0.05
        ) {
          lastCueEndRef.current = found.end;
          v.pause();
        }
      } else {
        lastCueEndRef.current = null;
      }

      if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
        rafRef.current = (
          v as HTMLVideoElement & {
            requestVideoFrameCallback: (cb: () => void) => number;
          }
        ).requestVideoFrameCallback(tick);
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    tick();
    return () => {
      if ('cancelVideoFrameCallback' in HTMLVideoElement.prototype) {
        (
          v as HTMLVideoElement & { cancelVideoFrameCallback: (id: number) => void }
        ).cancelVideoFrameCallback(rafRef.current);
      } else {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [src]);

  // Apply pitch-preserving playback rate.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.preservesPitch = true;
    v.playbackRate = playbackRate;
  }, [playbackRate, src]);

  const jumpLine = useCallback((delta: number) => {
    const v = videoRef.current;
    const list = cuesRef.current;
    if (!v || list.length === 0) return;
    const at = v.currentTime - offsetRef.current;
    let cur = -1;
    for (let i = 0; i < list.length; i++) {
      if (list[i].start <= at + 0.05) cur = i;
      else break;
    }
    const target = Math.min(Math.max(cur + delta, 0), list.length - 1);
    v.currentTime = list[target].start + offsetRef.current;
    void v.play();
  }, []);

  const replayLine = useCallback(() => {
    const v = videoRef.current;
    if (!v || !active) return;
    v.currentTime = active.start + offsetRef.current;
    void v.play();
  }, [active]);

  const translateLine = useCallback(async () => {
    if (!active) return;
    setLineBusy(true);
    try {
      const lang = getStudyLang();
      setLineTrans(await translate(active.text, lang));
    } catch {
      setLineTrans(t('media.offlineTranslatorUnavailable'));
    }
    setLineBusy(false);
  }, [active, t]);

  const lookupAt = useCallback(
    (e: React.MouseEvent) => {
      const dismissOnly = popupOpenOnDownRef.current && isLookupClick(e);
      const hit = lookupWordFromMouseUp(e);
      if (hit && !hit.translate) {
        setPopup({ query: hit.query, x: hit.x, y: hit.y, context: active?.text });
      } else if (dismissOnly) setPopup(null);
    },
    [active],
  );

  const saveProgress = useCallback(() => {
    const v = videoRef.current;
    if (v && current && v.currentTime > 3) window.api.setMediaPosition(current.id, v.currentTime);
  }, [current]);

  const nudge = useCallback(
    (delta: number) => {
      setSubOffset((o) => {
        const next = Math.round((o + delta) * 1000) / 1000;
        if (current) void window.api.setMediaSubOffset(current.id, next);
        return next;
      });
    },
    [current],
  );

  const exportSubs = useCallback(
    (format: 'srt' | 'vtt') => {
      if (!cues.length) return;
      const base = (current?.fileName ?? 'transcript').replace(/\.[^.]+$/, '');
      if (format === 'srt') downloadSubtitles(`${base}.srt`, cuesToSrt(cues), 'text/srt');
      else downloadSubtitles(`${base}.vtt`, cuesToVtt(cues), 'text/vtt');
    },
    [cues, current],
  );

  const clearPlayback = useCallback(() => {
    setSrc(null);
    setCurrent(null);
    setWatchFolder(null);
  }, []);

  const clearPlayer = useCallback(() => {
    setSrc(null);
    setCurrent(null);
  }, []);

  // Video learning shortcuts (Phase 5b).
  useEffect(() => {
    if (!showPlayer) return;
    const offs = [
      registerCommandHandler('video.replayLine', () => replayLine()),
      registerCommandHandler('video.prevLine', () => jumpLine(-1)),
      registerCommandHandler('video.nextLine', () => jumpLine(1)),
      registerCommandHandler('video.subEarlier', () => nudge(-0.1)),
      registerCommandHandler('video.subLater', () => nudge(0.1)),
      registerCommandHandler('video.subEarlierLarge', () => nudge(-0.5)),
      registerCommandHandler('video.subLaterLarge', () => nudge(0.5)),
      registerCommandHandler('video.toggleAutoPause', () => setAutoPause((v) => !v)),
      registerCommandHandler('video.toggleLoop', () => setLoopLine((v) => !v)),
      registerCommandHandler('video.toggleFurigana', () => setFurigana((v) => !v)),
    ];
    return () => offs.forEach((off) => off());
  }, [showPlayer, replayLine, jumpLine, nudge]);

  return {
    mode,
    showLibrary,
    showPlayer,
    videoRef,
    sigBurst,
    fireSigBurst,
    items,
    setItems,
    watchFolder,
    current,
    src,
    cues,
    subName,
    subStatus,
    subOffset,
    active,
    popup,
    setPopup,
    popupRef,
    popupOpenOnDownRef,
    error,
    setError,
    converting,
    modelTier,
    setModelTier,
    prefer,
    downloaded,
    subLang,
    setSubLang,
    genState,
    genMsg,
    genProgress,
    genError,
    generating,
    ytUrl,
    setYtUrl,
    ytSubLang,
    setYtSubLang,
    yt,
    ytError,
    lineTrans,
    lineBusy,
    query,
    setQuery,
    debouncedQuery,
    searchActive,
    selectedFolder,
    setSelectedFolder,
    kindFilter,
    setKindFilter,
    displayedItems,
    folderRows,
    hasFolders,
    toggleFolder,
    playbackRate,
    setPlaybackRate,
    autoPause,
    setAutoPause,
    loopLine,
    setLoopLine,
    furigana,
    setFurigana,
    dualSubs,
    setDualSubs,
    openFile,
    openItem,
    removeItem,
    downloadYouTube,
    chooseWatchFolder,
    clearWatch,
    openSubs,
    convertAndPlay,
    runGeneration,
    jumpLine,
    replayLine,
    translateLine,
    lookupAt,
    saveProgress,
    nudge,
    exportSubs,
    clearPlayback,
    clearPlayer,
    resumeRef,
  };
}

/** Whisper model picker + subtitle language segment. Player modes only. */
export function MediaTranscriptionControls({ state }: { state: MediaState }) {
  const { t } = useT();
  return (
    <>
      <select
        className="media-model-select"
        value={state.modelTier}
        aria-label={t('media.model.ariaLabel')}
        onChange={(e) => {
          const tier = e.target.value as WhisperModelTier;
          state.setModelTier(tier);
          setWhisperModelTier(tier);
        }}
      >
        {WHISPER_MODEL_SPECS.map((s) => (
          <option key={s.id} value={s.id}>
            {t(`media.model.${s.id}`)}
            {isDownloadedIn(state.downloaded, s.id, state.prefer)
              ? ' ✓'
              : ` · ${t('media.model.willDownload')}`}
          </option>
        ))}
      </select>
      <div className="sp-seg media-modelseg" role="group" aria-label={t('media.lang.ariaLabel')}>
        <button
          className={`sp-seg-btn ${state.subLang === 'ja' ? 'active' : ''}`}
          onClick={() => {
            state.setSubLang('ja');
            setStudyLang('ja');
          }}
          title={t('media.lang.ja.title')}
          lang="ja"
        >
          日本語
        </button>
        <button
          className={`sp-seg-btn ${state.subLang === 'zh' ? 'active' : ''}`}
          onClick={() => {
            state.setSubLang('zh');
            setStudyLang('zh');
          }}
          title={t('media.lang.zh.title')}
          lang="zh"
        >
          中文
        </button>
      </div>
    </>
  );
}

/** Watch-folder chip. */
export function MediaWatchFolder({ state }: { state: MediaState }) {
  const { t } = useT();
  return (
    <div className="media-watch">
      {state.watchFolder ? (
        <>
          <span className="muted media-watch-path" title={state.watchFolder}>
            <Icon name="eye" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
            {state.watchFolder.split(/[\\/]/).pop()}
          </span>
          <button className="btn small" onClick={() => void state.clearWatch()}>
            {t('media.watch.stop')}
          </button>
        </>
      ) : (
        <button className="btn small" onClick={() => void state.chooseWatchFolder()}>
          <Icon name="eye" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
          {t('media.watch.autoAdd')}
        </button>
      )}
    </div>
  );
}

/** YouTube download + subtitle-language row. Player modes only. */
export function MediaYoutubeBar({ state }: { state: MediaState }) {
  const { t } = useT();
  return (
    <>
      <div className="media-yt">
        <input
          className="gram-search media-yt-input"
          type="text"
          value={state.ytUrl}
          onChange={(e) => state.setYtUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void state.downloadYouTube()}
          placeholder={t('media.yt.placeholder')}
          disabled={!!state.yt}
        />
        <select
          className="media-model-select"
          value={state.ytSubLang}
          onChange={(e) => state.setYtSubLang(e.target.value as YouTubeSubtitleLang)}
          disabled={!!state.yt}
          title="Download existing subtitles when available"
          aria-label="Existing subtitle language"
        >
          <option value="none">No existing subs</option>
          <option value="ja">Japanese subs</option>
          <option value="zh">Chinese subs</option>
          <option value="en">English subs</option>
          <option value="ru">Russian subs</option>
        </select>
        <button
          className="btn"
          onClick={() => void state.downloadYouTube()}
          disabled={!state.ytUrl.trim() || !!state.yt}
        >
          <Icon name="download" size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
          {t('media.yt.downloadTranscribe')}
        </button>
        {state.yt && (
          <span className="muted media-yt-prog">
            {state.yt.stage === 'merging'
              ? t('media.yt.merging')
              : t('media.yt.downloading', { percent: Math.round(state.yt.percent) })}
          </span>
        )}
      </div>
      {state.ytError && <div className="media-error">{state.ytError}</div>}
    </>
  );
}

/** Transcription progress, error, and subtitle status. Player modes only. */
export function MediaGenerationStatus({ state }: { state: MediaState }) {
  return (
    <>
      {state.generating && (
        <div className="media-gen">
          <span className="media-gen-dot" />
          <div className="media-gen-body">
            <span>{state.genMsg}</span>
            {state.genState === 'transcribing' && (
              <div className="media-gen-bar">
                <div
                  className="media-gen-bar-fill"
                  style={{ width: `${Math.round(state.genProgress * 100)}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}
      {state.genError && <div className="media-error">{state.genError}</div>}
      {state.subStatus && !state.generating && (
        <div className="media-substatus muted">{state.subStatus}</div>
      )}
    </>
  );
}

/** The `<video>` element, its error/convert affordance, and the subtitle bar. */
export function MediaPlayerStage({ state }: { state: MediaState }) {
  const { t } = useT();
  const { cues, active, current, error } = state;
  if (!state.src) return null;

  return (
    <div className={`media-stage${state.sigBurst ? ' is-acquiring' : ''}`}>
      {/* Subtitles are rendered by SubtitleCueLine below, not as a <track>, so the
          video element deliberately has no caption child. */}
      <video
        ref={state.videoRef}
        className="media-video"
        src={state.src}
        controls
        autoPlay
        onLoadStart={state.fireSigBurst}
        onSeeking={state.fireSigBurst}
        onLoadedMetadata={() => {
          const v = state.videoRef.current;
          if (v && state.resumeRef.current > 5 && state.resumeRef.current < v.duration - 5) {
            v.currentTime = state.resumeRef.current;
          }
          if (v) {
            v.preservesPitch = true;
            v.playbackRate = state.playbackRate;
          }
        }}
        onPause={state.saveProgress}
        onError={() => state.setError(t('media.playError'))}
      />

      {error && (
        <div className="media-error media-error-inline">
          <span>{error}</span>
          <button
            className="btn small"
            onClick={() => void state.convertAndPlay()}
            disabled={state.converting}
          >
            {state.converting ? (
              t('media.converting')
            ) : (
              <>
                <Icon name="video" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                {t('media.convertToMp4')}
              </>
            )}
          </button>
        </div>
      )}

      <div className="media-subbar">
        {cues.length > 0 && (
          <div className="media-subctrls">
            <button className="btn small" onClick={() => state.jumpLine(-1)}>
              <Icon name="skip-back" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
              {t('media.subctrl.prev')}
            </button>
            <button className="btn small" onClick={state.replayLine} disabled={!active}>
              <Icon name="refresh" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
              {t('media.subctrl.replay')}
            </button>
            <button className="btn small" onClick={() => state.jumpLine(1)}>
              {t('media.subctrl.next')}
              <Icon name="skip-forward" size={13} style={{ marginLeft: 4, verticalAlign: '-2px' }} />
            </button>
            <div className="media-sync">
              <button
                className="btn small"
                onClick={() => state.nudge(-0.1)}
                title={t('media.sync.earlier')}
              >
                −0.1s
              </button>
              <span className="media-sync-val" title={t('media.sync.offsetTitle')}>
                {state.subOffset > 0 ? '+' : ''}
                {state.subOffset.toFixed(2)}s
              </span>
              <button
                className="btn small"
                onClick={() => state.nudge(0.1)}
                title={t('media.sync.later')}
              >
                +0.1s
              </button>
            </div>
            <select
              className="media-rate-select"
              value={state.playbackRate}
              aria-label={t('video.rate')}
              onChange={(e) => state.setPlaybackRate(Number(e.target.value))}
            >
              {RATE_PRESETS.map((r) => (
                <option key={r} value={r}>
                  {r.toFixed(2)}x
                </option>
              ))}
            </select>
            <label className="ocr-check muted">
              <input
                type="checkbox"
                checked={state.autoPause}
                onChange={(e) => state.setAutoPause(e.target.checked)}
              />
              {t('video.autoPause')}
            </label>
            <label className="ocr-check muted">
              <input
                type="checkbox"
                checked={state.loopLine}
                onChange={(e) => state.setLoopLine(e.target.checked)}
              />
              {t('video.loopLine')}
            </label>
            <label className="ocr-check muted">
              <input
                type="checkbox"
                checked={state.furigana}
                onChange={(e) => state.setFurigana(e.target.checked)}
              />
              {t('video.furigana')}
            </label>
            <label className="ocr-check muted">
              <input
                type="checkbox"
                checked={state.dualSubs}
                onChange={(e) => state.setDualSubs(e.target.checked)}
              />
              {t('video.dualSubs')}
            </label>
            <button
              className="btn small"
              onClick={() => void state.translateLine()}
              disabled={!active || state.lineBusy}
            >
              {state.lineBusy ? (
                '…'
              ) : (
                <>
                  <Icon name="globe" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                  {t('media.translate')}
                </>
              )}
            </button>
            <button
              className="btn small"
              onClick={() => state.exportSubs('srt')}
              disabled={!cues.length}
            >
              {t('video.exportSrt')}
            </button>
            {current && (
              <button
                className="btn small"
                onClick={() => window.api.openExternal(malUrl(current.title))}
              >
                {t('media.mal')}
                <Icon name="external" size={12} style={{ marginLeft: 4, verticalAlign: '-2px' }} />
              </button>
            )}
          </div>
        )}
        {active ? (
          <SubtitleCueLine
            className="media-subtitle"
            text={active.text}
            furigana={state.furigana}
            onMouseDown={(e) => {
              state.popupOpenOnDownRef.current = !!state.popupRef.current;
              noteLookupPointerDown(e);
            }}
            onMouseUp={state.lookupAt}
          />
        ) : (
          <div className="media-subtitle"> </div>
        )}
        {state.dualSubs && state.lineTrans && (
          <div className="media-subtrans">{state.lineTrans}</div>
        )}
        {cues.length === 0 && <p className="media-subhint muted">{t('media.noSubsHint')}</p>}
      </div>
    </div>
  );
}

/** Search field over the library. */
export function MediaSearchBox({ state }: { state: MediaState }) {
  const { t } = useT();
  return (
    <div className="media-search">
      <Icon name="search" size={13} />
      <input
        type="text"
        value={state.query}
        onChange={(e) => state.setQuery(e.target.value)}
        placeholder={t('media.search.placeholder')}
        aria-label={t('media.search.ariaLabel')}
      />
      {state.query && (
        <button
          className="media-search-clear"
          onClick={() => state.setQuery('')}
          title={t('media.search.clear')}
        >
          ×
        </button>
      )}
    </div>
  );
}

/** Folder rail. Rendered only when there are folders and no active search. */
export function MediaFolderNav({ state }: { state: MediaState }) {
  const { t } = useT();
  return (
    <nav className="media-lib-folders" aria-label={t('media.folders.ariaLabel')}>
      <button
        type="button"
        className={`media-folder-row media-folder-all ${state.selectedFolder === null ? 'active' : ''}`}
        onClick={() => state.setSelectedFolder(null)}
      >
        <Icon name="video" size={13} style={{ flexShrink: 0 }} />
        <span className="media-folder-name">{t('media.folders.all')}</span>
        <span className="muted media-folder-count">{state.items.length}</span>
      </button>
      {state.folderRows.map((row) => (
        <div
          key={row.key}
          className={`media-folder-row ${state.selectedFolder === row.key ? 'active' : ''}`}
          style={{ paddingLeft: 10 + row.depth * 14 }}
        >
          <button
            type="button"
            className="media-folder-chevron"
            onClick={(e) => state.toggleFolder(row.key, e)}
            aria-label={row.collapsed ? t('media.folder.expand') : t('media.folder.collapse')}
          >
            <Icon
              name="chevron"
              size={12}
              style={{
                transition: 'transform 0.15s ease',
                transform: row.collapsed ? undefined : 'rotate(90deg)',
              }}
            />
          </button>
          <button
            type="button"
            className="media-folder-select"
            onClick={() => state.setSelectedFolder(row.key)}
            title={row.key}
          >
            <Icon name="folder" size={13} style={{ flexShrink: 0 }} />
            <span className="media-folder-name">{row.name}</span>
            <span className="muted media-folder-count">{row.count}</span>
          </button>
        </div>
      ))}
    </nav>
  );
}

/** The virtualized card grid, or the "nothing matched" state. */
export function MediaGrid({ state }: { state: MediaState }) {
  const { t } = useT();

  if (state.displayedItems.length === 0) {
    return (
      <div className="media-empty media-empty-filtered">
        <p className="muted">
          {state.searchActive
            ? t('media.noMatch', { query: state.debouncedQuery })
            : t('media.noFilesInFolder')}
        </p>
      </div>
    );
  }

  return (
    <VirtualGrid
      items={state.displayedItems}
      minColWidth={CARD_MIN_WIDTH}
      gap={CARD_GAP}
      rowHeight={CARD_ROW_HEIGHT}
      className="media-lib-grid-wrap"
      getKey={(it) => it.id}
      renderItem={(it) => (
        <div
          className={`media-card ${state.current?.id === it.id ? 'active' : ''}`}
          onClick={() => void state.openItem(it.id)}
        >
          <div className="media-card-thumb">
            <Icon name="video" size={22} />
          </div>
          <div className="media-card-body">
            <span className="media-card-title">{it.title}</span>
            <span className="media-card-file">{it.fileName}</span>
            <div className="media-card-actions">
              <button
                className="media-card-link"
                onClick={(e) => {
                  e.stopPropagation();
                  window.api.openExternal(malUrl(it.title));
                }}
              >
                {t('media.malShort')}
                <Icon name="external" size={11} style={{ marginLeft: 3, verticalAlign: '-2px' }} />
              </button>
              <button
                className="media-card-del"
                onClick={(e) => void state.removeItem(it.id, e)}
                title={t('media.remove')}
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          </div>
        </div>
      )}
    />
  );
}

/** Empty-library state, shown instead of the grid when nothing is imported. */
export function MediaEmptyLibrary() {
  const { t } = useT();
  return (
    <div className="media-empty">
      <div className="media-empty-emoji">
        <Icon name="video" size={44} />
      </div>
      <p>{t('media.emptyHint')}</p>
      <p className="muted media-empty-note">
        {t('media.emptyNotePrefix')} <b>{t('media.watch.autoAddLabel')}</b>{' '}
        {t('media.emptyNoteSuffix')}
      </p>
    </div>
  );
}

/** Kind filter segment (all / video / audio / audiobook). Not shown in video mode. */
export function MediaKindFilter({ state }: { state: MediaState }) {
  const { t } = useT();
  return (
    <div className="sp-seg" role="group" aria-label={t('media.kindFilter')}>
      {(['all', 'video', 'audio', 'audiobook'] as const).map((k) => (
        <button
          key={k}
          type="button"
          className={`sp-seg-btn ${state.kindFilter === k ? 'active' : ''}`}
          onClick={() => state.setKindFilter(k)}
        >
          {t(`media.kind.${k}`)}
        </button>
      ))}
    </div>
  );
}

export { MediaLibraryActions };

/** Word-lookup popup for the subtitle line. */
export function MediaLookupPopup({ state }: { state: MediaState }) {
  if (!state.popup) return null;
  return (
    <DictionaryPopup
      query={state.popup.query}
      x={state.popup.x}
      y={state.popup.y}
      context={state.popup.context ?? state.active?.text}
      onClose={() => state.setPopup(null)}
    />
  );
}
