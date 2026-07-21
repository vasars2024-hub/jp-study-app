import { lazy, Suspense, useEffect, useState } from 'react';
import type { LibraryItem } from '../../shared/types';
import type { DesktopWinSection } from '../../shared/desktop';
import MusicWidget from './MusicWidget';
import { useVisualizer, VizStage } from './visualizer/VisualizerContent';
import { WALL_PRESETS } from '../environment/wallCatalog';
import { getCityState, onCityChanged } from '../cityState';
import type { CityStateMessage } from '../../main/city/ipc/channels';
const NoctisWorkspace = lazy(() => import('../../main/city/ui/NoctisWorkspace'));

const LibraryView = lazy(() => import('../views/LibraryView'));
const NovelsView = lazy(() => import('../views/NovelsView'));
const MediaView = lazy(() => import('../views/MediaView'));
const VideoPlayerView = lazy(() => import('../views/VideoPlayerView'));
const MusicView = lazy(() => import('../views/MusicView'));
const TranslateView = lazy(() => import('../views/TranslateView'));
const DictionaryView = lazy(() => import('../views/DictionaryView'));
const AnkiView = lazy(() => import('../views/AnkiView'));
const FlashcardsView = lazy(() => import('../views/FlashcardsView'));
const GameArenaView = lazy(() => import('../views/GameArenaView'));
const GrammarView = lazy(() => import('../views/GrammarView'));
const NotebookView = lazy(() => import('../views/NotebookView'));
const StatisticsView = lazy(() => import('../views/StatisticsView'));
const ResourcesView = lazy(() => import('../views/ResourcesView'));
const ImmersionView = lazy(() => import('../views/ImmersionView'));
const CalendarView = lazy(() => import('../views/CalendarView'));
const ReadingFinderView = lazy(() => import('../views/ReadingFinderView'));
const YouTubePlaylistsView = lazy(() => import('../views/YouTubePlaylistsView'));
const SettingsApp = lazy(() => import('./settings/SettingsApp'));

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
  let view: JSX.Element | null;
  switch (section) {
    case 'settings':
      view = (
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
      break;
    case 'city':
      view = <NoctisView />;
      break;
    case 'library':
      view = <LibraryView onOpen={onOpenBook} />;
      break;
    case 'novels':
      view = <NovelsView />;
      break;
    case 'player':
      view = <MediaView mode="library" />;
      break;
    case 'video':
      view = <VideoPlayerView />;
      break;
    case 'youtube':
      view = <YouTubePlaylistsView />;
      break;
    case 'music':
      view = <MusicView />;
      break;
    case 'visualizer':
      view = <VisualizerWidget />;
      break;
    case 'musicwidget':
      view = <MusicWidget />;
      break;
    case 'translate':
      view = <TranslateView />;
      break;
    case 'dictionary':
      view = <DictionaryView />;
      break;
    case 'anki':
      view = <AnkiView />;
      break;
    case 'flashcards':
      view = <FlashcardsView />;
      break;
    case 'games':
      view = <GameArenaView />;
      break;
    case 'grammar':
      view = <GrammarView />;
      break;
    case 'notebook':
      view = <NotebookView />;
      break;
    case 'stats':
      view = <StatisticsView />;
      break;
    case 'resources':
      view = <ResourcesView />;
      break;
    case 'immersion':
      view = <ImmersionView />;
      break;
    case 'calendar':
      view = <CalendarView />;
      break;
    case 'reading':
      view = <ReadingFinderView onOpenBook={onOpenBook} />;
      break;
    default:
      view = null;
  }
  return <Suspense fallback={<div className="app-section-loading muted">Loading...</div>}>{view}</Suspense>;
}

function NoctisView() {
  const [message, setMessage] = useState<CityStateMessage | null>(getCityState());
  useEffect(() => onCityChanged(setMessage), []);
  return <NoctisWorkspace message={message} />;
}

export function VisualizerWidget() {
  const { viz, playing } = useVisualizer();
  return <VizStage settings={viz} playing={playing} />;
}
