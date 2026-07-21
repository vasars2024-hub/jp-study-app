// Renderer glue between the finding-overlay modules and the user's real data.
//
// findingModules.ts is the pure logic; this reads the actual stores (mined
// deck, word-knowledge levels, reading stats) and hands both overlays the same
// readouts. Mirrors the games/contentSource ↔ games/contentStore split.
//
// Cost discipline matters here. The overlays render on an animation interval,
// and `loadArenaContent` walks the whole deck through the tokenizer — doing
// that per frame would stall the compositor and reintroduce exactly the
// window-dragging lag the project forbids. So the deck is loaded once per
// mount and refreshed only on the events that can actually change it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { loadArenaContent } from './games/contentStore';
import { loadEnvironment, saveEnvironment } from './environment/environmentStore';
import type { CompanionInstance, CompanionTypeId } from './environment/companionCatalog';
import { getUserLevel, onLevelChange } from './levelService';
import { getLevel, knowledgeCounts, onKnowledgeChanged } from './knownWords';
import { getSummary } from './stats';
import {
  buildBountyBoard,
  buildKanjiChallenge,
  computeSessionGauge,
  computeStudyVerdict,
  pickInterceptedTerm,
  type BountyTarget,
  type KanjiChallenge,
  type SessionGauge,
  type StudyVerdict,
  type InterceptedTerm,
} from './findingModules';
import type { VocabItem } from './games/contentSource';

export interface FindingReadouts {
  /** The user's own vocabulary for their current level. Empty when the deck is. */
  vocab: VocabItem[];
  /** Multiple-choice reading quiz; null when the deck can't support one. */
  challenge: KanjiChallenge | null;
  /** Three-unit recommendation on what to do next. */
  verdict: StudyVerdict;
  /** Weakest vocabulary, most-wanted first. */
  bounties: BountyTarget[];
  /** Streak + today's progress. */
  gauge: SessionGauge;
  /** A single withheld term. */
  intercepted: InterceptedTerm | null;
  /** Advance the seed to draw a fresh challenge / term. */
  reroll: () => void;
  /** True when the deck is too thin to drive the study modules. */
  starved: boolean;
}

/**
 * Live readouts for the overlay modules.
 *
 * `enabled` short-circuits every store read, so a disabled overlay costs
 * nothing — the modules are off far more often than they are on.
 */
export function useFindingReadouts(enabled: boolean): FindingReadouts {
  const [seed, setSeed] = useState(0);
  const [deckNonce, setDeckNonce] = useState(0);
  const [statsNonce, setStatsNonce] = useState(0);

  const bump = useCallback(() => setDeckNonce((n) => n + 1), []);
  useEffect(() => (enabled ? onLevelChange(bump) : undefined), [bump, enabled]);
  useEffect(() => (enabled ? onKnowledgeChanged(bump) : undefined), [bump, enabled]);

  // Stats move while the user studies, but a per-frame re-read is pointless —
  // the gauge is a minutes-scale readout. Sample it on a slow timer instead.
  useEffect(() => {
    if (!enabled) return undefined;
    const id = window.setInterval(() => setStatsNonce((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [enabled]);

  const vocab = useMemo<VocabItem[]>(() => {
    if (!enabled) return [];
    try {
      return loadArenaContent(getUserLevel()).vocab;
    } catch {
      // A corrupt deck must not take the desktop down with it.
      return [];
    }
  }, [deckNonce, enabled]);

  const challenge = useMemo(
    () => (enabled ? buildKanjiChallenge(vocab, seed) : null),
    [enabled, seed, vocab],
  );

  const intercepted = useMemo(
    () => (enabled ? pickInterceptedTerm(vocab, seed + 101) : null),
    [enabled, seed, vocab],
  );

  const bounties = useMemo(
    () => (enabled ? buildBountyBoard(vocab, getLevel) : []),
    [deckNonce, enabled, vocab],
  );

  const verdict = useMemo(() => {
    const summary = enabled ? getSummary() : null;
    return computeStudyVerdict({
      streak: summary?.streak ?? 0,
      todaySeconds: summary?.todaySeconds ?? 0,
      knowledge: enabled ? knowledgeCounts() : { 0: 0, 1: 0, 2: 0, 3: 0 },
      deckSize: vocab.length,
    });
  }, [enabled, statsNonce, deckNonce, vocab.length]);

  const gauge = useMemo(() => {
    const summary = enabled ? getSummary() : null;
    return computeSessionGauge(summary?.streak ?? 0, summary?.todaySeconds ?? 0);
  }, [enabled, statsNonce]);

  const reroll = useCallback(() => setSeed((n) => n + 1), []);

  return {
    vocab,
    challenge,
    verdict,
    bounties,
    gauge,
    intercepted,
    reroll,
    starved: vocab.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Companion summon — the payload behind WIRED's `wiredShimeji` / Aero's
// `desktopBuddy`. Both used to be toggles wired to no renderer at all, so the
// terminal's SUMMON command was a visible no-op. They now drive the real
// companion layer instead of a second, parallel sprite system.
// ---------------------------------------------------------------------------

/** The companion each theme summons. Both sprites already ship in the catalog. */
const SUMMON_TYPE = {
  wired: 'wired-navi',
  aero: 'miko-shimeji',
} as const;

export type SummonTheme = keyof typeof SUMMON_TYPE;

/** Marks instances this feature created, so dismiss only removes its own. */
const SUMMON_ID_PREFIX = 'c-summon-';

/**
 * What the environment looked like before we turned it on, so dismiss can put
 * it back. Only written when the summon is what enabled the layer.
 */
const SUMMON_RESTORE_KEY = 'jp-finding-summon-restore-v1';

interface SummonRestore {
  enabled: boolean;
  companionsEnabled: boolean;
  companionTypes: CompanionTypeId[];
}

function readRestore(): SummonRestore | null {
  try {
    const raw = localStorage.getItem(SUMMON_RESTORE_KEY);
    return raw ? (JSON.parse(raw) as SummonRestore) : null;
  } catch {
    return null;
  }
}

export function isSummonPresent(theme: SummonTheme): boolean {
  try {
    const env = loadEnvironment();
    const id = `${SUMMON_ID_PREFIX}${SUMMON_TYPE[theme]}`;
    return env.enabled && env.companionsEnabled && env.companions.some((c) => c.id === id);
  } catch {
    return false;
  }
}

/**
 * Force the summoned buddy for a theme on or off (no-op if already there).
 */
export function setSummonedCompanion(theme: SummonTheme, on: boolean): boolean {
  const present = isSummonPresent(theme);
  if (on === present) return present;
  return toggleSummonedCompanion(theme);
}

/**
 * Hard-off for Settings: drop every companion instance, clear summon restore,
 * and leave the living layer alone otherwise. Used by Companions → Off.
 */
export function forceCompanionsOff(): void {
  try {
    localStorage.removeItem(SUMMON_RESTORE_KEY);
  } catch {
    /* ignore */
  }
  saveEnvironment({ companionsEnabled: false, companions: [] });
}

/**
 * Toggle the summoned companion. Returns true when one is now present.
 *
 * Two paths, because the right cleanup depends on who turned the layer on:
 *
 * - Companions already on → add our instance next to the user's own and change
 *   nothing else. Dismiss removes only ours.
 * - Companions off → enable the layer but narrow `companionTypes` to just the
 *   summoned type, so the user gets the one companion they asked for instead of
 *   the whole default cast. Dismiss restores the previous settings exactly.
 */
export function toggleSummonedCompanion(theme: SummonTheme): boolean {
  try {
    const env = loadEnvironment();
    const typeId = SUMMON_TYPE[theme];
    const id = `${SUMMON_ID_PREFIX}${typeId}`;

    // "Present" must mean visible, not merely recorded. CompanionLayer
    // re-persists its own working list, so a dismissed instance can reappear in
    // storage after we removed it; keying off the array alone would make the
    // next click take the dismiss branch again and do nothing.
    const existing = env.enabled && env.companionsEnabled && env.companions.some((c) => c.id === id);

    if (existing) {
      const companions = env.companions.filter((c) => c.id !== id);
      const restore = readRestore();
      if (restore) {
        // The summon is what switched the layer on — put it back exactly as it
        // was, rather than leaving the user with a companion layer they never
        // asked for.
        saveEnvironment({
          enabled: restore.enabled,
          companionsEnabled: restore.companionsEnabled,
          companionTypes: restore.companionTypes as CompanionTypeId[],
          companions,
        });
        try {
          localStorage.removeItem(SUMMON_RESTORE_KEY);
        } catch {
          /* ignore */
        }
      } else {
        saveEnvironment({ companions });
      }
      return false;
    }

    const w = typeof window === 'undefined' ? 900 : window.innerWidth;
    const h = typeof window === 'undefined' ? 500 : window.innerHeight;
    // Drop any stale record with our id before re-adding, so a lingering
    // entry from a previous dismiss cannot become a duplicate.
    const others = env.companions.filter((c) => c.id !== id);
    const summoned: CompanionInstance = {
      id,
      typeId,
      x: Math.max(40, w * 0.68),
      y: Math.max(80, h - 160),
      facing: -1,
      mood: 'curious',
      motion: 'walk',
      motionTargetX: Math.max(40, w * 0.3),
    };

    // CompanionLayer bails on `!env.enabled || !env.companionsEnabled`, and
    // `seedOrLoad` drops any saved instance whose typeId is absent from a
    // non-empty `companionTypes` allowlist. Setting only `companionsEnabled`
    // persisted the instance but rendered nothing.
    const types = env.companionTypes ?? [];
    const layerWasOn = env.enabled && env.companionsEnabled;

    if (layerWasOn) {
      // The user already keeps companions. Add ours alongside theirs and touch
      // nothing else.
      saveEnvironment({
        companionTypes: types.length && !types.includes(typeId) ? [...types, typeId] : types,
        companions: [...others, summoned],
      });
      return true;
    }

    // The layer was off, so turning it on would make `seedOrLoad` populate the
    // entire default cast — click "summon one navi", get six companions.
    // Narrow the allowlist to just this type for the duration of the summon,
    // and remember what to restore.
    try {
      localStorage.setItem(
        SUMMON_RESTORE_KEY,
        JSON.stringify({
          enabled: env.enabled,
          companionsEnabled: env.companionsEnabled,
          companionTypes: types,
        } as SummonRestore),
      );
    } catch {
      /* ignore */
    }
    saveEnvironment({
      enabled: true,
      companionsEnabled: true,
      companionTypes: [typeId],
      companions: [...others, summoned],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Track the pointer without re-rendering React.
 *
 * The overlays' eye / radar / shield parallax used to `setState` on every
 * `mousemove`, re-rendering the whole overlay tree dozens of times a second.
 * This writes the position straight to CSS custom properties on a ref instead,
 * so the browser animates it on the compositor and React never re-runs.
 *
 * The element should read `--fx` / `--fy` (both 0..1, defaulting to 0.5).
 */
export function usePointerParallax<T extends HTMLElement>(enabled: boolean) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const node = ref.current;
    if (!node) return undefined;

    let frame = 0;
    let pending: { x: number; y: number } | null = null;

    const flush = (): void => {
      frame = 0;
      if (!pending || !ref.current) return;
      ref.current.style.setProperty('--fx', pending.x.toFixed(4));
      ref.current.style.setProperty('--fy', pending.y.toFixed(4));
      pending = null;
    };

    const onMove = (event: MouseEvent): void => {
      pending = {
        x: Math.min(1, Math.max(0, event.clientX / Math.max(1, window.innerWidth))),
        y: Math.min(1, Math.max(0, event.clientY / Math.max(1, window.innerHeight))),
      };
      // Coalesce to one write per frame; mousemove fires far faster than paint.
      if (!frame) frame = window.requestAnimationFrame(flush);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [enabled]);

  return ref;
}
