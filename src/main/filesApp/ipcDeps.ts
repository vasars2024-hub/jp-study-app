/**
 * The Files app's links into the rest of main, assembled in one place so
 * `ipc.ts` can stay importable by its tests without pulling in the library,
 * the media-ingest service and the PDF rasterizer (each of which reaches for
 * Electron APIs at load).
 */
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import type { FilesAppIpcOptions } from './ipc';
import { getMediaIngest } from '../mediaIngest';
import { activeWatchFolders } from '../../shared/mediaIngest';
import { localFileUrl } from '../library';
import { rasterizePdf } from '../pdfRasterize';

export function filesAppIpcDeps(mainWindow: () => BrowserWindow | null): FilesAppIpcOptions {
  return {
    mainWindow,
    mediaIngestFolders: () => {
      const state = getMediaIngest()?.state();
      if (!state) return [];
      return activeWatchFolders({
        version: 1,
        autoImport: state.autoImport,
        folders: state.folders,
        dismissed: [],
      }).map((folder) => folder.path);
    },
    localFileUrl,
    renderPdfFirstPage: async (pdfPath, outDir) => {
      const names = await rasterizePdf(pdfPath, outDir, undefined, 1);
      return names[0] ? path.join(outDir, names[0]) : null;
    },
  };
}
