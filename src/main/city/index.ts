/**
 * Noctis Civilization Module — main-process entry.
 *
 * Registers the city IPC contract and initializes the CityService singleton
 * (running the launch elapsed-time checkpoint). See docs/ARCHITECTURE.md for
 * layer boundaries.
 */

import { app } from 'electron';

import { registerCityHandlers } from './ipc/handlers';
import { initCityService, stampCityServiceOnQuit } from './service/lifecycle';

export function registerCityIpc(): void {
  registerCityHandlers();
  // Initialize the state owner as soon as the app is ready (the boot
  // checkpoint evaluates offline elapsed time exactly once).
  if (app.isReady()) {
    initCityService();
  } else {
    app.whenReady().then(() => initCityService());
  }
  app.on('before-quit', () => stampCityServiceOnQuit());
}
