// "Read text with AI" (aiProv.ocr.*): a vision model on the learner's own key as
// an OCR engine — its settings (Settings > AI and the Snips settings) and "Check
// with AI" on a snip. Part of the lazy AI pack (../aiPack). Its cloud opt-in's
// label is eager (../aiEagerUi): `shared/aiSetup.ts` names it at boot.
// English is the source of truth.

import type { Catalog } from '../core';

export const AI_OCR_UI_EN: Catalog = {
  // ---- The section ----
  'aiProv.ocr.title': 'Read text with AI',
  'aiProv.ocr.desc': 'A vision model on your own key reads snips, manga, the Reading Lens, visual novels and book pages. It is usually the most accurate reader, above all for stylised or small text.',
  'aiProv.ocr.mode': 'When to use it',
  'aiProv.ocr.mode.off': 'Off',
  'aiProv.ocr.mode.unsure': 'Only when unsure',
  'aiProv.ocr.mode.always': 'Always',
  'aiProv.ocr.mode.off.hint': 'Only the readers on this computer read. You can still check one snip with AI.',
  'aiProv.ocr.mode.unsure.hint': 'The readers on this computer read first. When they are unsure, the picture is sent once, and the AI reading wins where they disagree.',
  'aiProv.ocr.mode.always.hint': 'AI reads every picture. The readers on this computer step in when it fails.',
  'aiProv.ocr.provider': 'Read with',
  'aiProv.ocr.provider.follow': 'Same as Settings › AI ({provider})',
  'aiProv.ocr.provider.reads': '{provider} (reads pictures)',
  'aiProv.ocr.provider.noKey': '{provider} (reads pictures, no key yet)',
  'aiProv.ocr.provider.textOnly': '{provider} (text only)',
  'aiProv.ocr.compatVision': 'My local model reads pictures',
  'aiProv.ocr.compatVision.hint': 'Turn this on only for a vision model, such as qwen2.5-vl, llava or gemma3. A text-only model cannot read pictures.',
  'aiProv.ocr.consent': 'Allow sending pictures to {provider}',
  'aiProv.ocr.privacy': 'Pictures you snip or read are sent to {provider} ({host}).',
  'aiProv.ocr.privacyLocal': 'Pictures you snip or read are sent to your local server ({host}) and stay on this computer.',
  'aiProv.ocr.cost': 'One request per snip, page or region. Your provider bills it like any other request, within your spending limit.',
  'aiProv.ocr.status.ready': 'Ready: {provider} reads the pictures.',
  'aiProv.ocr.status.ai-off': 'Turn on “Use AI features” in Settings › AI first.',
  'aiProv.ocr.status.no-vision': '{provider} cannot read pictures. Choose Claude, OpenAI or Gemini, or a local vision model.',
  'aiProv.ocr.status.not-configured': 'Add your key for {provider} in Settings › AI first.',
  'aiProv.ocr.status.no-consent': 'Allow sending pictures to use it.',
  'aiProv.ocr.openSettings': 'Open Settings › AI',

  // ---- "Check with AI" on a snip ----
  'aiProv.ocr.check': 'Check with AI',
  'aiProv.ocr.check.hint': 'Sends this picture to {provider} once. Its reading replaces the text where the two differ.',
  'aiProv.ocr.check.confirmTitle': 'Send this picture to {provider}?',
  'aiProv.ocr.check.confirmBody': 'Checking with AI sends the snipped picture to {provider} ({host}). Saying yes allows pictures to be sent from now on; you can turn that off in Settings › AI.',
  'aiProv.ocr.check.confirm': 'Send it',
  'aiProv.ocr.check.running': 'Checking with AI…',
  'aiProv.ocr.check.failed': 'The AI reader could not read this snip: {reason}',
};
