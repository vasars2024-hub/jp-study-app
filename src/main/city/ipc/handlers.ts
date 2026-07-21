import { ipcMain } from 'electron';

import { getCityService, initCityService } from '../service/lifecycle';
import { CITY_GET_STATE, CITY_RECORD_SESSION, CityStateMessage } from './channels';
import { parseCitySessionPacket } from './validation';

let registered = false;

export function registerCityHandlers(): void {
  if (registered) return;
  registered = true;
  ipcMain.handle(CITY_GET_STATE, (): CityStateMessage => {
    const owner = getCityService() || initCityService();
    return owner.getState();
  });
  ipcMain.handle(CITY_RECORD_SESSION, async (_event, raw: unknown): Promise<CityStateMessage> => {
    const packet = parseCitySessionPacket(raw);
    const owner = getCityService() || initCityService();
    return owner.recordSession(packet.idempotencyKey, packet.input);
  });
}
