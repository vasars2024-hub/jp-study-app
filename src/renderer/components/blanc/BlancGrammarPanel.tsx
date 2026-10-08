/**
 * Blanc grammar panel (the only Blanc module that loads the grammar data set).
 *
 * One module per Blanc panel: a Blanc lazy chunk is a whole module, so panels
 * that shared a file loaded each other's content stacks (opening Clipboard used
 * to fetch the grammar data set). Pillar 0 still applies — compose the shared
 * content component in Blanc chrome, never a Study OS `*View`, and never
 * import `AppChrome`/`MenuBar`/`StatusBar` here. The Study OS class-name
 * stylesheet these blocks rely on is loaded by the shell's lazy loader
 * (`withStudyOsCompat` in BlancShell.tsx), before first render.
 */
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import { GRAMMAR } from '../../data/grammar';
import { dedupeGrammarByTitle, type PracticeFilters } from '../../data/grammar/practiceFilters';
import GrammarExplorer from '../grammar/GrammarExplorer';
import GrammarPracticePanel from '../grammar/GrammarPracticePanel';
import GrammarCurationPanel from '../grammar/GrammarCurationPanel';
import {
  GrammarDetail,
  GuidesBrowser,
  parsePracticeDeepLink,
} from '../grammar/GrammarContent';

/** Labels are catalog keys, resolved with `t()` at render. */
const GRAMMAR_MODES = [
  { id: 'grammar', labelKey: 'blanc.study.grammar.points' },
  { id: 'practice', labelKey: 'grammar.mode.practice' },
  { id: 'guides', labelKey: 'blanc.study.grammar.guides' },
  { id: 'review', labelKey: 'grammar.mode.review' },
] as const;

type GrammarMode = (typeof GRAMMAR_MODES)[number]['id'];

export function BlancGrammarPanel({
  focusRequest,
}: {
  focusRequest?: { id: string; key: number } | null;
}) {
  const { t } = useT();
  const [mode, setMode] = useState<GrammarMode>('grammar');
  const [practiceSeed, setPracticeSeed] = useState<Partial<PracticeFilters> | undefined>();
  const corpusSize = useMemo(() => dedupeGrammarByTitle(GRAMMAR).length, []);

  // Same deep link Study OS honours, so `grammar:open-practice` works from
  // either shell.
  useEffect(() => {
    const onPractice = (ev: Event) => {
      setPracticeSeed(parsePracticeDeepLink((ev as CustomEvent).detail));
      setMode('practice');
    };
    window.addEventListener('grammar:open-practice', onPractice);
    return () => window.removeEventListener('grammar:open-practice', onPractice);
  }, []);

  useEffect(() => {
    if (focusRequest) setMode('grammar');
  }, [focusRequest]);

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.study.grammar.mode')}</legend>
        <div className="blanc-segmented">
          {GRAMMAR_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={mode === m.id ? 'active' : ''}
              onClick={() => setMode(m.id)}
            >
              {t(m.labelKey)}
            </button>
          ))}
        </div>
        <div className="blanc-status-row">
          <span>{t('blanc.study.grammar.pointCount', { count: corpusSize })}</span>
          <span>{t('blanc.study.grammar.deterministic')}</span>
        </div>
      </fieldset>

      <fieldset>
        <legend>
          {t(GRAMMAR_MODES.find((m) => m.id === mode)?.labelKey ?? 'blanc.study.grammar.points')}
        </legend>
        {mode === 'grammar' ? (
          <GrammarExplorer
            focusRequest={focusRequest}
            renderDetail={(point) => <GrammarDetail key={point.id} point={point} />}
          />
        ) : mode === 'practice' ? (
          <GrammarPracticePanel initialFilters={practiceSeed} />
        ) : mode === 'review' ? (
          <GrammarCurationPanel />
        ) : (
          <GuidesBrowser />
        )}
      </fieldset>
    </div>
  );
}
