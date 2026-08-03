/**
 * Seanime sidecar IPC (Phase 1 — read-only architecture proof).
 *
 * Calls exactly three endpoints, typed against Seanime's own generated contract
 * (`vendor/seanime/generated/types.ts`, verbatim at pinned commit 9bdd052):
 *
 *   1. GET /api/v1/status                      -> Status
 *   2. GET /api/v1/library/collection          -> Anime_LibraryCollection
 *   3. GET /api/v1/library/anime-entry/:id     -> Anime_Entry
 *
 * Every response is wrapped by the server in `{ data: T }`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ipcMain, webContents } from 'electron';
import type {
  Anime_Entry,
  Anime_LibraryCollection,
  Status,
} from '../../../vendor/seanime/generated/types';
import {
  SEANIME_CHANNELS,
  SEANIME_SIDECAR_ENABLED,
  type SeanimeConnection,
  type SeanimeIdentityRow,
  type SeanimePosterTile,
  type SeanimeProbeResult,
  type SeanimeStatus,
} from '../../shared/seanime';
import {
  getSeanimeStatus,
  onSeanimeStatus,
  seanimeAuthToken,
  seanimeBaseUrl,
  startSeanime,
  stopSeanime,
} from './supervisor';
import { extractAudioPcm } from '../media';
import { readSeanimeStudyLibrary } from './studyLibrary';

async function api<T>(route: string): Promise<T> {
  const base = seanimeBaseUrl();
  if (!base) throw new Error('sidecar is not running');
  const res = await fetch(`${base}${route}`, {
    headers: { 'X-Seanime-Token': seanimeAuthToken() },
  });
  if (!res.ok) throw new Error(`${route} -> HTTP ${res.status}`);
  const body = (await res.json()) as { data?: T; error?: string };
  if (body.error) throw new Error(`${route} -> ${body.error}`);
  return body.data as T;
}

/**
 * Read the three endpoints and reduce them to what the dev grid needs:
 * posters plus the AniList-id ⇄ path mapping that Phase 1 has to demonstrate.
 */
export async function probeSeanime(): Promise<SeanimeProbeResult> {
  const serverStatus = await api<Status>('/api/v1/status');
  const collection = await api<Anime_LibraryCollection>('/api/v1/library/collection');

  const entries = (collection.lists ?? []).flatMap((list) => list.entries ?? []);

  const tiles: SeanimePosterTile[] = entries.map((entry) => ({
    anilistId: entry.mediaId,
    malId: entry.media?.idMal ?? null,
    title:
      entry.media?.title?.userPreferred ??
      entry.media?.title?.romaji ??
      entry.media?.title?.english ??
      `#${entry.mediaId}`,
    posterUrl: entry.media?.coverImage?.large ?? entry.media?.coverImage?.medium ?? null,
    fileCount: 0,
  }));

  // Endpoint 3: one entry read, which is where the identity mapping actually lives.
  let identity: SeanimeIdentityRow[] = [];
  const first = tiles[0];
  if (first) {
    const entry = await api<Anime_Entry>(`/api/v1/library/anime-entry/${first.anilistId}`);
    identity = (entry.localFiles ?? []).map((lf) => ({
      anilistId: lf.mediaId,
      malId: entry.media?.idMal ?? null,
      title: entry.media?.title?.romaji ?? first.title,
      episode: lf.metadata?.episode ?? null,
      path: lf.path,
    }));
    first.fileCount = identity.length;
  }

  // `stats.totalFiles` already counts every scanned file, matched or not — verified
  // against a 59-file library reporting totalFiles 59 with 44 unmatched.
  const unmatchedFiles = (collection.unmatchedLocalFiles ?? []).length;

  return {
    status: { ...getSeanimeStatus(), version: serverStatus.version ?? null },
    tiles,
    identity,
    unmatchedFiles,
    totalFiles: collection.stats?.totalFiles ?? unmatchedFiles,
  };
}

export function registerSeanimeIpc(): void {
  // Handlers are registered unconditionally so the renderer can render an honest
  // "disabled" state; the supervisor itself refuses to spawn without the flag.
  ipcMain.handle(SEANIME_CHANNELS.status, (): SeanimeStatus => getSeanimeStatus());
  ipcMain.handle(SEANIME_CHANNELS.start, () => startSeanime());
  ipcMain.handle(SEANIME_CHANNELS.stop, () => {
    stopSeanime();
    return getSeanimeStatus();
  });
  ipcMain.handle(
    SEANIME_CHANNELS.connection,
    (): SeanimeConnection => ({
      baseUrl: seanimeBaseUrl() ?? '',
      token: seanimeAuthToken(),
    }),
  );
  ipcMain.handle(SEANIME_CHANNELS.extractAudio, async (_event, localFilePath: string) => {
    if (typeof localFilePath !== 'string' || !path.isAbsolute(localFilePath)) {
      throw new Error('Seanime audio extraction requires an absolute local-file path.');
    }
    const resolved = path.resolve(localFilePath);
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) throw new Error('Seanime audio source is not a file.');
    return extractAudioPcm(resolved);
  });
  ipcMain.handle(SEANIME_CHANNELS.probe, async () => {
    try {
      return { ok: true as const, result: await probeSeanime() };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });
  // Phase 6. Returns the projection, never throws across IPC: a stopped sidecar has to
  // reach the renderer as an explicit reason, because an empty list is indistinguishable
  // from an empty library (the Phase-1 lifecycle rule).
  ipcMain.handle(SEANIME_CHANNELS.studyLibrary, async () => {
    try {
      return { ok: true as const, files: await readSeanimeStudyLibrary() };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });

  if (SEANIME_SIDECAR_ENABLED) {
    onSeanimeStatus((s) => {
      for (const wc of webContents.getAllWebContents()) {
        if (!wc.isDestroyed()) wc.send(SEANIME_CHANNELS.statusEvent, s);
      }
    });
  }
}

export { stopSeanime };
