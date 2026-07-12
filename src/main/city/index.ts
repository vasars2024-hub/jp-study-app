/**
 * Noctis Civilization Module — main-process entry.
 *
 * Registers IPC handlers and delegates to CityService.
 * See docs/ARCHITECTURE.md for layer boundaries.
 */

import { registerCityHandlers } from './ipc/handlers';

export function registerCityIpc(): void {
  registerCityHandlers();
}
