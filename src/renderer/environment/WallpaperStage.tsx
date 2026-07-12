/**
 * L1 wallpaper stage — crossfades between resolved environment walls.
 * Only mounts when living layer + rotation are enabled.
 */
import { useEffect, useRef, useState } from 'react';
import { loadEnvironment, onEnvironmentChanged } from './environmentStore';
import { resolveWall, wallItemKey } from './schedules';
import type { EnvironmentSettings, ResolvedWall, WallpaperItem } from './types';
import { getWallPreset } from './wallCatalog';

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
    // data:/blob: URLs are already displayable; file paths go through mediaFileUrl.
    if (/^(data:|blob:|file:|https?:)/i.test(item.ref)) {
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
    if (/^(data:|blob:|file:|https?:)/i.test(item.ref)) {
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

export default function WallpaperStage({
  onActiveChange,
}: {
  onActiveChange?: (active: boolean, label?: string) => void;
}) {
  const [env, setEnv] = useState<EnvironmentSettings>(loadEnvironment);
  /** Active layer index; -1 = neither (black gap during 'fade'). */
  const [front, setFront] = useState(0);
  const [layers, setLayers] = useState<[LayerStyle | null, LayerStyle | null]>([null, null]);
  const lastKey = useRef<string>('');
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

  useEffect(() => {
    const active = env.enabled && env.rotationEnabled;
    onActiveChange?.(active);
    return () => {
      onActiveChange?.(false);
    };
  }, [env.enabled, env.rotationEnabled, onActiveChange]);

  // Hard gate only — soft settings (playlist/rules/transition) read from envRef each tick.
  useEffect(() => {
    if (!env.enabled || !env.rotationEnabled) {
      setLayers([null, null]);
      lastKey.current = '';
      tickRef.current = () => undefined;
      return;
    }

    let cancelled = false;

    const applyResolved = async (resolved: ResolvedWall) => {
      const key = wallItemKey(resolved.item);
      if (key === lastKey.current) return;
      lastKey.current = key;

      let layer = itemToLayer(resolved.item, resolved.reason);
      layer = await hydrateMedia(layer, resolved.item);
      if (cancelled) return;

      const e = envRef.current;
      const pl = e.playlists.find((p) => p.id === e.activePlaylistId) ?? resolved.playlist;
      const reduceMotion = document.documentElement.classList.contains('reduce-motion');
      const transition = reduceMotion ? 'cut' : pl.transition;
      const ms = reduceMotion ? 0 : pl.transitionMs;
      const back = visibleFrontRef.current === 0 ? 1 : 0;

      setLayers((prev) => {
        if (!prev[0] && !prev[1]) {
          queueMicrotask(() => {
            if (!cancelled) {
              visibleFrontRef.current = 0;
              setFront(0);
            }
          });
          return [layer, null];
        }
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

      if (transition === 'cut' || ms <= 0) {
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
        const style: React.CSSProperties = {
          transitionDuration: mode === 'cut' ? '0ms' : `${ms}ms`,
          ...(layer.imageUrl
            ? {
                backgroundImage: `url("${layer.imageUrl}")`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
              }
            : layer.css
              ? layer.css.startsWith('#') || layer.css.startsWith('rgb')
                ? { backgroundColor: layer.css }
                : {
                    backgroundImage: layer.css,
                    backgroundSize: layer.animated ? '400% 400%' : 'cover',
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
