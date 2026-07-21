import { app, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { importEpubBufferToLibrary, itemDir } from './library';
import {
  DEFAULT_JITEN_DOWNLOAD_OPTIONS,
  buildSourceLinks,
  createEmptyJitenStore,
  jitenDeckToPlanEntry,
  normalizeJitenApiBase,
  sanitizeJitenDeck,
  sanitizePlanEntries,
  sanitizeSourceProfiles,
  type JitenConfig,
  type JitenDeck,
  type JitenDeckDownloadOptions,
  type JitenDeckStats,
  type JitenImportDirectRequest,
  type JitenImportDirectResult,
  type JitenMediaType,
  type JitenPlanEntry,
  type JitenSearchRequest,
  type JitenSearchResult,
  type JitenSourceProfile,
  type JitenStore,
} from '../shared/jiten';

const MAX_EPUB_BYTES = 100 * 1024 * 1024;
const MAX_COVER_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;
const COVER_EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function storePath(): string {
  return path.join(app.getPath('userData'), 'jiten.json');
}

function atomicWrite(file: string, data: string): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, data, 'utf-8');
  fs.renameSync(tmp, file);
}

function readStore(): JitenStore {
  try {
    const file = storePath();
    if (!fs.existsSync(file)) return createEmptyJitenStore();
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<JitenStore>;
    return {
      config: {
        apiBaseUrl: normalizeJitenApiBase(raw.config?.apiBaseUrl),
        apiKey: typeof raw.config?.apiKey === 'string' && raw.config.apiKey.trim()
          ? raw.config.apiKey.trim()
          : undefined,
      },
      sourceProfiles: sanitizeSourceProfiles(raw.sourceProfiles),
      plan: sanitizePlanEntries(raw.plan),
    };
  } catch {
    return createEmptyJitenStore();
  }
}

function writeStore(store: JitenStore): JitenStore {
  const safe: JitenStore = {
    config: {
      apiBaseUrl: normalizeJitenApiBase(store.config.apiBaseUrl),
      apiKey: store.config.apiKey?.trim() || undefined,
    },
    sourceProfiles: sanitizeSourceProfiles(store.sourceProfiles),
    plan: sanitizePlanEntries(store.plan),
  };
  atomicWrite(storePath(), JSON.stringify(safe, null, 2));
  return safe;
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function endpoint(store: JitenStore, route: string, params?: Record<string, string | number | boolean | undefined>): string {
  const base = normalizeJitenApiBase(store.config.apiBaseUrl).replace(/\/+$/, '');
  const url = new URL(`${base}/${route.replace(/^\/+/, '')}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  let lastError: unknown;
  // "fetch failed" is undici's generic wrapper around transient DNS/socket
  // errors, so retry once before giving up.
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: ctl.signal });
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (/abort/i.test(message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 750));
    } finally {
      clearTimeout(timer);
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  if (/fetch failed/i.test(message)) {
    let host = '';
    try {
      host = new URL(url).host;
    } catch {
      /* keep generic message */
    }
    throw new Error(`Could not reach ${host || 'the server'} (network error). Check your internet connection and try again.`);
  }
  throw new Error(message);
}

function authHeaders(store: JitenStore, accept = 'application/json'): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept,
    'User-Agent': 'jp-study-app/1.0 (Jiten bridge)',
  };
  if (store.config.apiKey) headers['X-Api-Key'] = store.config.apiKey;
  return headers;
}

async function fetchJitenJson(store: JitenStore, route: string, params?: Record<string, string | number | boolean | undefined>): Promise<unknown> {
  const res = await timedFetch(endpoint(store, route, params), {
    headers: authHeaders(store),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Jiten ${res.status}: ${res.statusText}`);
  return res.json() as Promise<unknown>;
}

function responseDecks(raw: unknown): { decks: JitenDeck[]; totalItems: number } {
  const root = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rows = Array.isArray(root.data)
    ? root.data
    : Array.isArray(root.suggestions)
      ? root.suggestions
      : Array.isArray(raw)
        ? raw
        : [];
  return {
    decks: rows.map(sanitizeJitenDeck).filter((deck): deck is JitenDeck => deck !== null),
    totalItems: typeof root.totalItems === 'number'
      ? root.totalItems
      : typeof root.totalCount === 'number'
        ? root.totalCount
        : rows.length,
  };
}

async function searchDecks(req: JitenSearchRequest): Promise<JitenSearchResult> {
  const store = readStore();
  const mediaTypes = req.mediaTypes?.length ? req.mediaTypes : ([4, 8] as JitenMediaType[]);
  const sortOrder = req.sortOrder === 'desc' ? 1 : 0;
  const all: JitenDeck[] = [];
  let totalItems = 0;
  for (const mediaType of mediaTypes) {
    const raw = await fetchJitenJson(store, 'media-deck/get-media-decks', {
      offset: req.offset ?? 0,
      mediaType,
      titleFilter: req.query?.trim(),
      sortBy: req.sortBy ?? 'difficulty',
      sortOrder,
      difficultyMin: req.difficultyMin,
      difficultyMax: req.difficultyMax,
      genres: req.genres?.join(','),
    });
    const parsed = responseDecks(raw);
    all.push(...parsed.decks);
    totalItems += parsed.totalItems;
  }
  return { decks: all.slice(0, Math.max(1, Math.min(req.limit ?? 100, 150))), totalItems };
}

async function getDeckDetail(deckId: number): Promise<JitenDeck | null> {
  const store = readStore();
  const raw = await fetchJitenJson(store, `media-deck/${deckId}/detail`);
  const root = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const data = root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : root;
  return sanitizeJitenDeck(data.mainDeck ?? data);
}

async function getDeckStats(deckId: number): Promise<JitenDeckStats | null> {
  const store = readStore();
  const raw = await fetchJitenJson(store, `media-deck/${deckId}/stats`);
  const root = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const data = root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : root;
  return data as JitenDeckStats;
}

function upsertPlan(entry: JitenPlanEntry): JitenStore {
  const store = readStore();
  const now = Date.now();
  const next = { ...entry, updatedAt: now, createdAt: entry.createdAt || now };
  const index = store.plan.findIndex((item) => item.id === next.id);
  if (index >= 0) store.plan[index] = next;
  else store.plan.unshift(next);
  return writeStore(store);
}

function removePlan(id: string): JitenStore {
  const store = readStore();
  store.plan = store.plan.filter((entry) => entry.id !== id);
  return writeStore(store);
}

function updatePlanPatch(id: string, patch: Partial<JitenPlanEntry>): JitenStore {
  const store = readStore();
  store.plan = store.plan.map((entry) => (
    entry.id === id ? { ...entry, ...patch, id, updatedAt: Date.now() } : entry
  ));
  return writeStore(store);
}

function contentDispositionFilename(header: string | null): string | undefined {
  if (!header) return undefined;
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(header);
  return match ? decodeURIComponent(match[1].replace(/"$/, '').trim()) : undefined;
}

function assertValidEpub(buffer: Buffer): void {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw new Error('The downloaded file is not a valid EPUB zip.');
  }
  const mimetype = zip.getEntry('mimetype')?.getData().toString('utf-8').trim();
  const hasOpf = zip.getEntries().some((entry) => /\.opf$/i.test(entry.entryName));
  if (mimetype !== 'application/epub+zip' && !hasOpf) {
    throw new Error('The downloaded file does not look like an EPUB.');
  }
}

async function importDirectEpub(input: JitenImportDirectRequest): Promise<JitenImportDirectResult> {
  const url = String(input?.url ?? '').trim();
  const title = String(input?.title ?? '').trim() || 'Imported EPUB';
  if (!isHttpUrl(url)) return { ok: false, error: 'Enter a full http(s):// EPUB URL.' };

  try {
    const res = await timedFetch(url, {
      headers: {
        'User-Agent': 'jp-study-app/1.0 (EPUB import)',
        Accept: 'application/epub+zip,application/zip,application/octet-stream,*/*',
      },
      redirect: 'follow',
    });
    if (!res.ok) return { ok: false, error: `${res.status} ${res.statusText}` };
    const length = Number(res.headers.get('content-length') ?? 0);
    if (length > MAX_EPUB_BYTES) return { ok: false, error: 'That EPUB is larger than the 100 MB safety limit.' };
    const contentType = res.headers.get('content-type') ?? '';
    const finalUrl = res.url || url;
    const filename = contentDispositionFilename(res.headers.get('content-disposition')) ?? new URL(finalUrl).pathname;
    const looksLikeEpub =
      /\.epub(?:$|[?#])/i.test(finalUrl) ||
      /\.epub$/i.test(filename) ||
      /epub|zip|octet-stream/i.test(contentType) ||
      !contentType;
    if (!looksLikeEpub) {
      return { ok: false, error: `That download is not an EPUB (${contentType.split(';')[0] || 'unknown type'}).` };
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_EPUB_BYTES) return { ok: false, error: 'That EPUB is larger than the 100 MB safety limit.' };
    assertValidEpub(buffer);
    const item = importEpubBufferToLibrary({ title, sourcePath: finalUrl, buffer });
    let store = readStore();
    if (input.planId) {
      store = updatePlanPatch(input.planId, {
        importedLibraryItemId: item.id,
        acquisitionStatus: 'imported',
        error: undefined,
      });
    }
    return { ok: true, item, store };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    let store: JitenStore | undefined;
    if (input.planId) {
      store = updatePlanPatch(input.planId, { acquisitionStatus: 'error', error: message });
    }
    return { ok: false, error: /abort/i.test(message) ? 'The EPUB download timed out.' : message, store };
  }
}

async function downloadDeck(deckId: number, options?: Partial<JitenDeckDownloadOptions>): Promise<{
  ok: boolean;
  content?: string;
  contentType?: string;
  filename?: string;
  error?: string;
}> {
  const store = readStore();
  const body = { ...DEFAULT_JITEN_DOWNLOAD_OPTIONS, ...(options ?? {}) };
  try {
    const res = await timedFetch(endpoint(store, `media-deck/${deckId}/download`), {
      method: 'POST',
      headers: {
        ...authHeaders(store, 'text/csv,text/plain,application/json,*/*'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      redirect: 'follow',
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: text || `${res.status} ${res.statusText}` };
    return {
      ok: true,
      content: text,
      contentType: res.headers.get('content-type') ?? undefined,
      filename: contentDispositionFilename(res.headers.get('content-disposition')),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: /abort/i.test(message) ? 'Jiten deck download timed out.' : message };
  }
}

/**
 * Download a Jiten deck's remote cover once and cache it under the same
 * itemDir(id)/media:// convention the Library already uses for EPUB covers
 * (see extractEpubCover in library.ts) — the production CSP's img-src has no
 * https: entry (main.ts, registerContentSecurityPolicy), so a raw remote URL
 * can't be rendered directly; this keeps that boundary intact.
 */
async function cacheDeckCover(
  planId: string,
  deckId: number,
  coverUrl: string,
): Promise<{ ok: boolean; relPath?: string; error?: string }> {
  if (!isHttpUrl(coverUrl)) return { ok: false, error: 'Not an http(s) cover URL.' };
  try {
    const res = await timedFetch(coverUrl, {
      headers: { 'User-Agent': 'jp-study-app/1.0 (cover fetch)', Accept: 'image/*' },
      redirect: 'follow',
    });
    if (!res.ok) return { ok: false, error: `${res.status} ${res.statusText}` };
    const length = Number(res.headers.get('content-length') ?? 0);
    if (length > MAX_COVER_BYTES) return { ok: false, error: 'Cover image is larger than the safety limit.' };
    const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const ext = COVER_EXT_BY_MIME[contentType];
    if (!ext) return { ok: false, error: `Unsupported cover image type (${contentType || 'unknown'}).` };
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_COVER_BYTES) return { ok: false, error: 'Cover image is larger than the safety limit.' };
    const dir = itemDir(`jiten-${deckId}`);
    fs.mkdirSync(dir, { recursive: true });
    const relPath = `cover${ext}`;
    fs.writeFileSync(path.join(dir, relPath), buffer);
    updatePlanPatch(planId, { coverCachePath: relPath });
    return { ok: true, relPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: /abort/i.test(message) ? 'Cover download timed out.' : message };
  }
}

function planFromDeck(deck: JitenDeck): JitenPlanEntry {
  const store = readStore();
  const existing = store.plan.find((entry) => entry.jitenDeckId === deck.deckId || entry.id === `jiten-${deck.deckId}`);
  const links = buildSourceLinks(deck, store.sourceProfiles, deck.links);
  return jitenDeckToPlanEntry(deck, links, existing);
}

export function registerJitenIpc(): void {
  ipcMain.handle('jiten:getStore', () => readStore());
  ipcMain.handle('jiten:updateConfig', (_event, patch: Partial<JitenConfig>) => {
    const store = readStore();
    store.config = {
      apiBaseUrl: normalizeJitenApiBase(patch.apiBaseUrl ?? store.config.apiBaseUrl),
      apiKey: patch.apiKey !== undefined ? patch.apiKey?.trim() || undefined : store.config.apiKey,
    };
    return writeStore(store);
  });
  ipcMain.handle('jiten:setSourceProfiles', (_event, profiles: JitenSourceProfile[]) => {
    const store = readStore();
    store.sourceProfiles = sanitizeSourceProfiles(profiles);
    return writeStore(store);
  });
  ipcMain.handle('jiten:searchDecks', (_event, req: JitenSearchRequest) => searchDecks(req ?? {}));
  ipcMain.handle('jiten:getDeckDetail', (_event, deckId: number) => getDeckDetail(Number(deckId)));
  ipcMain.handle('jiten:getDeckStats', (_event, deckId: number) => getDeckStats(Number(deckId)));
  ipcMain.handle('jiten:planFromDeck', (_event, raw: JitenDeck) => {
    const deck = sanitizeJitenDeck(raw);
    return deck ? planFromDeck(deck) : null;
  });
  ipcMain.handle('jiten:upsertPlan', (_event, entry: JitenPlanEntry) => upsertPlan(entry));
  ipcMain.handle('jiten:updatePlan', (_event, id: string, patch: Partial<JitenPlanEntry>) => updatePlanPatch(id, patch));
  ipcMain.handle('jiten:removePlan', (_event, id: string) => removePlan(id));
  ipcMain.handle('jiten:importDirectEpub', (_event, input: JitenImportDirectRequest) => importDirectEpub(input));
  ipcMain.handle('jiten:downloadDeck', (_event, deckId: number, options?: Partial<JitenDeckDownloadOptions>) =>
    downloadDeck(Number(deckId), options),
  );
  ipcMain.handle('jiten:cacheCover', (_event, planId: string, deckId: number, coverUrl: string) =>
    cacheDeckCover(String(planId), Number(deckId), String(coverUrl ?? '')),
  );
}
