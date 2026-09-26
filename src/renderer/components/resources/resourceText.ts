import type { ResourceCategory } from '../../data/resources';
import type { Bundle, NewEntry } from '../../../shared/resourcesCatalog';
import { RESOURCE_BUNDLES_EN } from '../../../shared/i18n/resourceBundles/en';

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

/**
 * The key prefix for one gem bundle's text (src/shared/i18n/resourceBundles).
 */
export function bundleKeyPrefix(bundleId: string): string {
  return `resourceBundles.bundle.${bundleId}`;
}

export function newEntryKey(name: string): string {
  return `resourceBundles.new.${resourceSlug(name)}`;
}

/**
 * The catalogue's text in the interface language — but only while the catalogue still
 * says what the English catalog says. The bundles and the New section can arrive from
 * the remote catalog.json, which shares the bundled copy's ids and names: an entry it
 * rewords, or one it adds, keeps the English it came with instead of showing a stale
 * or foreign translation.
 */
function catalogueText(key: string, english: string, t: Translate): string {
  if (RESOURCE_BUNDLES_EN[key] !== english) return english;
  const value = t(key);
  return value === key ? english : value;
}

/**
 * A gem bundle as the Resources window shows it: gem and creature labels, title, blurb,
 * item descriptions, setup-link names and descriptions, and checklist steps in the
 * interface language. Ids, names of the resources themselves, URLs and costs pass
 * through untouched (costs are labelled by costLabel.ts).
 */
export function localizeBundle(bundle: Bundle, t: Translate): Bundle {
  const prefix = bundleKeyPrefix(bundle.id);
  const text = (suffix: string, english: string) => catalogueText(`${prefix}.${suffix}`, english, t);
  return {
    ...bundle,
    gem: text('gem', bundle.gem),
    creature: bundle.creature === undefined ? undefined : text('creature', bundle.creature),
    title: text('title', bundle.title),
    blurb: text('blurb', bundle.blurb),
    items: bundle.items.map((item) => ({
      ...item,
      description: text(`item.${resourceSlug(item.name)}`, item.description),
    })),
    checklist: bundle.checklist?.map((step) => ({ ...step, text: text(`check.${step.id}`, step.text) })),
    downloads: bundle.downloads?.map((link) => ({
      ...link,
      name: text(`download.${link.id}.name`, link.name),
      description: text(`download.${link.id}.description`, link.description),
    })),
  };
}

/** A "New" entry with its description in the interface language; the name is the site's own. */
export function localizeNewEntry(entry: NewEntry, t: Translate): NewEntry {
  return { ...entry, description: catalogueText(newEntryKey(entry.name), entry.description, t) };
}
