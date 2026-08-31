import { lazy, Suspense } from 'react';
import type { LibraryItem } from '../../shared/types';
import type { DesktopWinSection } from '../../shared/desktop';
import { useT } from '../i18n';
import { openSectionSurface } from '../sectionSurface';
import MusicWidget from './MusicWidget';
import { useVisualizer, VizStage } from './visualizer/VisualizerContent';
import { WALL_PRESETS } from '../environment/wallCatalog';
const ReadingGarden = lazy(() => import('./reading-garden/ReadingGarden'));

const AgentWorkspaceShell = lazy(() => import('./agent/AgentWorkspaceShell'));
const LibraryView = lazy(() => import('../views/LibraryView'));
const ReadingWorkspaceView = lazy(() => import('../views/ReadingWorkspaceView'));
const MediaCenterView = lazy(() => import('../views/MediaCenterView'));
// Retained as an exported compatibility surface for older deep links and
// recovery callers. Primary player/video routes intentionally use MediaCenter.
export const MediaWorkspaceCompatibilityView = lazy(() => import('../views/MediaWorkspaceSectionView'));
const ScraperView = lazy(() => import('../views/ScraperView'));
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
const YouTubePlaylistsView = lazy(() => import('../views/YouTubePlaylistsView'));
const SettingsApp = lazy(() => import('./settings/SettingsApp'));
const FilesApp = lazy(() => import('./filesapp/FilesApp'));

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
  const { t } = useT();
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
    case 'agent':
      view = <AgentWorkspaceShell />;
      break;
    case 'city':
      view = <ReadingGarden />;
      break;
    case 'library':
      view = <LibraryView onOpen={onOpenBook} />;
      break;
    case 'novels':
      view = <ReadingWorkspaceView initialSection="plan" onOpenBook={onOpenBook} />;
      break;
    case 'player':
      // All Media entry points open the same shell. The shell owns local-library
      // browsing and exposes the Seanime workspace as an explicit handoff, so a
      // shortcut never lands on a status-only overlay or an empty canvas.
      view = <MediaCenterView initialTab="library" />;
      break;
    case 'scraper':
      view = <ScraperView />;
      break;
    case 'video':
      view = <MediaCenterView initialTab="video" />;
      break;
    case 'youtube':
      view = <YouTubePlaylistsView />;
      break;
    case 'music':
      view = <MediaCenterView initialTab="music" />;
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
      view = <ReadingWorkspaceView initialSection="discover" onOpenBook={onOpenBook} />;
      break;
    case 'files':
      view = <FilesApp />;
      break;
    default:
      // NOT `null`. A section the switch does not recognise used to render an
      // empty body inside a full window frame — measured live as an 820×580
      // window titled `media` whose `.fwin-body` held zero nodes, restored from
      // a layout on every boot. A blank surface is indistinguishable from a
      // broken one, so the unrecognised id is named and the way out is stated.
      // `shared/desktop.ts` repairs the ids it knows on the way off disk; this
      // is what the ones it cannot repair look like.
      view = (
        <div className="app-section-unavailable" style={{ padding: '32px 28px', maxWidth: 560 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 17 }}>{t('desktop.sectionUnavailable.title')}</h2>
          <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
            {t('desktop.sectionUnavailable.body', { section })}
          </p>
        </div>
      );
  }
  return <Suspense fallback={<div className="app-section-loading muted">{t('common.loading')}</div>}>{view}</Suspense>;
}

export function VisualizerWidget() {
  const { viz, playing } = useVisualizer();
  return (
    <VizStage
      settings={viz}
      playing={playing}
      // Both widgets render here AND inside their own `?popout=…` window, which
      // mounts no DesktopShell — so a bare `os:open` dispatch was a dead button
      // in the pop-out. `openSectionSurface` falls back to main's pop-out route.
      onOpenMusic={() => openSectionSurface('music')}
    />
  );
}
