// Kinomoto card layout + CSS shared by main (model creation) and renderer (preview).

import type { CardContent, FieldRole, LangCode, StudyProfile } from './profiles';

export const KINOMOTO_MODEL = 'jidoujisho Kinomoto';

export const KINOMOTO_FIELD_NAMES = [
  'Term',
  'Reading',
  'Meaning',
  'Translation',
  'Sentence',
  'Notes',
  'Image',
  'Term Audio',
  'Sentence Audio',
  'Frequency',
] as const;

const PRESET: ReadonlyArray<{ role: FieldRole; field: string }> = [
  { role: 'term', field: 'Term' },
  { role: 'reading', field: 'Reading' },
  { role: 'meaning', field: 'Meaning' },
  { role: 'translation', field: 'Translation' },
  { role: 'sentence', field: 'Sentence' },
  { role: 'notes', field: 'Notes' },
  { role: 'image', field: 'Image' },
  { role: 'termAudio', field: 'Term Audio' },
  { role: 'sentenceAudio', field: 'Sentence Audio' },
  { role: 'frequency', field: 'Frequency' },
];

export const DEFAULT_CARD_CSS = `html, body {
  color: #f5f5f5;
  background-color: #1b1b21;
}
.card {
  font-family: "Yu Gothic UI", "Noto Sans JP", "Hiragino Sans", sans-serif;
  font-size: 22px;
  text-align: center;
  color: #f5f5f5;
  background-color: #1b1b21;
  padding: 24px;
}
.jsa-face,
.jsa-term,
.jsa-meaning,
.jsa-translation {
  color: #f5f5f5;
}
.jsa-face { font-size: 2.2em; font-weight: 600; }
.jsa-term { font-size: 1.6em; font-weight: 600; }
.jsa-reading { color: #e0deda; margin-top: 12px; }
.jsa-meaning { margin-top: 12px; }
.jsa-translation { margin-top: 12px; }
.jsa-sentence { color: #c8c5c0; margin-top: 16px; font-size: 0.9em; }
.jsa-frequency { color: #d4a04a; margin-top: 12px; font-size: 0.95em; }
.jsa-image { margin-top: 14px; }
.jsa-image img { max-width: 100%; border-radius: 8px; }
.jsa-audio { margin-top: 12px; font-size: 0.85em; color: #b7b3ad; }
hr#answer { border: none; border-top: 1px solid #6e2b2b; margin: 18px 0; }`;

export const CARD_CSS_COMPACT = `html, body { color: #f5f5f5; background: #1b1b21; }
.card { font-family: "Yu Gothic UI", "Noto Sans JP", sans-serif; font-size: 20px; text-align: center; color: #f5f5f5; background: #1b1b21; padding: 16px; }
.jsa-face, .jsa-term, .jsa-meaning, .jsa-translation { color: #f5f5f5; }
.jsa-face { font-size: 2em; font-weight: 600; }
.jsa-term { font-size: 1.4em; }
.jsa-reading { color: #e0deda; font-size: 0.95em; }
hr#answer { border: none; border-top: 1px solid #6e2b2b; margin: 12px 0; }`;

function presetFieldFor(content: CardContent): string {
  if (content === 'frequency') return 'Frequency';
  if (content === 'image') return 'Image';
  if (content === 'audio') return 'Term Audio';
  const hit = PRESET.find((p) => p.role === (content as FieldRole));
  return hit ? hit.field : content;
}

function langFor(content: CardContent, profile: StudyProfile, face: 'front' | 'back'): LangCode {
  if (content === 'meaning' || content === 'translation') {
    return face === 'front' ? profile.card.frontLang : profile.card.backLang;
  }
  if (content === 'term' || content === 'reading' || content === 'sentence') {
    const lang = face === 'front' ? profile.card.frontLang : profile.card.backLang;
    if (lang === 'zh') return 'zh';
    return profile.targetLang;
  }
  return profile.targetLang;
}

/** Anki card templates derived from the profile blueprint (Kinomoto layout). */
export function buildCardTemplates(
  profile: StudyProfile,
): { front: string; back: string } {
  const front = profile.card.front
    .map(
      (c) =>
        `<div class="jsa-face" lang="${langFor(c, profile, 'front')}">{{${presetFieldFor(c)}}}</div>`,
    )
    .join('\n');
  const backLines = profile.card.back.map((c) => {
    const field = presetFieldFor(c);
    const lang = langFor(c, profile, 'back');
    return `{{#${field}}}<div class="jsa-${c}" lang="${lang}">{{${field}}}</div>{{/${field}}}`;
  });
  const back = ['{{FrontSide}}', '<hr id="answer">', ...backLines].join('\n');
  return { front, back };
}

/** Strip any Anki template syntax left after substitution. */
export function stripAnkiTemplateSyntax(html: string): string {
  let out = html;
  for (let i = 0; i < 4; i++) {
    const next = out
      .replace(/\{\{#([^}]+)\}\}[\s\S]*?\{\{\/\1\}\}/g, '')
      .replace(/\{\{[^}]+\}\}/g, '');
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Substitute {{Field}} placeholders with rendered field HTML. */
function fillCardTemplate(template: string, fieldHtml: Record<string, string>): string {
  let out = template;
  for (const [field, html] of Object.entries(fieldHtml)) {
    const esc = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\{\\{${esc}\\}\\}`, 'g');
    out = out.replace(re, html || '');
    const condRe = new RegExp(`\\{\\{#${esc}\\}\\}([\\s\\S]*?)\\{\\{/${esc}\\}\\}`, 'g');
    out = out.replace(condRe, (_, inner: string) =>
      html?.trim() ? inner.replace(`{{${field}}}`, html) : '',
    );
  }
  out = out.replace(/\{\{FrontSide\}\}/g, '__FRONT_SIDE__');
  return stripAnkiTemplateSyntax(out);
}

export function renderCardPreview(
  profile: StudyProfile,
  fieldHtml: Record<string, string>,
  css?: string,
): { frontHtml: string; backHtml: string; css: string } {
  const tpl = buildCardTemplates(profile);
  const frontFilled = fillCardTemplate(tpl.front, fieldHtml);
  const backFilled = fillCardTemplate(tpl.back, fieldHtml).replace('__FRONT_SIDE__', frontFilled);
  return {
    frontHtml: frontFilled,
    backHtml: backFilled,
    css: css ?? profile.noteCss ?? DEFAULT_CARD_CSS,
  };
}
