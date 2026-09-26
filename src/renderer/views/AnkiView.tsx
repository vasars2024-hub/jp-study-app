import { useEffect, useState } from 'react';
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

/** How long the first connection check may take before the offline sections mount anyway. */
export const ANKI_FIRST_CHECK_GRACE_MS = 1500;

export default function AnkiView() {
  const { t } = useT();
  const state = useAnkiConfig();
  const { status, loading, active, model, connLabel } = state;
  // The Deck Workbench and the profile section need no Anki, so a first check that hangs
  // (AnkiConnect half-up) must not hold them back for long: after the grace period they
  // mount anyway and accept the one shift.
  const [firstCheckSlow, setFirstCheckSlow] = useState(false);
  useEffect(() => {
    if (status) return;
    const id = window.setTimeout(() => setFirstCheckSlow(true), ANKI_FIRST_CHECK_GRACE_MS);
    return () => window.clearTimeout(id);
  }, [status]);
  const showOfflineSections = !!status || firstCheckSlow;

  const ankiMenus: MenuBarMenu[] = [
    {
      id: 'anki',
      label: 'Anki',
      items: [
        { id: 'recheck', label: t('anki.menu.recheckConnection'), disabled: loading, onSelect: state.check },
      ],
    },
  ];
  const ankiStatus = (
    <>
      <StatusBarField live>{connLabel}</StatusBarField>
      <StatusBarSpacer />
      {active.label && <StatusBarField>{t('anki.status.profile', { label: active.label })}</StatusBarField>}
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

      {/* LAYOUT JUMP (V12). The first check used to paint a one-line banner with the
          Deck Workbench and the profile section right under it, then swap the banner for
          the ~380px connection card — shoving both sections down ~280px a third of a
          second after the window opened (CLS 0.04-0.08 in the visual sweep). Until the
          FIRST answer arrives the body is one placeholder card and nothing is
          mounted below it, so the real content arrives in place instead of pushing
          anything. A later Recheck keeps the current content on screen (the head button
          already says "Checking…"), instead of collapsing the whole window and rebuilding
          it — the same jump, user-triggered. */}
      {!status && (
        <div className="anki-card anki-first-check" role="status" aria-busy="true">
          {t('anki.checkingConnection')}
        </div>
      )}

      {status && !status.connected && (
        <>
          <div className="anki-card">
            <AnkiDisconnected state={state} />
          </div>
          {/* The mapping and the CSS are profile settings: both save without Anki,
              the mapping is read at the next mine and the CSS is queued for the
              note type (`anki:pushNoteStyling`). Hiding them until Anki answered
              made two offline-capable editors unreachable. */}
          <div className="anki-card anki-offline-editors">
            <p className="muted anki-sub">{t('anki.offlineEditors')}</p>
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
        </>
      )}

      {status?.connected && (
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
      {showOfflineSections && (
        <>
          <div className="anki-card anki-card-flush">
            <CollapsibleSection title={t('ankiWorkbench.title')} summary={t('ankiWorkbench.lead')}>
              <DeckWorkbench />
            </CollapsibleSection>
          </div>

          <ProfileSettingsSection />
        </>
      )}
    </div>
    </AppChrome>
  );
}
