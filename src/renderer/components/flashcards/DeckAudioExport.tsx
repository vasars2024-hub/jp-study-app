/**
 * Take the local deck out of the app, with its audio.
 *
 * The plain CSV export drops every clip and every synthesized line, so a deck
 * mined from a video and narrated offline could not leave. This writes the
 * Anki-importable pair — a text file with a `[sound:…]` column and the media
 * beside it — into a new folder, and reports what actually reached disk rather
 * than the number of cards it hoped to write.
 */
import { useState } from 'react';
import { loadDeck } from '../../flashcardDeck';
import { exportDeckWithAudio, type DeckMediaExportOutcome } from '../../deckMediaExport';
import { useT } from '../../i18n';
import './autoAudio.css';

export default function DeckAudioExport() {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<DeckMediaExportOutcome | null>(null);

  async function run(): Promise<void> {
    setBusy(true);
    setOutcome(null);
    try {
      setOutcome(await exportDeckWithAudio(loadDeck(), 'deck.csv'));
    } catch (error) {
      setOutcome({
        ok: false,
        cards: 0,
        written: 0,
        failed: 0,
        withoutAudio: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="auto-reading-options">
      <legend>{t('flash.deckExport.title')}</legend>
      <p className="muted">{t('flash.deckExport.lead')}</p>
      <button type="button" onClick={() => void run()} disabled={busy}>
        {busy ? t('flash.deckExport.working') : t('flash.deckExport.run')}
      </button>

      {outcome && (
        <p className="auto-reading-options__report" aria-live="polite">
          {outcome.ok ? (
            <>
              {t('flash.deckExport.done', {
                cards: outcome.cards,
                files: outcome.written,
              })}
              {outcome.withoutAudio > 0
                && ` ${t('flash.deckExport.withoutAudio', { count: outcome.withoutAudio })}`}
              {/* A clip whose file is gone is named, not folded into the total. */}
              {outcome.failed > 0
                && ` ${t('flash.deckExport.failed', { count: outcome.failed })}`}
            </>
          ) : (
            t('flash.deckExport.error')
          )}
        </p>
      )}

      {outcome?.ok && outcome.directory && (
        <button
          type="button"
          onClick={() => void window.api.flashcardRevealExport(outcome.directory as string)}
        >
          {t('flash.deckExport.reveal')}
        </button>
      )}
    </fieldset>
  );
}
