/**
 * Noctis lifecycle — process-level orchestration of the CityService singleton.
 *
 * Main-process only. Holds the single service instance and the broadcast
 * path to every window (ARCHITECTURE.md Section 6). Kept separate from
 * CityService so the service stays testable without Electron.
 */

import { BrowserWindow } from 'electron';

import { CityService } from './CityService';
import { CITY_CHANGED, CityStateMessage } from '../ipc/channels';

let service: CityService | null = null;

/** Push a unified state/event result to all open windows (flow 2 broadcast). */
function broadcast(message: CityStateMessage): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(CITY_CHANGED, message);
  }
}

/** Initializes the service once, running the launch elapsed-time checkpoint. */
export function initCityService(): CityService {
  if (!service) service = CityService.init(broadcast);
  return service;
}

/** The live service, or null before init (handlers guard against this). */
export function getCityService(): CityService | null {
  return service;
}

/** Optional clean-quit timestamp stamp (flow 4); safe if never initialized. */
export function stampCityServiceOnQuit(): void {
  if (service) service.stampOnQuit();
}
