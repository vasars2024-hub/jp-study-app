import type { DictEntry, DictSense } from '../../../shared/types';
import { useT } from '../../i18n';
import './usageLabels.css';

interface Props {
  /**
   * Readable usage labels, already resolved by whichever source produced them.
   *
   * Optional despite `DictSense.tags` being declared required: a `DictResult`
   * reaches this component across IPC and out of persisted caches, and a sense
   * stored before the field existed arrives with it simply absent. The contract
   * says `string[]`, the wire does not enforce it, and a missing list is not an
   * error — it is a dictionary that said nothing about usage.
   */
  tags?: readonly string[];
}

/**
 * How a sense is used — colloquial, honorific, archaic, dialect, a term of art.
 *
 * The `DictSense.tags` field has carried this from three separate lookup paths
 * (`dictionary.ts` maps Jisho's `tags`+`info`, `lexiconAdapter.ts` passes the
 * database's `senses.tags`, and `yomitan.ts` now resolves a term row's
 * `definitionTags` through the dictionary's own tag bank) and no surface has
 * ever rendered it. This is that surface.
 *
 * The labels are data, not chrome: they are the dictionary's own words and are
 * never translated. Only the screen-reader prefix that says what the row *is*
 * goes through i18n, so a listener does not receive "colloquialism" adrift with
 * no indication of what it qualifies.
 */
export default function UsageLabels({ tags }: Props) {
  const { t } = useT();
  if (!tags?.length) return null;

  return (
    <span className="dict-usage">
      <span className="sr-only">{t('dict.results.usage')} </span>
      {tags.map((tag) => (
        <span className="dict-usage-tag" key={tag}>
          {tag}
        </span>
      ))}
    </span>
  );
}

/**
 * Every usage label on an entry, in sense order, deduplicated.
 *
 * Needed because a dictionary that kept its structured glossary renders as one
 * HTML block rather than a list of senses, and there is then no per-sense place
 * to hang a label on. Collapsing to the entry is the honest fallback: the DOM
 * has no sense boundaries left to attribute them to.
 */
export function entryUsageTags(entry: DictEntry): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const sense of entry.senses as readonly DictSense[]) {
    for (const tag of sense.tags ?? []) {
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}
