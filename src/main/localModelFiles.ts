/**
 * Where local GGUF models live, and which file serves which job.
 *
 * `translate.ts` and `localAgent.ts` used to answer "is the offline model here"
 * with two different lists: translate accepted `Qwen3-1.7B.gguf` only in the app
 * models folder and only `*-Q4_K_M.gguf` names in Downloads, while the Agent
 * accepted every name in both — so the user-facing hint that said "put
 * Qwen3-1.7B.gguf in Downloads" was true for one of them and false for the
 * other. Both read this module now, and so does the installer's asset folder,
 * which neither of them knew about.
 *
 * Synchronous on purpose: every caller asks right before it would queue work,
 * and the direct checks are a dozen `stat`s. The directory scan behind
 * `listLocalModelFiles` is only for the model picker and for a hand-picked
 * file that is not in one of the direct places.
 */
import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_LOCAL_MODEL_ASSET_ID,
  QWEN3_1_7B_FILE_NAMES,
  installedFileNameFor,
  resolveLocalAgentModel,
  type LocalAgentModelMode,
  type LocalAgentModelRole,
} from '../shared/localAgentModels';
import type { LocalAgentModelInfo } from '../shared/localAgentRuntime';

/**
 * Thrown when a local model is needed and none is installed. A type rather than
 * a message, so every layer between here and the user can recognise it without
 * matching English — the Agent used to relabel this exact failure as "the
 * provider returned an unusable response".
 */
export class LocalModelMissingError extends Error {
  readonly code = 'local-model-missing' as const;

  constructor(message = 'No offline AI model is installed. Install one in Settings > AI.') {
    super(message);
    this.name = 'LocalModelMissingError';
  }
}

export function isLocalModelMissingError(error: unknown): error is LocalModelMissingError {
  return error instanceof LocalModelMissingError
    || (error instanceof Error && (error as { code?: unknown }).code === 'local-model-missing');
}

interface ModelRoot {
  directory: string;
  location: LocalAgentModelInfo['location'];
}

export function localModelsRoot(): string {
  return path.join(app.getPath('userData'), 'models');
}

/** The folders a model is looked for in, most specific first. */
export function localModelRoots(): ModelRoot[] {
  const models = localModelsRoot();
  return [
    { directory: models, location: 'app-models' },
    // Where the Settings > AI installer puts it (`userData/models/<installDir>/`).
    { directory: path.join(models, DEFAULT_LOCAL_MODEL_ASSET_ID), location: 'app-models' },
    { directory: path.join(os.homedir(), 'Downloads'), location: 'downloads' },
  ];
}

function isGgufName(name: string): boolean {
  return /^[^\\/]+\.gguf$/i.test(name) && !name.includes('..');
}

function isFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

export interface LocalModelFile extends LocalAgentModelInfo {
  path: string;
}

/**
 * Every `.gguf` in the model roots and one folder below them, de-duplicated by
 * name (the first root wins), for the model picker.
 */
export function listLocalModelFiles(): LocalModelFile[] {
  const found: LocalModelFile[] = [];
  const seenDirectories = new Set<string>();
  for (const { directory: root, location } of localModelRoots()) {
    // The asset folder is a root of its own AND a child of the models root.
    if (seenDirectories.has(root.toLocaleLowerCase())) continue;
    seenDirectories.add(root.toLocaleLowerCase());
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const directory = entry.isDirectory() ? path.join(root, entry.name) : root;
      if (entry.isDirectory()) {
        const key = directory.toLocaleLowerCase();
        if (seenDirectories.has(key)) continue;
        seenDirectories.add(key);
      }
      const names = entry.isDirectory()
        ? (() => { try { return fs.readdirSync(directory, { withFileTypes: true }); } catch { return []; } })()
        : [entry];
      for (const nested of names) {
        if (!nested.isFile() || !isGgufName(nested.name)) continue;
        const filePath = path.join(directory, nested.name);
        try {
          found.push({ fileName: nested.name, sizeBytes: fs.statSync(filePath).size, location, path: filePath });
        } catch { /* A model can disappear while the folder is being scanned. */ }
      }
    }
  }
  return found
    .filter((model, index, all) => all.findIndex((candidate) => (
      candidate.fileName.toLocaleLowerCase() === model.fileName.toLocaleLowerCase()
    )) === index)
    .sort((a, b) => a.fileName.localeCompare(b.fileName))
    .slice(0, 100);
}

/** A named file in the direct places first, then anywhere the picker could have seen it. */
export function findLocalModelFile(fileName: string): string | null {
  if (!isGgufName(fileName)) return null;
  for (const { directory } of localModelRoots()) {
    const candidate = path.join(directory, fileName);
    if (isFile(candidate)) return candidate;
  }
  const wanted = fileName.toLocaleLowerCase();
  return listLocalModelFiles().find((model) => model.fileName.toLocaleLowerCase() === wanted)?.path ?? null;
}

/**
 * The small Qwen3 model that translation, AI cards and analysis are tuned for.
 * Direct checks only — this is asked on every availability probe.
 */
export function resolveQwenSmallModelPath(): string | null {
  for (const { directory } of localModelRoots()) {
    for (const name of QWEN3_1_7B_FILE_NAMES) {
      const candidate = path.join(directory, name);
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * The model that should serve an Agent `role` (planning, or chatting as the
 * tutor), honouring the user's pick.
 *
 * A file the user chose explicitly is the answer even when the catalog does not
 * know it, and its absence is an absence — not a cue to run on some other model
 * the user did not choose. With no pick, `resolveLocalAgentModel` chooses per
 * role from what is installed.
 */
export function resolveLocalModelForRole(
  role: LocalAgentModelRole,
  mode: LocalAgentModelMode,
  preferredFileName?: string,
): string | null {
  const preferred = preferredFileName?.trim();
  if (preferred) return findLocalModelFile(preferred);
  const installed = listLocalModelFiles();
  const spec = resolveLocalAgentModel(role, mode, undefined, installed.map((model) => model.fileName));
  if (!spec) return null;
  const fileName = installedFileNameFor(spec, installed.map((model) => model.fileName));
  if (!fileName) return null;
  return installed.find((model) => model.fileName === fileName)?.path ?? null;
}

/** True when some installed model can serve `role`. Used by readiness probes. */
export function hasLocalModelForRole(
  role: LocalAgentModelRole,
  mode: LocalAgentModelMode,
  preferredFileName?: string,
): boolean {
  return resolveLocalModelForRole(role, mode, preferredFileName) !== null;
}
