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
      <ProfileSettingsSection />

      <div className="view-head">
        <p className="muted">{t('anki.intro')}</p>
        <div className="actions">
          <button className="btn" onClick={state.check} disabled={loading}>
            {loading ? t('anki.checking') : t('anki.recheck')}
          </button>
        </div>
      </div>

      {/*
        Outside the connected branch on purpose: two of its three sources (a
        package file and this app's own local deck) need no Anki at all, so
        gating the workbench on AnkiConnect would hide working functionality.
      */}
      <div className="anki-card anki-card-flush">
        <CollapsibleSection title={t('ankiWorkbench.title')} summary={t('ankiWorkbench.lead')}>
          <DeckWorkbench />
        </CollapsibleSection>
      </div>

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
                {active.description ? ` — ${active.description}` : ''}
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
    </div>
    </AppChrome>
  );
}
