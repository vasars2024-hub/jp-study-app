/**
 * Shared leak detector for the i18n render tests.
 *
 * Not a `.test.ts` file, so `vitest.config.ts`'s glob does not collect it.
 *
 * The check asks whether a rendered token *is a key in the English catalog*,
 * rather than matching a list of namespace prefixes: that covers namespaces
 * nobody thought to enumerate, and it does not trip on `sample.exe` or
 * `C:/Games/…`, which are not keys. A prefix list only finds the leaks its
 * author already predicted.
 *
 * It walks text nodes individually. Reading `element.textContent` concatenates
 * siblings, and a leaked key sitting between English neighbours then tokenises
 * as `progressvnPanel.routesHead1` — not a catalog key, so it passes in English
 * while failing in ja/zh/ru, where CJK and Cyrillic happen to form clean token
 * boundaries. A leak check that only works in non-English is worse than none,
 * because English is where a dotted key is least likely to be noticed by eye.
 * This was a real false negative, caught by a positive control.
 */
import { en } from '../../../shared/i18n/catalogs/en';

const EN_KEYS = new Set(Object.keys(en));
const DOTTED = /[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+/g;

/**
 * Attributes that reach the user without being text nodes. `aria-label` matters
 * most: icon-only buttons and selects are labelled that way, so a key leaked
 * into one is invisible to a text-only scan and is read aloud verbatim.
 */
const TEXT_ATTRS = ['aria-label', 'placeholder', 'title', 'alt'] as const;

/** Every English catalog key rendered as visible text or a user-facing attribute. */
export function leakedKeys(node: HTMLElement): string[] {
  const found = new Set<string>();
  const collect = (value: string | null): void => {
    if (!value) return;
    const trimmed = value.trim();
    if (EN_KEYS.has(trimmed)) found.add(trimmed);
    for (const token of value.match(DOTTED) ?? []) if (EN_KEYS.has(token)) found.add(token);
  };

  const walker = node.ownerDocument.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) collect(text.nodeValue);
  for (const element of node.querySelectorAll('*')) {
    for (const attr of TEXT_ATTRS) collect(element.getAttribute(attr));
  }
  return [...found].sort();
}
