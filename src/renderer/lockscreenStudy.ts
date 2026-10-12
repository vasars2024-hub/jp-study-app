/**
 * What the lock screen may show about study (lock3), and the "answer a card to
 * unlock" challenge.
 *
 * Everything is read from this window's own copy of the deck — no IPC, which is
 * held while locked anyway (main/lockIpcGate.ts). The deck module is imported on
 * demand so the PIN pad's first paint never waits for it.
 *
 * Privacy is the caller's choice (Settings -> Lockscreen): `count` exposes a
 * number only; a card's front and its answer appear only in `card` mode or in
 * the challenge the owner turned on.
 */

export interface LockStudyCard {
  id: string;
  front: string;
  reading: string;
  back: string;
}

export interface LockStudySnapshot {
  due: number;
  /** The card of the day: a due card when there is one, else any card. */
  card: LockStudyCard | null;
  /** Cards with a front and an answer, for the challenge's choices. */
  pool: LockStudyCard[];
}

export interface LockChallenge {
  card: LockStudyCard;
  /** Four answers (or fewer with a small deck) when multiple choice; empty means self-check. */
  options: string[];
  answer: number;
}

const MAX_TEXT = 90;

/** Card fields can hold Anki HTML: show text only, one line, bounded. */
export function plainCardText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const text = raw
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
}

interface DeckLike {
  id: string;
  word?: string;
  front?: string;
  reading?: string;
  meaning?: string;
  back?: string;
  suspended?: boolean;
}

export function toLockStudyCard(card: DeckLike): LockStudyCard | null {
  const front = plainCardText(card.word || card.front);
  // The first sense of a long gloss reads better as a choice.
  const back = plainCardText(String(card.meaning || card.back || '').split(/[;\n；]/)[0]);
  if (!front || !back) return null;
  return { id: card.id, front, reading: plainCardText(card.reading), back };
}

/** Local day number, so the card of the day stays put until midnight. */
export function localDayNumber(now: number): number {
  const d = new Date(now);
  return Math.floor((now - d.getTimezoneOffset() * 60_000) / 86_400_000);
}

export function pickCardOfTheDay(due: readonly LockStudyCard[], pool: readonly LockStudyCard[], now: number): LockStudyCard | null {
  const from = due.length ? due : pool;
  if (!from.length) return null;
  return from[localDayNumber(now) % from.length] ?? null;
}

export async function loadLockStudy(now = Date.now()): Promise<LockStudySnapshot> {
  try {
    const deck = await import('./flashcardDeck');
    const cards = deck.loadDeck().filter((c) => !c.suspended);
    let dueCards: typeof cards = [];
    try {
      dueCards = deck.dueDeckCards(cards, now);
    } catch {
      dueCards = [];
    }
    const pool = cards.map(toLockStudyCard).filter((c): c is LockStudyCard => c !== null);
    const duePool = dueCards.map(toLockStudyCard).filter((c): c is LockStudyCard => c !== null);
    return { due: dueCards.length, card: pickCardOfTheDay(duePool, pool, now), pool };
  } catch {
    return { due: 0, card: null, pool: [] };
  }
}

/**
 * A recall question for `card`: its answer among up to three others from the
 * deck. With fewer than two distinct other answers it is a self-check instead
 * (show the answer, "I remembered it").
 */
export function buildChallenge(
  card: LockStudyCard,
  pool: readonly LockStudyCard[],
  rnd: () => number = Math.random,
): LockChallenge {
  const seen = new Set([card.back.toLowerCase()]);
  const others: string[] = [];
  const shuffled = [...pool].sort(() => rnd() - 0.5);
  for (const c of shuffled) {
    const key = c.back.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    others.push(c.back);
    if (others.length === 3) break;
  }
  if (others.length < 2) return { card, options: [], answer: -1 };
  const options = [...others];
  const answer = Math.floor(rnd() * (options.length + 1));
  options.splice(answer, 0, card.back);
  return { card, options, answer };
}

/** The next challenge card after `previousId` (a different one when the deck allows). */
export function nextChallengeCard(
  snapshot: LockStudySnapshot,
  previousId: string | null,
  rnd: () => number = Math.random,
): LockStudyCard | null {
  if (!previousId) return snapshot.card ?? snapshot.pool[0] ?? null;
  const rest = snapshot.pool.filter((c) => c.id !== previousId);
  if (!rest.length) return snapshot.card;
  return rest[Math.floor(rnd() * rest.length)] ?? null;
}
