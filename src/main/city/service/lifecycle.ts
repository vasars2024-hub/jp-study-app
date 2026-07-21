import { app, BrowserWindow } from 'electron';

import { CITY_CHANGED, CityStateMessage } from '../ipc/channels';
import { CityClock, CityService } from './CityService';
import { createFileCityStorage } from './persistence';

let service: CityService | null = null;

const systemClock: CityClock = {
  now: () => Date.now(),
  seed: () => (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0,
};

function broadcast(message: CityStateMessage): void {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) window.webContents.send(CITY_CHANGED, message);
  });
}

export function initCityService(): CityService {
  if (!service) {
    service = CityService.init(
      broadcast,
      systemClock,
      createFileCityStorage(app.getPath('userData')),
    );
  }
  return service;
}

export function getCityService(): CityService | null {
  return service;
}

export function stampCityServiceOnQuit(): void {
  if (service) service.stampOnQuit();
}
