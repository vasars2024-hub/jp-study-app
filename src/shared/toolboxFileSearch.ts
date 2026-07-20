export interface ToolboxFileSearchRequest {
  root: string;
  query: string;
  extensions?: string[];
  maxResults?: number;
  maxScanned?: number;
}

export interface ToolboxFileSearchResult {
  name: string;
  path: string;
  ext: string;
  size: number;
  modifiedMs: number;
  isDirectory: boolean;
}

export interface ToolboxFileSearchResponse {
  ok: boolean;
  root?: string;
  results?: ToolboxFileSearchResult[];
  scanned?: number;
  truncated?: boolean;
  error?: string;
}

export function normalizeToolboxExtensions(input?: string[]): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((value) => value.trim().toLowerCase().replace(/^\./, ''))
        .filter((value) => /^[a-z0-9]{1,12}$/.test(value)),
    ),
  ).slice(0, 12);
}

export function sanitizeToolboxFileSearchRequest(
  input: ToolboxFileSearchRequest,
): ToolboxFileSearchRequest {
  const query = String(input.query ?? '').trim().slice(0, 120);
  return {
    root: String(input.root ?? ''),
    query,
    extensions: normalizeToolboxExtensions(input.extensions),
    maxResults: Math.min(500, Math.max(1, Math.round(Number(input.maxResults) || 100))),
    maxScanned: Math.min(100_000, Math.max(100, Math.round(Number(input.maxScanned) || 20_000))),
  };
}
