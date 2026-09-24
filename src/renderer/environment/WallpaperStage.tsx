/**
 * L1 wallpaper stage — crossfades between resolved environment walls.
 * Only mounts when living layer + rotation are enabled.
 */
import { useEffect, useRef, useState } from 'react';
import { loadEnvironment, onEnvironmentChanged } from './environmentStore';
import { resolveWall, wallItemKey } from './schedules';
import type { EnvironmentSettings, ResolvedWall, WallpaperItem } from './types';
import { getWallPreset } from './wallCatalog';
import { syncPillarboxWallImage } from '../pillarboxSettings';

interface LayerStyle {
  key: string;
  css?: string;
  animated?: boolean;
  imageUrl?: string | null;
  videoUrl?: string | null;
  label: string;
  reason: string;
}

function itemToLayer(item: WallpaperItem, reason: string): LayerStyle {
  if (item.kind === 'preset') {
    const p = getWallPreset(item.ref);
    return {
      key: wallItemKey(item),
      css: p.css,
      animated: !!p.animated,
      label: item.label ?? p.label,
      reason,
    };
  }
  return {
    key: wallItemKey(item),
    label: item.label ?? item.ref,
    reason,
  };
}

async function hydrateMedia(layer: LayerStyle, item: WallpaperItem): Promise<LayerStyle> {
  if (item.kind === 'image' && item.ref) {
    // Bundled/data/blob/file/http URLs are already displayable; disk paths go through mediaFileUrl.
    if (/^(app:|data:|blob:|file:|https?:|\/)/i.test(item.ref)) {
      return { ...layer, imageUrl: item.ref };
    }
    try {
      const fileUrl = await window.api.mediaFileUrl(item.ref);
      return { ...layer, imageUrl: fileUrl };
    } catch {
      return layer;
    }
  }
  if (item.kind === 'video' && item.ref) {
    if (/^(app:|data:|blob:|file:|https?:)/i.test(item.ref)) {
      return { ...layer, videoUrl: item.ref };
    }
    try {
      const url = await window.api.mediaFileUrl(item.ref);
      return { ...layer, videoUrl: url };
    } catch {
      return layer;
    }
  }
  return layer;
}

/** The user's wallpaper fit as a background-size (set on <html> by wallpaperFit.ts). */
const WALL_BACKGROUND_FIT = 'var(--wall-background-fit, cover)';

export default function WallpaperStage({
  onActiveChange,
}: {
  onActiveChange?: (active: boolean, label?: string) => void;
}) {
  const [env, setEnv] = useState<EnvironmentSettings>(loadEnvironment);
  /** Active layer index; -1 = neither (black gap during 'fade'). */
  const [front, setFront] = useState(0);
  const [layers, setLayers] = useState<[LayerStyle | null, LayerStyle | null]>([null, null]);
  /** Key of the wall currently COMMITTED to `layers`. */
  const lastKey = useRef<string>('');
  /**
   * Key of the wall currently hydrating. Claimed synchronously so two ticks cannot
   * resolve the same wall twice, and released by the effect cleanup so a torn-down
   * run never blocks the run that replaces it — see the StrictMode note on `applyResolved`.
   */
  const pendingKey = useRef<string>('');
  /** Last *visible* front slot (0|1) — never -1, so fade does not clobber the wrong buffer. */
  const visibleFrontRef = useRef(0);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const envRef = useRef(env);
  envRef.current = env;
  const onActiveRef = useRef(onActiveChange);
  onActiveRef.current = onActiveChange;
  /** Soft re-tick entry (calendar / rules / playlist) without remounting the 30s interval. */
  const tickRef = useRef<() => void>(() => undefined);

  useEffect(() => onEnvironmentChanged(setEnv), []);

  /**
   * The shell drops its own wallpaper the moment this reports active, so reporting on
   * *intent* leaves the desktop black whenever rotation cannot produce a wall (empty
   * playlist, media that fails to hydrate, the first resolve still in flight). Report
   * only once a layer actually exists — the shell wall then holds until the living wall
   * is genuinely ready, and never hands over to nothing.
   */
  const hasLayer = !!(layers[0] || layers[1]);

  useEffect(() => {
    const active = env.enabled && env.rotationEnabled && hasLayer;
    onActiveChange?.(active);
    return () => {
      onActiveChange?.(false);
    };
  }, [env.enabled, env.rotationEnabled, hasLayer, onActiveChange]);

  // Hard gate only — soft settings (playlist/rules/transition) read from envRef each tick.
  useEffect(() => {
    if (!env.enabled || !env.rotationEnabled) {
      setLayers([null, null]);
      lastKey.current = '';
      pendingKey.current = '';
      tickRef.current = () => undefined;
      return;
    }

    let cancelled = false;

    const applyResolved = async (resolved: ResolvedWall) => {
      const key = wallItemKey(resolved.item);
      // Already on screen, or already being hydrated by an in-flight run.
      if (key === lastKey.current || key === pendingKey.current) return;
      pendingKey.current = key;

      let layer = itemToLayer(resolved.item, resolved.reason);
      layer = await hydrateMedia(layer, resolved.item);
      // A cancelled run must NOT claim the key. `lastKey` used to be written before this
      // await, so StrictMode's mount → cleanup → mount left the key claimed by the run that
      // was torn down while `layers` was still [null, null]; the second mount then resolved
      // the same wall, matched the key, and returned early. Nothing ever painted, the shell
      // had already dropped its own wall, and the desktop stayed black until the resolved
      // wall happened to change — v1.0 audit §1.4. The cleanup releases `pendingKey`, so
      // this run simply drops out and leaves the field to its replacement.
      if (cancelled) return;
      /** Nothing committed yet — this is the very first wall, seeded into slot 0. */
      const seeding = lastKey.current === '';
      lastKey.current = key;
      pendingKey.current = '';

      const e = envRef.current;
      const pl = e.playlists.find((p) => p.id === e.activePlaylistId) ?? resolved.playlist;
      const reduceMotion = document.documentElement.classList.contains('reduce-motion');
      const transition = reduceMotion ? 'cut' : pl.transition;
      const ms = reduceMotion ? 0 : pl.transitionMs;
      // The seed always lands in slot 0, so `back` must be 0 for it. Deriving `back` from
      // `visibleFrontRef` unconditionally gave 1, and the deferred promote then made slot 1
      // — which is empty — the front: one committed layer, none of them `on`, desktop black.
      // The old queueMicrotask that forced front back to 0 only won under a `cut` transition;
      // a crossfade promotes on rAF, which runs after microtasks, so the default day-cycle
      // playlist always lost the race (v1.0 audit §1.4).
      const back = seeding ? 0 : visibleFrontRef.current === 0 ? 1 : 0;

      setLayers((prev) => {
        if (seeding || (!prev[0] && !prev[1])) return [layer, null];
        const next: [LayerStyle | null, LayerStyle | null] = [prev[0], prev[1]];
        next[back] = layer;
        return next;
      });

      const promote = () => {
        if (cancelled) return;
        visibleFrontRef.current = back;
        setFront(back);
      };

      if (fadeTimer.current) {
        clearTimeout(fadeTimer.current);
        fadeTimer.current = null;
      }

      // Seeding has nothing to transition *from*; deferring it is what leaves a black gap.
      if (seeding || transition === 'cut' || ms <= 0) {
        promote();
      } else if (transition === 'fade') {
        setFront(-1);
        fadeTimer.current = setTimeout(() => {
          if (!cancelled) promote();
          fadeTimer.current = null;
        }, Math.max(80, Math.floor(ms / 2)));
      } else {
        requestAnimationFrame(() => requestAnimationFrame(promote));
      }

      onActiveRef.current?.(true, layer.label);
    };

    const tick = () => {
      if (cancelled) return;
      const resolved = resolveWall(envRef.current, new Date());
      if (resolved) void applyResolved(resolved);
    };
    tickRef.current = tick;

    tick();
    const id = window.setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      pendingKey.current = '';
      tickRef.current = () => undefined;
      clearInterval(id);
      if (fadeTimer.current) {
        clearTimeout(fadeTimer.current);
        fadeTimer.current = null;
      }
    };
  }, [env.enabled, env.rotationEnabled]);

  // Soft re-resolve when env object changes (calendar echo, rules, playlist).
  // lastKey short-circuits same wall — companion position saves stay cheap.
  useEffect(() => {
    if (!env.enabled || !env.rotationEnabled) return;
    tickRef.current();
  }, [env]);

  useEffect(() => {
    if (!env.enabled || !env.rotationEnabled) {
      syncPillarboxWallImage(null);
      return;
    }
    const slot = front >= 0 ? front : visibleFrontRef.current;
    const layer = layers[slot];
    syncPillarboxWallImage(layer?.imageUrl ?? null);
  }, [env.enabled, env.rotationEnabled, front, layers]);

  if (!env.enabled || !env.rotationEnabled) return null;

  const playlist = env.playlists.find((p) => p.id === env.activePlaylistId) ?? env.playlists[0];
  const reduceMotion = document.documentElement.classList.contains('reduce-motion');
  const ms = reduceMotion ? 0 : playlist?.transitionMs ?? 1200;
  const mode = reduceMotion ? 'cut' : playlist?.transition ?? 'crossfade';

  return (
    <div className="os-wall-stage" aria-hidden data-transition={mode}>
      {[0, 1].map((i) => {
        const layer = layers[i];
        if (!layer) return null;
        const on = front === i;
        // Settings > Wallpaper > Fit applies to rotating and preset walls too, not
        // only to a single image/video: `--wall-background-fit` is the
        // background-size twin of `--wall-fit` (wallpaperFit.ts). An animated
        // gradient keeps its own 400% canvas — its motion IS that oversize.
        const style: React.CSSProperties = {
          transitionDuration: mode === 'cut' ? '0ms' : `${ms}ms`,
          ...(layer.imageUrl
            ? {
                backgroundImage: `url("${layer.imageUrl}")`,
                backgroundSize: WALL_BACKGROUND_FIT,
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
              }
            : layer.css
              ? layer.css.startsWith('#') || layer.css.startsWith('rgb')
                ? { backgroundColor: layer.css }
                : {
                    backgroundImage: layer.css,
                    backgroundSize: layer.animated ? '400% 400%' : WALL_BACKGROUND_FIT,
                    backgroundRepeat: layer.animated ? 'no-repeat' : undefined,
                  }
              : { backgroundColor: '#100f15' }),
        };
        return (
          <div
            key={`slot-${i}-${layer.key}`}
            className={`os-wall-layer${on ? ' on' : ''}${layer.animated && on ? ' wall-animated' : ''}`}
            style={style}
          >
            {layer.videoUrl && on && (
              <video className="os-wall-video" src={layer.videoUrl} autoPlay loop muted playsInline />
            )}
          </div>
        );
      })}
    </div>
  );
}
