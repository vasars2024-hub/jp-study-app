// @vitest-environment jsdom
/**
 * Aero study mechanics — the decisions behind the Memory Defragmenter, the
 * Vocabulary Update, balloon tips and the study screensaver. Pure functions,
 * plus the settings store's normalisation.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  analyzeDeck,
  buildBlockMap,
  canShowBalloon,
  classifyCard,
  defragQueue,
  formatPct,
  installedToday,
  isFirstTimeToday,
  aeroDayKey,
  pickBalloonCard,
  planUpdates,
  screensaverShouldStart,
  screensaverWords,
  updateKbNumber,
  UNCAPPED_BATCH,
  type MechCard,
  type ScreensaverGate,
} from '../aeroMechanics/aeroMechLogic';
import {
  AERO_MECH_DEFAULTS,
  loadAeroMechSettings,
  normalizeAeroMechSettings,
  saveAeroMechSettings,
} from '../aeroMechanics/aeroMechSettings';
import type { LocalSrsState } from '../../shared/localSrs';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 7, 15, 0, 0).getTime();

function srs(partial: Partial<LocalSrsState>): LocalSrsState {
  return {
    version: 2,
    algorithm: 'sm2',
    dueAt: NOW + DAY,
    intervalDays: 3,
    ease: 2.5,
    repetitions: 2,
    lapses: 0,
    lastReviewedAt: NOW - DAY,
    lastRating: 'good',
    ...partial,
  };
}

function card(id: string, partial: Partial<MechCard> = {}): MechCard {
  return { id, word: `語${id}`, reading: `ご${id}`, meaning: `meaning ${id}`, ...partial };
}

describe('classifyCard', () => {
  it('reads every SRS state the map distinguishes', () => {
    expect(classifyCard({}, NOW)).toBe('new');
    expect(classifyCard({ srs: srs({ dueAt: NOW - 1000 }) }, NOW)).toBe('due');
    expect(classifyCard({ srs: srs({ dueAt: NOW - 2 * DAY }) }, NOW)).toBe('overdue');
    expect(classifyCard({ srs: srs({ intervalDays: 0, dueAt: NOW + 600_000 }) }, NOW)).toBe('learning');
    expect(classifyCard({ srs: srs({ intervalDays: 5 }) }, NOW)).toBe('young');
    expect(classifyCard({ srs: srs({ intervalDays: 30, dueAt: NOW + 30 * DAY }) }, NOW)).toBe('mature');
    // A leech is unmovable whatever its due date.
    expect(classifyCard({ srs: srs({ lapses: 8, dueAt: NOW - DAY * 3 }) }, NOW)).toBe('leech');
  });

  it('treats a malformed schedule as a new card, like the deck does', () => {
    expect(classifyCard({ srs: { dueAt: 'soon' } }, NOW)).toBe('new');
  });
});

describe('analyzeDeck (fragmentation)', () => {
  it('is the share of scheduled cards that are due; new cards are free space, not fragments', () => {
    const cards = [
      card('a', { srs: srs({ dueAt: NOW - 1 }) }),
      card('b', { srs: srs({ dueAt: NOW - 3 * DAY }) }),
      card('c', { srs: srs({}) }),
      card('d', { srs: srs({}) }),
      card('e'),
      card('f'),
    ];
    const a = analyzeDeck(cards, NOW);
    expect(a.total).toBe(6);
    expect(a.scheduled).toBe(4);
    expect(a.dueReviews).toBe(2);
    expect(a.fragmentation).toBe(50);
    expect(a.recommend).toBe(true);
    expect(a.counts.new).toBe(2);
    expect(a.counts.overdue).toBe(1);
  });

  it('reports 0% and no recommendation for an empty or all-new deck', () => {
    expect(analyzeDeck([], NOW).fragmentation).toBe(0);
    const fresh = analyzeDeck([card('x'), card('y')], NOW);
    expect(fresh.fragmentation).toBe(0);
    expect(fresh.recommend).toBe(false);
  });
});

describe('defragQueue', () => {
  const cards = [
    card('late', { srs: srs({ dueAt: NOW - 5 * DAY }) }),
    card('soon', { srs: srs({ dueAt: NOW + DAY }) }),
    card('now', { srs: srs({ dueAt: NOW - 1 }) }),
    card('new'),
  ];

  it('holds only due scheduled cards, most overdue first', () => {
    expect(defragQueue(cards, NOW)).toEqual(['late', 'now']);
  });

  it('puts a focus card first even when it is not due, without duplicating it', () => {
    expect(defragQueue(cards, NOW, 'soon')).toEqual(['soon', 'late', 'now']);
    expect(defragQueue(cards, NOW, 'now')).toEqual(['now', 'late']);
    expect(defragQueue(cards, NOW, 'missing')).toEqual(['late', 'now']);
  });
});

describe('buildBlockMap', () => {
  it('is one block per card in deck order for a small deck', () => {
    const cells = buildBlockMap([card('a'), card('b', { srs: srs({ dueAt: NOW - 1 }) })], NOW);
    expect(cells.map((c) => c.state)).toEqual(['new', 'due']);
    expect(cells.every((c) => c.size === 1)).toBe(true);
  });

  it('compacts answered cards to the front, in answer order', () => {
    const cards = [card('a'), card('b'), card('c'), card('d')];
    const cells = buildBlockMap(cards, NOW, { written: ['c', 'a'], readingId: 'd' });
    expect(cells.map((c) => c.written)).toEqual([true, true, false, false]);
    expect(cells[3].reading).toBe(true);
  });

  it('buckets a large deck and shows the most urgent state of each bucket', () => {
    const cards = Array.from({ length: 100 }, (_, i) =>
      card(String(i), { srs: srs(i === 5 ? { lapses: 9 } : {}) }));
    const cells = buildBlockMap(cards, NOW, { maxBlocks: 10 });
    expect(cells).toHaveLength(10);
    expect(cells[0].size).toBe(10);
    expect(cells[0].state).toBe('leech');
    expect(cells[1].state).toBe('young');
  });
});

describe('planUpdates (Vocabulary Update queue)', () => {
  const deck = [
    card('s1', { srs: srs({}) }),
    card('n1'),
    card('n2'),
    card('n3'),
    card('n4'),
    card('n5'),
  ];

  it('marks exactly today\'s remaining allowance as important, in deck order', () => {
    const plan = planUpdates(deck, 4, 1);
    expect(plan.budget).toBe(4);
    expect(plan.remaining).toBe(3);
    expect(plan.important.map((c) => c.id)).toEqual(['n1', 'n2', 'n3']);
    expect(plan.optional.map((c) => c.id)).toEqual(['n4', 'n5']);
    expect(plan.pendingTotal).toBe(5);
  });

  it('offers nothing important once the allowance is spent, but keeps optional updates', () => {
    const plan = planUpdates(deck, 3, 5);
    expect(plan.remaining).toBe(0);
    expect(plan.important).toEqual([]);
    expect(plan.optional.map((c) => c.id)).toEqual(['n1', 'n2', 'n3', 'n4', 'n5']);
  });

  it('uses a fixed batch when the profile sets no daily cap', () => {
    const many = Array.from({ length: 40 }, (_, i) => card(`n${i}`));
    const plan = planUpdates(many, undefined, 0);
    expect(plan.budget).toBeNull();
    expect(plan.important).toHaveLength(UNCAPPED_BATCH);
    expect(plan.optional).toHaveLength(10);
  });

  it('lists today\'s installs newest first, and nothing from yesterday', () => {
    const cards = [
      card('old', { introducedAt: NOW - DAY }),
      card('early', { introducedAt: NOW - 3600_000 }),
      card('late', { introducedAt: NOW - 60_000 }),
    ];
    expect(installedToday(cards, NOW).map((c) => c.id)).toEqual(['late', 'early']);
  });

  it('gives each card a stable KB number', () => {
    expect(updateKbNumber('abc')).toBe(updateKbNumber('abc'));
    expect(updateKbNumber('abc')).toMatch(/^KB\d{6}$/);
    expect(updateKbNumber('abc')).not.toBe(updateKbNumber('abd'));
  });
});

describe('balloon tips', () => {
  const base = { enabled: true, now: NOW, lastShownAt: 0, intervalMin: 20, blocked: false };

  it('rate-limits to one tip per interval', () => {
    expect(canShowBalloon(base)).toBe(true);
    expect(canShowBalloon({ ...base, lastShownAt: NOW - 19 * 60_000 })).toBe(false);
    expect(canShowBalloon({ ...base, lastShownAt: NOW - 20 * 60_000 })).toBe(true);
  });

  it('never shows when disabled or blocked, and floors an absurd interval', () => {
    expect(canShowBalloon({ ...base, enabled: false })).toBe(false);
    expect(canShowBalloon({ ...base, blocked: true })).toBe(false);
    expect(canShowBalloon({ ...base, intervalMin: 0, lastShownAt: NOW - 60_000 })).toBe(false);
  });

  it('does not lock out after the clock moved backwards', () => {
    expect(canShowBalloon({ ...base, lastShownAt: NOW + DAY })).toBe(true);
  });

  it('prefers a leech, then a due word, and skips cards with nothing to teach', () => {
    const due = card('due', { srs: srs({ dueAt: NOW - 1 }) });
    const leech = card('leech', { srs: srs({ lapses: 10 }) });
    const bare = card('bare', { srs: srs({ lapses: 12 }), meaning: '' });
    expect(pickBalloonCard([due, leech, bare], NOW, 3)).toEqual({ card: leech, reason: 'leech' });
    expect(pickBalloonCard([due, bare], NOW, 7)).toEqual({ card: due, reason: 'due' });
    expect(pickBalloonCard([card('new')], NOW, 0)).toBeNull();
  });
});

describe('screensaver gate', () => {
  const gate: ScreensaverGate = {
    enabled: true,
    minutes: 5,
    idleMs: 5 * 60_000,
    aero: true,
    videoPlaying: false,
    typing: false,
    reviewing: false,
    battery: false,
    suspended: false,
    hidden: false,
  };

  it('starts after the configured idle time, not before', () => {
    expect(screensaverShouldStart(gate)).toBe(true);
    expect(screensaverShouldStart({ ...gate, idleMs: 4 * 60_000 })).toBe(false);
  });

  it.each([
    ['disabled', { enabled: false }],
    ['set to never', { minutes: 0 }],
    ['outside Aero', { aero: false }],
    ['a video playing', { videoPlaying: true }],
    ['typing', { typing: true }],
    ['a review on screen', { reviewing: true }],
    ['Battery Saver', { battery: true }],
    ['the lock screen / boot', { suspended: true }],
    ['a hidden window', { hidden: true }],
  ])('never starts with %s', (_label, patch) => {
    expect(screensaverShouldStart({ ...gate, ...patch })).toBe(false);
  });

  it('carries due words first, deduplicated and capped', () => {
    const cards = [
      card('m', { word: '猫', srs: srs({ intervalDays: 40, dueAt: NOW + 40 * DAY }) }),
      card('d', { word: '犬', srs: srs({ dueAt: NOW - 1 }) }),
      card('dup', { word: '犬' }),
      card('n', { word: '鳥' }),
    ];
    expect(screensaverWords(cards, NOW, 10).map((c) => c.word)).toEqual(['犬', '猫', '鳥']);
    expect(screensaverWords(cards, NOW, 1)).toHaveLength(1);
  });
});

describe('once-a-day gates and formatting', () => {
  it('keys a day by local date', () => {
    expect(aeroDayKey(NOW)).toBe('2026-10-07');
    expect(isFirstTimeToday('2026-10-07', NOW)).toBe(false);
    expect(isFirstTimeToday('2026-10-06', NOW)).toBe(true);
    expect(isFirstTimeToday(null, NOW)).toBe(true);
  });

  it('formats percentages in the UI locale and clamps them', () => {
    expect(formatPct(23, 'en-US')).toBe('23%');
    expect(formatPct(140, 'en-US')).toBe('100%');
  });
});

describe('Aero mechanics settings', () => {
  afterEach(() => localStorage.clear());

  it('defaults everything on with a five-minute screensaver and 20-minute tips', () => {
    expect(loadAeroMechSettings()).toEqual(AERO_MECH_DEFAULTS);
    expect(AERO_MECH_DEFAULTS.screensaverMinutes).toBe(5);
    expect(AERO_MECH_DEFAULTS.balloonIntervalMin).toBe(20);
  });

  it('repairs out-of-range values instead of trusting them', () => {
    const s = normalizeAeroMechSettings({ screensaverMinutes: 7, balloonIntervalMin: 1, defrag: 'yes' as unknown as boolean });
    expect(s.screensaverMinutes).toBe(5);
    expect(s.balloonIntervalMin).toBe(5);
    expect(s.defrag).toBe(true);
  });

  it('persists a patch and keeps the rest', () => {
    saveAeroMechSettings({ balloons: false, screensaverMinutes: 0 });
    const s = loadAeroMechSettings();
    expect(s.balloons).toBe(false);
    expect(s.screensaverMinutes).toBe(0);
    expect(s.updates).toBe(true);
  });
});
