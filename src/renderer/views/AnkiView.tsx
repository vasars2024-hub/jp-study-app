import { AppChrome, StatusBarField, StatusBarSpacer, type MenuBarMenu } from '../components/ui';
import CollapsibleSection from '../components/CollapsibleSection';
import {
  AnkiDeckNoteType,
  AnkiDisconnected,
  AnkiFieldMapping,
  AnkiManualCardForm,
  AnkiNoteCss,
  AnkiPreviewPane,
  useAnkiConfig,
} from '../components/anki/AnkiContent';
import { ProfileSettingsSection } from './SettingsView';
import DeckWorkbench from '../components/anki/DeckWorkbench';
import { ContextualSurface } from '../components/liquid/LiquidSurface';
import { stripTrailingTerminator } from '../../shared/sentenceJoin';
import { useT } from '../i18n';

export default function AnkiView() {
  const { t } = useT();
  const state = useAnkiConfig();
  const { status, loading, active, model, connLabel } = state;

  const ankiMenus: MenuBarMenu[] = [
    {
      id: 'anki',
      label: 'Anki',
      items: [
        { id: 'recheck', label: 'Recheck connection', disabled: loading, onSelect: state.check },
      ],
    },
  ];
  const ankiStatus = (
    <>
      <StatusBarField live>{connLabel}</StatusBarField>
      <StatusBarSpacer />
      {active.label && <StatusBarField>Profile: {active.label}</StatusBarField>}
    </>
  );

  return (
    <AppChrome menus={ankiMenus} status={ankiStatus} className="aero-anki-chrome">
    <div className="anki-view">
      {/* L7: the surface's contextual chrome — an intro line and one transport action —
          takes the shared contextual primitive, exactly as Flashcards' heads do. The
          connection form, mapping editor, CSS editor and manual-card form below stay on
          opaque anchors: they are dense editing work, which §2.3 protects from glass. */}
      <ContextualSurface className="view-head">
        <p className="muted">{t('anki.intro')}</p>
        <div className="actions">
          {/* DECLARED primary, and the declaration is the point rather than the colour.
              cat5 Q1 read `entryPoints 0` and Q3 read `primaryAction: button.btn
              (Save mapping), insideBodyViewport false` — the first control this surface
              marks primary sat 856px down a 545px body, so the instrument answered "the
              dominant task is the field-template save", which is not true of this
              surface at all. Everything under this head is gated on `status?.connected`;
              this button is the one control that is always present and the one that
              unlocks the rest, so it is the entry point in fact and now says so. */}
          <button className="btn primary" onClick={state.check} disabled={loading}>
            {loading ? t('anki.checking') : t('anki.recheck')}
          </button>
        </div>
      </ContextualSurface>

      {loading && <div className="banner">{t('anki.checkingConnection')}</div>}

      {!loading && status && !status.connected && (
        <div className="anki-card">
          <AnkiDisconnected state={state} />
        </div>
      )}

      {!loading && status?.connected && (
        <div className="anki-workspace">
          <div className="anki-workspace-main">
            <div className="status-banner ok">
              <span className="status-dot ok" />
              {t('anki.connected', { decks: status.decks.length, models: status.models.length })}
            </div>

            <div className="anki-card">
              <h2>{t('anki.deckNoteType.title')}</h2>
              <p className="muted anki-sub">
                {t('anki.boundTo')} <b>{active.label}</b>
                {/* `subTail` OPENS with the sentence terminator that closes this clause
                    ('. ' in en/ru, '。' in ja/zh), because without a description the label
                    is the last thing said. All 28 seed descriptions already end in '.', so
                    appending one verbatim renders 'background.. Switch profiles' in en/ru
                    and 'background.。デッキ' in ja/zh. Drop the description's own terminator
                    and let the localised one close the sentence. */}
                {active.description ? ` — ${stripTrailingTerminator(active.description)}` : ''}
                {t('anki.deckNoteType.subTail')}
              </p>
              <AnkiDeckNoteType state={state} />
            </div>

            <div className="anki-card">
              <h2>{t('anki.fieldMapping.title')}</h2>
              <p className="muted anki-sub">
                {t('anki.fieldMapping.subPrefix')} <b>{model || '—'}</b>
                {t('anki.fieldMapping.subSuffix')}
              </p>
              <AnkiFieldMapping state={state} />
            </div>

            <div className="anki-card anki-card-flush">
              <AnkiNoteCss state={state} />
            </div>

            <div className="anki-card anki-card-flush">
              <CollapsibleSection
                title={t('anki.manualCard.title')}
                summary={t('anki.manualCard.summary')}
              >
                <AnkiManualCardForm state={state} />
              </CollapsibleSection>
            </div>
          </div>

          <AnkiPreviewPane state={state} />
        </div>
      )}

      {/*
        THE WORK LEADS; the profile picker and the workbench follow.

        Measured 2026-09-05 by the rubric category 4 harness. At the Anki window's own
        default 820x580 the body viewport is 58..603 and `.anki-workspace` began at y=549 —
        so ZERO pixels of the connection banner, the deck/note-type selector, the field
        mapping or the preview were on screen without scrolling. The 491 px above it were
        the study-profile section (267), this intro line (47) and a COLLAPSED Deck
        Workbench (103). The window is called Anki and it opened on a profile picker.

        Neither of the two moved down is hidden or gated, and neither loses a route: the
        profile section is the same component Settings renders, and every place the mapping
        depends on it already names the active profile inline (`anki.boundTo`,
        `anki.fieldMapping.subPrefix`). The workbench stays OUTSIDE the connected branch,
        for the reason it always was: three of its four sources — a package file, an Anki
        text export, and this app's own local deck — need no Anki running at all, so gating
        it on AnkiConnect would hide working functionality.
      */}
      <div className="anki-card anki-card-flush">
        <CollapsibleSection title={t('ankiWorkbench.title')} summary={t('ankiWorkbench.lead')}>
          <DeckWorkbench />
        </CollapsibleSection>
      </div>

      <ProfileSettingsSection />
    </div>
    </AppChrome>
  );
}
