/**
 * The pure halves of the AI fixes (docs/AI_AUDIT.md F2/F3/F5/F8):
 *  - AI failures become codes the UI can translate;
 *  - model output is sanitized before it can reach an Anki field;
 *  - a rejection survives the same answer being recorded twice;
 *  - unanswered notes become retryable failures, not `pending` forever;
 *  - a Japanese-only Whisper tier is never used for Chinese audio;
 *  - a partial translation report survives the IPC sanitizer;
 *  - the cloud translate prompt has no Japanese-only advice for Chinese.
 */
import { describe, expect, it } from 'vitest';
import { AI_ERROR_CODES, aiErrorCodeOf, aiErrorKey, isAiErrorCode } from '../aiErrorCodes';
import {
  approveAiVariant,
  beginAiBatch,
  failPendingAiNotes,
  readAiProvenance,
  recordAiResult,
  rejectAiVariant,
  sanitizeAiFieldHtml,
  summarizeAiReview,
  wrapAiProvenance,
} from '../ankiAiAdditions';
import { whisperTierForLang, whisperTierSupports, WHISPER_MULTILINGUAL_REQUIRED } from '../whisperModels';
import { buildCloudTranslatePrompt, sanitizeTranslateResultMeta } from '../translateProviders';
import { isCompleteMediaStudyAssistantResult, parseMediaStudyAssistantResult } from '../mediaStudyAssistant';
import { en } from '../i18n/catalogs/en';
import { ja } from '../i18n/catalogs/ja';
import { zh } from '../i18n/catalogs/zh';
import { ru } from '../i18n/catalogs/ru';

describe('AI error codes', () => {
  it('maps provider-runtime codes, timeouts and fetch failures', () => {
    expect(aiErrorCodeOf(Object.assign(new Error('x'), { code: 'output-truncated' }))).toBe('truncated');
    expect(aiErrorCodeOf(Object.assign(new Error('x'), { code: 'missing-credential' }))).toBe('no-key');
    expect(aiErrorCodeOf(Object.assign(new Error('x'), { code: 'spend-budget' }))).toBe('spend');
    expect(aiErrorCodeOf(Object.assign(new Error('x'), { name: 'TimeoutError' }))).toBe('timeout');
    expect(aiErrorCodeOf(new TypeError('fetch failed'))).toBe('network');
    expect(aiErrorCodeOf(new Error('???'))).toBe('other');
    expect(aiErrorCodeOf('boom')).toBe('other');
  });

  it('has a translation for every code in every UI language', () => {
    for (const code of AI_ERROR_CODES) {
      for (const [lang, catalog] of Object.entries({ en, ja, zh, ru })) {
        expect(typeof (catalog as Record<string, unknown>)[aiErrorKey(code)], `${lang} ${code}`).toBe('string');
      }
      expect((ru as Record<string, unknown>)[aiErrorKey(code)]).not.toBe((en as Record<string, unknown>)[aiErrorKey(code)]);
    }
    expect(isAiErrorCode('timeout')).toBe(true);
    expect(isAiErrorCode('AI request timed out')).toBe(false);
  });
});

describe('model output written to Anki fields (F3)', () => {
  it('escapes markup, so an injected handler cannot run in a card template', () => {
    const wrapped = wrapAiProvenance('<img src=x onerror="alert(1)">猫', 'p', 'm');
    expect(wrapped).not.toContain('<img');
    expect(wrapped).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;猫');
    expect(sanitizeAiFieldHtml('<script>x</script>')).toBe('&lt;script&gt;x&lt;/script&gt;');
  });

  it('keeps allowlisted bare formatting, never with attributes, and balances it', () => {
    expect(sanitizeAiFieldHtml('<b>猫</b>が<br/>寝る')).toBe('<b>猫</b>が<br>寝る');
    expect(sanitizeAiFieldHtml('<b onclick="x">猫</b>')).toBe('&lt;b onclick=&quot;x&quot;&gt;猫');
    expect(sanitizeAiFieldHtml('<b>open')).toBe('<b>open</b>');
    expect(sanitizeAiFieldHtml('stray</i>')).toBe('stray');
    expect(sanitizeAiFieldHtml('<ruby>猫<rt>ねこ</rt></ruby>')).toBe('<ruby>猫<rt>ねこ</rt></ruby>');
  });

  it('does not double-escape existing character references', () => {
    expect(sanitizeAiFieldHtml('Tom &amp; Jerry &#12354; & co')).toBe('Tom &amp; Jerry &#12354; &amp; co');
  });

  it('round-trips through the provenance reader', () => {
    expect(readAiProvenance(wrapAiProvenance('<b>猫</b>', 'p', 'm'))?.value).toBe('<b>猫</b>');
  });
});

describe('the review survives a run (F3)', () => {
  const answer = { ok: true as const, variants: [{ id: 'n1-v0', text: 'A' }, { id: 'n1-v1', text: 'B' }] };

  it('a rejection made between the progress event and the final result stays rejected', () => {
    let batch = beginAiBatch('b', 'example-sentence', '', 'm', [{ noteId: 'n1', term: '猫' }]);
    batch = recordAiResult(batch, 'n1', answer); // progress event
    batch = rejectAiVariant(batch, 'n1', 'n1-v0'); // the user, while the run continues
    batch = recordAiResult(batch, 'n1', answer); // the run's final result
    expect(batch.notes[0].variants.find((v) => v.id === 'n1-v0')?.rejected).toBe(true);
    expect(summarizeAiReview(batch).rejectedVariants).toBe(1);
  });

  it('a late failure report does not wipe an answer under review', () => {
    let batch = beginAiBatch('b', 'definition', '', 'm', [{ noteId: 'n1', term: '猫' }]);
    batch = recordAiResult(batch, 'n1', answer);
    batch = recordAiResult(batch, 'n1', { ok: false, error: 'timeout' });
    expect(batch.notes[0].status).toBe('generated');
  });

  it('notes a run never answered become retryable failures; approvals are untouched', () => {
    let batch = beginAiBatch('b', 'hint', '', 'm', [{ noteId: 'n1', term: '猫' }, { noteId: 'n2', term: '犬' }]);
    batch = recordAiResult(batch, 'n1', answer);
    batch = approveAiVariant(batch, 'n1', 'n1-v1');
    batch = failPendingAiNotes(batch, 'ipc-failed');
    expect(batch.notes.map((n) => n.status)).toEqual(['generated', 'failed']);
    expect(batch.notes[1].error).toBe('ipc-failed');
    expect(batch.notes[0].approvedVariantId).toBe('n1-v1');
  });
});

describe('Whisper tiers per language (F5)', () => {
  it('never runs the Japanese-only tier for Chinese or Russian', () => {
    expect(whisperTierSupports('kotoba-whisper', 'ja')).toBe(true);
    expect(whisperTierSupports('kotoba-whisper', 'zh')).toBe(false);
    expect(whisperTierForLang('kotoba-whisper', 'ja')).toBe('kotoba-whisper');
    expect(whisperTierForLang('kotoba-whisper', 'zh')).toBe('whisper-small');
    expect(whisperTierForLang('kotoba-whisper', 'ru')).not.toBe('kotoba-whisper');
  });

  it('prefers a multilingual tier that is already downloaded', () => {
    expect(whisperTierForLang('kotoba-whisper', 'zh', (t) => t === 'whisper-base')).toBe('whisper-base');
    expect(whisperTierForLang('whisper-large-v3-turbo', 'zh')).toBe('whisper-large-v3-turbo');
  });

  it('names the refusal code main stops the job on', () => {
    expect(WHISPER_MULTILINGUAL_REQUIRED).toBe('multilingual-model-required');
    expect(typeof (zh as Record<string, unknown>)['aiFix.whisper.multilingualRequired']).toBe('string');
  });
});

describe('translate partial report and prompt (F2, F8)', () => {
  it('keeps a valid partial report through the IPC sanitizer and drops a bogus one', () => {
    expect(sanitizeTranslateResultMeta({ provider: 'deepl', partial: { missing: [1], total: 3 } }))
      .toEqual({ provider: 'deepl', partial: { missing: [1], total: 3 } });
    expect(sanitizeTranslateResultMeta({ provider: 'deepl', partial: { missing: [9], total: 3 } }))
      .toEqual({ provider: 'deepl' });
  });

  it('gives Chinese its own guidance, not keigo', () => {
    const zhPrompt = buildCloudTranslatePrompt(['我很好。'], 'zh', 'en');
    expect(zhPrompt).not.toContain('keigo');
    expect(zhPrompt).toContain('measure words');
    expect(buildCloudTranslatePrompt(['猫です。'], 'ja', 'en')).toContain('keigo');
  });
});

describe('media assistant answers (F2)', () => {
  it('requires what the mode asked for', () => {
    const base = parseMediaStudyAssistantResult(JSON.stringify({ summary: 's', translation: 't' }), 'explain-grammar');
    expect(isCompleteMediaStudyAssistantResult(base)).toBe(false);
    const withGrammar = parseMediaStudyAssistantResult(
      JSON.stringify({ summary: 's', grammar: [{ pattern: 'p', explanation: 'e', level: 'N5' }] }),
      'explain-grammar',
    );
    expect(isCompleteMediaStudyAssistantResult(withGrammar)).toBe(true);
  });

  it('a non-JSON reply is a coded parse error', () => {
    expect(() => parseMediaStudyAssistantResult('nope', 'explain-dialogue')).toThrow(/malformed/);
    try {
      parseMediaStudyAssistantResult('nope', 'explain-dialogue');
    } catch (error) {
      expect(aiErrorCodeOf(error)).toBe('invalid');
    }
  });
});
