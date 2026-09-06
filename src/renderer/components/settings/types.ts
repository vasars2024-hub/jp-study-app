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
  // v1.0 audit 5.2 — `monitors` and `display` MERGED. Kept as a historical
  // coordinate only: it has no `SETTINGS_NAV` row and no branch in the page
  // switch, and `SettingsApp.navigate` redirects it to `display`, which now
  // renders the monitor cards above the visual-accessibility ones.
  | 'monitors'
  | 'file-drops'
  // Phase 0 credentials vault — every API key in the app, one page.
  | 'api-keys'
  | 'display'
  | 'motion'
  | 'storage'
  | 'memory'
  | 'help';

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
  /**
   * Theme ids this entry's card actually renders under. Omit when the card
   * renders everywhere, which is the overwhelming majority.
   *
   * `advanced` hides an entry whose card is behind Advanced Mode; this is the
   * same idea on the theme axis. A card rendered under a guard such as
   * `activeThemeId === AERO_THEME_ID` does not exist for a Study OS user, so a
   * search hit for it navigates to a page that highlights nothing — the
   * misroute the registry exists to prevent. (Spelled as prose rather than as
   * the tag itself: `l8-searchability.cjs` scans this tree for card tags and
   * would count the example as a real destination.)
   */
  themes?: string[];
  /**
   * The secret shell whose DISCOVERY this entry's card is behind — the other
   * render axis on the Special page, and independent of `themes`: a user who
   * found WIRED keeps its modules under every theme.
   *
   * When both are declared they are OR-ed, matching the guards they model
   * (`{(wired || isWiredDiscovered) && …}`). Not declaring either means the card
   * renders for everyone.
   */
  discovered?: 'aero' | 'wired';
  /**
   * This entry's card no longer lives in Settings — gate 8's memory/statistics
   * migration, and decision 1's single sanctioned exception to the
   * not-a-gatekeeper rule.
   *
   * The entry STAYS in the registry on purpose. Deleting it would mean a user
   * who types "factory reset" into Settings gets nothing, which is a capability
   * lost rather than a capability moved. `pageId` is kept as the card's
   * HISTORICAL page so a stale deep link and the agent's guided-navigation
   * index still resolve; `movedTo` is what actually routes the hit, and the
   * search UI opens the Files app on the card's own id instead of navigating a
   * settings page.
   *
   * `shared/filesApp/systemPanels.ts` owns the card → panel table.
   */
  movedTo?: 'files';
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
