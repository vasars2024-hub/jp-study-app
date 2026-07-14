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
import SettingsApp from './settings/SettingsApp';
import { WALL_PRESETS } from '../environment/wallCatalog';
import {
  AppChrome,
  StatusBarField,
  StatusBarSpacer,
  Toolbar,
  type MenuBarMenu,
  useAeroMaterials,
} from './ui';

// The section → view mapping. Shared by the in-desktop FloatingWindow
// (DesktopShell) and the pop-out window (App) so an app renders identically
// whether it lives on the fake desktop or in its own OS window. Notes stay
// desktop-coupled; Settings can open in a pop-out with safe wall stubs.
export default function AppSection({
  section,
  onOpenBook,
}: {
  section: DesktopWinSection;
  onOpenBook: (item: LibraryItem) => void;
}) {
  switch (section) {
    case 'settings':
      return (
        <SettingsApp
          wall={{ kind: 'preset', id: WALL_PRESETS[0]?.id ?? 'void' }}
          wallPreset={WALL_PRESETS[0]?.id ?? ''}
          presets={WALL_PRESETS.map((p) => ({ id: p.id, label: p.label, css: p.css, animated: p.animated }))}
          onWallPreset={() => undefined}
          onWallImage={() => undefined}
          onWallVideo={() => undefined}
          onWallClear={() => undefined}
          onReset={() => undefined}
          onOpenVisualizer={() => void window.api.popOut('music')}
          onOpenMusicWidget={() => void window.api.popOut('musicwidget')}
        />
      );
    case 'city':
      return <NoctisPlaceholder />;
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

function NoctisPlaceholder() {
  const aero = useAeroMaterials();
  const menus: MenuBarMenu[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        {
          id: 'open-docs',
          label: 'Show canon path',
          onSelect: () => {
            window.dispatchEvent(new CustomEvent('os:toast', { detail: { message: 'Noctis canon: src/main/city/docs', kind: 'ok' } }));
          },
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { id: 'overview', label: 'Overview', onSelect: () => undefined },
      ],
    },
  ];

  if (aero) {
    return (
      <AppChrome
        menus={menus}
        status={
          <>
            <StatusBarField>Scaffolding phase</StatusBarField>
            <StatusBarSpacer />
            <StatusBarField>Noctis canon linked</StatusBarField>
          </>
        }
        className="aero-noctis-chrome"
      >
        <div className="aero-noctis-placeholder">
          <Toolbar className="aero-noctis-toolbar" aria-label="Noctis commands">
            <span>Noctis Civilization Module</span>
          </Toolbar>
          <div className="aero-noctis-workbench">
            <aside className="aero-noctis-nav" aria-label="Noctis sections">
              <button className="active">Overview</button>
              <button disabled>Canon</button>
              <button disabled>Engine</button>
              <button disabled>Renderer</button>
            </aside>
            <main className="aero-noctis-main">
              <section className="aero-noctis-panel">
                <header>
                  <Icon name="stats" size={15} />
                  Noctis
                </header>
                <p>
                  Civilization module scaffolding is present under <code>src/main/city</code>. The final
                  app should become an observational 2D civilization surface, not a grid builder or CP economy.
                </p>
              </section>
              <section className="aero-noctis-panel">
                <header>Implementation checklist</header>
                <ul>
                  <li>Read the canon docs in <code>src/main/city/docs</code>.</li>
                  <li>Build service, engine, IPC, rendering, and UI under <code>src/main/city</code>.</li>
                  <li>Keep the current placeholder quiet until the module is real.</li>
                </ul>
              </section>
            </main>
          </div>
        </div>
      </AppChrome>
    );
  }

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
