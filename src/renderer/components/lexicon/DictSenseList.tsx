import type { DictSense } from '../../../shared/types';
import { posTagKey } from '../../dictPosTags';
import { useT } from '../../i18n';
import UsageLabels from './UsageLabels';

type TFn = (key: string) => string;

/**
 * A sense's part-of-speech codes as tags, each explained in a tooltip and its
 * accessible name (`dictPosTags.ts`). A code with no explanation is shown as the
 * dictionary wrote it.
 */
export function PosTags({ codes, t }: { codes: readonly string[]; t: TFn }) {
  return (
    <span className="dict-pos">
      {codes.map((code, i) => {
        const key = posTagKey(code);
        const label = key ? t(key) : '';
        return (
          <span key={`${code}-${i}`}>
            {i > 0 && ', '}
            {label ? (
              <abbr className="dict-pos-tag" title={label}>
                {code}
                <span className="sr-only"> ({label})</span>
              </abbr>
            ) : (
              <span className="dict-pos-tag">{code}</span>
            )}
          </span>
        );
      })}
    </span>
  );
}

function unionOf(senses: readonly DictSense[], pick: (sense: DictSense) => readonly string[] | undefined): string[] {
  const out: string[] = [];
  for (const sense of senses) {
    for (const value of pick(sense) ?? []) if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

/** One sense's line: tags first, then its own structured HTML or its glosses. */
export function SenseBody({ sense, lang, sourceLabel }: { sense: DictSense; lang: string; sourceLabel?: string }) {
  const { t } = useT();
  return (
    <>
      {sourceLabel && <span className="dict-sense-source">{sourceLabel}</span>}
      {(sense.partsOfSpeech?.length ?? 0) > 0 && <PosTags codes={sense.partsOfSpeech} t={t} />}
      <UsageLabels tags={sense.tags} />
      {sense.html ? (
        // Sanitized in main on every read (`lexiconAdapter.ts`, `yomitan.ts`).
        <div className="dict-sense-html" lang={lang} dangerouslySetInnerHTML={{ __html: sense.html }} />
      ) : (
        sense.definitions.join('; ')
      )}
    </>
  );
}

interface Props {
  senses: readonly DictSense[];
  /** A whole-entry structured glossary block, when the dictionary kept no sense boundaries. */
  glossaryHtml?: string;
  lang: string;
  /** Most senses shown before the rest are cut (the popup is a glance surface). */
  limit?: number;
  /** Label each sense with its dictionary (merged layout). */
  labelSources?: boolean;
}

/**
 * The meanings of one dictionary section, rendered the same way whatever the
 * dictionary's format: plain glossaries, structured glossaries whose senses were
 * marked (each sense under its own part of speech and usage tags), and a
 * structured block with no sense boundaries (its tags gathered above the block,
 * the only place left to hang them).
 */
export default function DictSenseList({ senses, glossaryHtml, lang, limit = 6, labelSources = false }: Props) {
  const { t } = useT();
  if (glossaryHtml && !senses.some((sense) => sense.html)) {
    const pos = unionOf(senses, (sense) => sense.partsOfSpeech);
    return (
      <>
        {pos.length > 0 && <PosTags codes={pos} t={t} />}
        <UsageLabels tags={unionOf(senses, (sense) => sense.tags)} />
        <div className="dict-glossary-html" lang={lang} dangerouslySetInnerHTML={{ __html: glossaryHtml }} />
      </>
    );
  }
  return (
    <ol className="dict-senses">
      {senses.slice(0, limit).map((sense, j) => (
        <li key={j}>
          <SenseBody sense={sense} lang={lang} sourceLabel={labelSources ? sense.source : undefined} />
        </li>
      ))}
    </ol>
  );
}
