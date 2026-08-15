// Reviewed AI additions — ANKI_DECK_WORKBENCH_PLAN.md Phase 4 and gate 12
// ("generate several AI example sentences and learning aids, approve only
// selected variants, cancel one batch, retry only failures, and verify that
// rejected/generated data is represented honestly").
//
// The failures these guard are the ones that would let gate 12 pass on paper and
// misrepresent a deck in practice: an unreviewed variant reaching a field, a
// rejection disappearing so the user cannot see or undo it, a retry re-asking
// for work the user already refused or cancelled, and generated prose landing in
// an exported deck with nothing to distinguish it from the user's own writing.
import { describe, expect, it } from 'vitest';
import {
  approveAiVariant,
  approvedAiAdditions,
  aiRetryTargets,
  beginAiBatch,
  beginAiRetry,
  cancelAiBatch,
  clearAiDecision,
  readAiProvenance,
  recordAiResult,
  rejectAiVariant,
  summarizeAiReview,
  wrapAiProvenance,
  type AiBatch,
} from '../ankiAiAdditions';
import { readEnrichProvenance, wrapEnrichProvenance } from '../ankiEnrich';

const batchOf = (...terms: Array<[string, string]>): AiBatch =>
  beginAiBatch(
    'b1',
    'example-sentence',
    'anthropic',
    'claude-opus-5',
    terms.map(([noteId, term]) => ({ noteId, term })),
  );

const withVariants = (batch: AiBatch, noteId: string, ...texts: string[]): AiBatch =>
  recordAiResult(batch, noteId, {
    ok: true,
    variants: texts.map((text, i) => ({ id: `${noteId}v${i + 1}`, text })),
  });

describe('approval gates what may be written', () => {
  it('writes nothing until a variant is approved, however many came back', () => {
    let batch = withVariants(batchOf(['n1', '猫']), 'n1', '猫が寝ている。', '猫を飼っている。');
    expect(approvedAiAdditions(batch)).toEqual([]);
    expect(summarizeAiReview(batch).undecided).toBe(1);

    batch = approveAiVariant(batch, 'n1', 'n1v2');
    expect(approvedAiAdditions(batch)).toEqual([{ noteId: 'n1', text: '猫を飼っている。' }]);
  });

  it('approves at most one variant per note — a second approval moves it', () => {
    let batch = withVariants(batchOf(['n1', '猫']), 'n1', 'A', 'B');
    batch = approveAiVariant(batch, 'n1', 'n1v1');
    batch = approveAiVariant(batch, 'n1', 'n1v2');

    expect(approvedAiAdditions(batch)).toEqual([{ noteId: 'n1', text: 'B' }]);
    expect(summarizeAiReview(batch).approved).toBe(1);
  });

  it('writes only the approved notes of a mixed batch', () => {
    let batch = batchOf(['n1', '猫'], ['n2', '犬'], ['n3', '鳥']);
    batch = withVariants(batch, 'n1', 'A1');
    batch = withVariants(batch, 'n2', 'B1');
    batch = recordAiResult(batch, 'n3', { ok: false, error: 'rate limited' });
    batch = approveAiVariant(batch, 'n1', 'n1v1');
    // n2 is left undecided on purpose: it must not ride along on n1's approval.

    expect(approvedAiAdditions(batch)).toEqual([{ noteId: 'n1', text: 'A1' }]);
    const summary = summarizeAiReview(batch);
    expect(summary).toMatchObject({ requested: 3, approved: 1, undecided: 1, failed: 1 });
  });

  it('treats an answer with no usable variant as a failure, not an empty success', () => {
    const batch = recordAiResult(batchOf(['n1', '猫']), 'n1', {
      ok: true,
      variants: [{ id: 'n1v1', text: '   ' }],
    });
    const note = batch.notes[0];
    expect(note.status).toBe('failed');
    expect(note.error).toBe('no-variants');
    expect(aiRetryTargets(batch)).toEqual(['n1']);
  });
});

describe('rejected data stays visible', () => {
  it('keeps a rejected variant, flagged, rather than deleting it', () => {
    let batch = withVariants(batchOf(['n1', '猫']), 'n1', 'A', 'B');
    batch = rejectAiVariant(batch, 'n1', 'n1v1');

    expect(batch.notes[0].variants).toHaveLength(2);
    expect(batch.notes[0].variants[0]).toMatchObject({ text: 'A', rejected: true });
    expect(summarizeAiReview(batch).rejectedVariants).toBe(1);
  });

  it('reports a note whose every variant was rejected as a decision, not as undecided', () => {
    let batch = withVariants(batchOf(['n1', '猫']), 'n1', 'A', 'B');
    batch = rejectAiVariant(batch, 'n1', 'n1v1');
    batch = rejectAiVariant(batch, 'n1', 'n1v2');

    const summary = summarizeAiReview(batch);
    expect(summary).toMatchObject({ allRejected: 1, undecided: 0, approved: 0 });
    expect(approvedAiAdditions(batch)).toEqual([]);
  });

  it('lets the user change their mind, and stops reporting the written text as rejected', () => {
    let batch = withVariants(batchOf(['n1', '猫']), 'n1', 'A', 'B');
    batch = rejectAiVariant(batch, 'n1', 'n1v1');
    batch = approveAiVariant(batch, 'n1', 'n1v1');

    expect(batch.notes[0].variants[0].rejected).toBeUndefined();
    expect(approvedAiAdditions(batch)).toEqual([{ noteId: 'n1', text: 'A' }]);
    expect(summarizeAiReview(batch).rejectedVariants).toBe(0);
  });

  it('rejecting the approved variant leaves the note undecided rather than writing it', () => {
    let batch = withVariants(batchOf(['n1', '猫']), 'n1', 'A', 'B');
    batch = approveAiVariant(batch, 'n1', 'n1v1');
    batch = rejectAiVariant(batch, 'n1', 'n1v1');

    expect(approvedAiAdditions(batch)).toEqual([]);
    expect(summarizeAiReview(batch).undecided).toBe(1);
  });

  it('clears a decision back to undecided', () => {
    let batch = withVariants(batchOf(['n1', '猫']), 'n1', 'A');
    batch = approveAiVariant(batch, 'n1', 'n1v1');
    batch = clearAiDecision(batch, 'n1', 'n1v1');

    expect(approvedAiAdditions(batch)).toEqual([]);
    expect(summarizeAiReview(batch).undecided).toBe(1);
  });
});

describe('cancelling one batch', () => {
  it('keeps what already came back and marks only the unanswered as cancelled', () => {
    let batch = batchOf(['n1', '猫'], ['n2', '犬'], ['n3', '鳥']);
    batch = withVariants(batch, 'n1', 'A1');
    batch = recordAiResult(batch, 'n2', { ok: false, error: 'timeout' });
    batch = cancelAiBatch(batch);

    expect(batch.notes.map((n) => n.status)).toEqual(['generated', 'failed', 'cancelled']);
    const summary = summarizeAiReview(batch);
    expect(summary).toMatchObject({ requested: 3, cancelled: 1, failed: 1, pending: 0 });
  });

  it('a cancelled note is distinguishable from one that was never requested', () => {
    const cancelled = cancelAiBatch(batchOf(['n1', '猫']));
    expect(cancelled.notes[0].status).toBe('cancelled');
    expect(summarizeAiReview(cancelled)).toMatchObject({ requested: 1, cancelled: 1 });
    // The negative control: a batch nobody cancelled reports the same note as
    // still pending, so "cancelled" is never inferred from an absent result.
    expect(summarizeAiReview(batchOf(['n1', '猫']))).toMatchObject({ pending: 1, cancelled: 0 });
  });

  it('an approval made before the cancel still writes', () => {
    let batch = batchOf(['n1', '猫'], ['n2', '犬']);
    batch = withVariants(batch, 'n1', 'A1');
    batch = approveAiVariant(batch, 'n1', 'n1v1');
    batch = cancelAiBatch(batch);

    expect(approvedAiAdditions(batch)).toEqual([{ noteId: 'n1', text: 'A1' }]);
  });
});

describe('retry covers failures and nothing else', () => {
  it('retries the failed note and not the rejected or cancelled ones', () => {
    let batch = batchOf(['n1', '猫'], ['n2', '犬'], ['n3', '鳥'], ['n4', '魚']);
    batch = withVariants(batch, 'n1', 'A1');
    batch = approveAiVariant(batch, 'n1', 'n1v1');
    batch = withVariants(batch, 'n2', 'B1');
    batch = rejectAiVariant(batch, 'n2', 'n2v1');
    batch = recordAiResult(batch, 'n3', { ok: false, error: '503' });
    batch = cancelAiBatch(batch); // n4 was still waiting

    expect(aiRetryTargets(batch)).toEqual(['n3']);
  });

  it('a retry cannot disturb a decision already made', () => {
    let batch = batchOf(['n1', '猫'], ['n2', '犬']);
    batch = withVariants(batch, 'n1', 'A1');
    batch = approveAiVariant(batch, 'n1', 'n1v1');
    batch = recordAiResult(batch, 'n2', { ok: false, error: '503' });

    const retrying = beginAiRetry(batch);
    expect(retrying.notes[0]).toMatchObject({ status: 'generated', approvedVariantId: 'n1v1' });
    expect(retrying.notes[1]).toMatchObject({ status: 'pending', error: undefined });

    const done = withVariants(retrying, 'n2', 'B1');
    expect(done.notes[1].status).toBe('generated');
    expect(approvedAiAdditions(done)).toEqual([{ noteId: 'n1', text: 'A1' }]);
  });

  it('a late answer never overwrites an approval', () => {
    let batch = withVariants(batchOf(['n1', '猫']), 'n1', 'A1');
    batch = approveAiVariant(batch, 'n1', 'n1v1');
    batch = withVariants(batch, 'n1', 'LATE');

    expect(approvedAiAdditions(batch)).toEqual([{ noteId: 'n1', text: 'A1' }]);
  });

  it('nothing to retry when nothing failed', () => {
    let batch = withVariants(batchOf(['n1', '猫']), 'n1', 'A1');
    batch = approveAiVariant(batch, 'n1', 'n1v1');
    expect(aiRetryTargets(batch)).toEqual([]);
    expect(beginAiRetry(batch)).toEqual(batch);
  });
});

describe('generated text says it is generated', () => {
  it('round-trips the provider and model through the field text', () => {
    const wrapped = wrapAiProvenance('猫が寝ている。', 'anthropic', 'claude-opus-5');
    const read = readAiProvenance(wrapped);

    expect(read).toEqual({
      provider: 'anthropic',
      model: 'claude-opus-5',
      value: '猫が寝ている。',
    });
  });

  it('marks generation even when nobody is named, rather than staying silent', () => {
    const wrapped = wrapAiProvenance('猫が寝ている。', '', '');
    expect(readAiProvenance(wrapped)).toEqual({
      provider: '',
      model: '',
      value: '猫が寝ている。',
    });
  });

  it('is not confused with dictionary provenance in either direction', () => {
    const dict = wrapEnrichProvenance('cat', ['JMdict (EN)'], 'inline');
    const ai = wrapAiProvenance('猫が寝ている。', 'anthropic', 'claude-opus-5');

    // The specific misrepresentation the plan forbids: generated prose read back
    // as a dictionary quotation, or a gloss read back as a generation.
    expect(readAiProvenance(dict)).toBeNull();
    expect(readEnrichProvenance(ai)).toBeNull();
    expect(readAiProvenance(ai)?.value).toBe('猫が寝ている。');
    expect(readEnrichProvenance(dict)?.sources).toEqual(['JMdict (EN)']);
  });

  it('reads null for hand-typed text', () => {
    expect(readAiProvenance('猫が寝ている。')).toBeNull();
    expect(readAiProvenance('<span class="other">猫</span>')).toBeNull();
  });

  it('survives a model name carrying quotes or angle brackets', () => {
    const wrapped = wrapAiProvenance('text', 'a"b', '<m>');
    expect(readAiProvenance(wrapped)).toEqual({ provider: 'a"b', model: '<m>', value: 'text' });
  });

  it('keeps markup inside the generated value intact', () => {
    const wrapped = wrapAiProvenance('<b>猫</b>が寝ている。', 'anthropic', 'm');
    expect(readAiProvenance(wrapped)?.value).toBe('<b>猫</b>が寝ている。');
  });
});
