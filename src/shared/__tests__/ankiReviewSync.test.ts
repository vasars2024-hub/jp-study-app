import { describe, expect, it } from 'vitest';
import { ANKI_COLLECTION_UNAVAILABLE_MSG, ANKI_UNREACHABLE_MSG } from '../anki';
import {
  ANKI_SYNC_BACKOFF_BASE_MS,
  ANKI_SYNC_BACKOFF_MAX_MS,
  ANKI_SYNC_REVIEW_MAX_AGE_MS,
  ANKI_SYNC_UNDO_GRACE_MS,
  ankiEaseForRating,
  ankiSyncBackoffMs,
  ankiSyncErrorAction,
  ankiDayToDueAt,
  ankiMirrorDueByDate,
  ankiMirrorFromCard,
  classifyAnkiSyncError,
  countAnkiMirrorsDue,
  decideAnkiReviewPush,
  isFinalAnkiPushOutcome,
  needsAnkiLink,
  pickAnkiLinkCandidate,
  pickAnkiPrimaryCard,
  planAnkiReviewPush,
  summarizeAnkiDeckLinks,
  type AnkiReviewOutboxItem,
} from '../ankiReviewSync';

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

function item(reviewId: string, noteId: number, reviewedAt: number, ease: 1 | 2 | 3 | 4 = 3): AnkiReviewOutboxItem {
  return { reviewId, cardId: `card-${noteId}`, noteId, ease, reviewedAt, queuedAt: reviewedAt, attempts: 0 };
}

describe('answer mapping', () => {
  it('maps the four Gum ratings onto Anki ease buttons', () => {
    expect(['again', 'hard', 'good', 'easy'].map((r) => ankiEaseForRating(r as never))).toEqual([1, 2, 3, 4]);
  });
});

describe('error classification', () => {
  it('names the kinds the panel explains', () => {
    expect(classifyAnkiSyncError(ANKI_UNREACHABLE_MSG)).toBe('unreachable');
    expect(classifyAnkiSyncError(ANKI_COLLECTION_UNAVAILABLE_MSG)).toBe('collection');
    expect(classifyAnkiSyncError('unsupported action')).toBe('unsupported');
    expect(classifyAnkiSyncError('valid api key must be provided')).toBe('permission');
    expect(classifyAnkiSyncError('fetch failed')).toBe('unreachable');
    expect(classifyAnkiSyncError('model was not found: Basic')).toBe('api');
    expect(classifyAnkiSyncError(undefined)).toBe('api');
  });

  it('rule 10: pauses on what the user must fix, retries the rest with a growing wait', () => {
    expect(['unsupported', 'permission', 'version'].map((k) => ankiSyncErrorAction(k as never))).toEqual(['pause', 'pause', 'pause']);
    expect(['unreachable', 'collection', 'api', 'profile-mismatch'].map((k) => ankiSyncErrorAction(k as never)))
      .toEqual(['retry', 'retry', 'retry', 'retry']);
    expect(ankiSyncBackoffMs(1)).toBe(ANKI_SYNC_BACKOFF_BASE_MS);
    expect(ankiSyncBackoffMs(2)).toBe(2 * ANKI_SYNC_BACKOFF_BASE_MS);
    expect(ankiSyncBackoffMs(3)).toBe(4 * ANKI_SYNC_BACKOFF_BASE_MS);
    expect(ankiSyncBackoffMs(50)).toBe(ANKI_SYNC_BACKOFF_MAX_MS);
  });
});

describe('rule 3 + 4 + 5: what one drain sends', () => {
  it('replays every answer to a note, in review order: "again then good" keeps the lapse', () => {
    const plan = planAnkiReviewPush([
      item('b', 1, NOW - 90_000, 3),
      item('a', 1, NOW - 120_000, 1),
      item('c', 2, NOW - 100_000, 4),
    ], NOW);
    expect(plan.push.map((i) => [i.reviewId, i.ease])).toEqual([['a', 1], ['c', 4], ['b', 3]]);
    expect(plan.superseded).toEqual([]);
    expect(plan.stale).toEqual([]);
    expect(plan.waiting).toBe(0);
  });

  it('orders answers given in the same millisecond by review id, so a replay is deterministic', () => {
    const plan = planAnkiReviewPush([item('r2', 1, NOW - 60_000, 3), item('r1', 1, NOW - 60_000, 1)], NOW);
    expect(plan.push.map((i) => i.reviewId)).toEqual(['r1', 'r2']);
  });

  it('holds a note whose latest answer is still inside the undo grace, unless forced', () => {
    const items = [item('old', 1, NOW - 60_000), item('fresh', 1, NOW - ANKI_SYNC_UNDO_GRACE_MS + 1000)];
    const held = planAnkiReviewPush(items, NOW);
    // Not even "old": sending it now would make Anki's card newer than "fresh".
    expect(held.push).toEqual([]);
    expect(held.superseded).toEqual([]);
    expect(held.waiting).toBe(2);
    const forced = planAnkiReviewPush(items, NOW, { force: true });
    expect(forced.push.map((i) => i.reviewId)).toEqual(['old', 'fresh']);
    expect(forced.superseded).toEqual([]);
  });

  it('never splits one note\'s answers across two requests', () => {
    const plan = planAnkiReviewPush([
      item('n2', 2, NOW - 200_000),
      item('n1a', 1, NOW - 150_000, 1),
      item('n1b', 1, NOW - 100_000, 3),
    ], NOW, { batch: 2 });
    expect(plan.push.map((i) => i.reviewId)).toEqual(['n2']);
    expect(plan.waiting).toBe(2);
  });

  it('supersedes only the oldest extras of a note with more answers than one request holds', () => {
    const plan = planAnkiReviewPush([
      item('r1', 1, NOW - 400_000, 1),
      item('r2', 1, NOW - 300_000, 1),
      item('r3', 1, NOW - 200_000, 3),
    ], NOW, { batch: 2 });
    expect(plan.superseded).toEqual(['r1']);
    expect(plan.push.map((i) => i.reviewId)).toEqual(['r2', 'r3']);
  });

  it('drops answers too old to replay and caps a batch', () => {
    const plan = planAnkiReviewPush([
      item('ancient', 9, NOW - ANKI_SYNC_REVIEW_MAX_AGE_MS - 1),
      item('x', 1, NOW - 60_000),
      item('y', 2, NOW - 50_000),
      item('z', 3, NOW - 40_000),
    ], NOW, { batch: 2 });
    expect(plan.stale).toEqual(['ancient']);
    expect(plan.push.map((i) => i.reviewId)).toEqual(['x', 'y']);
    expect(plan.waiting).toBe(1);
  });
});

describe('rules 2, 5, 6: one answer against its Anki card', () => {
  const card = { cardId: 10, note: 1, ord: 0, queue: 2, type: 2, mod: (NOW - DAY) / 1000 };

  it('pushes when Anki has not touched the card since the Gum review', () => {
    expect(decideAnkiReviewPush({ reviewedAt: NOW - 60_000 }, card, NOW)).toBe('push');
  });

  it('skips when Anki reviewed (or edited) the card after Gum did — newer wins', () => {
    expect(decideAnkiReviewPush({ reviewedAt: NOW - 2 * DAY }, card, NOW)).toBe('anki-newer');
  });

  it('never answers a suspended card, and reports a deleted note', () => {
    expect(decideAnkiReviewPush({ reviewedAt: NOW - 60_000 }, { ...card, queue: -1 }, NOW)).toBe('suspended');
    expect(decideAnkiReviewPush({ reviewedAt: NOW - 60_000 }, null, NOW)).toBe('note-missing');
  });

  it('treats a stale answer as stale even when the card is otherwise answerable', () => {
    expect(decideAnkiReviewPush({ reviewedAt: NOW - ANKI_SYNC_REVIEW_MAX_AGE_MS - 1 }, { ...card, mod: 0 }, NOW)).toBe('stale');
  });

  it('only "failed" keeps an answer in the queue', () => {
    expect(isFinalAnkiPushOutcome('failed')).toBe(false);
    for (const outcome of ['answered', 'anki-newer', 'suspended', 'note-missing', 'stale', 'superseded'] as const) {
      expect(isFinalAnkiPushOutcome(outcome)).toBe(true);
    }
  });
});

describe('rule 9: which card of a note is answered', () => {
  it('takes the lowest ordinal that is not suspended', () => {
    const picked = pickAnkiPrimaryCard([
      { cardId: 3, ord: 1, queue: 2 },
      { cardId: 2, ord: 0, queue: -1 },
      { cardId: 4, ord: 2, queue: 2 },
    ]);
    expect(picked?.cardId).toBe(3);
  });

  it('falls back to the lowest ordinal when every card is suspended, and to null for none', () => {
    expect(pickAnkiPrimaryCard([{ cardId: 7, ord: 1, queue: -1 }, { cardId: 6, ord: 0, queue: -1 }])?.cardId).toBe(6);
    expect(pickAnkiPrimaryCard([])).toBeNull();
  });
});

describe('pull: Anki state as a mirror', () => {
  // Local noon: the study day (4 am start) is the calendar day.
  const noon = new Date(2026, 9, 14, 12, 0, 0).getTime();
  const ctx = { todayDay: 500, isDue: false, now: noon, dayStartHour: 4 };

  it('anchors a review card day number against Anki\'s today, at the start of the study day', () => {
    const mirror = ankiMirrorFromCard({ cardId: 1, note: 11, type: 2, queue: 2, due: 503, interval: 9, factor: 2500, reps: 4, lapses: 1 }, ctx);
    expect(mirror).toMatchObject({ noteId: 11, state: 'review', intervalDays: 9, ease: 2.5, reps: 4, lapses: 1, isDue: false });
    expect(mirror.dueAt).toBe(new Date(2026, 9, 17, 4, 0, 0).getTime());
  });

  it('reads a learning card due as Unix seconds and leaves a new card undated', () => {
    expect(ankiMirrorFromCard({ cardId: 2, type: 1, queue: 1, due: 1_800_000_600 }, ctx).dueAt).toBe(1_800_000_600_000);
    const fresh = ankiMirrorFromCard({ cardId: 3, type: 0, queue: 0, due: 77 }, ctx);
    expect(fresh.state).toBe('new');
    expect(fresh.dueAt).toBeUndefined();
  });

  it('leaves the date out rather than guessing when Anki\'s day could not be anchored', () => {
    expect(ankiMirrorFromCard({ cardId: 4, type: 2, queue: 2, due: 503 }, { ...ctx, todayDay: null }).dueAt).toBeUndefined();
  });

  it('is due by date only once its study day has begun (no areDue)', () => {
    const today = ankiMirrorFromCard({ cardId: 9, type: 2, queue: 2, due: 500 }, ctx);
    const tomorrow = ankiMirrorFromCard({ cardId: 10, type: 2, queue: 2, due: 501 }, ctx);
    const step = ankiMirrorFromCard({ cardId: 11, type: 1, queue: 1, due: Math.floor(noon / 1000) + 600 }, ctx);
    const suspended = ankiMirrorFromCard({ cardId: 12, type: 2, queue: -1, due: 499 }, ctx);
    expect(ankiMirrorDueByDate(today, noon)).toBe(true);
    // The old midnight anchor plus "a day minus a millisecond" called this due all day today.
    expect(ankiMirrorDueByDate(tomorrow, noon)).toBe(false);
    expect(ankiMirrorDueByDate(step, noon)).toBe(false);
    expect(ankiMirrorDueByDate(step, noon + 600_000)).toBe(true);
    expect(ankiMirrorDueByDate(suspended, noon)).toBe(false);
  });

  it('names suspended and buried cards, and counts the mirror', () => {
    const suspended = ankiMirrorFromCard({ cardId: 5, type: 2, queue: -1, due: 400 }, ctx);
    const buried = ankiMirrorFromCard({ cardId: 6, type: 2, queue: -3, due: 400 }, ctx);
    const due = ankiMirrorFromCard({ cardId: 8, type: 2, queue: 2, due: 499 }, { ...ctx, isDue: true });
    expect([suspended.state, buried.state]).toEqual(['suspended', 'buried']);
    expect(countAnkiMirrorsDue([suspended, buried, due])).toEqual({ due: 1, suspended: 1, total: 3 });
  });
});

describe('pull: Anki due days are study days, not calendar days (00:00-04:00)', () => {
  const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute, 0).getTime();
  const fourAm = (day: number) => at(day, 4);

  it('between midnight and 4 am, "today" is still the study day that began yesterday at 4', () => {
    // Anki's today (day 500) at 00:00, 01:30, 03:59 on Oct 15 is the Oct 14 study day.
    for (const now of [at(15, 0), at(15, 1, 30), at(15, 3, 59)]) {
      expect(ankiDayToDueAt(500, 500, now, 4)).toBe(fourAm(14));
      expect(ankiDayToDueAt(501, 500, now, 4)).toBe(fourAm(15));
      expect(ankiDayToDueAt(499, 500, now, 4)).toBe(fourAm(13));
    }
  });

  it('from 4 am the study day is the calendar day', () => {
    for (const now of [at(15, 4), at(15, 12), at(15, 23, 59)]) {
      expect(ankiDayToDueAt(500, 500, now, 4)).toBe(fourAm(15));
      expect(ankiDayToDueAt(503, 500, now, 4)).toBe(fourAm(18));
    }
  });

  it('a card due tomorrow is not due at 02:00 tonight, and is due from 04:00 tomorrow', () => {
    const now = at(15, 2);
    const mirror = ankiMirrorFromCard({ cardId: 1, type: 2, queue: 2, due: 501 }, { todayDay: 500, isDue: false, now, dayStartHour: 4 });
    expect(mirror.dueAt).toBe(fourAm(15));
    expect(ankiMirrorDueByDate(mirror, now)).toBe(false);
    expect(ankiMirrorDueByDate(mirror, at(15, 3, 59))).toBe(false);
    expect(ankiMirrorDueByDate(mirror, fourAm(15))).toBe(true);
  });

  it('honours the user\'s own start hour, and the 4 am default when none is sent', () => {
    expect(ankiDayToDueAt(501, 500, at(15, 5), 6)).toBe(at(15, 6));
    expect(ankiDayToDueAt(501, 500, at(15, 7), 6)).toBe(at(16, 6));
    expect(ankiDayToDueAt(500, 500, at(15, 1), 0)).toBe(at(15, 0));
    expect(ankiDayToDueAt(501, 500, at(15, 2))).toBe(fourAm(15));
  });

  it('stays at the start hour across a daylight-saving change', () => {
    // Wherever the clocks change in late March, every due day still starts at 04:00 local.
    const now = new Date(2026, 2, 27, 12).getTime();
    for (let d = 0; d < 5; d += 1) expect(new Date(ankiDayToDueAt(500 + d, 500, now, 4)).getHours()).toBe(4);
  });
});

describe('link discovery', () => {
  it('prefers a note Gum created, then a reading match, then the oldest note', () => {
    expect(pickAnkiLinkCandidate([
      { noteId: 5, appTagged: false },
      { noteId: 9, appTagged: true },
    ])).toEqual({ noteId: 9, ambiguous: false });
    expect(pickAnkiLinkCandidate([
      { noteId: 5, appTagged: true, readingMatches: false },
      { noteId: 9, appTagged: true, readingMatches: true },
    ])).toEqual({ noteId: 9, ambiguous: false });
    expect(pickAnkiLinkCandidate([
      { noteId: 9, appTagged: true },
      { noteId: 5, appTagged: true },
    ])).toEqual({ noteId: 5, ambiguous: true });
    expect(pickAnkiLinkCandidate([])).toEqual({ noteId: null, ambiguous: false });
  });

  it('looks up only cards Anki has (or will have) and Gum has no id for', () => {
    expect(needsAnkiLink({ word: '猫', ankiPending: true })).toBe(true);
    expect(needsAnkiLink({ word: '猫', ankiDuplicate: true })).toBe(true);
    expect(needsAnkiLink({ word: '猫', ankiExported: true, ankiNoteId: 4 })).toBe(false);
    expect(needsAnkiLink({ word: '猫' })).toBe(false);
    expect(needsAnkiLink({ word: ' ', ankiPending: true })).toBe(false);
  });
});

describe('per-deck summary', () => {
  it('counts linked, waiting and not-yet-linked cards per Anki deck', () => {
    expect(summarizeAnkiDeckLinks([
      { ankiDeck: 'Mining', ankiNoteId: 1, ankiExported: true },
      { ankiDeck: 'Mining', ankiPending: true },
      { ankiDeck: 'Core', ankiDuplicate: true },
      { ankiExported: true },
      {},
    ], '(none)')).toEqual([
      { deck: '(none)', linked: 0, pending: 0, unlinked: 1 },
      { deck: 'Core', linked: 0, pending: 0, unlinked: 1 },
      { deck: 'Mining', linked: 1, pending: 1, unlinked: 0 },
    ]);
  });
});
