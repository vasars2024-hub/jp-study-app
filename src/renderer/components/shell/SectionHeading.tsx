/**
 * A visually hidden heading for the apps that render none (round-2 audit K12).
 *
 * The a11y scan (`a11y/apps.json`) found seven apps with no heading element at
 * all — YouTube, Dictionary, Translate, Immersion, Visual Novels, Calendar and
 * Mooncap Garden — so heading navigation skipped them entirely. The design rule is
 * that no window repeats its own name as a visible in-window title, so the heading
 * is screen-reader only: it names the app for heading navigation and changes no
 * pixel. Apps that already carry a heading are deliberately not listed.
 */
import { useT } from '../../i18n';

/** Section id -> the catalogue key of the app's name. */
export const SR_HEADING_KEYS: Readonly<Record<string, string>> = {
  youtube: 'palette.section.youtube',
  dictionary: 'palette.section.dictionary',
  translate: 'palette.section.translate',
  immersion: 'palette.section.immersion',
  visualnovels: 'palette.section.visualnovels',
  calendar: 'palette.section.calendar',
  city: 'palette.section.city',
};

export default function SectionHeading({ section }: { section: string }) {
  const { t } = useT();
  const key = SR_HEADING_KEYS[section];
  if (!key) return null;
  return <h2 className="sr-only">{t(key)}</h2>;
}
