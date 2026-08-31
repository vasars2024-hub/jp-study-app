/**
 * Ambient audio (Phase 3 · M4) — per-environment looping soundscapes routed
 * through the existing soundEngine 'environment' category (so it inherits master
 * volume, mute, ducking, and Battery-Saver gating). ONE bed plays at a time and
 * crossfades on environment change.
 *
 * No audio is bundled — with the default silent sound pack every call is a no-op
 * (soundEngine.playLoop returns a silent handle). It becomes audible once a pack
 * maps 'environment' bed names (forest/ocean/sky/city/space/snow/ambient) to URLs.
 */
import { soundEngine, type LoopHandle } from '../audio/soundEngine';
import { loadEnvironment, onEnvironmentChanged } from './environmentStore';
import { resolveWall } from './schedules';
import { wallDefinition } from './frameworkBridge';
import type { EnvironmentSettings } from './types';
import type { WallpaperCategory } from './wallpaperFramework';
import { isMiniMode, onMiniModeChanged } from '../miniMode';
import { onThemeChanged } from '../theme/engine';
import { isAeroSafeModeApplied, onAeroSafeModeChanged } from '../aeroSafeMode';

const CATEGORY_BED: Record<WallpaperCategory, string> = {
  nature: 'forest',
  ocean: 'ocean',
  sky: 'sky',
  city: 'city',
  space: 'space',
  seasonal: 'snow',
  abstract: 'ambient',
  minimal: 'ambient',
};

/** The ambient bed name for a wallpaper category (pure; reused by presets). */
export function bedForCategory(cat: WallpaperCategory | undefined): string {
  return cat ? CATEGORY_BED[cat] ?? 'ambient' : 'ambient';
}

function isAeroActive(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.getAttribute('data-materials') === 'aero';
}

/** Secret OS mini widget — silence living-layer ambience beds. */
function atmosphereSuppressed(): boolean {
  return isAeroSafeModeApplied() || (isAeroActive() && isMiniMode());
}

function desiredBed(env: EnvironmentSettings): string | null {
  if (atmosphereSuppressed()) return null;
  if (!env.enabled || !env.ambientAudio?.enabled) return null;
  if (env.performanceTier === 'off') return null;
  if (document.documentElement.getAttribute('data-perf') === 'battery') return null;
  const ref = env.rotationEnabled ? resolveWall(env)?.item.ref : undefined;
  return bedForCategory(wallDefinition(ref)?.category);
}

let currentName: string | null = null;
let currentHandle: LoopHandle | null = null;
let syncToken = 0;
let installed = false;

async function sync(env: EnvironmentSettings): Promise<void> {
  const want = desiredBed(env);
  const vol = env.ambientAudio?.volume ?? 0.5;

  if (!want) {
    if (currentHandle) {
      const h = currentHandle;
      h.fadeTo(0, 500);
      window.setTimeout(() => h.stop(), 520);
    }
    currentHandle = null;
    currentName = null;
    return;
  }

  if (want === currentName) {
    currentHandle?.fadeTo(vol, 400);
    return;
  }

  const token = ++syncToken;
  const old = currentHandle;
  currentName = want;
  const next = await soundEngine.playLoop('environment', want, { volume: 0 });
  if (token !== syncToken) {
    // A newer sync superseded this one mid-await.
    next.stop();
    return;
  }
  currentHandle = next;
  next.fadeTo(vol, 800);
  if (old) {
    old.fadeTo(0, 800);
    window.setTimeout(() => old.stop(), 820);
  }
}

/** Wire ambient audio to the environment. Call once at boot. */
export function installAmbientAudio(): void {
  if (installed) return;
  installed = true;
  const resync = () => void sync(loadEnvironment());
  void sync(loadEnvironment());
  onEnvironmentChanged((env) => void sync(env));
  onMiniModeChanged(resync);
  onThemeChanged(resync);
  onAeroSafeModeChanged(resync);
  window.addEventListener('jp-perf-changed', resync);
}
