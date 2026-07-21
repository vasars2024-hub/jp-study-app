import type { CommandCategory } from './keyboardShortcuts';
import type { TVars } from '../shared/i18n/core';

type TFn = (key: string, vars?: TVars) => string;

export function commandLabelKey(id: string): string {
  return `commands.${id}`;
}

export function commandCategoryKey(category: CommandCategory): string {
  return `commands.category.${category.toLowerCase()}`;
}

/** Resolve a built-in command label — falls back to the catalog's English label. */
export function commandLabel(id: string, fallback: string, t: TFn): string {
  const key = commandLabelKey(id);
  const out = t(key);
  return out === key ? fallback : out;
}

export function commandCategory(category: CommandCategory, t: TFn): string {
  const key = commandCategoryKey(category);
  const out = t(key);
  return out === key ? category : out;
}
