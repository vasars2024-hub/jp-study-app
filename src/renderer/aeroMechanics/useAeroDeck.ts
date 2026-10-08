/**
 * The local deck, live, for the Aero mechanics.
 *
 * `loadDeck()` is the store's own cached read; this only re-asks it when the
 * store says the deck changed. `enabled` false costs nothing.
 */
import { useEffect, useState } from 'react';
import { introducedTodayCount, loadDeck, onDeckChanged, type DeckFlashcard } from '../flashcardDeck';
import { getActiveProfile, onProfileChanged } from '../profileState';

export interface AeroDeckSnapshot {
  cards: DeckFlashcard[];
  /** Profile `deckParams.newPerDay`; undefined means no cap. */
  newPerDay: number | undefined;
  introducedToday: number;
  /** Read time, so every consumer classifies against the same instant. */
  at: number;
}

function read(): AeroDeckSnapshot {
  const at = Date.now();
  let cards: DeckFlashcard[] = [];
  let newPerDay: number | undefined;
  let introducedToday = 0;
  try {
    cards = loadDeck();
    introducedToday = introducedTodayCount(at);
  } catch {
    cards = [];
  }
  try {
    newPerDay = getActiveProfile().deckParams.newPerDay;
  } catch {
    newPerDay = undefined;
  }
  return { cards, newPerDay, introducedToday, at };
}

const EMPTY: AeroDeckSnapshot = { cards: [], newPerDay: undefined, introducedToday: 0, at: 0 };

export function readAeroDeck(): AeroDeckSnapshot {
  return read();
}

export function useAeroDeck(enabled: boolean, refreshMs = 60_000): AeroDeckSnapshot {
  const [snap, setSnap] = useState<AeroDeckSnapshot>(() => (enabled ? read() : EMPTY));
  useEffect(() => {
    if (!enabled) {
      setSnap(EMPTY);
      return undefined;
    }
    setSnap(read());
    const refresh = (): void => setSnap(read());
    const offDeck = onDeckChanged(refresh);
    const offProfile = onProfileChanged(refresh);
    // Due-ness is a function of the clock as well as the deck.
    const id = window.setInterval(refresh, refreshMs);
    return () => {
      offDeck();
      offProfile();
      window.clearInterval(id);
    };
  }, [enabled, refreshMs]);
  return snap;
}
