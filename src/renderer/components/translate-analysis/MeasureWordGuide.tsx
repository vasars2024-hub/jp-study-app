import { useEffect, useState } from 'react';
import CollapsibleSection from '../CollapsibleSection';
import { parseClassifiers, type ClassifierHint } from '../../../shared/pinyin';
import type { AspectNoteItem, MeasureWordItem } from '../../../shared/translateAnalysisCore';
import { useT } from '../../i18n';

// The LLM names the noun and its contextual classifier; CEDICT's embedded
// "CL:只[zhi1],条[tiao2]" hints act as an offline cross-check — shown as a
// secondary "dictionary also lists" line when they differ from the pick.
export default function MeasureWordGuide({
  measureWords,
  aspectNotes,
}: {
  measureWords?: MeasureWordItem[];
  aspectNotes?: AspectNoteItem[];
}) {
  const [dictHints, setDictHints] = useState<Record<string, ClassifierHint[]>>({});

  useEffect(() => {
    let alive = true;
    const nouns = (measureWords ?? []).map((m) => m.noun).filter(Boolean);
    if (!nouns.length) {
      setDictHints({});
      return;
    }
    void Promise.all(
      nouns.map(async (noun) => {
        const result = await window.api.lookupChinese(noun);
        const defs = result.entries[0]?.senses?.[0]?.definitions ?? [];
        return [noun, parseClassifiers(defs)] as const;
      }),
    ).then((pairs) => {
      if (!alive) return;
      const map: Record<string, ClassifierHint[]> = {};
      for (const [noun, hints] of pairs) {
        if (hints.length) map[noun] = hints;
      }
      setDictHints(map);
    });
    return () => {
      alive = false;
    };
  }, [measureWords]);

  const { t } = useT();
  const count = (measureWords?.length ?? 0) + (aspectNotes?.length ?? 0);

  return (
    <CollapsibleSection
      className="tr-analysis-section measure-word-section"
      title={t('translate.analysis.measureTitle')}
      summary={t('translate.analysis.notes', { count })}
      defaultOpen
    >
      {measureWords && measureWords.length > 0 && (
        <ul className="measure-word-list">
          {measureWords.map((m, i) => {
            const hints = dictHints[m.noun] ?? [];
            const others = hints.filter((h) => h.simp !== m.classifier && h.trad !== m.classifier);
            return (
              <li key={i} className="measure-word-item">
                <span className="measure-word-pick" lang="zh">
                  <strong>{m.classifier}</strong>
                  {m.pinyin ? <span className="muted"> ({m.pinyin})</span> : null}
                  {' + '}
                  {m.noun}
                </span>
                {m.reason && <span className="measure-word-reason muted">{m.reason}</span>}
                {others.length > 0 && (
                  <span className="measure-word-dict muted">
                    {t('translate.analysis.dictAlso')}{' '}
                    {others.map((h) => `${h.simp}${h.pinyin ? ` (${h.pinyin})` : ''}`).join(', ')}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {aspectNotes && aspectNotes.length > 0 && (
        <ul className="measure-aspect-list">
          {aspectNotes.map((a, i) => (
            <li key={i} className="measure-aspect-item">
              <span className="measure-aspect-particle" lang="zh">
                {a.particle}
              </span>
              {a.afterWord && (
                <span lang="zh" className="muted">
                  {t('translate.analysis.after', { word: a.afterWord })}
                </span>
              )}
              {a.reason && <span className="muted">{a.reason}</span>}
            </li>
          ))}
        </ul>
      )}
    </CollapsibleSection>
  );
}
