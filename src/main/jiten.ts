import { app, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { importEpubBufferToLibrary, itemDir } from './library';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
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
import {
  clearSecret as clearVaultSecret,
  readSecret as readVaultSecret,
  writeSecret as writeVaultSecret,
} from './credentials/vault';

/** This module's id in `shared/credentialRegistry.ts`. */
const JITEN_CREDENTIAL_ID = 'jiten';

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

/**
 * Moves a plaintext `apiKey` out of `jiten.json` and into the credentials vault.
 *
 * This key was the app's one secret stored in readable JSON
 * (PROFESSIONAL_DICTIONARY_PLAN.md §0.1). It now lives in
 * `main/credentials/vault.ts`; this runs the one-way move the first time an old
 * store is read, and is a no-op on every read after that.
 *
 * Two deliberate details:
 *
 *   - **The plaintext is removed only once the vault write succeeded.** The
 *     vault refuses to store anything on a machine whose OS cannot encrypt, and
 *     deleting the key after a refusal would destroy it with nowhere to put it.
 *     On such a machine the file is left exactly as it was and the app keeps
 *     working as before — no worse than today, and no silent data loss.
 *   - **The field is stripped, not the file, and nothing else is touched.**
 *     `jiten.json` also carries the user's source profiles and reading plan.
 *     Unlinking it would take those with it, and re-normalizing them through
 *     `sanitizePlanEntries` on a *read* would drop any entry that fails
 *     validation earlier than the app otherwise would. So the rest of the
 *     document is written back exactly as it was found: this migration removes
 *     one field and has no other opinion.
 *
 * @returns the key to use for this session regardless of the outcome.
 */
function migrateLegacyApiKey(raw: Partial<JitenStore>, legacy: string): string {
  if (!legacy) return '';
  if (!writeVaultSecret(JITEN_CREDENTIAL_ID, 'apiKey', legacy).ok) return legacy;
  const config = { ...(raw.config ?? {}) } as Partial<JitenStore['config']>;
  delete config.apiKey;
  try {
    // No `.bak`: the copy it would keep is the plaintext key being removed.
    writeJsonAtomicSync(storePath(), { ...raw, config }, { backup: false });
  } catch {
    // The vault holds the key now. A failed rewrite leaves a stale plaintext
    // copy that the next successful read strips, so this is not worth throwing
    // over — but it must not report success either.
  }
  return legacy;
}

function readStore(): JitenStore {
  const empty = createEmptyJitenStore();
  try {
    const raw = readJsonSync<Partial<JitenStore>>(storePath(), {}, {
      validate: (v) => v !== null && typeof v === 'object',
    });
    const legacy = typeof raw.config?.apiKey === 'string' ? raw.config.apiKey.trim() : '';
    // Vault first: after migration it is the only copy that exists.
    const apiKey = readVaultSecret(JITEN_CREDENTIAL_ID) || migrateLegacyApiKey(raw, legacy);
    return {
      config: {
        apiBaseUrl: normalizeJitenApiBase(raw.config?.apiBaseUrl),
        apiKey: apiKey || undefined,
      },
      sourceProfiles: sanitizeSourceProfiles(raw.sourceProfiles),
      plan: sanitizePlanEntries(raw.plan),
    };
  } catch {
    return empty;
  }
}

/**
 * Persists everything except the key — that is the vault's job now, and writing
 * it here is what made the file a plaintext secret store in the first place.
 */
function writeStore(store: JitenStore): JitenStore {
  const safe: JitenStore = {
    config: { apiBaseUrl: normalizeJitenApiBase(store.config.apiBaseUrl) },
    sourceProfiles: sanitizeSourceProfiles(store.sourceProfiles),
    plan: sanitizePlanEntries(store.plan),
  };
  writeJsonAtomicSync(storePath(), safe);
  // Returned in memory so the caller's next request can still authenticate;
  // `forRenderer` strips it again at the IPC boundary.
  const apiKey = readVaultSecret(JITEN_CREDENTIAL_ID);
  return { ...safe, config: { ...safe.config, apiKey: apiKey || undefined } };
}

/**
 * What the renderer is allowed to see. The key is never part of it — the
 * settings page learns only whether one is configured, from the vault's own
 * status channel.
 */
function forRenderer(store: JitenStore): JitenStore {
  return { ...store, config: { apiBaseUrl: store.config.apiBaseUrl } };
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
  ipcMain.handle('jiten:getStore', () => forRenderer(readStore()));
  /**
   * `apiKey` semantics changed with the vault, because the renderer can no
   * longer read the key back to re-send it:
   *
   *   omitted / ''  → leave the stored key alone (what the Novels panel sends
   *                   after a refresh, which previously wiped the key)
   *   a string      → store it
   *   null          → remove it
   */
  ipcMain.handle(
    'jiten:updateConfig',
    (_event, patch: Partial<JitenConfig> & { apiKey?: string | null }) => {
      const store = readStore();
      if (patch.apiKey === null) clearVaultSecret(JITEN_CREDENTIAL_ID);
      else if (typeof patch.apiKey === 'string' && patch.apiKey.trim()) {
        writeVaultSecret(JITEN_CREDENTIAL_ID, 'apiKey', patch.apiKey.trim());
      }
      store.config = { apiBaseUrl: normalizeJitenApiBase(patch.apiBaseUrl ?? store.config.apiBaseUrl) };
      return forRenderer(writeStore(store));
    },
  );
  ipcMain.handle('jiten:setSourceProfiles', (_event, profiles: JitenSourceProfile[]) => {
    const store = readStore();
    store.sourceProfiles = sanitizeSourceProfiles(profiles);
    return forRenderer(writeStore(store));
  });
  ipcMain.handle('jiten:searchDecks', (_event, req: JitenSearchRequest) => searchDecks(req ?? {}));
  ipcMain.handle('jiten:getDeckDetail', (_event, deckId: number) => getDeckDetail(Number(deckId)));
  ipcMain.handle('jiten:getDeckStats', (_event, deckId: number) => getDeckStats(Number(deckId)));
  ipcMain.handle('jiten:planFromDeck', (_event, raw: JitenDeck) => {
    const deck = sanitizeJitenDeck(raw);
    return deck ? planFromDeck(deck) : null;
  });
  ipcMain.handle('jiten:upsertPlan', (_event, entry: JitenPlanEntry) => forRenderer(upsertPlan(entry)));
  ipcMain.handle('jiten:updatePlan', (_event, id: string, patch: Partial<JitenPlanEntry>) =>
    forRenderer(updatePlanPatch(id, patch)),
  );
  ipcMain.handle('jiten:removePlan', (_event, id: string) => forRenderer(removePlan(id)));
  ipcMain.handle('jiten:importDirectEpub', async (_event, input: JitenImportDirectRequest) => {
    const result = await importDirectEpub(input);
    return result.store ? { ...result, store: forRenderer(result.store) } : result;
  });
  ipcMain.handle('jiten:downloadDeck', (_event, deckId: number, options?: Partial<JitenDeckDownloadOptions>) =>
    downloadDeck(Number(deckId), options),
  );
  ipcMain.handle('jiten:cacheCover', (_event, planId: string, deckId: number, coverUrl: string) =>
    cacheDeckCover(String(planId), Number(deckId), String(coverUrl ?? '')),
  );
}
