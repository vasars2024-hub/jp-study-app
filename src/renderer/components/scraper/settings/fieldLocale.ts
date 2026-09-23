import type { ScraperFieldDef } from './fields';
import { SCRAPER_LOG_CHANNELS } from '../../../../shared/scraperOutputSettings';
import { SCRAPER_EXPORT_COLUMNS } from '../data/exportBuilder';

export function scraperFieldKey(field: ScraperFieldDef): string {
  return field.path === 'network.userAgent' && field.kind === 'text'
    ? `${field.path}.custom` : field.path;
}

/** Keep the source model's English text for search; translate only display copies. */
export function localizeScraperField(
  field: ScraperFieldDef,
  t: (key: string, vars?: Record<string, string | number>) => string,
): ScraperFieldDef {
  const keyPath = scraperFieldKey(field);
  const prefix = `scraperDrawer.field.${keyPath}`;
  const fallback = (key: string, english: string, vars?: Record<string, string | number>): string => {
    const translated = t(key, vars);
    return translated === key ? english : translated;
  };
  return {
    ...field,
    label: fallback(`${prefix}.label`, field.label),
    hint: field.hint ? fallback(`${prefix}.hint`, field.hint,
      field.path === 'logging.channels' ? { channels: SCRAPER_LOG_CHANNELS.join(', ') }
        : field.path === 'export.includeColumns' ? { columns: SCRAPER_EXPORT_COLUMNS.join(', ') }
          : undefined) : undefined,
    placeholder: field.placeholder ? fallback(`${prefix}.placeholder`, field.placeholder) : undefined,
    options: field.options?.map((option) => ({
      ...option,
      label: fallback(`scraperDrawer.option.${keyPath}.${option.value}`, option.label),
    })),
  };
}
