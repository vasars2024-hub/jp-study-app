/**
 * Mini View — compact launcher (“crafting table”).
 * Pinned apps open as full-size OS pop-out windows, never inside this frame.
 * Resize is uniform scale only (aspect locked).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon, { type IconName } from './Icons';
import {
  loadMiniMode,
  onMiniModeChanged,
  saveMiniMode,
  setMiniModeEnabled,
  MINI_MAX_APPS,
  MINI_MIN_APPS,
  addMiniApp,
  removeMiniApp,
  moveMiniApp,
  availableMiniApps,
  miniAppMeta,
  miniAppLaunch,
  isMiniSlotActive,
  resolveMiniDesktopWallpaper,
  onMiniDesktopWallpaperChanged,
  MINI_THEME_TINTS,
  type MiniAppId,
  type MiniDensity,
  type MiniModeSettings,
  type MiniWallpaperMode,
  type MiniInlineWidget,
  type MiniDesktopWall,
  miniAppLabel,
} from '../miniMode';
import { ClipboardWidget } from '../widgets/system';
import { useAeroMaterials, useWiredMaterials } from './ui';
import { useT } from '../i18n';
import { LANG_TAGS } from '../../shared/i18n/core';

/** Base craft window size — height follows from locked aspect ratio. */
const BASE_W = 352;
/** Height / width — launcher grid + chrome (tighter to reduce empty space). */
const ASPECT_GRID = 0.56;
/** Extra height when an inline widget panel is open. */
const ASPECT_INLINE = 0.4;
const SCALE_MIN = 0.72;
const SCALE_MAX = 1.55;
const SCALE_KEY = 'jp-mini-frame-scale-v1';

const WIRED_MINI_LABELS: Record<string, string> = {
  library: 'ARCH',
  novels: 'DOC',
  dictionary: 'LEX',
  grammar: 'SYN',
  translate: 'TRN',
  player: 'SIG-VID',
  music: 'AUD-DAT',
  musicwidget: 'AUD-MINI',
  clipboard: 'BUFFER',
  anki: 'MEM',
  flashcards: 'SIM',
  stats: 'TEL',
  resources: 'LINK',
  immersion: 'FEED',
  calendar: 'OPS',
  settings: 'SYS',
};

function wiredMiniLabel(id: MiniAppId, fallback: string): string {
  return WIRED_MINI_LABELS[id] ?? fallback;
}

function loadScale(): number {
  try {
    const n = Number(localStorage.getItem(SCALE_KEY));
    if (Number.isFinite(n) && n >= SCALE_MIN && n <= SCALE_MAX) return n;
  } catch {
    /* ignore */
  }
  return 1;
}

function saveScale(s: number): void {
  try {
    localStorage.setItem(SCALE_KEY, String(s));
  } catch {
    /* ignore */
  }
}

function useClock(enabled: boolean): string {
  // A hook, so it can read the UI language itself rather than take it as an
  // argument — without this the clock follows the OS locale, not the app's.
  const { lang } = useT();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, [enabled]);
  return now.toLocaleTimeString(LANG_TAGS[lang], { hour: '2-digit', minute: '2-digit' });
}

/** Fill to 9 slots for a full 3×3 craft grid (empty slots stay locked empty). */
function craftSlots(apps: MiniAppId[]): (MiniAppId | null)[] {
  const slots: (MiniAppId | null)[] = [...apps];
  while (slots.length < 9) slots.push(null);
  return slots.slice(0, 9);
}

export default function MiniShell({
  widgetMode = false,
}: {
  /** True when running inside the dedicated transparent OS widget window. */
  widgetMode?: boolean;
}) {
  const { t } = useT();
  const [cfg, setCfg] = useState<MiniModeSettings>(() => loadMiniMode());
  const [panelOpen, setPanelOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addPick, setAddPick] = useState<MiniAppId | ''>('');
  const [msg, setMsg] = useState('');
  const [popped, setPopped] = useState<Set<string>>(() => new Set());
  const [activeInline, setActiveInline] = useState<MiniInlineWidget | null>(null);
  const [desktopWall, setDesktopWall] = useState<MiniDesktopWall>({ kind: 'none' });
  const [scale, setScale] = useState(loadScale);
  const resizing = useRef(false);
  const resizeStart = useRef({ y: 0, scale: 1 });
  const clock = useClock(cfg.showClock);
  const aeroMini = useAeroMaterials();
  const wiredMini = useWiredMaterials();

  useEffect(() => onMiniModeChanged(setCfg), []);

  // Track which apps are open in OS pop-out windows (for slot highlight).
  useEffect(() => {
    void window.api.popoutListOpen().then((sections) => setPopped(new Set(sections)));
    return window.api.onPopoutChanged((sections) => setPopped(new Set(sections)));
  }, []);

  /**
   * localfile:// tokens are in-memory only (main process). After restart the
   * saved wallpaperUrl is dead — always re-resolve from the durable path.
   */
  const [wallSrc, setWallSrc] = useState<string>('');
  useEffect(() => {
    let dead = false;
    const path = cfg.wallpaperPath?.trim();
    if (cfg.wallpaperMode !== 'image' || !path) {
      setWallSrc('');
      return;
    }
    void (async () => {
      try {
        const url =
          (await window.api.imageFileUrl(path)) ??
          (await window.api.setWallpaperFromPath(path));
        if (!dead && url) setWallSrc(url);
        else if (!dead) setWallSrc('');
      } catch {
        if (!dead) setWallSrc('');
      }
    })();
    return () => {
      dead = true;
    };
  }, [cfg.wallpaperMode, cfg.wallpaperPath]);

  /** Sync mini backdrop with the Study desktop wallpaper when requested. */
  useEffect(() => {
    if (cfg.wallpaperMode !== 'desktop') {
      setDesktopWall({ kind: 'none' });
      return;
    }
    let dead = false;
    const load = async () => {
      const next = await resolveMiniDesktopWallpaper();
      if (!dead) setDesktopWall(next);
    };
    void load();
    const unsubscribe = onMiniDesktopWallpaperChanged(() => {
      void load();
    });
    return () => {
      dead = true;
      unsubscribe();
    };
  }, [cfg.wallpaperMode]);

  const flash = (text: string) => {
    setMsg(text);
    window.setTimeout(() => setMsg(''), 2000);
  };

  const openApp = (id: MiniAppId) => {
    const target = miniAppLaunch(id);
    if (target.kind === 'inline') {
      setActiveInline((cur) => {
        const next = cur === target.widget ? null : target.widget;
        flash(next ? 'Opened clipboard' : 'Closed clipboard');
        return next;
      });
      return;
    }
    void window.api.popOut(target.section);
    const label = id === 'music' ? 'Music widget' : miniAppLabel(id);
    flash(`Opened ${label}`);
  };

  // Auto-open first pinned app once per mini session as a pop-out.
  useEffect(() => {
    if (!cfg.enabled || !cfg.autoOpenFirst || !cfg.apps[0]) return;
    const key = 'jp-mini-auto-opened-session';
    try {
      if (sessionStorage.getItem(key) === '1') return;
      sessionStorage.setItem(key, '1');
    } catch {
      /* ignore */
    }
    openApp(cfg.apps[0]!);
  }, [cfg.enabled, cfg.autoOpenFirst, cfg.apps]);

  const slots = useMemo(() => craftSlots(cfg.apps), [cfg.apps]);
  const freeSlots = MINI_MAX_APPS - cfg.apps.length;
  const canAdd = freeSlots > 0 && availableMiniApps(cfg.apps).length > 0;
  const addChoices = useMemo(() => availableMiniApps(cfg.apps), [cfg.apps]);

  useEffect(() => {
    if (!addChoices.length) {
      setAddPick('');
      return;
    }
    if (!addPick || !addChoices.some((a) => a.id === addPick)) {
      setAddPick(addChoices[0]!.id);
    }
  }, [addChoices, addPick]);

  const frameW = Math.round(BASE_W * scale);
  const aspect = ASPECT_GRID + (activeInline ? ASPECT_INLINE : 0);
  const frameH = Math.round(BASE_W * aspect * scale);

  // Keep the OS widget window tightly wrapped around the craft panel.
  useEffect(() => {
    if (!widgetMode) return;
    void window.api.miniSetSize({ width: frameW + 4, height: frameH + 4 });
  }, [widgetMode, frameW, frameH, activeInline]);

  // Mark document for transparent root CSS (no solid body fill).
  // Reset app zoom so the widget fills the OS window without letterboxing.
  useEffect(() => {
    if (!widgetMode) return;
    document.documentElement.classList.add('mini-widget-root');
    document.body.classList.add('mini-widget-root');
    void import('../appZoom').then(({ applyZoom, loadZoom }) => {
      const prev = loadZoom();
      applyZoom(1);
      (window as unknown as { __miniPrevZoom?: number }).__miniPrevZoom = prev;
    });
    return () => {
      document.documentElement.classList.remove('mini-widget-root');
      document.body.classList.remove('mini-widget-root');
      const prev = (window as unknown as { __miniPrevZoom?: number }).__miniPrevZoom;
      if (typeof prev === 'number') {
        void import('../appZoom').then(({ applyZoom }) => applyZoom(prev));
      }
    };
  }, [widgetMode]);

  const exitToFull = useCallback(() => {
    try {
      sessionStorage.removeItem('jp-mini-auto-opened-session');
    } catch {
      /* ignore */
    }
    setMiniModeEnabled(false);
    void window.api?.miniFocusMain?.();
  }, []);

  const doAddApp = (id?: MiniAppId) => {
    const pick = id ?? (addPick || undefined);
    if (!pick) {
      flash('Choose an app');
      return;
    }
    const next = addMiniApp(cfg.apps, pick);
    if (!next) {
      flash(cfg.apps.length >= MINI_MAX_APPS ? `Max ${MINI_MAX_APPS}` : 'Already added');
      return;
    }
    setCfg(saveMiniMode({ apps: next }));
    setAddOpen(false);
    flash(`Added ${miniAppLabel(pick)}`);
  };

  const doRemove = (id: MiniAppId) => {
    const next = removeMiniApp(cfg.apps, id);
    if (!next) {
      flash(`Keep ≥ ${MINI_MIN_APPS}`);
      return;
    }
    setCfg(saveMiniMode({ apps: next }));
    flash(`Removed ${miniAppLabel(id)}`);
  };

  const selectSlot = (id: MiniAppId | null) => {
    if (!id) return;
    setPanelOpen(false);
    setAddOpen(false);
    openApp(id);
  };

  // Uniform size drag (corner) — changes scale only, aspect locked
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!resizing.current) return;
      const dy = e.clientY - resizeStart.current.y;
      // Drag down/right-ish grows; ~200px drag ≈ full scale range
      const next = Math.min(
        SCALE_MAX,
        Math.max(SCALE_MIN, resizeStart.current.scale + dy / 280),
      );
      setScale(next);
    };
    const onUp = () => {
      if (!resizing.current) return;
      resizing.current = false;
      setScale((s) => {
        saveScale(s);
        return s;
      });
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizing.current = true;
    resizeStart.current = { y: e.clientY, scale };
    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';
  };

  // Digit hotkeys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
        return;
      }
      if (e.key === 'Escape') {
        if (panelOpen || addOpen) {
          setPanelOpen(false);
          setAddOpen(false);
        }
      }
      const n = Number(e.key);
      if (n >= 1 && n <= 9) {
        const app = cfg.apps[n - 1];
        if (app) {
          e.preventDefault();
          selectSlot(app);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cfg.apps, panelOpen, addOpen]);

  const densityClass =
    cfg.density === 'compact' ? 'is-compact' : cfg.density === 'spacious' ? 'is-spacious' : '';

  const pickWallpaper = async () => {
    try {
      // Prefer env pick (does not overwrite the full-desktop shell wallpaper file).
      // Fall back to pickWallpaper if needed.
      let absPath = await window.api.pickEnvImage();
      let displayUrl: string | null = null;
      if (absPath) {
        displayUrl = await window.api.imageFileUrl(absPath);
      } else {
        const picked = await window.api.pickWallpaper();
        if (!picked) return;
        absPath = picked.path;
        displayUrl = (await window.api.imageFileUrl(picked.path)) ?? picked.url;
      }
      if (!absPath) return;
      const url = displayUrl ?? '';
      setWallSrc(url);
      setCfg(
        saveMiniMode({
          wallpaperMode: 'image',
          wallpaperPath: absPath,
          wallpaperUrl: url,
        }),
      );
      flash(url ? 'Wallpaper set' : 'Wallpaper saved (reload if not visible)');
    } catch (err) {
      console.error('[mini] wallpaper pick failed', err);
      flash('Could not pick wallpaper');
    }
  };

  const clearWallpaper = () => {
    setWallSrc('');
    setCfg(saveMiniMode({ wallpaperPath: '', wallpaperUrl: '', wallpaperMode: 'none' }));
    flash('Wallpaper cleared');
  };

  const wallBlur = Math.max(0, Math.min(40, cfg.wallpaperBlur ?? 0));
  const showImageWall =
    (cfg.wallpaperMode === 'image' && !!(wallSrc || cfg.wallpaperUrl)) ||
    (cfg.wallpaperMode === 'desktop' && desktopWall.kind === 'image');
  const showPresetWall = cfg.wallpaperMode === 'desktop' && desktopWall.kind === 'preset';
  const imageSrc =
    cfg.wallpaperMode === 'desktop' && desktopWall.kind === 'image'
      ? desktopWall.url
      : wallSrc || cfg.wallpaperUrl;
  const slotIconSize = aeroMini || wiredMini ? Math.round(18 + scale * 9) : Math.round(16 + scale * 7);

  return (
    <div
      className={`mini-shell mini-tint-${cfg.tint}${widgetMode ? ' is-widget' : ''}${
        wiredMini ? ' is-wired-mini' : aeroMini ? ' is-aero-mini' : ' is-modern-mini'
      }${cfg.monoMode && !aeroMini && !wiredMini ? ' mini-mono' : ''}`}
      data-mini="1"
      data-widget={widgetMode ? '1' : undefined}
    >
      {/* Full-canvas wallpaper only when Mini is drawn inside the main window.
          Widget mode: OS window is transparent — wallpaper fills the craft frame only. */}
      {!widgetMode && (
        <div className="mini-backdrop" aria-hidden>
          {showPresetWall ? (
            <div
              className="mini-wall-layer mini-wall-preset"
              style={{
                background: desktopWall.css,
                filter: wallBlur > 0 ? `blur(${wallBlur}px)` : undefined,
                transform: wallBlur > 0 ? 'scale(1.08)' : undefined,
              }}
            />
          ) : null}
          {showImageWall && imageSrc ? (
            <div
              className="mini-wall-layer mini-wall-image"
              style={{
                filter: wallBlur > 0 ? `blur(${wallBlur}px)` : undefined,
                transform: wallBlur > 0 ? 'scale(1.08)' : undefined,
              }}
            >
              <img src={imageSrc} alt="" className="mini-wall-img" draggable={false} />
            </div>
          ) : null}
          {cfg.wallpaperMode === 'icons' ? (
            <div
              className="mini-wall-layer mini-wall-icons"
              style={{
                filter: wallBlur > 0 ? `blur(${wallBlur}px)` : undefined,
                transform: wallBlur > 0 ? 'scale(1.06)' : undefined,
              }}
            >
              {Array.from({ length: 36 }, (_, i) => {
                const app = cfg.apps[i % Math.max(1, cfg.apps.length)]!;
                const meta = miniAppMeta(app);
                return (
                  <span key={i} className="mini-wall-icon-cell">
                    <Icon name={meta.icon as IconName} size={28} />
                  </span>
                );
              })}
            </div>
          ) : null}
          <div className="mini-wall-veil" />
        </div>
      )}

      <div
        className={`mini-frame ${densityClass}${widgetMode ? ' is-widget-frame' : ''}${
          showImageWall || cfg.wallpaperMode === 'icons' || showPresetWall ? ' has-wall' : ''
        }${panelOpen ? ' has-panel-open' : ''}`}
        style={
          widgetMode
            ? { width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%', ['--mini-scale' as string]: scale }
            : { width: frameW, height: frameH, ['--mini-scale' as string]: scale }
        }
        role="dialog"
        aria-label="Mini view"
      >
        {/* Wallpaper inside the rounded frame (widget + non-widget when image/icons). */}
        {(showImageWall || cfg.wallpaperMode === 'icons' || showPresetWall) && (
          <div className="mini-frame-wall" aria-hidden>
            {showPresetWall ? (
              <div
                className="mini-wall-layer mini-wall-preset"
                style={{
                  background: desktopWall.css,
                  filter: wallBlur > 0 ? `blur(${wallBlur}px)` : undefined,
                  transform: wallBlur > 0 ? 'scale(1.1)' : undefined,
                }}
              />
            ) : null}
            {showImageWall && imageSrc ? (
              <div
                className="mini-wall-layer mini-wall-image"
                style={{
                  filter: wallBlur > 0 ? `blur(${wallBlur}px)` : undefined,
                  transform: wallBlur > 0 ? 'scale(1.1)' : undefined,
                }}
              >
                <img src={imageSrc} alt="" className="mini-wall-img" draggable={false} />
              </div>
            ) : null}
            {cfg.wallpaperMode === 'icons' ? (
              <div
                className="mini-wall-layer mini-wall-icons mini-wall-icons-dense"
                style={{
                  filter: wallBlur > 0 ? `blur(${Math.min(wallBlur, 24)}px)` : undefined,
                  transform: wallBlur > 0 ? 'scale(1.08)' : undefined,
                }}
              >
                {Array.from({ length: 16 }, (_, i) => {
                  const app = cfg.apps[i % Math.max(1, cfg.apps.length)]!;
                  const meta = miniAppMeta(app);
                  return (
                    <span key={i} className="mini-wall-icon-cell">
                      <Icon name={meta.icon as IconName} size={22} />
                    </span>
                  );
                })}
              </div>
            ) : null}
            <div className="mini-wall-veil mini-frame-veil" />
          </div>
        )}

        {/* Tiny chrome — drag region for the borderless OS window */}
        <header className="mini-frame-bar mini-drag-region">
          <span className="mini-frame-brand">
            <span className="mini-brand-mark" aria-hidden />
            {wiredMini ? 'WIRED MINI' : 'Mini'}
          </span>
          {cfg.showClock && <span className="mini-clock">{clock}</span>}
          <div className="mini-frame-tools mini-no-drag">
            <button
              type="button"
              className={`mini-ico-btn${canAdd ? '' : ' is-disabled'}`}
              disabled={!canAdd}
              title="Add app"
              onClick={() => {
                setAddOpen(true);
                setPanelOpen(true);
              }}
            >
              <Icon name="plus" size={13} />
            </button>
            <button
              type="button"
              className={`mini-ico-btn${panelOpen ? ' is-on' : ''}`}
              title="Settings"
              onClick={() => {
                setPanelOpen((o) => !o);
                if (panelOpen) setAddOpen(false);
              }}
            >
              <Icon name="settings" size={13} />
            </button>
            <button type="button" className="mini-ico-btn" title="Full desktop" onClick={exitToFull}>
              <Icon name="external" size={13} />
            </button>
          </div>
        </header>

        {msg && (
          <div className="mini-toast" role="status">
            {msg}
          </div>
        )}

        {/* Crafting-table 3×3 slot grid */}
        <div className="mini-craft mini-no-drag" aria-label="App slots">
          <div className="mini-craft-grid">
            {slots.map((id, i) => {
              if (!id) {
                return (
                  <button
                    key={`empty-${i}`}
                    type="button"
                    className="mini-slot is-empty"
                    disabled={!canAdd}
                    title={canAdd ? 'Add app' : 'Empty'}
                    onClick={() => {
                      if (!canAdd) return;
                      setAddOpen(true);
                      setPanelOpen(true);
                    }}
                  />
                );
              }
              const meta = miniAppMeta(id);
              const on = isMiniSlotActive(id, popped, activeInline);
              const label = wiredMini ? wiredMiniLabel(id, meta.label) : meta.label;
              return (
                <button
                  key={id}
                  type="button"
                  className={`mini-slot${on ? ' is-active' : ''}`}
                  title={wiredMini ? `${label} / ${meta.label} (${i + 1})` : `${meta.label} (${i + 1})`}
                  onClick={() => selectSlot(id)}
                >
                  <span className={`mini-slot-icon app-${id}`} aria-hidden>
                    <Icon name={meta.icon as IconName} size={slotIconSize} />
                  </span>
                  <span className="mini-slot-label">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {activeInline === 'clipboard' && (
          <section className="mini-stage mini-no-drag" aria-label="Clipboard">
            <div className="mini-stage-bar">
              <span className="mini-stage-title">Clipboard</span>
              <button
                type="button"
                className="mini-ico-btn"
                title="Close"
                onClick={() => setActiveInline(null)}
              >
                <Icon name="close" size={12} />
              </button>
            </div>
            <div className="mini-stage-body">
              <ClipboardWidget />
            </div>
          </section>
        )}

        {!widgetMode && !activeInline && (
          <footer className="mini-footer mini-no-drag" aria-hidden>
            <span className="mini-footer-hint">
              {wiredMini ? 'Mounted modules open pop-out nodes' : 'Slots open widgets or pop-out apps'}
            </span>
          </footer>
        )}

        {/* Uniform size grip — scale only (updates OS window bounds in widget mode) */}
        <button
          type="button"
          className="mini-size-grip mini-no-drag"
          title="Resize (scale)"
          aria-label="Resize mini window size"
          onPointerDown={startResize}
        />
        <div className="mini-size-hint muted mini-no-drag">{Math.round(scale * 100)}%</div>

        {/* Settings drawer (inside frame) */}
        {panelOpen && (
          <aside className="mini-panel mini-no-drag" aria-label="Mini settings">
            <div className="mini-panel-head">
              <span>Settings</span>
              <button
                type="button"
                className="mini-ico-btn"
                onClick={() => {
                  setPanelOpen(false);
                  setAddOpen(false);
                }}
              >
                <Icon name="close" size={12} />
              </button>
            </div>

            <section className="mini-panel-block">
              <button type="button" className="btn small primary mini-panel-full" onClick={exitToFull}>
                Full desktop
              </button>
            </section>

            <section className="mini-panel-block">
              <h3 className="mini-panel-title">Size</h3>
              <input
                type="range"
                min={SCALE_MIN}
                max={SCALE_MAX}
                step={0.01}
                value={scale}
                className="mini-size-slider"
                onChange={(e) => {
                  const s = Number(e.target.value);
                  setScale(s);
                  saveScale(s);
                }}
                aria-label={t('a11y.slider.miniWindowSize')}
              />
              <p className="muted mini-panel-note">Scale only — width and height stay locked together.</p>
            </section>

            <section className="mini-panel-block">
              <h3 className="mini-panel-title">Look</h3>
              <div className="mini-seg">
                {(
                  [
                    ['compact', 'S'],
                    ['comfortable', 'M'],
                    ['spacious', 'L'],
                  ] as [MiniDensity, string][]
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`mini-chip${cfg.density === id ? ' is-on' : ''}`}
                    onClick={() => setCfg(saveMiniMode({ density: id }))}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mini-seg mini-seg-wrap">
                {MINI_THEME_TINTS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`mini-chip${cfg.tint === id ? ' is-on' : ''}`}
                    onClick={() => setCfg(saveMiniMode({ tint: id }))}
                    title={id}
                  >
                    {id.slice(0, 1).toUpperCase()}
                  </button>
                ))}
              </div>
              <label className="mini-check">
                <input
                  type="checkbox"
                  checked={cfg.showClock}
                  onChange={(e) => setCfg(saveMiniMode({ showClock: e.target.checked }))}
                />
                <span>Clock</span>
              </label>
              <label className="mini-check">
                <input
                  type="checkbox"
                  checked={cfg.autoOpenFirst}
                  onChange={(e) => setCfg(saveMiniMode({ autoOpenFirst: e.target.checked }))}
                />
                <span>Auto-open first</span>
              </label>
              {!aeroMini && !wiredMini && (
                <label className="mini-check">
                  <input
                    type="checkbox"
                    checked={cfg.monoMode}
                    onChange={(e) => setCfg(saveMiniMode({ monoMode: e.target.checked }))}
                  />
                  <span>Dark mono (B&amp;W)</span>
                </label>
              )}
            </section>

            <section className="mini-panel-block">
              <h3 className="mini-panel-title">Wallpaper</h3>
              <div className="mini-seg">
                {(
                  [
                    ['none', 'Off'],
                    ['icons', 'Icons'],
                    ['image', 'Image'],
                    ['desktop', 'Desktop'],
                  ] as [MiniWallpaperMode, string][]
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`mini-chip${cfg.wallpaperMode === id ? ' is-on' : ''}`}
                    onClick={() => setCfg(saveMiniMode({ wallpaperMode: id }))}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="muted mini-panel-note">
                Icons = mosaic of pinned apps. Image = custom photo. Desktop = match Study wallpaper.
              </p>
              <div className="mini-seg" style={{ marginTop: 6 }}>
                <button type="button" className="mini-chip" onClick={() => void pickWallpaper()}>
                  Pick image
                </button>
                {(cfg.wallpaperUrl || cfg.wallpaperMode === 'image') && (
                  <button type="button" className="mini-chip" onClick={clearWallpaper}>
                    Clear
                  </button>
                )}
              </div>
              <label className="mini-panel-title" style={{ display: 'block', marginTop: 8 }}>
                Blur {wallBlur}px
              </label>
              <input
                type="range"
                min={0}
                max={40}
                step={1}
                value={wallBlur}
                className="mini-size-slider"
                onChange={(e) => setCfg(saveMiniMode({ wallpaperBlur: Number(e.target.value) }))}
                aria-label={t('a11y.slider.miniWallpaperBlur')}
              />
            </section>

            <section className="mini-panel-block">
              <div className="mini-panel-row">
                <h3 className="mini-panel-title">
                  Apps {cfg.apps.length}/{MINI_MAX_APPS}
                </h3>
                <button
                  type="button"
                  className="mini-chip is-on"
                  disabled={!canAdd}
                  onClick={() => setAddOpen((o) => !o)}
                >
                  Add
                </button>
              </div>

              {addOpen && canAdd && (
                <div className="mini-add-box">
                  <div className="mini-add-row">
                    <select
                      className="mini-add-select"
                      value={addPick}
                      onChange={(e) => setAddPick(e.target.value as MiniAppId)}
                    >
                      {addChoices.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="mini-chip is-on" disabled={!addPick} onClick={() => doAddApp()}>
                      +
                    </button>
                  </div>
                  <div className="mini-add-quick">
                    {addChoices.map((a) => (
                      <button key={a.id} type="button" className="mini-chip" onClick={() => doAddApp(a.id)}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <ul className="mini-app-manage">
                {cfg.apps.map((id, i) => (
                  <li key={id} className="mini-app-manage-row">
                    <span className="mini-app-manage-name">
                      {i + 1}. {miniAppLabel(id)}
                    </span>
                    <span className="mini-app-manage-acts">
                      <button
                        type="button"
                        className="mini-chip"
                        disabled={i === 0}
                        onClick={() => setCfg(saveMiniMode({ apps: moveMiniApp(cfg.apps, id, -1) }))}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="mini-chip"
                        disabled={i === cfg.apps.length - 1}
                        onClick={() => setCfg(saveMiniMode({ apps: moveMiniApp(cfg.apps, id, 1) }))}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="mini-chip"
                        disabled={cfg.apps.length <= MINI_MIN_APPS}
                        onClick={() => doRemove(id)}
                      >
                        ×
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        )}
      </div>
    </div>
  );
}
