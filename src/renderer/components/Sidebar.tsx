export type SectionId =
  | 'desktop'
  | 'library'
  | 'novels'
  | 'dictionary'
  | 'grammar'
  | 'translate'
  | 'player'
  | 'anki'
  | 'flashcards'
  | 'stats'
  | 'resources'
  | 'settings';

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'desktop', label: 'Desktop' },
  { id: 'library', label: 'Library' },
  { id: 'novels', label: 'Novels' },
  { id: 'dictionary', label: 'Dictionary' },
  { id: 'grammar', label: 'Grammar' },
  { id: 'translate', label: 'Translate' },
  { id: 'player', label: 'Media Player' },
  { id: 'anki', label: 'Anki Cards' },
  { id: 'flashcards', label: 'Flashcards' },
  { id: 'stats', label: 'Statistics' },
  { id: 'resources', label: 'Resources' },
  { id: 'settings', label: 'Settings' },
];

interface Props {
  active: SectionId;
  onSelect: (id: SectionId) => void;
}

export default function Sidebar({ active, onSelect }: Props) {
  return (
    <nav className="sidebar">
      <div className="brand">
        <span className="brand-jp">日本語</span>
        <span className="brand-sub">Study</span>
      </div>
      <ul className="nav-list">
        {SECTIONS.map((s) => (
          <li
            key={s.id}
            className={`nav-item ${s.id === active ? 'active' : ''}`}
            onClick={() => onSelect(s.id)}
          >
            <span className="nav-label">{s.label}</span>
          </li>
        ))}
      </ul>
      <div className="sidebar-foot">v0.1 · MVP</div>
    </nav>
  );
}
