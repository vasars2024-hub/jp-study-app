import { registerTheme, type Theme } from './engine';
import { WIRED_ARCHIVE_SOUND_PACK_ID } from '../audio/wiredArchivePack';

export const WIRED_ARCHIVE_THEME_ID = 'wired-archive';

export const WIRED_ARCHIVE_THEME: Theme = {
  id: WIRED_ARCHIVE_THEME_ID,
  label: 'WIRED ARCHIVE',
  kind: 'aero',
  hidden: true,
  light: false,
  version: 1,
  materialSet: 'wired',
  assetPack: { id: 'wired-archive-assets', sounds: WIRED_ARCHIVE_SOUND_PACK_ID },
  swatch: { bg: '#02070d', text: '#d8fbff', border: '#1c7484' },
};

let registered = false;

export function registerWiredArchive(): void {
  if (registered) return;
  registerTheme(WIRED_ARCHIVE_THEME);
  registered = true;
}
