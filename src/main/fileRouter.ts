/**
 * Electron IPC boundary for the filesystem-aware file planner. The planning
 * itself lives in `fileRouterPlanning.ts`, which has no Electron import so the
 * Files ingest worker can share the same decisions.
 *
 * **Where execution lives.** The plan for this feature put `filedrop:execute`
 * here in main. It is not here, and the reason is worth stating: every importer
 * this router dispatches to (`library:importPaths`, `media:addPaths`,
 * `dict:importYomitan`, `apkg:import`, `mining:importFrequencyDict`,
 * `desktop:setWallpaperFromPath`) is an `ipcMain.handle` handler with no
 * exported function behind it. Calling them from main would mean refactoring
 * six modules to split handler from implementation — a much larger and riskier
 * change than the feature needs. So classification (which genuinely requires
 * `fs`) happens here, and dispatch happens in `renderer/components/DropRouter.tsx`
 * through the same `window.api.*` calls the rest of the UI already uses. Undo
 * lives with dispatch, because reversing an import is `library:remove` /
 * `media:remove` — also renderer-side.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ipcMain } from 'electron';
import { IMAGE_EXT, extOf } from '../shared/mediaKind';
import { listImportableFiles, planForPath } from './fileRouterPlanning';

export { planForPath } from './fileRouterPlanning';
export type { DropPlan, FolderSummary } from './fileRouterPlanning';

export function registerFileRouterIpc(): void {
  ipcMain.handle('filedrop:classify', (_event, paths: unknown) => {
    if (!Array.isArray(paths)) return [];
    return paths
      .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0)
      .slice(0, 200)
      .map(planForPath);
  });

  /** Image files directly inside a folder — the slideshow / manga import list. */
  ipcMain.handle('filedrop:listFolderImages', (_event, dirPath: unknown): string[] => {
    if (typeof dirPath !== 'string') return [];
    try {
      return fs.readdirSync(dirPath, { withFileTypes: true })
        .filter((entry) => !entry.isDirectory() && IMAGE_EXT.has(extOf(entry.name)))
        .map((entry) => path.join(dirPath, entry.name))
        .sort();
    } catch {
      return [];
    }
  });

  /**
   * Importable files inside a folder and its subfolders, for a book/media folder drop.
   * Recursive like the planner's scan, so a parent folder of shows imports every show.
   */
  ipcMain.handle('filedrop:listFolderFiles', (_event, dirPath: unknown): string[] => {
    if (typeof dirPath !== 'string') return [];
    return listImportableFiles(dirPath);
  });
}
