import type { CommandCategory } from './keyboardShortcuts';
import type { TVars } from '../shared/i18n/core';

type TFn = (key: string, vars?: TVars) => string;

/**
 * Label keys live in two places for historical reasons: the first ~100 commands were
 * translated as `commands.<id>` in the main catalogs; the rest (and every note) were
 * added as `cmd.<id>` / `cmd.note.<id>` in `shared/i18n/commandsUi/`. Resolution tries
 * the old key first, so neither set shadows the other.
 */
export function commandLabelKey(id: string): string {
  return `commands.${id}`;
}

export function commandLabelKeys(id: string): readonly [string, string] {
  return [`commands.${id}`, `cmd.${id}`];
}

export function commandNoteKey(id: string): string {
  return `cmd.note.${id}`;
}

export function commandCategoryKey(category: CommandCategory): string {
  return `commands.category.${category.toLowerCase()}`;
}

/** Resolve a built-in command label — falls back to the catalog's English label. */
export function commandLabel(id: string, fallback: string, t: TFn): string {
  for (const key of commandLabelKeys(id)) {
    const out = t(key);
    if (out !== key) return out;
  }
  return fallback;
}

/**
 * Resolve a built-in command's settings note — falls back to the catalog's English note.
 * Toolbox rows carry a `scope` (where the chord works); it is appended as its own
 * translated sentence, the way the English note is built.
 */
export function commandNote(
  id: string,
  fallback: string | undefined,
  t: TFn,
  scope?: string,
): string | undefined {
  if (!fallback) return fallback;
  const key = commandNoteKey(id);
  const out = t(key);
  if (out === key) return fallback;
  if (!scope) return out;
  const scopeKey = `shortcut.scope.${scope}`;
  const scopeText = t(scopeKey);
  return scopeText === scopeKey ? out : `${out} ${scopeText}`;
}

export function commandCategory(category: CommandCategory, t: TFn): string {
  const key = commandCategoryKey(category);
  const out = t(key);
  return out === key ? category : out;
}
