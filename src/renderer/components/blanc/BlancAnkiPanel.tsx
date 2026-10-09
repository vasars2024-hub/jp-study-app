/**
 * Blanc Anki connection and note-type panel.
 *
 * One module per Blanc panel: a Blanc lazy chunk is a whole module, so panels
 * that shared a file loaded each other's content stacks (opening Clipboard used
 * to fetch the grammar data set). Pillar 0 still applies — compose the shared
 * content component in Blanc chrome, never a Study OS `*View`, and never
 * import `AppChrome`/`MenuBar`/`StatusBar` here. The Study OS class-name
 * stylesheet these blocks rely on is loaded by the shell's lazy loader
 * (`withStudyOsCompat` in BlancShell.tsx), before first render.
 */
import { useT } from '../../i18n';
import {
  AnkiDeckNoteType,
  AnkiDisconnected,
  AnkiFieldMapping,
  AnkiManualCardForm,
  AnkiNoteCss,
  AnkiPreviewPane,
  useAnkiConfig,
} from '../anki/AnkiContent';
import { ProfileSwitcher } from '../ProfileSwitcher';
import AnkiSyncStatus from '../anki/AnkiSyncStatus';

/**
 * "Mapped onto <b>model</b>. ..." as one catalog sentence, with the model name
 * bolded wherever the language places it.
 */
function MappedOnto({ model }: { model: string }) {
  const { t } = useT();
  const slot = '\u0000';
  const [before, after = ''] = t('blanc.study.anki.mappedOnto', { model: slot }).split(slot);
  return (
    <>
      {before}
      <b>{model}</b>
      {after}
    </>
  );
}

/**
 * Pillar 0 fix for the `anki` bail-out — the Deck tab's advanced branch used to
 * mount `AnkiView`. Same hook, same IPC, same field-mapping and CSS editors;
 * Blanc supplies `fieldset`/`legend` framing instead of `AppChrome` + the
 * `anki-card` stack, and uses `ProfileSwitcher` rather than Study OS's
 * `ProfileSettingsSection`.
 */
export function BlancAnkiPanel() {
  const { t } = useT();
  const state = useAnkiConfig();
  const { status, loading, active, model } = state;

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.study.anki.connection')}</legend>
        <ProfileSwitcher compact showHeading={false} />
        <div className="blanc-status-row">
          <span className={`blanc-status-dot${status?.connected ? ' ok' : ''}`} />
          <span>{state.connLabel}</span>
          {active.label && <span>{t('blanc.study.anki.profile', { name: active.label })}</span>}
          <button type="button" onClick={() => void state.check()} disabled={loading}>
            {loading ? t('anki.checking') : t('anki.recheck')}
          </button>
        </div>
        {!loading && status && !status.connected && <AnkiDisconnected state={state} />}
        {!loading && status?.connected && (
          <p className="blanc-note">
            {t('blanc.study.anki.available', {
              decks: t('blanc.study.anki.deckCount', { count: status.decks.length }),
              models: t('blanc.study.anki.noteTypeCount', { count: status.models.length }),
            })}
          </p>
        )}
      </fieldset>

      {/* Offline too: the queue and the last problem are what a closed Anki leaves behind. */}
      <fieldset>
        <legend>{t('anki3.sync.title')}</legend>
        <AnkiSyncStatus />
      </fieldset>

      {!loading && status?.connected && (
        <>
          <fieldset>
            <legend>{t('blanc.study.anki.deckNoteType')}</legend>
            <AnkiDeckNoteType state={state} />
          </fieldset>

          <fieldset>
            <legend>{t('anki.fieldMapping.title')}</legend>
            <p className="blanc-note">
              <MappedOnto model={model || '—'} />
            </p>
            <AnkiFieldMapping state={state} />
          </fieldset>

          <fieldset>
            <legend>{t('blanc.study.anki.cardStyling')}</legend>
            <AnkiNoteCss state={state} />
          </fieldset>

          <fieldset>
            <legend>{t('blanc.study.anki.manualCard')}</legend>
            <AnkiManualCardForm state={state} />
          </fieldset>

          {state.fields.length > 0 && (
            <fieldset>
              <legend>{t('blanc.study.anki.preview')}</legend>
              <AnkiPreviewPane state={state} />
            </fieldset>
          )}
        </>
      )}
    </div>
  );
}
