import { describe, expect, it } from 'vitest';
import { ANKI_COLLECTION_UNAVAILABLE_MSG, ANKI_UNREACHABLE_MSG } from '../anki';
import {
  ANKI_SYNC_REVIEW_MAX_AGE_MS,
  ANKI_SYNC_UNDO_GRACE_MS,
  ankiEaseForRating,
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
});

describe('rule 3 + 4 + 5: what one drain sends', () => {
  it('collapses several answers to one note into the latest and supersedes the rest', () => {
    const plan = planAnkiReviewPush([
      item('a', 1, NOW - 120_000, 1),
      item('b', 1, NOW - 90_000, 3),
      item('c', 2, NOW - 100_000, 4),
    ], NOW);
    expect(plan.push.map((i) => i.reviewId)).toEqual(['c', 'b']);
    expect(plan.superseded).toEqual(['a']);
    expect(plan.stale).toEqual([]);
    expect(plan.waiting).toBe(0);
  });

  it('holds a note whose latest answer is still inside the undo grace, unless forced', () => {
    const items = [item('old', 1, NOW - 60_000), item('fresh', 1, NOW - ANKI_SYNC_UNDO_GRACE_MS + 1000)];
    const held = planAnkiReviewPush(items, NOW);
    expect(held.push).toEqual([]);
    // Nothing is superseded yet: an undo of "fresh" would make "old" the latest again.
    expect(held.superseded).toEqual([]);
    expect(held.waiting).toBe(2);
    const forced = planAnkiReviewPush(items, NOW, { force: true });
    expect(forced.push.map((i) => i.reviewId)).toEqual(['fresh']);
    expect(forced.superseded).toEqual(['old']);
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
  const dayStart = new Date(NOW);
  dayStart.setHours(0, 0, 0, 0);
  const ctx = { todayDay: 500, dayStartMs: dayStart.getTime(), isDue: false, now: NOW };

  it('anchors a review card day number against Anki\'s today', () => {
    const mirror = ankiMirrorFromCard({ cardId: 1, note: 11, type: 2, queue: 2, due: 503, interval: 9, factor: 2500, reps: 4, lapses: 1 }, ctx);
    expect(mirror).toMatchObject({ noteId: 11, state: 'review', intervalDays: 9, ease: 2.5, reps: 4, lapses: 1, isDue: false });
    expect(mirror.dueAt).toBe(ctx.dayStartMs + 3 * DAY);
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

  it('names suspended and buried cards, and counts the mirror', () => {
    const suspended = ankiMirrorFromCard({ cardId: 5, type: 2, queue: -1, due: 400 }, ctx);
    const buried = ankiMirrorFromCard({ cardId: 6, type: 2, queue: -3, due: 400 }, ctx);
    const due = ankiMirrorFromCard({ cardId: 8, type: 2, queue: 2, due: 499 }, { ...ctx, isDue: true });
    expect([suspended.state, buried.state]).toEqual(['suspended', 'buried']);
    expect(countAnkiMirrorsDue([suspended, buried, due])).toEqual({ due: 1, suspended: 1, total: 3 });
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
