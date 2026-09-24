// Collected-tools main-process store. Mirrors the userData-JSON atomic-write
// pattern from src/main/immersion/index.ts. IPC: tools:list / add / remove /
// update / addFolder / renameFolder / removeFolder / moveItem. Adds dedupe by
// normalized target so saving the same page (or app, or tool shortcut) twice
// is a no-op.
//
// This store also backs Blanc's App Drawer (Pillar 3) — `kind`/`folderId` on
// CollectedTool and the `folders` array are additive, so this file stays the
// single source of truth for "shortcuts the user saved" rather than growing a
// second, parallel store (BLANC_REFINEMENT_PLAN.md, Pillar 3).

import path from 'node:path';
import { app, ipcMain } from 'electron';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import {
  emptyCollectedToolsStore,
  normalizeToolTarget,
  type CollectToolInput,
  type CollectedFolder,
  type CollectedTool,
  type CollectedToolKind,
  type CollectedToolsStore,
  type UpdateToolInput,
} from '../shared/collectedTools';

function storePath(): string {
  return path.join(app.getPath('userData'), 'collected-tools.json');
}

function sanitizeKind(value: unknown): CollectedToolKind {
  return value === 'app' || value === 'file' || value === 'tool' ? value : 'link';
}

function sanitizeTool(raw: unknown, folderIds: Set<string>): CollectedTool | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const kind = sanitizeKind(o.kind);
  if (typeof o.url !== 'string' || !normalizeToolTarget(kind, o.url)) return null;
  const folderId = typeof o.folderId === 'string' && folderIds.has(o.folderId) ? o.folderId : null;
  return {
    id: typeof o.id === 'string' ? o.id : crypto.randomUUID(),
    url: o.url,
    name: typeof o.name === 'string' && o.name.trim() ? o.name.trim() : o.url,
    note: typeof o.note === 'string' ? o.note : undefined,
    tags: Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string') : undefined,
    favicon: typeof o.favicon === 'string' ? o.favicon : undefined,
    addedAt: typeof o.addedAt === 'number' ? o.addedAt : Date.now(),
    source: o.source === 'extension' ? 'extension' : 'app',
    kind,
    folderId,
  };
}

/** Enforces one level of nesting: a folder whose own parent is non-null can
 * never itself be a parent — any attempt is flattened onto the root. */
function sanitizeFolders(raw: unknown): CollectedFolder[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<string, { id: string; name: string; parentFolderId: string | null; order: number }>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const o = entry as Record<string, unknown>;
    if (typeof o.id !== 'string' || !o.id) continue;
    if (typeof o.name !== 'string' || !o.name.trim()) continue;
    byId.set(o.id, {
      id: o.id,
      name: o.name.trim(),
      parentFolderId: typeof o.parentFolderId === 'string' ? o.parentFolderId : null,
      order: typeof o.order === 'number' ? o.order : 0,
    });
  }
  for (const folder of byId.values()) {
    if (!folder.parentFolderId) continue;
    const parent = byId.get(folder.parentFolderId);
    // Unknown parent, self-parent, or a parent that is itself a subfolder —
    // all flatten to root rather than nesting two levels deep.
    if (!parent || parent.id === folder.id || parent.parentFolderId) folder.parentFolderId = null;
  }
  return [...byId.values()];
}

function load(): CollectedToolsStore {
  try {
    const raw = readJsonSync<unknown>(storePath(), null, { validate: (v) => !!v && typeof v === 'object' });
    if (!raw || typeof raw !== 'object') return emptyCollectedToolsStore();
    const folders = sanitizeFolders((raw as { folders?: unknown }).folders);
    const folderIds = new Set(folders.map((f) => f.id));
    const tools = Array.isArray((raw as { tools?: unknown }).tools)
      ? ((raw as { tools: unknown[] }).tools
          .map((t) => sanitizeTool(t, folderIds))
          .filter(Boolean) as CollectedTool[])
      : [];
    return { version: 1, tools, folders };
  } catch {
    return emptyCollectedToolsStore();
  }
}

function save(store: CollectedToolsStore): void {
  writeJsonAtomicSync(storePath(), store);
}

function addTool(input: CollectToolInput): { tool: CollectedTool; duplicate: boolean } {
  const kind = sanitizeKind(input.kind);
  const key = normalizeToolTarget(kind, input.url);
  if (!key) throw new Error(kind === 'link' ? 'Invalid URL' : 'Invalid target');
  const store = load();
  const existing = store.tools.find(
    (t) => t.kind === kind && normalizeToolTarget(t.kind, t.url) === key,
  );
  if (existing) return { tool: existing, duplicate: true };
  const folderId =
    typeof input.folderId === 'string' && store.folders.some((f) => f.id === input.folderId)
      ? input.folderId
      : null;
  const tool: CollectedTool = {
    id: crypto.randomUUID(),
    url: input.url.trim(),
    name: input.name?.trim() || input.url.trim(),
    note: input.note?.trim() || undefined,
    tags: input.tags,
    favicon: input.favicon,
    addedAt: Date.now(),
    source: input.source === 'extension' ? 'extension' : 'app',
    kind,
    folderId,
  };
  store.tools.unshift(tool);
  save(store);
  return { tool, duplicate: false };
}

function removeTool(id: string): CollectedToolsStore {
  const store = load();
  store.tools = store.tools.filter((t) => t.id !== id);
  save(store);
  return store;
}

function updateTool(id: string, patch: UpdateToolInput): CollectedTool | null {
  const store = load();
  const tool = store.tools.find((t) => t.id === id);
  if (!tool) return null;
  if (typeof patch.name === 'string') tool.name = patch.name.trim() || tool.name;
  if (typeof patch.note === 'string') tool.note = patch.note.trim() || undefined;
  if (Array.isArray(patch.tags)) tool.tags = patch.tags.filter((t) => typeof t === 'string');
  if (patch.folderId !== undefined) {
    tool.folderId = patch.folderId && store.folders.some((f) => f.id === patch.folderId) ? patch.folderId : null;
  }
  save(store);
  return tool;
}

function moveItem(id: string, folderId: string | null): CollectedTool | null {
  return updateTool(id, { folderId });
}

function addFolder(name: string, parentFolderId: string | null): CollectedFolder {
  const store = load();
  const trimmed = name.trim() || 'New folder';
  const parent = parentFolderId ? store.folders.find((f) => f.id === parentFolderId) : null;
  // Nesting is capped at one level — a folder inside a folder cannot itself
  // hold subfolders, so an attempt to parent under a non-root folder is
  // silently flattened to the root instead of rejected outright.
  const resolvedParent = parent && !parent.parentFolderId ? parent.id : null;
  const order = store.folders.filter((f) => f.parentFolderId === resolvedParent).length;
  const folder: CollectedFolder = { id: crypto.randomUUID(), name: trimmed, parentFolderId: resolvedParent, order };
  store.folders.push(folder);
  save(store);
  return folder;
}

function renameFolder(id: string, name: string): CollectedFolder | null {
  const store = load();
  const folder = store.folders.find((f) => f.id === id);
  if (!folder) return null;
  folder.name = name.trim() || folder.name;
  save(store);
  return folder;
}

/** Non-destructive: items and subfolders inside the removed folder move to
 * the root rather than being deleted along with it. */
function removeFolder(id: string): CollectedToolsStore {
  const store = load();
  store.folders = store.folders.filter((f) => f.id !== id);
  for (const folder of store.folders) {
    if (folder.parentFolderId === id) folder.parentFolderId = null;
  }
  for (const tool of store.tools) {
    if (tool.folderId === id) tool.folderId = null;
  }
  save(store);
  return store;
}

export function registerCollectedToolsIpc(): void {
  ipcMain.handle('tools:list', async () => load());

  ipcMain.handle('tools:add', async (_e, input: CollectToolInput) => {
    try {
      const { tool, duplicate } = addTool(input);
      return { ok: true as const, tool, duplicate };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('tools:remove', async (_e, id: string) => {
    if (typeof id !== 'string') return { ok: false as const, error: 'Invalid id' };
    return { ok: true as const, store: removeTool(id) };
  });

  ipcMain.handle('tools:update', async (_e, id: string, patch: UpdateToolInput) => {
    if (typeof id !== 'string') return { ok: false as const, error: 'Invalid id' };
    const tool = updateTool(id, patch ?? {});
    return tool ? { ok: true as const, tool } : { ok: false as const, error: 'Not found' };
  });

  ipcMain.handle('tools:moveItem', async (_e, id: string, folderId: string | null) => {
    if (typeof id !== 'string') return { ok: false as const, error: 'Invalid id' };
    const tool = moveItem(id, folderId ?? null);
    return tool ? { ok: true as const, tool } : { ok: false as const, error: 'Not found' };
  });

  ipcMain.handle('tools:addFolder', async (_e, name: string, parentFolderId?: string | null) => {
    if (typeof name !== 'string' || !name.trim()) return { ok: false as const, error: 'Invalid name' };
    return { ok: true as const, folder: addFolder(name, parentFolderId ?? null) };
  });

  ipcMain.handle('tools:renameFolder', async (_e, id: string, name: string) => {
    if (typeof id !== 'string' || typeof name !== 'string' || !name.trim()) {
      return { ok: false as const, error: 'Invalid input' };
    }
    const folder = renameFolder(id, name);
    return folder ? { ok: true as const, folder } : { ok: false as const, error: 'Not found' };
  });

  ipcMain.handle('tools:removeFolder', async (_e, id: string) => {
    if (typeof id !== 'string') return { ok: false as const, error: 'Invalid id' };
    return { ok: true as const, store: removeFolder(id) };
  });
}
