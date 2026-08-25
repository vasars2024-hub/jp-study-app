import { useEffect, useMemo, useState } from 'react';
import { GRAMMAR } from '../data/grammar';
import { useT } from '../i18n';
import {
  AppChrome,
  StatusBarField,
  StatusBarSpacer,
  useAeroMaterials,
  useWiredMaterials,
} from '../components/ui';
import GrammarPracticePanel from '../components/grammar/GrammarPracticePanel';
import GrammarCurationPanel from '../components/grammar/GrammarCurationPanel';
import GrammarExplorer from '../components/grammar/GrammarExplorer';
import {
  GrammarDetail,
  GuidesBrowser,
  parsePracticeDeepLink,
} from '../components/grammar/GrammarContent';
import {
  dedupeGrammarByTitle,
  type PracticeFilters,
} from '../data/grammar/practiceFilters';
import { ContextualSurface } from '../components/liquid/LiquidSurface';

type Mode = 'grammar' | 'practice' | 'guides' | 'review';

export default function GrammarView() {
  const aero = useAeroMaterials();
  const wired = useWiredMaterials();
  const corpusSize = useMemo(() => dedupeGrammarByTitle(GRAMMAR).length, []);
  const [mode, setMode] = useState<Mode>('grammar');
  const [practiceSeed, setPracticeSeed] = useState<Partial<PracticeFilters> | undefined>();
  const { t } = useT();

  useEffect(() => {
    const onPractice = (ev: Event) => {
      const detail = (ev as CustomEvent).detail;
      setPracticeSeed(parsePracticeDeepLink(detail));
      setMode('practice');
    };
    window.addEventListener('grammar:open-practice', onPractice);
    return () => window.removeEventListener('grammar:open-practice', onPractice);
  }, []);

  /*
   * Phase 2 removed the theme branch that used to live here. It returned a
   * separate Aero explorer before the mode switch, which made Practice and Test
   * unreachable in that theme and silently swallowed the `grammar:open-practice`
   * deep link. Both explorers are now one component skinned by CSS, so the mode
   * switch below is the only thing that decides what renders.
   */

  const modeLabel =
    mode === 'grammar'
      ? t('grammar.mode.points')
      : mode === 'practice'
        ? t('grammar.mode.practice')
        : mode === 'review'
          ? t('grammar.mode.review')
          : t('grammar.mode.guides');

  const classicStatus = (
    <>
      {/* The classic tree is shared: WIRED skins it as a diagnostic unit, but
          Aero and the default themes render it too, and a bare "SYN / PARSE
          UNIT READY" leaked terminal fiction into a Vista glass window. */}
      {wired && <StatusBarField>SYN / PARSE UNIT READY</StatusBarField>}
      <StatusBarField>{modeLabel}</StatusBarField>
      <StatusBarSpacer />
      {/*
        Deduped, not raw: the Explorer lists the collapsed corpus, and a status
        bar claiming 2,227 next to a list of 1,893 is the same kind of
        unbacked number this redesign has been removing everywhere else.
      */}
      <StatusBarField>{t('grammar.count', { count: corpusSize })}</StatusBarField>
    </>
  );

  return (
    <AppChrome status={classicStatus} className="gram-chrome">
    <div className="gram-view">
      {/* L5 — contextual, not dense work: one intro line and the mode switch. The
          four mode panels below stay conventional Work; a grammar point’s prose and
          its practice form are exactly what §2 keeps off translucent material.
          `ContextualSurface` is inert until this window is put in Liquid
          presentation, so conventional pixels are unchanged. */}
      <ContextualSurface className="view-head">
        <p className="muted">{t('grammar.intro')}</p>
        <div className="gram-mode-toggle">
          <button
            className={`gram-mode-btn ${mode === 'grammar' ? 'active' : ''}`}
            onClick={() => setMode('grammar')}
          >
            {t('grammar.mode.points')}
          </button>
          <button
            className={`gram-mode-btn ${mode === 'practice' ? 'active' : ''}`}
            onClick={() => setMode('practice')}
          >
            {t('grammar.mode.practice')}
          </button>
          <button
            className={`gram-mode-btn ${mode === 'guides' ? 'active' : ''}`}
            onClick={() => setMode('guides')}
          >
            {t('grammar.mode.guides')}
          </button>
          <button
            className={`gram-mode-btn ${mode === 'review' ? 'active' : ''}`}
            onClick={() => setMode('review')}
          >
            {t('grammar.mode.review')}
          </button>
        </div>
      </ContextualSurface>

      {mode === 'grammar' ? (
        <GrammarExplorer
          className={aero ? 'gram-x--aero' : ''}
          renderDetail={(point) => <GrammarDetail key={point.id} point={point} />}
        />
      ) : mode === 'practice' ? (
        <GrammarPracticePanel initialFilters={practiceSeed} />
      ) : mode === 'review' ? (
        <GrammarCurationPanel />
      ) : (
        <GuidesBrowser />
      )}
    </div>
    </AppChrome>
  );
}
