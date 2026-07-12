import { useEffect, useState } from 'react';
import type { LibraryItem } from '../../shared/types';
import type { DesktopWinSection } from '../../shared/desktop';
import LibraryView from '../views/LibraryView';
import NovelsView from '../views/NovelsView';
import MediaView from '../views/MediaView';
import MusicView from '../views/MusicView';
import MusicWidget from './MusicWidget';
import VisualizerCanvas from './VisualizerCanvas';
import { loadVizSettings, onVizSettingsChanged } from '../visualizerSettings';
import { isPlaying as isMusicPlaying, onPlayingChanged } from '../audioBus';
import TranslateView from '../views/TranslateView';
import DictionaryView from '../views/DictionaryView';
import AnkiView from '../views/AnkiView';
import FlashcardsView from '../views/FlashcardsView';
import GrammarView from '../views/GrammarView';
import StatisticsView from '../views/StatisticsView';
import ResourcesView from '../views/ResourcesView';
import ImmersionView from '../views/ImmersionView';
import CalendarView from '../views/CalendarView';
import Icon from './Icons';

// The section → view mapping. Shared by the in-desktop FloatingWindow
// (DesktopShell) and the pop-out window (App) so an app renders identically
// whether it lives on the fake desktop or in its own OS window. Note/Settings
// are intentionally not here: they are desktop-coupled and handled by the shell.
export default function AppSection({
  section,
  onOpenBook,
}: {
  section: DesktopWinSection;
  onOpenBook: (item: LibraryItem) => void;
}) {
  switch (section) {
    case 'city':
      return (
        <div className="coming-soon">
          <div className="cs-emoji">
            <Icon name="stats" size={40} />
          </div>
          <h1>Noctis</h1>
          <p className="muted">
            Civilization module — implementation lives in <code>src/main/city</code>.
          </p>
          <div className="cs-card">
            <div className="cs-tag">Scaffolding phase</div>
            <ul>
              <li>Read the canon docs in src/main/city/docs/</li>
              <li>Build service, engine, ipc, rendering, and ui under src/main/city/</li>
              <li>Observational 2D civilization — not a grid builder or CP economy</li>
            </ul>
          </div>
        </div>
      );
    case 'library':
      return <LibraryView onOpen={onOpenBook} />;
    case 'novels':
      return <NovelsView />;
    case 'player':
      return <MediaView />;
    case 'music':
      return <MusicView />;
    case 'visualizer':
      return <VisualizerWidget />;
    case 'musicwidget':
      return <MusicWidget />;
    case 'translate':
      return <TranslateView />;
    case 'dictionary':
      return <DictionaryView />;
    case 'anki':
      return <AnkiView />;
    case 'flashcards':
      return <FlashcardsView />;
    case 'grammar':
      return <GrammarView />;
    case 'stats':
      return <StatisticsView />;
    case 'resources':
      return <ResourcesView />;
    case 'immersion':
      return <ImmersionView />;
    case 'calendar':
      return <CalendarView />;
    default:
      return null;
  }
}

export function VisualizerWidget() {
  const [viz, setViz] = useState(loadVizSettings);
  const [playing, setPlaying] = useState(isMusicPlaying);
  useEffect(() => onVizSettingsChanged(setViz), []);
  useEffect(() => onPlayingChanged(setPlaying), []);
  return (
    <div className="viz-widget">
      <VisualizerCanvas className="viz-widget-canvas" settings={viz} idleBaseline />
      {!playing && (
        <span className="viz-widget-hint muted">
          <Icon name="music" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
          play a song in Music
        </span>
      )}
    </div>
  );
}
