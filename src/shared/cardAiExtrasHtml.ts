/**
 * The HTML half of `./cardAiExtras.ts`: the block a note field carries for a
 * card's saved extras, and where on the note it goes. Model-written text is
 * sanitized and marked as generated (`wrapAiProvenance`); the learner's own
 * text and corpus sentences are escaped in full.
 */
import { pickCardAiExtras } from './cardAiExtras';
import { wrapAiProvenance } from './ankiAiAdditions';

/** Section headings, in the UI language (`deckExport.notes.*`). Omitted: no headings. */
export interface CardAiExtrasLabels {
  mnemonic: string;
  distinction: string;
  examples: string;
  accepted: string;
}

/** The CSS class on the exported block, so a note template can style it. */
const CARD_EXTRAS_CLASS = 'jp-card-extras';

/** Escape learner-typed or corpus text for an HTML field. */
function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Generated text: sanitized and marked. No provider/model is recorded on a card. */
function generated(value: string): string {
  return wrapAiProvenance(value, '', '');
}

/**
 * The block for a note field, or `''` when the card has nothing to export.
 * Accepts the raw card (or an IPC payload): it is normalized here.
 */
export function cardAiExtrasHtml(card: unknown, labels?: CardAiExtrasLabels): string {
  const extras = pickCardAiExtras(card);
  if (!extras) return '';
  const heading = (label: string | undefined): string => (label ? `<b>${escapeText(label)}</b> ` : '');
  const parts: string[] = [];
  if (extras.mnemonic) parts.push(`${heading(labels?.mnemonic)}${generated(extras.mnemonic)}`);
  if (extras.distinction) parts.push(`${heading(labels?.distinction)}${generated(extras.distinction)}`);
  if (extras.exampleSentences?.length) {
    const lines = extras.exampleSentences.map((entry) => {
      const mark = entry.origin === 'ai' ? generated : escapeText;
      return entry.translation ? `${mark(entry.text)} — ${mark(entry.translation)}` : mark(entry.text);
    });
    parts.push(`${labels?.examples ? `<b>${escapeText(labels.examples)}</b><br>` : ''}${lines.join('<br>')}`);
  }
  const answers = [...(extras.acceptedAnswers?.meaning ?? []), ...(extras.acceptedAnswers?.target ?? [])];
  if (answers.length) parts.push(`${heading(labels?.accepted)}${answers.map(escapeText).join('; ')}`);
  return `<div class="${CARD_EXTRAS_CLASS}">${parts.join('<br>')}</div>`;
}

/**
 * Put the block on a note: into the `notes` role's field when the note type
 * has one, else appended to the meaning (back) field. Returns the fields
 * unchanged when there is no block or no field to take it.
 */
export function placeCardAiExtras(
  fields: Readonly<Record<string, string>>,
  fieldMap: Partial<Record<'notes' | 'meaning', string>>,
  html: string,
): Record<string, string> {
  const target = fieldMap.notes || fieldMap.meaning;
  if (!html || !target) return { ...fields };
  const existing = fields[target] ?? '';
  return { ...fields, [target]: existing ? `${existing}<br>${html}` : html };
}

/** The headings, from a translate function (`t` / `mt`). */
export function cardAiExtrasLabels(translate: (key: string) => string): CardAiExtrasLabels {
  return {
    mnemonic: translate('deckExport.notes.mnemonic'),
    distinction: translate('deckExport.notes.distinction'),
    examples: translate('deckExport.notes.examples'),
    accepted: translate('deckExport.notes.accepted'),
  };
}
