import type { LibraryItem, MediaItem } from '../shared/types';
import type { AgentKnowledgeRecord } from '../shared/localAgentKnowledge';
import type { AgentMemoryStore } from '../shared/localAgentMemory';
import type { CalendarEvent } from './calendar';
import type { DeckFlashcard } from './flashcardDeck';

export function buildLocalAgentKnowledgeSnapshot(input: {
  deck: readonly DeckFlashcard[];
  media: readonly MediaItem[];
  library: readonly LibraryItem[];
  calendar: readonly CalendarEvent[];
  memory?: AgentMemoryStore;
}): AgentKnowledgeRecord[] {
  const records: AgentKnowledgeRecord[] = [];
  for (const card of input.deck.slice(0, 3_000)) {
    records.push({
      id: `vocabulary:${card.id}`,
      kind: 'vocabulary',
      title: card.word,
      content: [card.reading, card.meaning, card.sentence, card.bookTitle].filter(Boolean).join(' · '),
      tags: [card.source, card.jlptLevel, card.folder].filter((value): value is string => Boolean(value)),
      metadata: { level: card.jlptLevel ?? '', known: card.known === true },
      updatedAt: card.addedAt,
    });
  }
  for (const item of input.media.slice(0, 1_000)) {
    records.push({
      id: `media:${item.id}`,
      kind: 'media',
      title: item.title,
      content: [item.artist, item.category, item.lang, item.jlptLevel].filter(Boolean).join(' · '),
      tags: item.genres ?? [],
      metadata: { level: item.jlptLevel ?? '', category: item.category ?? '' },
      updatedAt: item.addedAt ?? 0,
    });
  }
  for (const item of input.library.slice(0, 1_000)) {
    records.push({
      id: `library:${item.id}`,
      kind: 'media',
      title: item.title,
      content: [item.kind, item.sourcePath, item.folder].filter(Boolean).join(' · '),
      tags: ['library'],
      updatedAt: 0,
    });
  }
  for (const event of input.calendar.slice(0, 500)) {
    records.push({
      id: `study-history:${event.id}`,
      kind: event.category === 'study' ? 'study-history' : 'note',
      title: event.title,
      content: [event.description, event.date, event.startTime].filter(Boolean).join(' · '),
      tags: [event.category],
      updatedAt: event.createdAt,
    });
  }
  for (const entry of input.memory?.entries ?? []) {
    records.push({
      id: `memory:${entry.id}`,
      kind: 'note',
      title: entry.key,
      content: entry.value,
      tags: [entry.category],
      updatedAt: entry.updatedAt,
    });
  }
  return records;
}
