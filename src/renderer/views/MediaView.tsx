import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DictionaryPopup from '../components/DictionaryPopup';
import Icon from '../components/Icons';
import MediaLibraryActions from '../components/MediaLibraryActions';
import VirtualGrid from '../components/VirtualGrid';
import { translate } from '../translator';
import type { MediaItem, MediaOpen } from '../../shared/types';
import { parseSubtitles, type Cue } from '../subtitles';
import { loadWhisperDevice, onWhisperDeviceChanged } from '../whisperSettings';
import { useDebouncedValue } from '../hooks';
import {
  buildMediaTree,
  buildMediaFileSearchIndex,
  collectTreeItems,
  filterItemsById,
  flattenFolderNav,
  searchMediaByFileName,
} from '../mediaLibrary';
import { lookupWordFromMouseUp, isLookupClick, noteLookupPointerDown } from '../wordLookup';
import { useT } from '../i18n';

const CARD_MIN_WIDTH = 230;
const CARD_GAP = 12;
const CARD_ROW_HEIGHT = 108; // card content height + gap, generous enough to never clip
const COLLAPSED_KEY = 'jp-media-collapsed';

function loadCollapsed(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((v) => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

type WhisperModel = 'Xenova/whisper-base' | 'Xenova/whisper-small';
type GenState = 'idle' | 'extracting' | 'loading' | 'transcribing' | 'done' | 'error';

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
function malUrl(title: string): string {
  return `https://myanimelist.net/anime.php?cat=anime&q=${encodeURIComponent(title)}`;
}

export default function MediaView() {
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const resumeRef = useRef(0);
  const cuesRef = useRef<Cue[]>([]);
  const offsetRef = useRef(0);

  const [items, setItems] = useState<MediaItem[]>([]);
  const [watchFolder, setWatchFolder] = useState<string | null>(null);
  const [current, setCurrent] = useState<MediaItem | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [cues, setCues] = useState<Cue[]>([]);
  const [subName, setSubName] = useState('');
  const [subStatus, setSubStatus] = useState('');
  const [subOffset, setSubOffset] = useState(0);
  const [active, setActive] = useState<Cue | null>(null);
  const [popup, setPopup] = useState<{ query: string; x: number; y: number } | null>(null);
  const popupRef = useRef(popup);
  popupRef.current = popup;
  const popupOpenOnDownRef = useRef(false);
  const [error, setError] = useState('');
  const [converting, setConverting] = useState(false);
  const [model, setModel] = useState<WhisperModel>('Xenova/whisper-base');
  const [prefer, setPrefer] = useState(loadWhisperDevice);
  const [subLang, setSubLang] = useState<'ja' | 'zh'>(
    () =>
      (localStorage.getItem('jp-study-whisper-lang') as 'ja' | 'zh') ||
      (localStorage.getItem('jp-study-dict-lang') as 'ja' | 'zh') ||
      'ja',
  );
  const [genState, setGenState] = useState<GenState>('idle');
  const [genMsg, setGenMsg] = useState('');
  const [genProgress, setGenProgress] = useState(0);
  const [genError, setGenError] = useState('');
  const [ytUrl, setYtUrl] = useState('');
  const [yt, setYt] = useState<{ stage: string; percent: number } | null>(null);
  const [ytError, setYtError] = useState('');
  const [lineTrans, setLineTrans] = useState('');
  const [lineBusy, setLineBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);

  const generating = genState === 'extracting' || genState === 'loading' || genState === 'transcribing';

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(Array.from(collapsed)));
  }, [collapsed]);

  const tree = useMemo(() => buildMediaTree(items), [items]);
  const searchIndex = useMemo(() => buildMediaFileSearchIndex(items), [items]);
  const debouncedQuery = useDebouncedValue(query, 80);
  const searchActive = debouncedQuery.trim().length > 0;

  const displayedItems = useMemo(() => {
    if (searchActive) return searchMediaByFileName(searchIndex, debouncedQuery);
    if (selectedFolder) {
      const inFolder = collectTreeItems(tree, selectedFolder);
      return filterItemsById(items, new Set(inFolder.map((it) => it.id)));
    }
    return items;
  }, [searchActive, searchIndex, debouncedQuery, selectedFolder, tree, items]);

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
    }
  }, [items, current]);

  const loadOpened = useCallback((r: MediaOpen) => {
    setCurrent(r.item);
    setSrc(r.url);
    resumeRef.current = r.item.positionSec ?? 0;
    setError('');
    setActive(null);
    setCues([]);
    setSubName('');
    setSubStatus('');
    setSubOffset(0);
    setGenState('idle');
    setGenMsg('');
    setGenError('');
  }, []);

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

      const worker = new Worker(new URL('../whisperWorker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      worker.onmessage = (ev: MessageEvent) => {
        const m = ev.data;
        if (m.type === 'progress' && m.status === 'progress' && typeof m.progress === 'number') {
          const f = typeof m.file === 'string' ? m.file.split('/').pop() : 'model';
          setGenMsg(t('media.gen.downloadingModel', { file: f, percent: Math.round(m.progress) }));
        } else if (m.type === 'status' && m.status === 'transcribing') {
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
      worker.postMessage({ audio, model, prefer, lang: subLang }, [audio.buffer]);
    },
    [model, prefer, subLang, t],
  );

  const openFile = useCallback(async () => {
    const r = await window.api.pickMedia();
    if (r) loadOpened(r);
  }, [loadOpened]);

  const openItem = useCallback(
    async (id: string) => {
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
    const r = await window.api.downloadYouTube(url);
    setYt(null);
    if ('error' in r) {
      setYtError(r.error);
      return;
    }
    setYtUrl('');
    loadOpened(r);
    void runGeneration(r.url); // automatically transcribe
  }, [ytUrl, loadOpened, runGeneration]);

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

  // Sync the on-screen subtitle to playback (reads refs so it never re-subscribes
  // mid-transcription as cues stream in).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = (): void => {
      const t = v.currentTime - offsetRef.current;
      const found = cuesRef.current.find((c) => t >= c.start && t < c.end) ?? null;
      setActive((prev) => (prev?.start === found?.start && prev?.text === found?.text ? prev : found));
    };
    v.addEventListener('timeupdate', onTime);
    return () => v.removeEventListener('timeupdate', onTime);
  }, [src]);

  const jumpLine = useCallback((delta: number) => {
    const v = videoRef.current;
    const list = cuesRef.current;
    if (!v || list.length === 0) return;
    const t = v.currentTime - offsetRef.current;
    let cur = -1;
    for (let i = 0; i < list.length; i++) {
      if (list[i].start <= t + 0.05) cur = i;
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
      const lang = (localStorage.getItem('jp-study-dict-lang') as 'ja' | 'zh') || 'ja';
      setLineTrans(await translate(active.text, lang));
    } catch {
      setLineTrans(t('media.offlineTranslatorUnavailable'));
    }
    setLineBusy(false);
  }, [active, t]);

  const lookupAt = useCallback((e: React.MouseEvent) => {
    const dismissOnly = popupOpenOnDownRef.current && isLookupClick(e);
    const hit = lookupWordFromMouseUp(e);
    if (hit && !hit.translate) setPopup({ query: hit.query, x: hit.x, y: hit.y });
    else if (dismissOnly) setPopup(null);
  }, []);

  const saveProgress = useCallback(() => {
    const v = videoRef.current;
    if (v && current && v.currentTime > 3) window.api.setMediaPosition(current.id, v.currentTime);
  }, [current]);

  const nudge = useCallback((delta: number) => {
    setSubOffset((o) => Math.round((o + delta) * 10) / 10);
  }, []);

  const clearPlayback = useCallback(() => {
    setSrc(null);
    setCurrent(null);
    setWatchFolder(null);
  }, []);

  return (
    <div className="media-view">
      <div className="view-head">
        <p className="muted">{t('media.intro')}</p>
      </div>

      <div className="media-toolbar">
        <button className="btn primary" onClick={openFile}>
          <Icon name="folder" size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
          {t('media.openFile')}
        </button>
        <button className="btn" onClick={openSubs} disabled={!src}>
          <Icon name="caption" size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
          {subName && genState !== 'done' ? t('media.subs.loaded', { name: subName }) : t('media.subs.load')}
        </button>
        <button className="btn" onClick={() => src && runGeneration(src)} disabled={!src || generating}>
          <Icon name="sparkle" size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
          {t('media.generateSubs')}
        </button>
        <div className="sp-seg media-modelseg" role="group" aria-label={t('media.model.ariaLabel')}>
          <button
            className={`sp-seg-btn ${model === 'Xenova/whisper-base' ? 'active' : ''}`}
            onClick={() => setModel('Xenova/whisper-base')}
            title={t('media.model.fast.title')}
          >
            {t('media.model.fast')}
          </button>
          <button
            className={`sp-seg-btn ${model === 'Xenova/whisper-small' ? 'active' : ''}`}
            onClick={() => setModel('Xenova/whisper-small')}
            title={t('media.model.accurate.title')}
          >
            {t('media.model.accurate')}
          </button>
        </div>
        <div className="sp-seg media-modelseg" role="group" aria-label={t('media.lang.ariaLabel')}>
          <button
            className={`sp-seg-btn ${subLang === 'ja' ? 'active' : ''}`}
            onClick={() => {
              setSubLang('ja');
              localStorage.setItem('jp-study-whisper-lang', 'ja');
            }}
            title={t('media.lang.ja.title')}
            lang="ja"
          >
            日本語
          </button>
          <button
            className={`sp-seg-btn ${subLang === 'zh' ? 'active' : ''}`}
            onClick={() => {
              setSubLang('zh');
              localStorage.setItem('jp-study-whisper-lang', 'zh');
            }}
            title={t('media.lang.zh.title')}
            lang="zh"
          >
            中文
          </button>
        </div>
        <div className="media-watch">
          {watchFolder ? (
            <>
              <span className="muted media-watch-path" title={watchFolder}>
                <Icon name="eye" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                {watchFolder.split(/[\\/]/).pop()}
              </span>
              <button className="btn small" onClick={clearWatch}>
                {t('media.watch.stop')}
              </button>
            </>
          ) : (
            <button className="btn small" onClick={chooseWatchFolder}>
              <Icon name="eye" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
              {t('media.watch.autoAdd')}
            </button>
          )}
        </div>
      </div>

      <div className="media-yt">
        <input
          className="gram-search media-yt-input"
          type="text"
          value={ytUrl}
          onChange={(e) => setYtUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && downloadYouTube()}
          placeholder={t('media.yt.placeholder')}
          disabled={!!yt}
        />
        <button className="btn" onClick={downloadYouTube} disabled={!ytUrl.trim() || !!yt}>
          <Icon name="download" size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
          {t('media.yt.downloadTranscribe')}
        </button>
        {yt && (
          <span className="muted media-yt-prog">
            {yt.stage === 'merging' ? t('media.yt.merging') : t('media.yt.downloading', { percent: Math.round(yt.percent) })}
          </span>
        )}
      </div>
      {ytError && <div className="media-error">{ytError}</div>}

      {generating && (
        <div className="media-gen">
          <span className="media-gen-dot" />
          <div className="media-gen-body">
            <span>{genMsg}</span>
            {genState === 'transcribing' && (
              <div className="media-gen-bar">
                <div className="media-gen-bar-fill" style={{ width: `${Math.round(genProgress * 100)}%` }} />
              </div>
            )}
          </div>
        </div>
      )}
      {genError && <div className="media-error">{genError}</div>}
      {subStatus && !generating && <div className="media-substatus muted">{subStatus}</div>}

      {src && (
        <div className="media-stage">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={videoRef}
            className="media-video"
            src={src}
            controls
            autoPlay
            onLoadedMetadata={() => {
              const v = videoRef.current;
              if (v && resumeRef.current > 5 && resumeRef.current < v.duration - 5) {
                v.currentTime = resumeRef.current;
              }
            }}
            onPause={saveProgress}
            onError={() => setError(t('media.playError'))}
          />

          {error && (
            <div className="media-error media-error-inline">
              <span>{error}</span>
              <button className="btn small" onClick={convertAndPlay} disabled={converting}>
                {converting ? (
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
                <button className="btn small" onClick={() => jumpLine(-1)}>
                  <Icon name="skip-back" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                  {t('media.subctrl.prev')}
                </button>
                <button className="btn small" onClick={replayLine} disabled={!active}>
                  <Icon name="refresh" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                  {t('media.subctrl.replay')}
                </button>
                <button className="btn small" onClick={() => jumpLine(1)}>
                  {t('media.subctrl.next')}
                  <Icon name="skip-forward" size={13} style={{ marginLeft: 4, verticalAlign: '-2px' }} />
                </button>
                <div className="media-sync">
                  <button className="btn small" onClick={() => nudge(-0.5)} title={t('media.sync.earlier')}>
                    −0.5s
                  </button>
                  <span className="media-sync-val" title={t('media.sync.offsetTitle')}>
                    {subOffset > 0 ? '+' : ''}
                    {subOffset.toFixed(1)}s
                  </span>
                  <button className="btn small" onClick={() => nudge(0.5)} title={t('media.sync.later')}>
                    +0.5s
                  </button>
                </div>
                <button className="btn small" onClick={translateLine} disabled={!active || lineBusy}>
                  {lineBusy ? (
                    '…'
                  ) : (
                    <>
                      <Icon name="globe" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                      {t('media.translate')}
                    </>
                  )}
                </button>
                {current && (
                  <button className="btn small" onClick={() => window.api.openExternal(malUrl(current.title))}>
                    {t('media.mal')}
                    <Icon name="external" size={12} style={{ marginLeft: 4, verticalAlign: '-2px' }} />
                  </button>
                )}
              </div>
            )}
            <div
              className="media-subtitle"
              lang="ja"
              title={t('media.clickToLookup')}
              onMouseDown={(e) => {
                popupOpenOnDownRef.current = !!popupRef.current;
                noteLookupPointerDown(e);
              }}
              onMouseUp={lookupAt}
            >
              {active ? active.text : ' '}
            </div>
            {lineTrans && <div className="media-subtrans">{lineTrans}</div>}
            {cues.length === 0 && (
              <p className="media-subhint muted">{t('media.noSubsHint')}</p>
            )}
          </div>
        </div>
      )}

      {/* ---- media library ---- */}
      <div className="media-lib-head">
        <h2>
          {t('media.yourMedia')}{' '}
          {items.length > 0 && (
            <span className="muted">
              ({searchActive || selectedFolder ? `${displayedItems.length} / ${items.length}` : items.length})
            </span>
          )}
        </h2>
        <MediaLibraryActions onItemsChange={setItems} onCleared={clearPlayback} />
      </div>

      {items.length === 0 ? (
        <div className="media-empty">
          <div className="media-empty-emoji">
            <Icon name="video" size={44} />
          </div>
          <p>{t('media.emptyHint')}</p>
          <p className="muted media-empty-note">
            {t('media.emptyNotePrefix')} <b>{t('media.watch.autoAddLabel')}</b> {t('media.emptyNoteSuffix')}
          </p>
        </div>
      ) : (
        <div className="media-lib-panel">
          <div className="media-search">
            <Icon name="search" size={13} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('media.search.placeholder')}
              aria-label={t('media.search.ariaLabel')}
            />
            {query && (
              <button className="media-search-clear" onClick={() => setQuery('')} title={t('media.search.clear')}>
                ×
              </button>
            )}
          </div>

          <div className={`media-lib-body ${hasFolders ? 'has-folders' : ''}`}>
            {hasFolders && !searchActive && (
              <nav className="media-lib-folders" aria-label={t('media.folders.ariaLabel')}>
                <button
                  type="button"
                  className={`media-folder-row media-folder-all ${selectedFolder === null ? 'active' : ''}`}
                  onClick={() => setSelectedFolder(null)}
                >
                  <Icon name="video" size={13} style={{ flexShrink: 0 }} />
                  <span className="media-folder-name">{t('media.folders.all')}</span>
                  <span className="muted media-folder-count">{items.length}</span>
                </button>
                {folderRows.map((row) => (
                  <div
                    key={row.key}
                    className={`media-folder-row ${selectedFolder === row.key ? 'active' : ''}`}
                    style={{ paddingLeft: 10 + row.depth * 14 }}
                  >
                    <button
                      type="button"
                      className="media-folder-chevron"
                      onClick={(e) => toggleFolder(row.key, e)}
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
                      onClick={() => setSelectedFolder(row.key)}
                      title={row.key}
                    >
                      <Icon name="folder" size={13} style={{ flexShrink: 0 }} />
                      <span className="media-folder-name">{row.name}</span>
                      <span className="muted media-folder-count">{row.count}</span>
                    </button>
                  </div>
                ))}
              </nav>
            )}

            {displayedItems.length === 0 ? (
              <div className="media-empty media-empty-filtered">
                <p className="muted">
                  {searchActive
                    ? t('media.noMatch', { query: debouncedQuery })
                    : t('media.noFilesInFolder')}
                </p>
              </div>
            ) : (
              <VirtualGrid
                items={displayedItems}
                minColWidth={CARD_MIN_WIDTH}
                gap={CARD_GAP}
                rowHeight={CARD_ROW_HEIGHT}
                className="media-lib-grid-wrap"
                getKey={(it) => it.id}
                renderItem={(it) => (
                  <div
                    className={`media-card ${current?.id === it.id ? 'active' : ''}`}
                    onClick={() => openItem(it.id)}
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
                        <button className="media-card-del" onClick={(e) => removeItem(it.id, e)} title={t('media.remove')}>
                          <Icon name="close" size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              />
            )}
          </div>
        </div>
      )}

      {popup && (
        <DictionaryPopup
          query={popup.query}
          x={popup.x}
          y={popup.y}
          context={active?.text}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  );
}
