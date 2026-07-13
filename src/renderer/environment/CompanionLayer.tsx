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
  type CompanionInstance,
  type CompanionMood,
  type CompanionReactivity,
  type CompanionTypeId,
} from './companionCatalog';
import { onCompanionEvent, type CompanionEventDetail } from './companionEvents';
import { onPlayingChanged, isPlaying as musicIsPlaying } from '../audioBus';
import { READING_RECORDED_EVENT } from '../stats';
import { saveEnvironment } from './environmentStore';
import { pushCompanionOsState } from './companionOsBridge';
import { getZoomFactor } from '../appZoom';
import {
  BUDDY_RUN_EVENT,
  getDefaultBuddyRoutines,
  resolveMenuRoutineIds,
  resolvePrimaryRoutineId,
  resolveSecondaryRoutineId,
  runBuddyRoutine,
} from './buddyRoutines';

const SIZE = 52;
const DRAG_THRESHOLD = 6;

/** Avoid re-firing morning/night on every CompanionLayer remount within the same period. */
let lastHourPulseKind: 'morning' | 'night' | null = null;
let lastHourPulseDay = '';

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

function wanderSpeed(reactivity: CompanionReactivity): number {
  if (reactivity === 'quiet') return 12;
  if (reactivity === 'playful') return 38;
  return 22;
}

function reactionChance(reactivity: CompanionReactivity): number {
  if (reactivity === 'quiet') return 0.25;
  if (reactivity === 'playful') return 0.9;
  return 0.55;
}

/** Keep saved instances for active types; seed any missing active types. */
function seedOrLoad(env: EnvironmentSettings, w: number, h: number): CompanionInstance[] {
  const now = Date.now();
  const active = new Set<CompanionTypeId>(
    env.companionTypes?.length
      ? (env.companionTypes as CompanionTypeId[])
      : COMPANION_DEFS.map((d) => d.id),
  );
  const saved = (env.companions ?? [])
    .filter((c) => active.has(c.typeId))
    .filter((c) => !c.hiddenUntil || c.hiddenUntil < now)
    .map((c) => ({
      ...c,
      x: clamp(c.x, 8, Math.max(8, w - SIZE)),
      y: clamp(c.y, 8, Math.max(8, h - SIZE)),
    }));

  const have = new Set(saved.map((c) => c.typeId));
  const seeded = defaultCompanions(w, h).filter((c) => active.has(c.typeId) && !have.has(c.typeId));
  return [...saved, ...seeded];
}

function applyDomPos(el: HTMLElement | null, c: CompanionInstance): void {
  if (!el) return;
  // Compositor path: avoid left/top layout thrash every wander frame.
  el.style.transform = `translate3d(${c.x}px, ${c.y}px, 0) scaleX(${c.facing})`;
}

export default function CompanionLayer({ env }: { env: EnvironmentSettings }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [list, setList] = useState<CompanionInstance[]>([]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const listRef = useRef<CompanionInstance[]>([]);
  const envRef = useRef(env);
  const dragRef = useRef<{
    id: string;
    ox: number;
    oy: number;
    sx: number;
    sy: number;
    moved: boolean;
  } | null>(null);
  const dirtyRef = useRef(false);
  const menuIdRef = useRef<string | null>(null);
  const lastClickRef = useRef<{ id: string; t: number } | null>(null);

  const patchCompanion = useCallback(
    (id: string, patch: { mood?: CompanionMood; status?: string }) => {
      const next = listRef.current.map((c) => (c.id === id ? { ...c, ...patch } : c));
      listRef.current = next;
      setList(next);
      // Soft persist mood/status without thrashing: mark dirty for 2s flush
      dirtyRef.current = true;
    },
    [],
  );

  const runRoutine = useCallback(
    (c: CompanionInstance, routineId: string) => {
      void runBuddyRoutine(routineId, {
        companionId: c.id,
        typeId: c.typeId,
        patchCompanion: (patch) => patchCompanion(c.id, patch),
      }).then((res) => {
        if (!res.ok && res.error && res.error !== 'Too fast.') {
          patchCompanion(c.id, { status: res.error });
        }
      });
    },
    [patchCompanion],
  );

  // Host / external: buddy:run { companionId, routineId }
  useEffect(() => {
    const onRun = (ev: Event) => {
      const d = (ev as CustomEvent<{ companionId?: string; routineId?: string }>).detail;
      if (!d?.companionId || !d?.routineId) return;
      const c = listRef.current.find((x) => x.id === d.companionId);
      if (c) runRoutine(c, d.routineId);
    };
    window.addEventListener(BUDDY_RUN_EVENT, onRun);
    const unsubIpc =
      typeof window.api?.onBuddyRun === 'function'
        ? window.api.onBuddyRun((payload) => {
            window.dispatchEvent(new CustomEvent(BUDDY_RUN_EVENT, { detail: payload }));
          })
        : () => undefined;
    return () => {
      window.removeEventListener(BUDDY_RUN_EVENT, onRun);
      unsubIpc();
    };
  }, [runRoutine]);

  useEffect(() => {
    envRef.current = env;
  }, [env]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env.enabled, env.companionsEnabled, env.companionTypes?.join(',')]);

  // Wander: DOM-only motion. Disk persist is rare (was every 2s → UI freezes).
  useEffect(() => {
    if (!env.enabled || !env.companionsEnabled) return;
    if (document.documentElement.classList.contains('reduce-motion')) return;

    let raf = 0;
    let last = performance.now();
    let lastPersist = performance.now();
    let frameN = 0;
    let running = !document.hidden;
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
      const speed = wanderSpeed(envRef.current.companionReactivity ?? 'normal');
      const pauseStudy = envRef.current.companionPauseWhenStudying;
      const prev = listRef.current;
      if (!prev.length) {
        raf = requestAnimationFrame(frame);
        return;
      }

      let moved = false;
      for (const c of prev) {
        if (c.locked || (c.hiddenUntil && c.hiddenUntil > Date.now())) continue;
        if (dragRef.current?.id === c.id) continue;
        if (pauseStudy && c.mood === 'calm' && Math.random() < 0.4) continue;

        let nx = c.x;
        let ny = c.y;
        let facing = c.facing;

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

      // Persist at most every 12s — full env JSON to disk every 2s was the hitch.
      if (now - lastPersist > 12_000 && dirtyRef.current) {
        lastPersist = now;
        flushPersist(false);
      }

      raf = requestAnimationFrame(frame);
    };

    const onVis = () => {
      if (document.hidden) {
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

    if (running) raf = requestAnimationFrame(frame);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
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
          if (c.typeId === 'study-buddy' || c.typeId === 'noctis' || Math.random() < 0.5) {
            mood = envRef.current.companionCelebrate !== false ? 'celebrate' : 'happy';
            if (c.typeId === 'noctis') {
              status = kind === 'flashcard' ? 'Crystal warmed' : note ? `Light from · ${note}` : 'City grows';
            } else {
              status = kind === 'flashcard' ? 'Card cleared!' : note ? `Reading · ${note}` : 'Nice focus';
            }
          }
        } else if (kind === 'streak' || kind === 'achievement') {
          if (
            envRef.current.achievementCelebrations !== false &&
            (c.typeId === 'study-buddy' || c.typeId === 'noctis' || Math.random() < 0.6)
          ) {
            mood = 'celebrate';
            status = note ?? (kind === 'streak' ? 'Streak!' : 'Milestone');
          }
        } else if (kind === 'calendar') {
          if (c.typeId === 'noctis' || c.typeId === 'timekeeper' || c.typeId === 'study-buddy') {
            mood = note?.toLowerCase().includes('exam') ? 'curious' : 'happy';
            status = note ?? 'Calendar note';
          }
        } else if (kind === 'music-play') {
          mood = c.typeId === 'critter' || c.typeId === 'noctis' ? 'curious' : 'happy';
          status = c.typeId === 'noctis' ? 'Resonating' : 'Feeling the music';
        } else if (kind === 'music-stop') {
          mood = 'calm';
          status =
            c.typeId === 'timekeeper' ? 'Quiet hours' : c.typeId === 'noctis' ? 'Still listening' : status;
        } else if (kind === 'morning') {
          if (c.typeId === 'timekeeper') {
            mood = 'curious';
            status = 'Good morning';
          } else if (c.typeId === 'noctis') {
            mood = 'calm';
            status = 'Dawn under the canopy';
          }
        } else if (kind === 'night') {
          if (c.typeId === 'timekeeper') {
            mood = 'sleepy';
            status = 'Night watch';
          } else if (c.typeId === 'critter') {
            mood = 'sleepy';
            status = 'Curling up';
          } else if (c.typeId === 'noctis') {
            mood = 'curious';
            status = 'Night ecology awake';
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
    };
    window.addEventListener(READING_RECORDED_EVENT, onReading);

    const onCards = () => react('flashcard');
    window.addEventListener('flashcard-deck-changed', onCards);

    const unsubMusic = onPlayingChanged((playing) => {
      react(playing ? 'music-play' : 'music-stop');
    });

    // Time-of-day pulse once per day-period (module-level debounce survives remounts)
    const hourPulse = () => {
      const now = new Date();
      const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
      const h = now.getHours();
      let kind: 'morning' | 'night' | null = null;
      if (h >= 5 && h < 11) kind = 'morning';
      else if (h >= 21 || h < 5) kind = 'night';
      if (!kind) {
        lastHourPulseKind = null;
        return;
      }
      if (lastHourPulseDay === day && lastHourPulseKind === kind) return;
      lastHourPulseDay = day;
      lastHourPulseKind = kind;
      react(kind);
    };
    hourPulse();
    const tid = window.setInterval(hourPulse, 10 * 60_000);

    return () => {
      unsub();
      window.removeEventListener(READING_RECORDED_EVENT, onReading);
      window.removeEventListener('flashcard-deck-changed', onCards);
      unsubMusic();
      clearInterval(tid);
    };
  }, [env.enabled, env.companionsEnabled, react]);

  // Avoid music-play spam on every remount: only if actually playing when first enabled
  useEffect(() => {
    if (!env.enabled || !env.companionsEnabled) return;
    if (musicIsPlaying()) react('music-play');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env.enabled, env.companionsEnabled]);

  const onPointerDown = (c: CompanionInstance) => (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (c.locked) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { id: c.id, ox: c.x, oy: c.y, sx: e.clientX, sy: e.clientY, moved: false };
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const z = getZoomFactor();
      const dx = (e.clientX - d.sx) / z;
      const dy = (e.clientY - d.sy) / z;
      if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      d.moved = true;
      const root = rootRef.current;
      const w = root?.clientWidth ?? 900;
      const h = root?.clientHeight ?? 500;
      const nx = clamp(d.ox + dx, 8, w - SIZE);
      const ny = clamp(d.oy + dy, 8, h - SIZE);
      const cur = listRef.current.find((c) => c.id === d.id);
      if (cur) {
        cur.x = nx;
        cur.y = ny;
        const el = root?.querySelector(`[data-companion-id="${d.id}"]`) as HTMLElement | null;
        applyDomPos(el, cur);
      }
    };
    const up = () => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      if (d.moved) {
        const snapshot = listRef.current.map((c) => ({ ...c }));
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
    if (dragRef.current?.moved) return;
    // Ignore click that completed a drag
    const d = dragRef.current;
    if (d?.id === c.id && d.moved) return;

    const now = Date.now();
    const prev = lastClickRef.current;
    if (prev && prev.id === c.id && now - prev.t < 320) {
      lastClickRef.current = null;
      setMenuId(null);
      runRoutine(c, resolveSecondaryRoutineId(c));
      return;
    }
    lastClickRef.current = { id: c.id, t: now };
    setMenuId(null);
    runRoutine(c, resolvePrimaryRoutineId(c));
  };

  const onBuddyContext = (c: CompanionInstance) => (e: RMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuId((id) => (id === c.id ? null : c.id));
  };

  if (!env.enabled || !env.companionsEnabled) return null;

  const visible = list.filter((c) => !c.hiddenUntil || c.hiddenUntil <= Date.now());
  const routines = env.buddyRoutines?.length ? env.buddyRoutines : getDefaultBuddyRoutines();

  return (
    <div ref={rootRef} className="os-companion-layer">
      {visible.map((c) => {
        const def = defFor(c.typeId);
        const menuRoutines = resolveMenuRoutineIds(c, routines);
        return (
          <div
            key={c.id}
            data-companion-id={c.id}
            className={`os-companion mood-${c.mood}${c.locked ? ' locked' : ''}${def.variant ? ` variant-${def.variant}` : ''}`}
            style={{
              left: 0,
              top: 0,
              transform: `translate3d(${c.x}px, ${c.y}px, 0) scaleX(${c.facing})`,
              ['--c-body' as string]: def.color,
              ['--c-accent' as string]: def.accent,
            }}
            title={`${def.label}${c.status ? ` — ${c.status}` : ''} · Click: run · Right-click: menu`}
            onPointerDown={onPointerDown(c)}
            onClick={onBuddyClick(c)}
            onContextMenu={onBuddyContext(c)}
          >
            <div className="os-companion-body">
              <span className="os-companion-eye" />
              <span className="os-companion-eye" />
              <span className={`os-companion-mouth mood-${c.mood}`} />
            </div>
            {c.mood === 'celebrate' && <span className="os-companion-spark" />}
            <button
              type="button"
              className="os-companion-menu-btn"
              title="Buddy menu"
              aria-label={`${def.label} menu`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setMenuId((id) => (id === c.id ? null : c.id));
              }}
            >
              ···
            </button>
            {menuId === c.id && (
              <div
                className="os-companion-menu"
                style={{ transform: `translateX(-50%) scaleX(${c.facing === -1 ? -1 : 1})` }}
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
                    Run: {r.name}
                  </button>
                ))}
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    commitList(
                      listRef.current.map((x) => (x.id === c.id ? { ...x, locked: !x.locked } : x)),
                    );
                  }}
                >
                  {c.locked ? 'Unlock' : 'Lock place'}
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
                  Hide 1 hour
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
                  Configure routines
                </button>
                <button type="button" className="btn small" onClick={() => setMenuId(null)}>
                  Close
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
