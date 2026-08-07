/**
 * In-app desktop companions — wander, react, programmable click routines.
 * Wander updates DOM positions (not React every frame) to avoid lag/persist thrash.
 * Left-click = primary routine; right-click / menu button = actions menu.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as RMouseEvent,
  type PointerEvent as RPointerEvent,
} from 'react';
import type { EnvironmentSettings } from './types';
import {
  COMPANION_DEFS,
  defaultCompanions,
  defFor,
  type CompanionMotion,
  type CompanionInstance,
  type CompanionMood,
  type CompanionReactivity,
  type CompanionTypeId,
} from './companionCatalog';
import ShimejiSprite from './ShimejiSprite';
import { hasDiscoveredAero, onAeroDiscoveryChanged } from '../aeroDiscovery';
import { hasDiscoveredWired, onWiredDiscoveryChanged } from '../wiredDiscovery';
import { onCompanionEvent, type CompanionEventDetail } from './companionEvents';
import { onPlayingChanged, isPlaying as musicIsPlaying } from '../audioBus';
import { READING_RECORDED_EVENT } from '../stats';
import { saveEnvironment } from './environmentStore';
import { pushCompanionOsState } from './companionOsBridge';
import { getZoomFactor } from '../appZoom';
import { companionPhysics, loadMotionPrefs, onMotionPrefsChanged } from '../motion/motionPrefs';
import {
  BUDDY_RUN_EVENT,
  getDefaultBuddyRoutines,
  resolveHoldRoutineId,
  resolveMenuRoutineIds,
  resolvePrimaryRoutineId,
  resolveSecondaryRoutineId,
  runBuddyRoutine,
  routinesForType,
  routinesMatchingTrigger,
  syncBuddyTimeSchedule,
  type BuddyTriggerKind,
} from './buddyRoutines';
import {
  companionChromeCounterScale,
  companionCssTransform,
  clampThrowVelocity,
  updateShimejiMotion,
} from './shimejiPhysics';
import {
  HOLD_MS,
  clearPending,
  decideClick,
  emptyClickGestureState,
  noteDragEnd,
  noteHold,
} from './companionClickGesture';
import { BUDDY_SPEECH_EVENT, speakBeepLine, voiceForType, type BuddySpeechDetail } from './beepSpeech';
import { pickDialogueLine, type DialogueContext } from './dialoguePools';
import { getUserLevel, onLevelChange } from '../levelService';
import { useT } from '../i18n';

const SIZE = 52;
const SHIMEJI_SIZE = 96;
const WIRED_SHIMEJI_SIZE = 100;
const DRAG_THRESHOLD = 6;
const IDLE_DEFAULT_MS = 90_000;

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

function companionSize(c: Pick<CompanionInstance, 'typeId'>): number {
  return defFor(c.typeId).spritePack
    ? c.typeId === 'wired-navi'
      ? WIRED_SHIMEJI_SIZE
      : SHIMEJI_SIZE
    : SIZE;
}

function isShimeji(c: CompanionInstance): boolean {
  return Boolean(defFor(c.typeId).spritePack);
}

function applyDomPos(el: HTMLElement | null, c: CompanionInstance): void {
  if (!el) return;
  el.style.transform = companionCssTransform(c);
}

/**
 * Drag stretch (Phase 4.5): the sprite elongates along the drag vector and
 * thins across it, preserving apparent volume — the squash-and-stretch rule.
 * Written as CSS vars the sprite consumes, so the position transform above
 * stays untouched and there is no transform to fight over.
 */
function applyDragStretch(el: HTMLElement | null, vx: number, vy: number, weight: number): void {
  if (!el) return;
  const speed = Math.hypot(vx, vy);
  const k = Math.min(0.28, (speed / 2600) * (0.7 + weight * 0.8));
  if (k < 0.005) {
    el.style.removeProperty('--stretch');
    el.style.removeProperty('--squash');
    return;
  }
  const vertical = Math.abs(vy) >= Math.abs(vx);
  const long = 1 + k;
  const thin = 1 / long;
  el.style.setProperty('--stretch', String(vertical ? thin : long));
  el.style.setProperty('--squash', String(vertical ? long : thin));
}

function clearDragStretch(el: HTMLElement | null): void {
  if (!el) return;
  el.style.removeProperty('--stretch');
  el.style.removeProperty('--squash');
}

function secretLifecycleSuspended(): boolean {
  return document.documentElement.classList.contains('secret-lifecycle-suspended');
}

function isTreasureLockedBonzi(c: CompanionInstance): boolean {
  return c.typeId === 'miko-shimeji' && !hasDiscoveredAero();
}

function wanderSpeed(reactivity: CompanionReactivity, activeness = 0.4): number {
  const a = Math.min(1, Math.max(0, activeness));
  // Calmer base speeds than classic shimeji; dial scales 0.28×…1.33×.
  const base = reactivity === 'quiet' ? 8 : reactivity === 'playful' ? 26 : 14;
  return base * (0.28 + a * 1.05);
}

function bobDurationSec(activeness = 0.4): number {
  const a = Math.min(1, Math.max(0, activeness));
  return 2.8 * (1.55 - a * 0.75);
}

function reactionChance(reactivity: CompanionReactivity): number {
  if (reactivity === 'quiet') return 0.25;
  if (reactivity === 'playful') return 0.9;
  return 0.55;
}

/** Keep saved instances for active types; seed any missing active types. */
function seedOrLoad(env: EnvironmentSettings, w: number, h: number): CompanionInstance[] {
  const now = Date.now();
  const visibleTypes = new Set(COMPANION_DEFS().map((d) => d.id));
  const active = new Set<CompanionTypeId>(
    (env.companionTypes?.length ? (env.companionTypes as CompanionTypeId[]) : COMPANION_DEFS().map((d) => d.id))
      .filter((typeId) => visibleTypes.has(typeId)),
  );
  const saved = (env.companions ?? [])
    .filter((c) => active.has(c.typeId))
    .filter((c) => !c.hiddenUntil || c.hiddenUntil < now)
    .map((c) => ({
      ...c,
      x: clamp(c.x, 8, Math.max(8, w - companionSize(c))),
      y: clamp(c.y, 8, Math.max(8, h - companionSize(c))),
    }));

  const have = new Set(saved.map((c) => c.typeId));
  const seeded = defaultCompanions(w, h).filter((c) => active.has(c.typeId) && !have.has(c.typeId));
  return [...saved, ...seeded];
}

export default function CompanionLayer({ env }: { env: EnvironmentSettings }) {
  const { t, lang } = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const [list, setList] = useState<CompanionInstance[]>([]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [shakeId, setShakeId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [aeroDiscovered, setAeroDiscovered] = useState(hasDiscoveredAero);
  const [wiredDiscovered, setWiredDiscovered] = useState(hasDiscoveredWired);
  const listRef = useRef<CompanionInstance[]>([]);
  const envRef = useRef(env);
  // Physics is read every frame from a ref so the weight slider applies live
  // without restarting the wander loop (which would reset motion state), and
  // without re-parsing localStorage on every frame / pointermove.
  const physicsRef = useRef(companionPhysics(loadMotionPrefs()));
  const weightRef = useRef(loadMotionPrefs().companionWeight);
  const dragRef = useRef<{
    id: string;
    ox: number;
    oy: number;
    sx: number;
    sy: number;
    moved: boolean;
    /** Last pointermove timestamp — drag velocity for squash/stretch + throw. */
    lastT?: number;
    lastVx?: number;
    lastVy?: number;
  } | null>(null);
  const dirtyRef = useRef(false);
  const menuIdRef = useRef<string | null>(null);
  // Left-button arbitration between drag / single click / double click.
  const gestureRef = useRef(emptyClickGestureState());
  const clickTimerRef = useRef(0);
  const holdTimerRef = useRef(0);

  const patchCompanion = useCallback(
    (id: string, patch: { mood?: CompanionMood; status?: string; speechBubble?: string | null }) => {
      const next = listRef.current.map((c) => {
        if (c.id !== id) return c;
        const merged = { ...c, ...patch };
        if (patch.speechBubble === null) delete merged.speechBubble;
        return merged;
      });
      listRef.current = next;
      setList(next);
      dirtyRef.current = true;
    },
    [],
  );

  const speakLine = useCallback(
    (c: CompanionInstance, text: string) => {
      const profile = defFor(c.typeId).voice ?? voiceForType(c.typeId);
      void speakBeepLine(c.id, text, profile);
    },
    [],
  );

  const runRoutine = useCallback(
    (c: CompanionInstance, routineId: string) => {
      if (isTreasureLockedBonzi(c)) return;
      void runBuddyRoutine(routineId, {
        companionId: c.id,
        typeId: c.typeId,
        patchCompanion: (patch) => patchCompanion(c.id, patch),
        speak: (text) => speakLine(c, text),
      }).then((res) => {
        if (!res.ok && res.error && res.error !== 'Too fast.') {
          patchCompanion(c.id, { status: res.error });
        }
      });
    },
    [patchCompanion, speakLine],
  );

  const runTriggeredRoutines = useCallback(
    (kind: BuddyTriggerKind, opts?: { afterMs?: number }) => {
      const envNow = envRef.current;
      const routines = envNow.buddyRoutines?.length ? envNow.buddyRoutines : getDefaultBuddyRoutines();
      const matched = routinesMatchingTrigger(routines, kind, opts);
      if (!matched.length) return;
      for (const routine of matched) {
        const candidates = listRef.current.filter(
          (c) =>
            (!c.hiddenUntil || c.hiddenUntil <= Date.now()) &&
            (!routine.forType || routine.forType === '*' || routine.forType === c.typeId),
        );
        const target = candidates[0];
        if (target) runRoutine(target, routine.id);
      }
    },
    [runRoutine],
  );

  const maybeSpeakContext = useCallback(
    (ctx: DialogueContext, preferType?: CompanionTypeId) => {
      const pool = listRef.current.filter((c) => !c.hiddenUntil || c.hiddenUntil <= Date.now());
      if (!pool.length) return;
      const preferred = preferType ? pool.find((c) => c.typeId === preferType) : undefined;
      const c = preferred ?? pool[Math.floor(Math.random() * pool.length)];
      if (!c) return;
      const line = pickDialogueLine(c.typeId, ctx, c.id);
      if (line) speakLine(c, line);
    },
    [speakLine],
  );

  // Host / external: buddy:run { companionId, routineId } + time-trigger IPC
  useEffect(() => {
    const onRun = (ev: Event) => {
      const d = (ev as CustomEvent<{ companionId?: string; routineId?: string }>).detail;
      if (!d?.companionId || !d?.routineId) return;
      const c = listRef.current.find((x) => x.id === d.companionId);
      if (c) runRoutine(c, d.routineId);
    };
    const onTrigger = (ev: Event) => {
      const d = (ev as CustomEvent<{ routineId?: string; forType?: string }>).detail;
      if (!d?.routineId) return;
      const candidates = listRef.current.filter(
        (c) =>
          (!c.hiddenUntil || c.hiddenUntil <= Date.now()) &&
          (!d.forType || d.forType === '*' || d.forType === c.typeId),
      );
      const target = candidates[0];
      if (target) runRoutine(target, d.routineId);
    };
    window.addEventListener(BUDDY_RUN_EVENT, onRun);
    window.addEventListener('buddy:trigger', onTrigger);
    const unsubIpc =
      typeof window.api?.onBuddyRun === 'function'
        ? window.api.onBuddyRun((payload) => {
            window.dispatchEvent(new CustomEvent(BUDDY_RUN_EVENT, { detail: payload }));
          })
        : () => undefined;
    const unsubTrigger =
      typeof window.api?.onBuddyTrigger === 'function'
        ? window.api.onBuddyTrigger((payload) => {
            window.dispatchEvent(new CustomEvent('buddy:trigger', { detail: payload }));
          })
        : () => undefined;
    return () => {
      window.removeEventListener(BUDDY_RUN_EVENT, onRun);
      window.removeEventListener('buddy:trigger', onTrigger);
      unsubIpc();
      unsubTrigger();
    };
  }, [runRoutine]);

  // Speech bubble from beep engine
  useEffect(() => {
    const onSpeech = (ev: Event) => {
      const d = (ev as CustomEvent<BuddySpeechDetail>).detail;
      if (!d?.companionId) return;
      patchCompanion(d.companionId, { speechBubble: d.text });
    };
    window.addEventListener(BUDDY_SPEECH_EVENT, onSpeech);
    return () => window.removeEventListener(BUDDY_SPEECH_EVENT, onSpeech);
  }, [patchCompanion]);

  // Push time-of-day triggers to the single main-process scheduler
  useEffect(() => {
    if (!env.enabled || !env.companionsEnabled) {
      syncBuddyTimeSchedule([]);
      return;
    }
    const routines = env.buddyRoutines?.length ? env.buddyRoutines : getDefaultBuddyRoutines();
    syncBuddyTimeSchedule(routines);
  }, [env.enabled, env.companionsEnabled, env.buddyRoutines]);

  useEffect(() => {
    envRef.current = env;
  }, [env]);

  useEffect(() => onAeroDiscoveryChanged(setAeroDiscovered), []);
  useEffect(() => onWiredDiscoveryChanged(setWiredDiscovered), []);
  useEffect(
    () =>
      onMotionPrefsChanged((p) => {
        physicsRef.current = companionPhysics(p);
        weightRef.current = p.companionWeight;
      }),
    [],
  );

  useEffect(() => {
    menuIdRef.current = menuId;
  }, [menuId]);

  const persist = useCallback((next: CompanionInstance[]) => {
    // Idle callback when available so we don't block drag/scroll on JSON write.
    const run = () => {
      saveEnvironment({ companions: next });
      pushCompanionOsState(next);
    };
    const ric = (
      window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      }
    ).requestIdleCallback;
    if (typeof ric === 'function') ric(run, { timeout: 1500 });
    else window.setTimeout(run, 0);
  }, []);

  // Init / resync when companions toggled or type set changes
  useEffect(() => {
    if (!env.enabled || !env.companionsEnabled) {
      listRef.current = [];
      setList([]);
      return;
    }
    const rect = rootRef.current?.getBoundingClientRect();
    const w = rect?.width ?? 900;
    const h = rect?.height ?? 500;
    const next = seedOrLoad(env, w, h);
    listRef.current = next;
    setList(next);
    dirtyRef.current = true;
  }, [env.enabled, env.companionsEnabled, env.companionTypes?.join(','), aeroDiscovered, wiredDiscovered]);

  // Routine assignments are edited in Settings › Companions, which writes them
  // into `env.companions`. The resync effect above deliberately does NOT depend
  // on `env.companions` — it would re-seed on every wander autosave — so the
  // layer kept a list with no assignment on it, and `persist()` then wrote that
  // stale list straight back over the setting. Measured: a hold routine chosen
  // in Settings was gone from `jp-os-environment-v1` seconds later, and the
  // pet went on opening the menu. Primary and secondary go through the same
  // `patchEnv({ companions })` path and were lost the same way.
  const routineAssignmentKey = (env.companions ?? [])
    .map(
      (c) =>
        `${c.id}:${c.primaryRoutineId ?? ''}:${c.secondaryRoutineId ?? ''}:${c.holdRoutineId ?? ''}`,
    )
    .join('|');
  useEffect(() => {
    const byId = new Map((env.companions ?? []).map((c) => [c.id, c]));
    let changed = false;
    const next = listRef.current.map((c) => {
      const src = byId.get(c.id);
      if (!src) return c;
      if (
        src.primaryRoutineId === c.primaryRoutineId &&
        src.secondaryRoutineId === c.secondaryRoutineId &&
        src.holdRoutineId === c.holdRoutineId
      ) {
        return c;
      }
      changed = true;
      return {
        ...c,
        primaryRoutineId: src.primaryRoutineId,
        secondaryRoutineId: src.secondaryRoutineId,
        holdRoutineId: src.holdRoutineId,
      };
    });
    if (!changed) return;
    listRef.current = next;
    setList(next);
    dirtyRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routineAssignmentKey]);

  // Wander: DOM-only motion. Disk persist is rare (was every 2s → UI freezes).
  useEffect(() => {
    if (!env.enabled || !env.companionsEnabled) return;
    if (document.documentElement.classList.contains('reduce-motion')) return;

    let raf = 0;
    let last = performance.now();
    let lastPersist = performance.now();
    let lastReactSync = performance.now();
    let frameN = 0;
    let running = !document.hidden && !secretLifecycleSuspended();
    /** Cache companion nodes — querySelector every frame was expensive. */
    const elCache = new Map<string, HTMLElement | null>();

    const elFor = (root: HTMLElement | null, id: string): HTMLElement | null => {
      if (!root) return null;
      let el = elCache.get(id);
      if (el && el.isConnected) return el;
      el = root.querySelector(`[data-companion-id="${id}"]`) as HTMLElement | null;
      elCache.set(id, el);
      return el;
    };

    const flushPersist = (forceReact = false) => {
      if (!dirtyRef.current && !forceReact) return;
      dirtyRef.current = false;
      const snapshot = listRef.current.map((c) => ({ ...c }));
      listRef.current = snapshot;
      // React only when menu is open (needs live coords); otherwise DOM is enough.
      if (forceReact || menuIdRef.current) setList(snapshot);
      persist(snapshot);
    };

    const frame = (now: number) => {
      if (!running) return;
      frameN++;
      // Yield while user drags windows/icons
      if (document.documentElement.classList.contains('os-interacting')) {
        last = now;
        raf = requestAnimationFrame(frame);
        return;
      }
      // Half-rate wander (~30fps) — smooth enough, half the main-thread cost
      if (frameN % 2 === 1) {
        raf = requestAnimationFrame(frame);
        return;
      }

      const dt = Math.min(0.08, (now - last) / 1000);
      last = now;
      const root = rootRef.current;
      const w = root?.clientWidth ?? 900;
      const h = root?.clientHeight ?? 500;
      const speed = wanderSpeed(
        envRef.current.companionReactivity ?? 'normal',
        envRef.current.companionActiveness ?? 0.4,
      );
      const pauseStudy = envRef.current.companionPauseWhenStudying;
      const prev = listRef.current;
      if (!prev.length) {
        raf = requestAnimationFrame(frame);
        return;
      }

      let moved = false;
      let needsReact = false;
      for (const c of prev) {
        if (c.locked || (c.hiddenUntil && c.hiddenUntil > Date.now())) continue;
        if (dragRef.current?.id === c.id) continue;
        if (pauseStudy && c.mood === 'calm' && Math.random() < 0.4) continue;

        let nx = c.x;
        let ny = c.y;
        let facing = c.facing;

        if (isShimeji(c)) {
          const motionChanged = updateShimejiMotion(
            c,
            w,
            h,
            dt,
            speed,
            physicsRef.current,
            companionSize(c),
          );
          moved = true;
          needsReact = needsReact || motionChanged;
          applyDomPos(elFor(root, c.id), c);
          continue;
        }

        if (Math.random() < dt * 0.28) {
          const tx = clamp(c.x + (Math.random() - 0.5) * 120, 8, w - SIZE);
          const ty = clamp(c.y + (Math.random() - 0.5) * 80, 8, h - SIZE);
          const dx = tx - c.x;
          const dy = ty - c.y;
          const len = Math.hypot(dx, dy) || 1;
          const step = speed * dt;
          nx = clamp(c.x + (dx / len) * step, 8, w - SIZE);
          ny = clamp(c.y + (dy / len) * step, 8, h - SIZE);
          facing = dx >= 0 ? 1 : -1;
        } else if (c.typeId === 'critter' || envRef.current.companionReactivity === 'playful') {
          nx = clamp(c.x + Math.sin(now / 800 + c.x) * speed * dt * 0.4, 8, w - SIZE);
          ny = clamp(c.y + Math.cos(now / 900 + c.y) * speed * dt * 0.25, 8, h - SIZE);
        }

        if (nx !== c.x || ny !== c.y || facing !== c.facing) {
          c.x = nx;
          c.y = ny;
          c.facing = facing;
          moved = true;
          applyDomPos(elFor(root, c.id), c);
        }
      }

      if (moved) dirtyRef.current = true;
      if (needsReact && now - lastReactSync > 180) {
        lastReactSync = now;
        const snapshot = listRef.current.map((c) => ({ ...c }));
        listRef.current = snapshot;
        setList(snapshot);
      }

      // Persist at most every 12s — full env JSON to disk every 2s was the hitch.
      if (now - lastPersist > 12_000 && dirtyRef.current) {
        lastPersist = now;
        flushPersist(false);
      }

      raf = requestAnimationFrame(frame);
    };

    const onVis = () => {
      const shouldRun = !document.hidden && !secretLifecycleSuspended();
      if (!shouldRun) {
        running = false;
        cancelAnimationFrame(raf);
        if (dirtyRef.current && listRef.current.length) {
          lastPersist = performance.now();
          flushPersist(true);
        }
      } else if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('secret:lifecycle', onVis);

    if (running) raf = requestAnimationFrame(frame);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('secret:lifecycle', onVis);
      elCache.clear();
      // One disk flush on unmount if positions moved
      if (dirtyRef.current && listRef.current.length) {
        dirtyRef.current = false;
        const snapshot = listRef.current.map((c) => ({ ...c }));
        listRef.current = snapshot;
        // Sync write on unmount so positions aren't lost
        saveEnvironment({ companions: snapshot });
        pushCompanionOsState(snapshot);
      }
    };
  }, [env.enabled, env.companionsEnabled, persist]);

  // Re-show companions when temporary hide expires (no need to wait for next event)
  useEffect(() => {
    if (!env.enabled || !env.companionsEnabled) return;
    const now = Date.now();
    const pending = list
      .map((c) => c.hiddenUntil)
      .filter((t): t is number => typeof t === 'number' && t > now);
    if (!pending.length) return;
    const nextAt = Math.min(...pending);
    const tid = window.setTimeout(() => {
      const snapshot = listRef.current.map((c) => ({ ...c }));
      listRef.current = snapshot;
      setList(snapshot);
    }, Math.max(50, nextAt - Date.now() + 30));
    return () => clearTimeout(tid);
  }, [list, env.enabled, env.companionsEnabled]);

  const commitList = useCallback(
    (next: CompanionInstance[]) => {
      listRef.current = next;
      setList(next);
      dirtyRef.current = false;
      persist(next);
    },
    [persist],
  );

  const react = useCallback(
    (kind: CompanionEventDetail['kind'], note?: string) => {
      const chance = reactionChance(envRef.current.companionReactivity ?? 'normal');
      const force =
        kind === 'study' ||
        kind === 'flashcard' ||
        kind === 'streak' ||
        kind === 'achievement' ||
        kind === 'calendar';
      if (Math.random() > chance && !force) return;

      const prev = listRef.current;
      const next = prev.map((c) => {
        if (c.hiddenUntil && c.hiddenUntil > Date.now()) return c;
        let mood: CompanionMood = c.mood;
        let status = c.status;
        if (kind === 'study' || kind === 'flashcard') {
          if (c.typeId === 'study-buddy' || Math.random() < 0.5) {
            mood = envRef.current.companionCelebrate !== false ? 'celebrate' : 'happy';
            status =
              kind === 'flashcard'
                ? 'Card cleared!'
                : note
                  ? `Reading · ${note}`
                  : 'Nice focus';
          }
        } else if (kind === 'streak' || kind === 'achievement') {
          if (
            envRef.current.achievementCelebrations !== false &&
            (c.typeId === 'study-buddy' || Math.random() < 0.6)
          ) {
            mood = 'celebrate';
            status = note ?? (kind === 'streak' ? 'Streak!' : 'Milestone');
          }
        } else if (kind === 'calendar') {
          if (c.typeId === 'timekeeper' || c.typeId === 'study-buddy') {
            mood = note?.toLowerCase().includes('exam') ? 'curious' : 'happy';
            status = note ?? 'Calendar note';
          }
        } else if (kind === 'music-play') {
          mood = c.typeId === 'critter' ? 'curious' : 'happy';
          status = 'Feeling the music';
        } else if (kind === 'music-stop') {
          mood = 'calm';
          status = c.typeId === 'timekeeper' ? 'Quiet hours' : status;
        } else if (kind === 'morning') {
          if (c.typeId === 'timekeeper') {
            mood = 'curious';
            status = 'Good morning';
          }
        } else if (kind === 'night') {
          if (c.typeId === 'timekeeper') {
            mood = 'sleepy';
            status = 'Night watch';
          } else if (c.typeId === 'critter') {
            mood = 'sleepy';
            status = 'Curling up';
          }
        } else if (kind === 'environment') {
          // The world shifted (preset / weather change) — a gentle acknowledgement.
          mood = 'curious';
          status = note ? `Exploring · ${note}` : 'The world shifts';
        }
        return mood === c.mood && status === c.status ? c : { ...c, mood, status };
      });

      const changed = next.some((c, i) => c !== prev[i]);
      if (changed) commitList(next);

      if (kind === 'study' || kind === 'flashcard' || kind === 'streak' || kind === 'achievement') {
        window.setTimeout(() => {
          const cur = listRef.current;
          const cooled = cur.map((c) => (c.mood === 'celebrate' ? { ...c, mood: 'happy' as CompanionMood } : c));
          if (cooled.some((c, i) => c.mood !== cur[i].mood)) commitList(cooled);
        }, 4500);
      }
    },
    [commitList],
  );

  useEffect(() => {
    if (!env.enabled || !env.companionsEnabled) return;
    const unsub = onCompanionEvent((e) => react(e.kind, e.note));

    const onReading = (ev: Event) => {
      const d = (ev as CustomEvent<{ title?: string }>).detail;
      react('study', d?.title);
      maybeSpeakContext('study', 'study-buddy');
    };
    window.addEventListener(READING_RECORDED_EVENT, onReading);

    const onCards = () => {
      react('flashcard');
      maybeSpeakContext('flashcard', 'study-buddy');
    };
    window.addEventListener('flashcard-deck-changed', onCards);

    const unsubMusic = onPlayingChanged((playing) => {
      react(playing ? 'music-play' : 'music-stop');
      if (playing) {
        runTriggeredRoutines('musicPlaying');
        maybeSpeakContext('music', 'critter');
      }
    });

    // Mood-only daypart pulse (time routines fire from main buddyScheduler)
    const moodPulse = () => {
      const h = new Date().getHours();
      if (h >= 5 && h < 11) react('morning');
      else if (h >= 21 || h < 5) react('night');
    };
    moodPulse();
    const tid = window.setInterval(moodPulse, 30 * 60_000);

    // Idle trigger: no pointer/key activity for afterMs
    let lastActive = Date.now();
    let idleArmed = true;
    const bump = () => {
      lastActive = Date.now();
      idleArmed = true;
    };
    const onPtr = () => bump();
    const onKey = () => bump();
    window.addEventListener('pointerdown', onPtr, { passive: true });
    window.addEventListener('keydown', onKey, { passive: true });
    const idleTid = window.setInterval(() => {
      if (!idleArmed) return;
      const idleFor = Date.now() - lastActive;
      const routines = envRef.current.buddyRoutines?.length
        ? envRef.current.buddyRoutines
        : getDefaultBuddyRoutines();
      const idleOnes = routinesMatchingTrigger(routines, 'idle');
      const threshold = idleOnes.reduce(
        (min, r) => Math.min(min, r.trigger?.kind === 'idle' ? r.trigger.afterMs : IDLE_DEFAULT_MS),
        IDLE_DEFAULT_MS,
      );
      if (idleFor >= threshold) {
        idleArmed = false;
        runTriggeredRoutines('idle', { afterMs: idleFor });
        maybeSpeakContext('idle');
      }
    }, 5_000);

    let lastLevel = getUserLevel();
    const unsubLevel = onLevelChange(() => {
      const next = getUserLevel();
      if (next > lastLevel) {
        maybeSpeakContext('levelUp', 'study-buddy');
        react('achievement', 'Level up');
      }
      lastLevel = next;
    });

    return () => {
      unsub();
      window.removeEventListener(READING_RECORDED_EVENT, onReading);
      window.removeEventListener('flashcard-deck-changed', onCards);
      unsubMusic();
      clearInterval(tid);
      clearInterval(idleTid);
      window.removeEventListener('pointerdown', onPtr);
      window.removeEventListener('keydown', onKey);
      unsubLevel();
    };
  }, [env.enabled, env.companionsEnabled, react, runTriggeredRoutines, maybeSpeakContext]);

  // Avoid music-play spam on every remount: only if actually playing when first enabled
  useEffect(() => {
    if (!env.enabled || !env.companionsEnabled) return;
    if (musicIsPlaying()) react('music-play');
  }, [env.enabled, env.companionsEnabled]);

  const rejectTreasureBonzi = useCallback(
    (c: CompanionInstance) => {
      setShakeId(c.id);
      window.setTimeout(() => setShakeId((id) => (id === c.id ? null : id)), 420);
      patchCompanion(c.id, { mood: 'curious', status: t('companion.treasure.seeking') });
      window.dispatchEvent(
        new CustomEvent('os:toast', { detail: { message: t('companion.treasure.locked'), kind: 'warn' } }),
      );
    },
    [patchCompanion, lang],
  );

  const cancelHold = () => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = 0;
    }
  };

  /**
   * Press-and-hold, still pressed. The hold ends the press it grew out of: the
   * drag is dropped so the pet does not slide out from under the menu, and the
   * `click` that release will fire is swallowed by the same suppression a drag
   * uses. Unassigned hold opens the buddy menu (see `resolveHoldRoutineId`).
   */
  const fireHold = (c: CompanionInstance) => {
    holdTimerRef.current = 0;
    if (isTreasureLockedBonzi(c)) return;
    const d = dragRef.current;
    if (d && d.id === c.id) {
      dragRef.current = null;
      setDraggingId(null);
      clearDragStretch(
        rootRef.current?.querySelector(`[data-companion-id="${c.id}"]`) as HTMLElement | null,
      );
    }
    gestureRef.current = noteHold(gestureRef.current, c.id, Date.now());
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = 0;
    }
    const holdId = resolveHoldRoutineId(c);
    if (holdId) {
      setMenuId(null);
      runRoutine(c, holdId);
    } else {
      setMenuId(c.id);
    }
  };

  const onPointerDown = (c: CompanionInstance) => (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (isTreasureLockedBonzi(c)) {
      e.stopPropagation();
      rejectTreasureBonzi(c);
      return;
    }
    // Armed before the `locked` bail-out: a locked pet cannot be dragged, but it
    // can still be held.
    cancelHold();
    holdTimerRef.current = window.setTimeout(() => fireHold(c), HOLD_MS);
    if (c.locked) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { id: c.id, ox: c.x, oy: c.y, sx: e.clientX, sy: e.clientY, moved: false };
    setDraggingId(c.id);
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const z = getZoomFactor();
      const dx = (e.clientX - d.sx) / z;
      const dy = (e.clientY - d.sy) / z;
      if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      // Past the threshold this press is a drag, so it can no longer be a hold.
      if (holdTimerRef.current) {
        window.clearTimeout(holdTimerRef.current);
        holdTimerRef.current = 0;
      }
      d.moved = true;
      const root = rootRef.current;
      const w = root?.clientWidth ?? 900;
      const h = root?.clientHeight ?? 500;
      const cur = listRef.current.find((c) => c.id === d.id);
      const size = cur ? companionSize(cur) : SIZE;
      const nx = clamp(d.ox + dx, 8, w - size);
      const ny = clamp(d.oy + dy, 8, h - size);
      if (cur) {
        const now = performance.now();
        const elapsed = Math.max(1, now - (d.lastT || now));
        const vx = ((nx - cur.x) / elapsed) * 1000;
        const vy = ((ny - cur.y) / elapsed) * 1000;
        d.lastT = now;
        d.lastVx = vx;
        d.lastVy = vy;
        cur.x = nx;
        cur.y = ny;
        cur.motion = 'drag';
        cur.edge = 'floor';
        const el = root?.querySelector(`[data-companion-id="${d.id}"]`) as HTMLElement | null;
        applyDomPos(el, cur);
        applyDragStretch(el, vx, vy, weightRef.current);
      }
    };
    const up = () => {
      if (holdTimerRef.current) {
        window.clearTimeout(holdTimerRef.current);
        holdTimerRef.current = 0;
      }
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      // `click` is dispatched after `pointerup`, by which point `dragRef` is
      // already null — so the drag outcome is handed to the arbiter here rather
      // than read back in the click handler, where it is never visible.
      const drag = noteDragEnd(gestureRef.current, d.id, d.moved, Date.now());
      gestureRef.current = drag.next;
      if (drag.cancelPending && clickTimerRef.current) {
        window.clearTimeout(clickTimerRef.current);
        clickTimerRef.current = 0;
      }
      setDraggingId(null);
      clearDragStretch(
        rootRef.current?.querySelector(`[data-companion-id="${d.id}"]`) as HTMLElement | null,
      );
      if (d.moved) {
        const throwVx = clampThrowVelocity(d.lastVx ?? 0);
        const throwVy = clampThrowVelocity(d.lastVy ?? 0);
        const snapshot = listRef.current.map((c) =>
          c.id === d.id && isShimeji(c)
            ? {
                ...c,
                motion: 'fall' as CompanionMotion,
                edge: 'floor' as const,
                motionVx: throwVx,
                motionVy: throwVy,
              }
            : { ...c },
        );
        listRef.current = snapshot;
        setList(snapshot);
        persist(snapshot);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [persist]);

  const onBuddyClick = (c: CompanionInstance) => (e: RMouseEvent) => {
    e.stopPropagation();
    if (isTreasureLockedBonzi(c)) {
      rejectTreasureBonzi(c);
      return;
    }
    const { action, next } = decideClick(gestureRef.current, c.id, Date.now());
    gestureRef.current = next;

    if (action.kind === 'ignore') return;

    setMenuId(null);
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = 0;
    }
    if (action.kind === 'runSecondary') {
      runRoutine(c, resolveSecondaryRoutineId(c));
      return;
    }
    // The primary waits out the double-click window. Running it immediately is
    // what made a double click fire primary-then-secondary.
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = 0;
      gestureRef.current = clearPending(gestureRef.current);
      runRoutine(c, resolvePrimaryRoutineId(c));
    }, action.delayMs);
  };

  useEffect(
    () => () => {
      if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
      if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    },
    [],
  );

  const onBuddyContext = (c: CompanionInstance) => (e: RMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isTreasureLockedBonzi(c)) {
      rejectTreasureBonzi(c);
      return;
    }
    setMenuId((id) => (id === c.id ? null : c.id));
  };

  if (!env.enabled || !env.companionsEnabled) return null;

  const visible = list.filter((c) => !c.hiddenUntil || c.hiddenUntil <= Date.now());
  const routines = env.buddyRoutines?.length ? env.buddyRoutines : getDefaultBuddyRoutines();

  return (
    <div
      ref={rootRef}
      className="os-companion-layer"
      style={{
        ['--companion-bob-dur' as string]: `${bobDurationSec(env.companionActiveness ?? 0.4)}s`,
      }}
    >
      {visible.map((c) => {
        const def = defFor(c.typeId);
        const size = companionSize(c);
        const menuRoutines = resolveMenuRoutineIds(c, routines);
        // Everything this type can legally run — `runBuddyRoutine` refuses a
        // routine whose forType does not match, so offering more would be a
        // picker with dead entries.
        const bindableRoutines = routinesForType(routines, c.typeId);
        const lockedTreasure = isTreasureLockedBonzi(c);
        return (
          <div
            key={c.id}
            data-companion-id={c.id}
            className={`os-companion mood-${c.mood}${c.locked ? ' locked' : ''}${lockedTreasure ? ' is-treasure-locked' : ''}${shakeId === c.id ? ' is-treasure-shake' : ''}${def.variant ? ` variant-${def.variant}` : ''}`}
            style={{
              left: 0,
              top: 0,
              width: size,
              height: size,
              transform: companionCssTransform(c),
              ['--c-body' as string]: def.color,
              ['--c-accent' as string]: def.accent,
            }}
            title={
              lockedTreasure
                ? `${def.label} — ${t('companion.treasure.locked')}`
                : `${def.label}${c.status ? ` — ${c.status}` : ''} · ${t('companion.tooltip.hint')}`
            }
            onPointerDown={onPointerDown(c)}
            onClick={onBuddyClick(c)}
            onContextMenu={onBuddyContext(c)}
          >
            {def.spritePack ? (
              <ShimejiSprite
                motion={c.motion}
                mood={c.mood}
                dragging={draggingId === c.id}
                pack={def.spritePack}
                activeness={env.companionActiveness ?? 0.4}
              />
            ) : (
              <div className="os-companion-body">
                <span className="os-companion-eye" />
                <span className="os-companion-eye" />
                <span className={`os-companion-mouth mood-${c.mood}`} />
              </div>
            )}
            {c.speechBubble && (
              <div
                className="os-companion-bubble"
                style={{
                  transform: `translateX(-50%) ${companionChromeCounterScale(c.facing, c.edge)}`,
                }}
              >
                {c.speechBubble}
              </div>
            )}
            {c.mood === 'celebrate' && <span className="os-companion-spark" />}
            {!lockedTreasure && (
            <button
              type="button"
              className="os-companion-menu-btn"
              style={{ transform: companionChromeCounterScale(c.facing, c.edge) }}
              title={t('companion.menu.button')}
              aria-label={`${def.label} menu`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setMenuId((id) => (id === c.id ? null : c.id));
              }}
            >
              ···
            </button>
            )}
            {menuId === c.id && !lockedTreasure && (
              <div
                className="os-companion-menu"
                style={{
                  transform: `translateX(-50%) ${companionChromeCounterScale(c.facing, c.edge)}`,
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="os-companion-menu-title">{def.label}</div>
                <div className="os-companion-menu-status muted">{c.status ?? def.blurb}</div>
                {menuRoutines.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="btn small"
                    onClick={() => {
                      runRoutine(c, r.id);
                      setMenuId(null);
                    }}
                  >
                    {t('companion.menu.run', { name: r.name })}
                  </button>
                ))}
                <div className="os-companion-menu-shortcuts">
                  <div className="os-companion-menu-label">{t('companion.menu.shortcuts')}</div>
                  {(
                    [
                      ['primaryRoutineId', 'companion.menu.bindPrimary', resolvePrimaryRoutineId(c)],
                      [
                        'secondaryRoutineId',
                        'companion.menu.bindSecondary',
                        resolveSecondaryRoutineId(c),
                      ],
                      ['holdRoutineId', 'companion.menu.bindHold', resolveHoldRoutineId(c)],
                    ] as const
                  ).map(([field, labelKey, value]) => (
                    <label key={field} className="os-companion-menu-bind">
                      <span className="muted">{t(labelKey)}</span>
                      <select
                        className="set-select"
                        value={value}
                        onChange={(e) => {
                          const next = e.target.value;
                          commitList(
                            listRef.current.map((x) =>
                              x.id === c.id ? { ...x, [field]: next } : x,
                            ),
                          );
                        }}
                      >
                        {/* Hold is the only slot that may be bound to nothing;
                            unbound it opens this menu (see resolveHoldRoutineId). */}
                        {field === 'holdRoutineId' && (
                          <option value="">{t('settings.companions.holdOpensMenu')}</option>
                        )}
                        {bindableRoutines.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    commitList(
                      listRef.current.map((x) => (x.id === c.id ? { ...x, locked: !x.locked } : x)),
                    );
                  }}
                >
                  {c.locked ? t('companion.menu.unlock') : t('companion.menu.lock')}
                </button>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    const until = Date.now() + 60 * 60 * 1000;
                    commitList(
                      listRef.current.map((x) => (x.id === c.id ? { ...x, hiddenUntil: until } : x)),
                    );
                    setMenuId(null);
                  }}
                >
                  {t('companion.menu.hideHour')}
                </button>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('os:open', { detail: 'settings' }));
                    window.dispatchEvent(
                      new CustomEvent('settings:navigate', {
                        detail: { page: 'companions', settingId: 'buddy-programmer' },
                      }),
                    );
                    setMenuId(null);
                  }}
                >
                  {t('companion.menu.configureRoutines')}
                </button>
                <button type="button" className="btn small" onClick={() => setMenuId(null)}>
                  {t('common.close')}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
