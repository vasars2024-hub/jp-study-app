// The Windows installer's in-app surface: the "Restart to update" notice an installed
// (Squirrel) copy shows once an update has downloaded (main/squirrelUpdater.ts,
// renderer/releaseCheck.ts). — English source of truth.

import type { Catalog } from '../core';

export const INSTALL_UI_EN: Catalog = {
  'install.update.readyTitle': 'Gum {version} is ready to install',
  'install.update.readyTitleNoVersion': 'A Gum update is ready to install',
  'install.update.readyBody': 'It has downloaded in the background. Restart Gum to finish updating; your data stays as it is.',
  'install.update.restart': 'Restart to update',
};
