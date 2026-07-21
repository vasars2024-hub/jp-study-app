import Icon from '../components/Icons';
import {
  AppChrome,
  StatusBarField,
  StatusBarSpacer,
  useWiredMaterials,
  type MenuBarMenu,
} from '../components/ui';
import {
  MediaEmptyLibrary,
  MediaFolderNav,
  MediaGenerationStatus,
  MediaGrid,
  MediaKindFilter,
  MediaLibraryActions,
  MediaLookupPopup,
  MediaPlayerStage,
  MediaSearchBox,
  MediaTranscriptionControls,
  MediaWatchFolder,
  MediaYoutubeBar,
  malUrl,
  useMedia,
  type MediaViewMode,
} from '../components/media/MediaContent';
import { useT } from '../i18n';

export type { MediaViewMode };

interface MediaViewProps {
  /** full = legacy combined; library = file browser; video = learning player. */
  mode?: MediaViewMode;
}

export default function MediaView({ mode = 'full' }: MediaViewProps) {
  const { t } = useT();
  const wired = useWiredMaterials();
  const state = useMedia(mode, wired);
  const {
    items,
    current,
    cues,
    src,
    watchFolder,
    active,
    showLibrary,
    showPlayer,
    generating,
    subName,
    genState,
    displayedItems,
    searchActive,
    selectedFolder,
    kindFilter,
    hasFolders,
  } = state;

  const mediaMenus: MenuBarMenu[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'open', label: 'Open media file…', icon: <Icon name="folder" size={14} />, onSelect: state.openFile },
        {
          id: 'watch-folder',
          label: watchFolder ? 'Change watch folder…' : 'Set watch folder…',
          icon: <Icon name="folder" size={14} />,
          onSelect: state.chooseWatchFolder,
        },
        { id: 'clear-watch', label: 'Stop watching folder', disabled: !watchFolder, onSelect: state.clearWatch },
      ],
    },
    {
      id: 'subtitles',
      label: 'Subtitles',
      items: [
        { id: 'load-subs', label: 'Load subtitles…', disabled: !src, icon: <Icon name="caption" size={14} />, onSelect: state.openSubs },
        {
          id: 'generate-subs',
          label: 'Generate subtitles',
          disabled: !src || generating,
          icon: <Icon name="sparkle" size={14} />,
          onSelect: () => src && state.runGeneration(src),
        },
        { separator: true, label: '' },
        { id: 'prev-line', label: 'Previous line', disabled: cues.length === 0, onSelect: () => state.jumpLine(-1) },
        { id: 'next-line', label: 'Next line', disabled: cues.length === 0, onSelect: () => state.jumpLine(1) },
        { id: 'replay-line', label: 'Replay line', disabled: !active, onSelect: state.replayLine },
        { separator: true, label: '' },
        { id: 'export-srt', label: 'Export SRT…', disabled: cues.length === 0, onSelect: () => state.exportSubs('srt') },
        { id: 'export-vtt', label: 'Export VTT…', disabled: cues.length === 0, onSelect: () => state.exportSubs('vtt') },
      ],
    },
    {
      id: 'library',
      label: 'Library',
      items: [
        {
          id: 'clear-player',
          label: 'Clear player',
          disabled: !current && !src,
          onSelect: state.clearPlayer,
        },
        {
          id: 'open-mal',
          label: 'Search current title on MAL',
          disabled: !current,
          onSelect: () => current && window.api.openExternal(malUrl(current.title)),
        },
      ],
    },
  ];

  const mediaStatus = (
    <>
      <StatusBarField>{items.length} media items</StatusBarField>
      <StatusBarField>{current ? current.title : 'No media loaded'}</StatusBarField>
      <StatusBarSpacer />
      {cues.length > 0 && <StatusBarField>{cues.length} subtitle lines</StatusBarField>}
      {watchFolder && <StatusBarField title={watchFolder}>Watch folder on</StatusBarField>}
    </>
  );

  return (
    <AppChrome menus={mediaMenus} status={mediaStatus} className="aero-media-chrome">
    <div className="media-view">
      <div className="view-head">
        <p className="muted">
          {mode === 'video' ? t('video.intro') : mode === 'library' ? t('media.libraryIntro') : t('media.intro')}
        </p>
      </div>

      <div className="media-toolbar">
        <button className="btn primary" onClick={state.openFile}>
          <Icon name="folder" size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
          {t('media.openFile')}
        </button>
        {showPlayer && (
          <>
            <button className="btn" onClick={state.openSubs} disabled={!src}>
              <Icon name="caption" size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
              {subName && genState !== 'done' ? t('media.subs.loaded', { name: subName }) : t('media.subs.load')}
            </button>
            <button className="btn" onClick={() => src && state.runGeneration(src)} disabled={!src || generating}>
              <Icon name="sparkle" size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
              {t('media.generateSubs')}
            </button>
            <MediaTranscriptionControls state={state} />
          </>
        )}
        <MediaWatchFolder state={state} />
      </div>

      {showPlayer && <MediaYoutubeBar state={state} />}

      {showPlayer && <MediaGenerationStatus state={state} />}

      {showPlayer && <MediaPlayerStage state={state} />}

      {showLibrary && (
      <>
      {/* ---- media library ---- */}
      <div className="media-lib-head">
        <h2>
          {t('media.yourMedia')}{' '}
          {items.length > 0 && (
            <span className="muted">
              ({searchActive || selectedFolder || kindFilter !== 'all' ? `${displayedItems.length} / ${items.length}` : items.length})
            </span>
          )}
        </h2>
        {mode !== 'video' && <MediaKindFilter state={state} />}
        <MediaLibraryActions onItemsChange={state.setItems} onCleared={state.clearPlayback} />
      </div>

      {items.length === 0 ? (
        <MediaEmptyLibrary />
      ) : (
        <div className="media-lib-panel">
          <MediaSearchBox state={state} />

          <div className={`media-lib-body ${hasFolders ? 'has-folders' : ''}`}>
            {hasFolders && !searchActive && <MediaFolderNav state={state} />}
            <MediaGrid state={state} />
          </div>
        </div>
      )}
      </>
      )}

      <MediaLookupPopup state={state} />
    </div>
    </AppChrome>
  );
}
