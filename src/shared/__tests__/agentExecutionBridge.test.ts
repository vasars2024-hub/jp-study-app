import { describe, expect, it } from 'vitest';
import {
  AGENT_EXECUTION_ATTACHMENT_CHAR_LIMIT,
  AGENT_EXECUTION_ATTACHMENTS_TOTAL_CHAR_LIMIT,
  AGENT_EXECUTION_IMAGE_BYTES_LIMIT,
  agentExecutionFailure,
  defaultAgentExecutionPolicy,
  normalizeAgentExecutionCancelResult,
  normalizeAgentExecutionEvent,
  normalizeAgentExecutionRequest,
  normalizeAgentExecutionResult,
} from '../agentExecutionBridge';
import { emptyAgentWorkspaceState } from '../agentWorkspace';

describe('Agent execution bridge contract', () => {
  it('builds an explicit local-only default policy', () => {
    expect(defaultAgentExecutionPolicy()).toMatchObject({
      target: { kind: 'local', backend: 'local-qwen' },
      allowCloud: false,
      allowSensitiveContext: false,
      cache: 'off',
      streaming: true,
    });
  });

  it('builds an explicit cloud policy only when the user selects a provider', () => {
    expect(defaultAgentExecutionPolicy('gemini-2.5-flash')).toMatchObject({
      target: { kind: 'cloud', providerId: 'gemini-2.5-flash' },
      allowCloud: true,
      cache: 'off',
    });
  });

  it('rejects empty, foreign-provider and persistent-cache requests', () => {
    const base = {
      requestId: 'run-1',
      conversationId: 'chat-1',
      prompt: 'Explain this',
      policy: defaultAgentExecutionPolicy(),
      allowLocalFallback: false,
    };
    expect(normalizeAgentExecutionRequest(base)).toEqual({ ...base, attachments: [] });
    expect(normalizeAgentExecutionRequest({ ...base, prompt: '   ' })).toBeNull();
    expect(normalizeAgentExecutionRequest({
      ...base,
      policy: { ...base.policy, cache: 'persistent' },
    })).toBeNull();
    expect(normalizeAgentExecutionRequest({
      ...base,
      policy: { ...base.policy, target: { kind: 'cloud', providerId: 'future-ai' } },
    })).toBeNull();
  });

  it('normalizes transient text attachments without retaining paths or weaker privacy', () => {
    const base = {
      requestId: 'run-files',
      conversationId: 'chat-1',
      prompt: 'Compare these notes',
      policy: defaultAgentExecutionPolicy(),
      allowLocalFallback: false,
    };
    expect(normalizeAgentExecutionRequest({
      ...base,
      attachments: [
        {
          id: 'note-a',
          kind: 'text',
          name: 'a.txt',
          mimeType: 'text/plain',
          sizeBytes: 12,
          sensitivity: 'ordinary',
          retained: true,
          contentText: 'first note',
        },
        {
          id: 'note-b',
          kind: 'document',
          name: 'b.md',
          contentText: '# Second note',
        },
      ],
    })).toEqual({
      ...base,
      attachments: [
        {
          id: 'note-a',
          kind: 'text',
          name: 'a.txt',
          mimeType: 'text/plain',
          sizeBytes: 12,
          sensitivity: 'sensitive',
          retained: false,
          contentText: 'first note',
        },
        {
          id: 'note-b',
          kind: 'document',
          name: 'b.md',
          sensitivity: 'sensitive',
          retained: false,
          contentText: '# Second note',
        },
      ],
    });
  });

  it('rejects malformed, binary, duplicate, path-bearing and too-many attachments', () => {
    const base = {
      requestId: 'run-files',
      conversationId: 'chat-1',
      prompt: 'Read this',
      policy: defaultAgentExecutionPolicy(),
      allowLocalFallback: false,
    };
    const valid = { id: 'a', kind: 'text', name: 'a.txt', contentText: 'a' };
    for (const attachments of [
      {},
      // An image kind with no payload: an attachment claiming to show something
      // it does not carry. Rejected since the vision lane opened, where before
      // the kind itself was unknown.
      [{ ...valid, kind: 'image' }],
      [{ ...valid, contentText: '   ' }],
      [{ ...valid, localPath: 'C:\\secret.txt' }],
      [{ ...valid, bytes: [1, 2, 3] }],
      [valid, { ...valid, name: 'duplicate.txt' }],
      Array.from({ length: 6 }, (_, index) => ({ ...valid, id: `a-${index}` })),
    ]) {
      expect(normalizeAgentExecutionRequest({ ...base, attachments })).toBeNull();
    }
  });

  it('normalizes an image attachment and derives its size from the payload', () => {
    const base = {
      requestId: 'run-vision',
      conversationId: 'chat-1',
      prompt: 'What does this screen say?',
      policy: defaultAgentExecutionPolicy('gemini-2.5-flash'),
      allowLocalFallback: false,
    };
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const imageBase64 = bytes.toString('base64');
    expect(normalizeAgentExecutionRequest({
      ...base,
      attachments: [{
        id: 'shot-1',
        kind: 'image',
        name: 'capture.png',
        mimeType: 'image/png',
        sensitivity: 'ordinary',
        retained: true,
        contentText: '設定',
        imageBase64,
      }],
    })).toEqual({
      ...base,
      attachments: [{
        id: 'shot-1',
        kind: 'image',
        name: 'capture.png',
        mimeType: 'image/png',
        // Not supplied by the caller above: computed from the payload, so the
        // figure the composer shows and the bytes that ship cannot diverge.
        sizeBytes: bytes.length,
        // The privacy floor is imposed, exactly as it is for text. A screenshot
        // of the user's screen may never arrive declaring itself ordinary.
        sensitivity: 'sensitive',
        retained: false,
        contentText: '設定',
        imageBase64,
      }],
    });
  });

  it('holds the vision lane to one declared field, three formats and its own bounds', () => {
    const base = {
      requestId: 'run-vision-reject',
      conversationId: 'chat-1',
      prompt: 'Read this',
      policy: defaultAgentExecutionPolicy('gemini-2.5-flash'),
      allowLocalFallback: false,
    };
    const bytes = Buffer.from([1, 2, 3]);
    const imageBase64 = bytes.toString('base64');
    const image = {
      id: 'shot-1',
      kind: 'image',
      name: 'capture.png',
      mimeType: 'image/png',
      contentText: '',
      imageBase64,
    };
    expect(normalizeAgentExecutionRequest({ ...base, attachments: [image] })).not.toBeNull();

    const oversized = Buffer.alloc(AGENT_EXECUTION_IMAGE_BYTES_LIMIT + 1).toString('base64');
    for (const attachments of [
      // The payload may not ride on a text attachment: reaching the vision lane
      // without declaring it is exactly what the forbidden-field set prevents,
      // and a new field must not become a way around that.
      [{ ...image, kind: 'text', contentText: 'a' }],
      // The old forbidden names are untouched by the new lane.
      [{ ...image, base64: imageBase64 }],
      [{ ...image, localPath: 'C:\\Users\\shot.png' }],
      // A `data:` URL, whitespace and a non-base64 alphabet are all rejected
      // rather than being repaired into something plausible.
      [{ ...image, imageBase64: `data:image/png;base64,${imageBase64}` }],
      [{ ...image, imageBase64: `${imageBase64}\n` }],
      [{ ...image, imageBase64: '****' }],
      // Format must be declared and must be one of the three. Guessing it from
      // the bytes would put an unverified claim on the wire.
      [{ ...image, mimeType: undefined }],
      [{ ...image, mimeType: 'image/gif' }],
      // A stated size that disagrees with the payload.
      [{ ...image, sizeBytes: bytes.length + 1 }],
      [{ ...image, imageBase64: oversized }],
      // Bounded separately from the five-attachment limit.
      [
        { ...image, id: 'a' },
        { ...image, id: 'b' },
        { ...image, id: 'c' },
      ],
    ]) {
      expect(normalizeAgentExecutionRequest({ ...base, attachments })).toBeNull();
    }
  });

  it('accepts exact attachment character limits and rejects any overflow without truncation', () => {
    const base = {
      requestId: 'run-limits',
      conversationId: 'chat-1',
      prompt: 'Read this',
      policy: defaultAgentExecutionPolicy(),
      allowLocalFallback: false,
    };
    const content = 'a'.repeat(AGENT_EXECUTION_ATTACHMENT_CHAR_LIMIT);
    const exact = normalizeAgentExecutionRequest({
      ...base,
      attachments: [
        { id: 'a', kind: 'text', name: 'a.txt', contentText: content },
        { id: 'b', kind: 'document', name: 'b.md', contentText: content },
      ],
    });
    expect(exact?.attachments.map((entry) => entry.contentText.length))
      .toEqual([AGENT_EXECUTION_ATTACHMENT_CHAR_LIMIT, AGENT_EXECUTION_ATTACHMENT_CHAR_LIMIT]);
    expect(exact?.attachments.reduce((sum, entry) => sum + entry.contentText.length, 0))
      .toBe(AGENT_EXECUTION_ATTACHMENTS_TOTAL_CHAR_LIMIT);

    expect(normalizeAgentExecutionRequest({
      ...base,
      attachments: [{
        id: 'too-long',
        kind: 'text',
        name: 'too-long.txt',
        contentText: `${content}x`,
      }],
    })).toBeNull();
    expect(normalizeAgentExecutionRequest({
      ...base,
      attachments: [
        { id: 'a', kind: 'text', name: 'a.txt', contentText: content },
        { id: 'b', kind: 'text', name: 'b.txt', contentText: content },
        { id: 'c', kind: 'text', name: 'c.txt', contentText: 'x' },
      ],
    })).toBeNull();
  });

  it('refuses a cloud target whose cloud consent bit is false', () => {
    expect(normalizeAgentExecutionRequest({
      requestId: 'run-1',
      conversationId: 'chat-1',
      prompt: 'Explain this',
      policy: {
        ...defaultAgentExecutionPolicy('deepseek-v4-flash'),
        allowCloud: false,
      },
      allowLocalFallback: false,
    })).toBeNull();
  });

  it('bounds streamed events and rejects malformed event shapes', () => {
    expect(normalizeAgentExecutionEvent({
      type: 'chunk',
      requestId: 'run-1',
      assistantMessageId: 'assistant-1',
      text: 'part',
    })).toEqual({
      type: 'chunk',
      requestId: 'run-1',
      assistantMessageId: 'assistant-1',
      text: 'part',
    });
    expect(normalizeAgentExecutionEvent({ type: 'chunk', requestId: 'run-1' })).toBeNull();
  });

  it('normalizes success state and closed failure codes', () => {
    const state = emptyAgentWorkspaceState();
    expect(normalizeAgentExecutionResult({
      ok: true,
      requestId: 'run-1',
      assistantMessageId: 'assistant-1',
      delivery: 'streamed',
      state,
    })).toEqual({
      ok: true,
      requestId: 'run-1',
      assistantMessageId: 'assistant-1',
      delivery: 'streamed',
      state,
    });
    expect(normalizeAgentExecutionResult({
      ok: false,
      requestId: 'run-1',
      code: 'authentication',
      state,
    })).toEqual(agentExecutionFailure('authentication', 'run-1', state));
    expect(normalizeAgentExecutionResult({ ok: false, code: 'future-error' }))
      .toEqual(agentExecutionFailure('provider-failed'));
  });

  it('normalizes cancellation without exposing arbitrary reply data', () => {
    expect(normalizeAgentExecutionCancelResult({ ok: true, cancelled: true }))
      .toEqual({ ok: true, cancelled: true });
    expect(normalizeAgentExecutionCancelResult({ ok: false, cancelled: true, secret: 'x' }))
      .toEqual({ ok: true, cancelled: false });
  });
});
