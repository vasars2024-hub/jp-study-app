import type { ResourceCategory } from '../../data/resources';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/**
 * The catalogue key segment for a resource, from its name: "Tae Kim’s Guide" →
 * `tae-kim-s-guide`, "Weblio 辞書" → `weblio`. Names are unique within a category,
 * so `<category id>.<slug>` names one item.
 */
export function resourceSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function resourceItemKey(categoryId: string, name: string): string {
  return `resourcesCatalog.item.${categoryId}.${resourceSlug(name)}`;
}

/**
 * A built-in category as the Resources window shows it: title, blurb and every item's
 * description in the interface language (src/shared/i18n/resourcesCatalog). The data
 * file keeps its English, which search, "My tools" copies and the remote catalogue
 * share. A key the catalogs do not have — a remote category, or an item added to the
 * data before its translation — keeps the English it came with; names and URLs are the
 * sites' own and are never translated.
 */
export function localizeResourceCategory(category: ResourceCategory, t: Translate): ResourceCategory {
  const pick = (key: string, english: string): string => {
    const value = t(key);
    return value === key ? english : value;
  };
  return {
    ...category,
    title: pick(`resourcesCatalog.cat.${category.id}.title`, category.title),
    blurb: pick(`resourcesCatalog.cat.${category.id}.blurb`, category.blurb),
    items: category.items.map((item) => ({
      ...item,
      description: pick(resourceItemKey(category.id, item.name), item.description),
    })),
  };
}
