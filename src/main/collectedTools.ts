// Collected-tools main-process store. Mirrors the userData-JSON atomic-write
// pattern from src/main/immersion/index.ts. IPC: tools:list / add / remove /
// update. Adds dedupe by normalized URL so saving the same page twice is a no-op.

import fs from 'node:fs';
import path from 'node:path';
import { app, ipcMain } from 'electron';
import {
  emptyCollectedToolsStore,
  normalizeToolUrl,
  type CollectToolInput,
  type CollectedTool,
  type CollectedToolsStore,
  type UpdateToolInput,
} from '../shared/collectedTools';

function storePath(): string {
  return path.join(app.getPath('userData'), 'collected-tools.json');
}

function atomicWrite(file: string, data: string): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, data, 'utf-8');
  fs.renameSync(tmp, file);
}

function sanitizeTool(raw: unknown): CollectedTool | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.url !== 'string' || !normalizeToolUrl(o.url)) return null;
  return {
    id: typeof o.id === 'string' ? o.id : crypto.randomUUID(),
    url: o.url,
    name: typeof o.name === 'string' && o.name.trim() ? o.name.trim() : o.url,
    note: typeof o.note === 'string' ? o.note : undefined,
    tags: Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string') : undefined,
    favicon: typeof o.favicon === 'string' ? o.favicon : undefined,
    addedAt: typeof o.addedAt === 'number' ? o.addedAt : Date.now(),
    source: o.source === 'extension' ? 'extension' : 'app',
  };
}

function load(): CollectedToolsStore {
  try {
    const file = storePath();
    if (!fs.existsSync(file)) return emptyCollectedToolsStore();
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown;
    if (!raw || typeof raw !== 'object') return emptyCollectedToolsStore();
    const tools = Array.isArray((raw as { tools?: unknown }).tools)
      ? ((raw as { tools: unknown[] }).tools.map(sanitizeTool).filter(Boolean) as CollectedTool[])
      : [];
    return { version: 1, tools };
  } catch {
    return emptyCollectedToolsStore();
  }
}

function save(store: CollectedToolsStore): void {
  atomicWrite(storePath(), JSON.stringify(store, null, 2));
}

function addTool(input: CollectToolInput): { tool: CollectedTool; duplicate: boolean } {
  const key = normalizeToolUrl(input.url);
  if (!key) throw new Error('Invalid URL');
  const store = load();
  const existing = store.tools.find((t) => normalizeToolUrl(t.url) === key);
  if (existing) return { tool: existing, duplicate: true };
  const tool: CollectedTool = {
    id: crypto.randomUUID(),
    url: input.url.trim(),
    name: input.name?.trim() || input.url.trim(),
    note: input.note?.trim() || undefined,
    tags: input.tags,
    favicon: input.favicon,
    addedAt: Date.now(),
    source: input.source === 'extension' ? 'extension' : 'app',
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
  save(store);
  return tool;
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
}
