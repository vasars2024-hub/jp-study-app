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

/**
 * Strips credential-shaped text out of a log line.
 *
 * Defense in depth beyond "callers shouldn't pass secrets": a pasted stack
 * trace, an HTTP error echoing its own request headers, or a JSON parse failure
 * quoting the document it choked on will all carry a key if nothing removes it.
 *
 * **This is the app's only redaction list. Extend it here.** Phase 0 (the
 * credentials vault, `main/credentials/vault.ts`) widened it to the shapes the
 * vault now holds; a second list next to a new credential is how one of them
 * silently stops being maintained.
 *
 * Order is deliberate: named forms run first so the replacement says what was
 * removed, and the two generic blob rules at the end are the backstop for
 * anything that arrives without a label.
 */
export function redactSecrets(detail: string): string {
  return (
    detail
      // Header forms — Authorization, and the two custom headers this app sends.
      .replace(/Bearer\s+[A-Za-z0-9._-]{12,}/gi, 'Bearer [redacted]')
      .replace(
        /\b(x-api-key|x-seanime-token|authorization)\b(\s*[:=]\s*)\S+/gi,
        '$1$2[redacted]',
      )
      // Field forms — `"apiKey":"…"`, `clientSecret=…`, `password: '…'`. Covers
      // both the JSON stores this replaces and query strings.
      .replace(
        /\b(api_?key|access_?token|refresh_?token|client_?secret|password|passwd|secret|token)\b(\s*["']?\s*[:=]\s*["']?)([^\s"',&}]{6,})/gi,
        '$1$2[redacted]',
      )
      // The vault's environment overrides (JPSTUDY_KEY_GEMINI=…, JP_STUDY_MAL_*).
      .replace(/\b(JP_?STUDY[A-Z0-9_]*)=\S+/g, '$1=[redacted]')
      // Provider-shaped keys, which turn up bare in "invalid API key" responses.
      .replace(/\bAIza[0-9A-Za-z_-]{20,}/g, '[redacted-key]')
      .replace(/\bsk-(?:ant-|or-)?[A-Za-z0-9_-]{16,}/g, '[redacted-key]')
      // Backstops: long hex (pairing tokens, OAuth tokens, the seanime password
      // hash) and long base64 (safeStorage ciphertext, if a store is ever dumped).
      .replace(/\b[A-Fa-f0-9]{32,}\b/g, '[redacted-hex]')
      // The three lookaheads require mixed case *and* a digit, which is what
      // separates a ciphertext blob from the two benign things that also reach
      // 40 base64-legal characters: a long filesystem path (no digits) and a
      // long run of one letter. Both were redacted by an earlier draft of this
      // rule, which is why the guard is this specific.
      .replace(
        /(?<![\w+/=\\.-])(?=[A-Za-z0-9+/]*[a-z])(?=[A-Za-z0-9+/]*[A-Z])(?=[A-Za-z0-9+/]*\d)[A-Za-z0-9+/]{40,}={0,2}(?![\w+/=])/g,
        '[redacted-blob]',
      )
      .slice(0, 4000)
  );
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
      detail: redactSecrets(detail),
    };
    fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf-8');
    trimIfLarge(file);
  } catch {
    /* logging must never throw — fall back to console only */
    // Redacted here too: the fallback path is the one that runs when the log
    // file is unwritable, which is exactly when someone is reading the console.
    console.error(`[${subsystem}] ${operation}: ${redactSecrets(detail)}`);
  }
}

export function errorDetail(err: unknown): string {
  if (err instanceof Error) return err.stack || err.message;
  return String(err);
}
