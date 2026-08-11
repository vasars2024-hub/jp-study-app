import type { IconName } from '../Icons';
import type { OsPersonalization } from '../../osPersonalization';
import type { DesktopPrefs } from '../../desktopPrefs';
import type { EnvironmentSettings } from '../../environment';
import type { VizSettings } from '../../visualizerSettings';
import type { ReaderSettings } from '../../readerSettings';
import type { WhisperDevice, WhisperModelTier } from '../../whisperSettings';
import type { LyricsSettings } from '../../lyricsSettings';
import type { MiniModeSettings } from '../../miniMode';

export interface WallChoice {
  kind: 'preset' | 'image' | 'video' | 'slideshow';
  id?: string;
  path?: string;
  /** Slideshow folder (absolute). */
  folder?: string;
  intervalSec?: number;
  shuffle?: boolean;
}

export type SettingsPageId =
  | 'home'
  | 'appearance'
  | 'wallpaper'
  | 'atmosphere'
  | 'companions'
  | 'desktop-layout'
  | 'shortcuts'
  | 'mini'
  | 'lockscreen'
  | 'study'
  | 'profile-rules'
  | 'reading'
  | 'scraper'
  | 'transcription'
  | 'visualizer'
  | 'special'
  // Phase 0 credentials vault — every API key in the app, one page.
  | 'api-keys'
  | 'display'
  | 'motion'
  | 'storage'
  | 'memory';

export interface SettingsNavPage {
  id: SettingsPageId;
  /** i18n catalog key — resolve with t() at render time, never read directly. */
  labelKey: string;
  icon: IconName;
  group: string;
  /** i18n catalog key — resolve with t() at render time, never read directly. */
  descKey?: string;
  /** Only listed when Settings Advanced Mode is on (features still run when hidden). */
  advanced?: boolean;
}

export interface SettingsRegistryEntry {
  id: string;
  /** i18n catalog key — resolve with t() at render time, never read directly. */
  titleKey: string;
  /** i18n catalog key — resolve with t() at render time, never read directly. */
  descKey?: string;
  /**
   * Search terms, deliberately kept as literal English rather than catalog
   * keys — search matches translated title/description text plus these, so a
   * JA/ZH/RU user can still find a setting by typing its English feature name.
   */
  keywords: string[];
  pageId: SettingsPageId;
  group: string;
  advanced?: boolean;
}

export interface UserWallThumb {
  id: string;
  label: string;
  kind: 'image' | 'video';
  path: string;
}

export interface SettingsWallProps {
  wall: WallChoice;
  wallPreset: string;
  presets: { id: string; label: string; css: string; animated?: boolean }[];
  /** User-added images/videos listed under default presets. */
  userWallpapers?: UserWallThumb[];
  /** Preview URL (data/playfile) keyed by user wallpaper id. */
  userWallThumbs?: Record<string, string>;
  onWallPreset: (id: string) => void;
  onWallUser?: (id: string) => void;
  onWallUserRemove?: (id: string) => void;
  onWallImage: () => void;
  onWallVideo: () => void;
  onWallFolder?: () => void;
  onWallSlideshowNext?: () => void;
  onWallSlideshowPrev?: () => void;
  onWallSlideshowOptions?: (opts: { intervalSec?: number; shuffle?: boolean }) => void;
  onWallClear: () => void;
  onReset: () => void;
  onOpenVisualizer: () => void;
  onOpenMusicWidget: () => void;
}

export interface SettingsController extends SettingsWallProps {
  page: SettingsPageId;
  navigate: (page: SettingsPageId, focusSettingId?: string) => void;
  focusSettingId: string | null;
  clearFocusSetting: () => void;

  look: OsPersonalization;
  patchLook: (p: Partial<OsPersonalization>) => void;
  deskPrefs: DesktopPrefs;
  patchDesk: (p: Partial<DesktopPrefs>) => void;
  env: EnvironmentSettings;
  patchEnv: (p: Partial<EnvironmentSettings>) => void;
  viz: VizSettings;
  patchViz: (p: Partial<VizSettings>) => void;
  theme: string;
  chooseTheme: (id: string) => void;
  zoom: number;
  setZoomValue: (n: number) => void;
  bumpZoomBy: (d: number) => void;
  reduce: boolean;
  toggleMotion: () => void;
  readerSettings: ReaderSettings;
  changeReaderSettings: (s: ReaderSettings) => void;
  whisperDevice: WhisperDevice;
  chooseWhisperDevice: (d: WhisperDevice) => void;
  whisperModelTier: WhisperModelTier;
  chooseWhisperModelTier: (t: WhisperModelTier) => void;
  lyricsSettings: LyricsSettings;
  setLyricsAlbumSearch: (on: boolean) => void;
  userCss: string;
  setUserCss: (v: string) => void;
  cssMsg: string | null;
  setCssMsg: (v: string | null) => void;
  mini: MiniModeSettings;
  patchMini: (p: Partial<MiniModeSettings>) => void;
  advancedMode: boolean;
  setAdvancedMode: (on: boolean) => void;
  seg: (active: boolean) => string;
}
