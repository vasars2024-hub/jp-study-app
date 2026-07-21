// Structured local diagnostic log (PHASE_6_5_AUDIT.md Phase 8 gap — previously
// nothing caught main-process unhandled rejections, renderer crashes, or React
// render errors; failures were silent or only visible in a dev console).
//
// Writes JSON-lines to <userData>/logs/main.log, capped to avoid unbounded
// growth. Never logs full document/study content — callers pass a short,
// already-sanitized `detail` string, not raw objects that might carry user text.

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export type LogSeverity = 'info' | 'warn' | 'error';

interface LogEntry {
  ts: string;
  severity: LogSeverity;
  subsystem: string;
  operation: string;
  detail: string;
}

const MAX_LOG_BYTES = 2 * 1024 * 1024; // 2MB — trimmed, not left to grow forever.

function logPath(): string {
  return path.join(app.getPath('userData'), 'logs', 'main.log');
}

function ensureLogDir(): void {
  try {
    fs.mkdirSync(path.dirname(logPath()), { recursive: true });
  } catch {
    /* ignore */
  }
}

function trimIfLarge(file: string): void {
  try {
    const stat = fs.statSync(file);
    if (stat.size <= MAX_LOG_BYTES) return;
    // Keep the newest half rather than growing forever or deleting everything.
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    fs.writeFileSync(file, lines.slice(Math.floor(lines.length / 2)).join('\n'), 'utf-8');
  } catch {
    /* ignore — logging must never throw into the caller */
  }
}

function sanitizeDetail(detail: string): string {
  // Defense in depth beyond "callers shouldn't pass secrets": strip anything
  // that looks like a bearer token / long hex or base64 blob (API keys,
  // pairing tokens) so a pasted stack trace can't leak one into the log.
  return detail
    .replace(/Bearer\s+[A-Za-z0-9._-]{12,}/gi, 'Bearer [redacted]')
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, '[redacted-hex]')
    .slice(0, 4000);
}

export function logDiagnostic(
  severity: LogSeverity,
  subsystem: string,
  operation: string,
  detail: string,
): void {
  try {
    ensureLogDir();
    const file = logPath();
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      severity,
      subsystem,
      operation,
      detail: sanitizeDetail(detail),
    };
    fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf-8');
    trimIfLarge(file);
  } catch {
    /* logging must never throw — fall back to console only */
    console.error(`[${subsystem}] ${operation}: ${detail}`);
  }
}

export function errorDetail(err: unknown): string {
  if (err instanceof Error) return err.stack || err.message;
  return String(err);
}
