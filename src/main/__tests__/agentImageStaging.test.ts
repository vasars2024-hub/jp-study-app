// @vitest-environment node
/**
 * The capture staging area — the fourth route, and the only one a screenshot may
 * travel between the window that captured it and the Agent window.
 *
 * The properties under test are the ones the privacy floor rests on rather than
 * the ones a store normally gets tested for. A staged capture must be
 * **single-use**, must **expire** whether or not anyone comes for it, and must
 * be **bounded** so a surface staging in a loop cannot hold the process's memory.
 * Anything weaker and `retained: false` is a claim the app does not keep.
 *
 * The registration test is the other half: a channel that is declared but never
 * handled is a `bridge-unavailable` at the far end, and the renderer client
 * treats that identically to a preload that predates the method — which would
 * make a completely absent main handler look like an old window.
 */
import os from 'node:os';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: unknown, ...args: unknown[]) => unknown;

interface FakeWindow {
  destroyed: boolean;
  sent: Array<{ channel: string; payload: unknown }>;
}

const registry = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  windows: [] as FakeWindow[],
}));

vi.mock('electron', () => ({
  app: { getPath: (): string => os.tmpdir() },
  ipcMain: {
    handle: (channel: string, handler: Handler): void => {
      registry.handlers.set(channel, handler);
    },
  },
  BrowserWindow: {
    getAllWindows: () => registry.windows.map((window) => ({
      isDestroyed: () => window.destroyed,
      webContents: {
        send: (channel: string, payload: unknown) => window.sent.push({ channel, payload }),
      },
    })),
  },
}));

import {
  AGENT_IMAGE_STAGING_CHANNELS,
  AGENT_IMAGE_STAGING_CONVERSATION_LIMIT,
  AGENT_IMAGE_STAGING_PER_CONVERSATION_LIMIT,
  AGENT_IMAGE_STAGING_TOTAL_BYTES_LIMIT,
  AGENT_IMAGE_STAGING_TTL_MS,
  mergeStagedImageAttachments,
  splitImageDataUrl,
  stagedImageAttachment,
  type AgentStagedImage,
} from '../../shared/agentImageStaging';
import {
  AGENT_EXECUTION_IMAGE_BYTES_LIMIT,
  defaultAgentExecutionPolicy,
  normalizeAgentExecutionRequest,
  type AgentExecutionAttachment,
} from '../../shared/agentExecutionBridge';
import {
  createAgentImageStagingStore,
  registerAgentImageStagingIpc,
  type AgentImageStagingStore,
} from '../agentImageStaging';

/** A 1×1 PNG, the smallest thing that is genuinely an image. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/**
 * `bytes` decoded bytes of canonical base64.
 *
 * Built through `Buffer` rather than by repeating a character, so the padding is
 * whatever a real encoder would produce — `decodedBase64Bytes` reads the padding
 * to get its answer, and a hand-rolled string is the wrong thing to measure it
 * against.
 */
function payloadOfBytes(bytes: number): string {
  return Buffer.alloc(bytes).toString('base64');
}

/**
 * One 4 MiB payload, shared by every stage in the byte-budget tests.
 *
 * Exceeding the 32 MiB process budget takes nine of these, and nine distinct
 * strings would be ~50 MB of allocation for a test about eviction order. Strings
 * are immutable and the store keeps the reference, so re-staging this one costs
 * nothing beyond the first encode.
 */
const MAX_IMAGE_BASE64 = payloadOfBytes(AGENT_EXECUTION_IMAGE_BYTES_LIMIT);

function stage(
  store: AgentImageStagingStore,
  conversationId: string,
  imageBase64 = PNG_BASE64,
  now?: number,
) {
  return store.stage(
    { conversationId, name: 'capture.png', mimeType: 'image/png', imageBase64 },
    now,
  );
}

describe('agent image staging store', () => {
  let store: AgentImageStagingStore;

  beforeEach(() => {
    store = createAgentImageStagingStore();
  });

  it('hands a staged capture to exactly one claimant', () => {
    expect(stage(store, 'agent-1').ok).toBe(true);

    const first = store.take('agent-1');
    expect(first.ok && first.images).toHaveLength(1);

    // The second claim is `ok` with nothing, not a failure: the shell asks on
    // every workspace push and "no capture is waiting" is the normal answer.
    const second = store.take('agent-1');
    expect(second).toEqual({ ok: true, images: [] });
    expect(store.size()).toBe(0);
    expect(store.bytes()).toBe(0);
  });

  it('gives a claim back in the shape the composer can attach', () => {
    stage(store, 'agent-1');
    const claimed = store.take('agent-1');
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) return;
    const [image] = claimed.images;
    expect(image.mimeType).toBe('image/png');
    expect(image.imageBase64).toBe(PNG_BASE64);

    const attachment = stagedImageAttachment(image);
    expect(attachment).toMatchObject({
      kind: 'image',
      sensitivity: 'sensitive',
      retained: false,
      contentText: '',
    });
    // The whole point of the lane: what a claim produces must survive the
    // execution normalizer, or the composer holds an attachment that can never
    // be sent and the Send button dies with no reason given.
    const normalized = normalizeAgentExecutionRequest({
      requestId: 'run-1',
      conversationId: 'agent-1',
      prompt: 'what does this say?',
      policy: defaultAgentExecutionPolicy('gemini-2.5-flash'),
      attachments: [attachment],
    });
    expect(normalized?.attachments).toHaveLength(1);
    expect(normalized?.attachments[0].imageBase64).toBe(PNG_BASE64);
  });

  it('drops a capture nobody claimed once its TTL passes', () => {
    const staged = 1_000_000;
    stage(store, 'agent-1', PNG_BASE64, staged);

    const early = store.take('agent-1', staged + AGENT_IMAGE_STAGING_TTL_MS - 1);
    expect(early.ok && early.images).toHaveLength(1);

    stage(store, 'agent-2', PNG_BASE64, staged);
    const late = store.take('agent-2', staged + AGENT_IMAGE_STAGING_TTL_MS);
    expect(late).toEqual({ ok: true, images: [] });
  });

  it('refuses more captures for one conversation than a request could carry', () => {
    for (let index = 0; index < AGENT_IMAGE_STAGING_PER_CONVERSATION_LIMIT; index += 1) {
      expect(stage(store, 'agent-1').ok).toBe(true);
    }
    expect(stage(store, 'agent-1')).toEqual({ ok: false, code: 'too-many' });
  });

  it('refuses a payload larger than one request may carry, without decoding it', () => {
    const oversize = payloadOfBytes(AGENT_EXECUTION_IMAGE_BYTES_LIMIT + 1);
    expect(stage(store, 'agent-1', oversize)).toEqual({ ok: false, code: 'invalid-request' });
    expect(store.size()).toBe(0);
  });

  it('refuses a field the attachment contract forbids, rather than ignoring it', () => {
    // Caught by a driven probe: this normalizer read only the fields it knew
    // about, so `bytes` was dropped and the stage answered `ok`. Nothing untyped
    // could reach the attachment, but a caller who sent it was told it landed —
    // and the boundary has two doors, so it has to hold at both.
    for (const field of ['localPath', 'path', 'bytes', 'contentBytes', 'data', 'base64', 'buffer']) {
      expect(store.stage({
        conversationId: 'agent-1',
        name: 'capture.png',
        mimeType: 'image/png',
        imageBase64: PNG_BASE64,
        [field]: 'anything at all',
      })).toEqual({ ok: false, code: 'invalid-request' });
    }
    expect(store.size()).toBe(0);
  });

  it('refuses anything the request contract would refuse', () => {
    expect(store.stage({ conversationId: '', name: 'a', mimeType: 'image/png', imageBase64: PNG_BASE64 }))
      .toEqual({ ok: false, code: 'invalid-request' });
    expect(store.stage({ conversationId: 'agent-1', name: 'a', mimeType: 'image/gif', imageBase64: PNG_BASE64 }))
      .toEqual({ ok: false, code: 'invalid-request' });
    expect(store.stage({ conversationId: 'agent-1', name: 'a', mimeType: 'image/png', imageBase64: 'not base64!!' }))
      .toEqual({ ok: false, code: 'invalid-request' });
    // A `data:` URL is two claims about the same bytes; the prefix is refused
    // here exactly as it is on an execution attachment.
    expect(store.stage({
      conversationId: 'agent-1',
      name: 'a',
      mimeType: 'image/png',
      imageBase64: `data:image/png;base64,${PNG_BASE64}`,
    })).toEqual({ ok: false, code: 'invalid-request' });
    expect(store.size()).toBe(0);
  });

  it('evicts the oldest conversation rather than growing without end', () => {
    for (let index = 0; index < AGENT_IMAGE_STAGING_CONVERSATION_LIMIT + 4; index += 1) {
      expect(stage(store, `agent-${index}`).ok).toBe(true);
    }
    expect(store.size()).toBeLessThanOrEqual(AGENT_IMAGE_STAGING_CONVERSATION_LIMIT);
    // The oldest is gone and the newest is still claimable.
    expect(store.take('agent-0')).toEqual({ ok: true, images: [] });
    const newest = store.take(`agent-${AGENT_IMAGE_STAGING_CONVERSATION_LIMIT + 3}`);
    expect(newest.ok && newest.images).toHaveLength(1);
  });

  it('makes room by age when the process budget is full', () => {
    const fill = Math.floor(AGENT_IMAGE_STAGING_TOTAL_BYTES_LIMIT / AGENT_EXECUTION_IMAGE_BYTES_LIMIT);
    for (let index = 0; index < fill; index += 1) {
      expect(stage(store, `agent-${index}`, MAX_IMAGE_BASE64).ok).toBe(true);
    }
    expect(store.bytes()).toBe(AGENT_IMAGE_STAGING_TOTAL_BYTES_LIMIT);

    expect(stage(store, 'agent-late', MAX_IMAGE_BASE64).ok).toBe(true);
    expect(store.bytes()).toBeLessThanOrEqual(AGENT_IMAGE_STAGING_TOTAL_BYTES_LIMIT);
    expect(store.take('agent-0')).toEqual({ ok: true, images: [] });
    const late = store.take('agent-late');
    expect(late.ok && late.images).toHaveLength(1);
  });

  it('never evicts the conversation being staged into to make room for itself', () => {
    const fill = Math.floor(AGENT_IMAGE_STAGING_TOTAL_BYTES_LIMIT / AGENT_EXECUTION_IMAGE_BYTES_LIMIT) - 1;
    for (let index = 0; index < fill; index += 1) {
      expect(stage(store, `agent-${index}`, MAX_IMAGE_BASE64).ok).toBe(true);
    }
    // Fills the budget exactly, then asks for one more into the same conversation.
    expect(stage(store, 'agent-target', MAX_IMAGE_BASE64).ok).toBe(true);
    expect(stage(store, 'agent-target', MAX_IMAGE_BASE64).ok).toBe(true);

    const kept = store.take('agent-target');
    expect(kept.ok && kept.images).toHaveLength(2);
    expect(store.take('agent-0')).toEqual({ ok: true, images: [] });
  });

  it('registers both channels on the shared main boundary', () => {
    registry.handlers.clear();
    const shared = createAgentImageStagingStore();
    registerAgentImageStagingIpc(() => shared);

    const stageHandler = registry.handlers.get(AGENT_IMAGE_STAGING_CHANNELS.stage);
    const takeHandler = registry.handlers.get(AGENT_IMAGE_STAGING_CHANNELS.take);
    expect(stageHandler).toBeTypeOf('function');
    expect(takeHandler).toBeTypeOf('function');

    expect(stageHandler?.(null, {
      conversationId: 'agent-1',
      name: 'capture.png',
      mimeType: 'image/png',
      imageBase64: PNG_BASE64,
    })).toMatchObject({ ok: true });
    const claimed = takeHandler?.(null, 'agent-1') as { ok: boolean; images: unknown[] };
    expect(claimed.images).toHaveLength(1);
  });

  /**
   * Why the announcement exists: a hand-off saves its context first, because the
   * conversation id is what the save decides, and stages the capture second. The
   * workspace push therefore reaches an already-open Agent before the image is
   * there. Without this channel the capture waits in main until its TTL.
   */
  describe('the staged announcement', () => {
    beforeEach(() => {
      registry.handlers.clear();
      registry.windows = [
        { destroyed: false, sent: [] },
        { destroyed: false, sent: [] },
      ];
      registerAgentImageStagingIpc(() => store);
    });

    const stageThrough = (request: unknown): unknown =>
      registry.handlers.get(AGENT_IMAGE_STAGING_CHANNELS.stage)?.(null, request);

    const announcements = (): Array<{ channel: string; payload: unknown }> =>
      registry.windows.flatMap((window) => window.sent);

    it('names the conversation to every window, the sender included', () => {
      stageThrough({
        conversationId: 'agent-1',
        name: 'capture.png',
        mimeType: 'image/png',
        imageBase64: PNG_BASE64,
      });
      expect(announcements()).toEqual([
        { channel: AGENT_IMAGE_STAGING_CHANNELS.staged, payload: 'agent-1' },
        { channel: AGENT_IMAGE_STAGING_CHANNELS.staged, payload: 'agent-1' },
      ]);
    });

    it('announces the bounded id the store keyed on, not the raw one', () => {
      stageThrough({
        conversationId: '  agent-1  ',
        name: 'capture.png',
        mimeType: 'image/png',
        imageBase64: PNG_BASE64,
      });
      // A claim arrives as the trimmed id, so announcing the padded one would
      // name a conversation no window could ever match.
      expect(announcements()[0].payload).toBe('agent-1');
    });

    it('says nothing when the capture was refused', () => {
      stageThrough({
        conversationId: 'agent-1',
        name: 'capture.png',
        mimeType: 'image/gif',
        imageBase64: PNG_BASE64,
      });
      expect(announcements()).toEqual([]);
    });

    it('carries the conversation id and nothing else — never the picture', () => {
      stageThrough({
        conversationId: 'agent-1',
        name: 'capture.png',
        mimeType: 'image/png',
        imageBase64: PNG_BASE64,
      });
      expect(JSON.stringify(announcements())).not.toContain(PNG_BASE64.slice(0, 24));
    });
  });
});

describe('splitImageDataUrl', () => {
  it('takes the format from the URL and keeps the payload prefix-free', () => {
    expect(splitImageDataUrl(`data:image/jpeg;base64,${PNG_BASE64}`)).toEqual({
      mimeType: 'image/jpeg',
      imageBase64: PNG_BASE64,
    });
  });

  it('refuses a format the vision lane does not accept', () => {
    expect(splitImageDataUrl(`data:image/gif;base64,${PNG_BASE64}`)).toBeNull();
    expect(splitImageDataUrl(`data:text/plain;base64,${PNG_BASE64}`)).toBeNull();
    expect(splitImageDataUrl(PNG_BASE64)).toBeNull();
    expect(splitImageDataUrl(undefined)).toBeNull();
  });
});

describe('mergeStagedImageAttachments', () => {
  const claimed = (id: string): AgentStagedImage => ({
    id,
    name: 'capture.png',
    mimeType: 'image/png',
    imageBase64: PNG_BASE64,
    sizeBytes: 70,
  });

  const text = (id: string): AgentExecutionAttachment => ({
    id,
    kind: 'text',
    name: `${id}.txt`,
    sizeBytes: 4,
    sensitivity: 'sensitive',
    retained: false,
    contentText: 'note',
  });

  it('appends a capture to what the composer already holds', () => {
    const merged = mergeStagedImageAttachments([text('a')], [claimed('cap-1')]);
    expect(merged.dropped).toBe(0);
    expect(merged.attachments.map((attachment) => attachment.id)).toEqual(['a', 'cap-1']);
  });

  it('counts what it could not fit rather than shortening the list silently', () => {
    const merged = mergeStagedImageAttachments(
      [text('a'), text('b'), text('c'), text('d'), text('e')],
      [claimed('cap-1')],
    );
    expect(merged.dropped).toBe(1);
    expect(merged.attachments).toHaveLength(5);
  });

  it('holds the image count to what one request may carry', () => {
    const merged = mergeStagedImageAttachments(
      [stagedImageAttachment(claimed('cap-0'))],
      [claimed('cap-1'), claimed('cap-2')],
    );
    expect(merged.dropped).toBe(1);
    expect(merged.attachments.filter((attachment) => attachment.kind === 'image')).toHaveLength(2);
  });

  it('treats a re-delivered id as already held, not as a loss', () => {
    const held = stagedImageAttachment(claimed('cap-1'));
    const merged = mergeStagedImageAttachments([held], [claimed('cap-1')]);
    expect(merged).toEqual({ attachments: [held], dropped: 0 });
  });
});
