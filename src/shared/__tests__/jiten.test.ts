import { describe, expect, it } from 'vitest';
import {
  buildSourceLinks,
  expandSourceTemplate,
  parseJitenCsvDeck,
  sanitizeJitenDeck,
  sanitizePlanEntries,
  sanitizeSourceProfiles,
} from '../jiten';

describe('Jiten shared helpers', () => {
  it('sanitizes novel and web novel decks', () => {
    const deck = sanitizeJitenDeck({
      deckId: '124797',
      originalTitle: 'こころ',
      mediaType: 4,
      difficulty: '2.4',
      coverName: 'https://img.example/kokoro.jpg',
      tags: [{ name: 'classic', percentage: 35 }],
      links: [{ linkType: 11, url: 'https://example.com/book' }, { url: 'file:///bad' }],
    });

    expect(deck?.deckId).toBe(124797);
    expect(deck?.originalTitle).toBe('こころ');
    expect(deck?.difficulty).toBe(2.4);
    expect(deck?.links).toHaveLength(1);
    expect(sanitizeJitenDeck({ deckId: 1, originalTitle: 'bad', mediaType: 1 })).toBeNull();
  });

  it('expands custom source templates safely', () => {
    const url = expandSourceTemplate('https://source.example/search?q={titleJp}%20{author}%20{deckId}', {
      titleJp: '吾輩は猫である',
      author: '夏目 漱石',
      jitenDeckId: 42,
    });

    expect(url).toBe('https://source.example/search?q=%E5%90%BE%E8%BC%A9%E3%81%AF%E7%8C%AB%E3%81%A7%E3%81%82%E3%82%8B%20%E5%A4%8F%E7%9B%AE%20%E6%BC%B1%E7%9F%B3%2042');
  });

  it('builds external and direct source links from profiles', () => {
    const links = buildSourceLinks(
      { titleJp: 'こころ', deckId: 7 },
      [
        {
          id: 'custom',
          name: 'Custom',
          enabled: true,
          mode: 'both',
          searchUrlTemplate: 'https://custom.example/search/{titleJp}',
          directUrlTemplate: 'https://custom.example/epub/{deckId}.epub',
        },
      ],
      [{ linkType: 6, url: 'https://books.example/kokoro' }],
    );

    expect(links.map((link) => link.label)).toEqual(['Google Books', 'Custom', 'Custom EPUB']);
    expect(links[2].direct).toBe(true);
  });

  it('parses Jiten CSV decks into local cards', () => {
    const cards = parseJitenCsvDeck(
      [
        'Word,ReadingKana,Definitions,ExampleSentence,Occurences,ReadingFrequency,JmdictWordId',
        '"心","こころ","heart; mind","心が落ち着いた。",3,120,1001',
        '"読む","よむ","to read","本を読む。",5,80,1002',
      ].join('\n'),
    );

    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      word: '心',
      reading: 'こころ',
      meaning: 'heart; mind',
      sentence: '心が落ち着いた。',
      occurrences: 3,
      frequency: 120,
      jmdictWordId: '1001',
    });
    expect(cards[0].back).toContain('heart; mind');
  });

  it('sanitizes persisted source profiles and plan entries', () => {
    const profiles = sanitizeSourceProfiles([
      {
        id: 'anna-like-user-source',
        name: 'User source',
        enabled: true,
        mode: 'direct',
        searchUrlTemplate: 'https://example.com/search?q={titleJp}',
        directUrlTemplate: 'https://example.com/{deckId}.epub',
      },
      { id: '', name: 'Bad', searchUrlTemplate: '' },
    ]);
    const plans = sanitizePlanEntries([
      {
        id: 'jiten-7',
        titleJp: 'こころ',
        acquisitionStatus: 'imported',
        sourceLinks: [{ id: 'x', label: 'X', url: 'https://example.com/x', direct: false }],
        createdAt: 10,
        updatedAt: 20,
      },
      { id: 'bad' },
    ]);

    expect(profiles).toHaveLength(1);
    expect(profiles[0].mode).toBe('direct');
    expect(plans).toHaveLength(1);
    expect(plans[0].acquisitionStatus).toBe('imported');
  });
});
