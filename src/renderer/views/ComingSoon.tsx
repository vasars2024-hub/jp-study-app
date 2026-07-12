import Icon from '../components/Icons';
import type { SectionId } from '../components/Sidebar';

const INFO: Record<string, { title: string; blurb: string; planned: string[] }> = {
  dictionary: {
    title: 'Dictionary',
    blurb: 'A Yomitan-style pop-up dictionary and word search.',
    planned: [
      'Import Yomitan-format dictionaries',
      'Instant pop-up lookup while reading',
      'Search the web for a word in context',
    ],
  },
  grammar: {
    title: 'Grammar',
    blurb: 'Browse grammar points by JLPT level.',
    planned: ['N5 → N1 grammar lists', 'Search and filter', 'Example sentences and notes'],
  },
  player: {
    title: 'Media Player',
    blurb: 'Watch video and listen to audio with Japanese subtitles.',
    planned: [
      'Built-in video / audio player',
      'Whisper AI auto-generated Japanese subtitles',
      'Click any subtitle word to look it up',
    ],
  },
  anki: {
    title: 'Anki Cards',
    blurb: 'One-click card creation with full customization.',
    planned: [
      'Connect to Anki via AnkiConnect',
      'Customizable note templates',
      'One-click add from the reader or player',
    ],
  },
  flashcards: {
    title: 'Flashcards',
    blurb: 'Store and search your flashcard decks.',
    planned: ['Browse your decks', 'Search across all cards', 'Built-in study mode'],
  },
  resources: {
    title: 'Resources',
    blurb: 'A curated directory of guides and news.',
    planned: [
      'Tofugu-style learning guides',
      'Japanese news sites',
      'Sorted by level and topic',
    ],
  },
  settings: {
    title: 'Settings',
    blurb: 'Configure the app to your taste.',
    planned: ['Theme and fonts', 'Anki connection', 'Dictionary management'],
  },
};

export default function ComingSoon({ section }: { section: SectionId }) {
  const info = INFO[section] ?? { title: section, blurb: '', planned: [] };
  return (
    <div className="coming-soon">
      <div className="cs-emoji">
        <Icon name="wrench" size={40} />
      </div>
      <h1>{info.title}</h1>
      <p className="muted">{info.blurb}</p>
      <div className="cs-card">
        <div className="cs-tag">Planned for a later phase</div>
        <ul>
          {info.planned.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
