// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  AGENT_EXECUTION_ATTACHMENT_CHAR_LIMIT,
  AGENT_EXECUTION_ATTACHMENTS_TOTAL_CHAR_LIMIT,
  AGENT_EXECUTION_IMAGE_BYTES_LIMIT,
  decodedBase64Bytes,
  type AgentExecutionAttachment,
} from '../../shared/agentExecutionBridge';
import { readAgentAttachmentFiles } from '../agentAttachments';

function file(name: string, content: string, type = 'text/plain'): File {
  return {
    name,
    type,
    size: new TextEncoder().encode(content).length,
    text: async () => content,
  } as File;
}

/**
 * A real Blob-backed File, unlike the plain object above: the image path reads
 * through `FileReader.readAsDataURL`, which needs an actual Blob. jsdom supplies
 * both, so this exercises the same decode the renderer performs.
 */
function imageFile(name: string, bytes: Uint8Array, type = 'image/png'): File {
  return new File([bytes], name, { type });
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

describe('Agent attachment reader', () => {
  it('reads explicit text/document selections into sensitive session-only payloads', async () => {
    const result = await readAgentAttachmentFiles([
      file('notes.txt', 'plain notes'),
      file('captions.srt', '1\n00:00:01,000 --> 00:00:02,000\n猫', 'application/x-subrip'),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachments).toMatchObject([
      { kind: 'text', name: 'notes.txt', sensitivity: 'sensitive', retained: false },
      { kind: 'document', name: 'captions.srt', sensitivity: 'sensitive', retained: false },
    ]);
    expect(result.attachments[0]).not.toHaveProperty('localPath');
    expect(result.attachments[1].contentText).toContain('猫');
  });

  it('rejects unsupported, empty, binary-looking, unreadable and too-many selections', async () => {
    // A GIF is an image the vision lane does not take. It must be refused AS an
    // image rather than falling through to the text reader, which would report
    // it as binary-looking and name the wrong problem.
    await expect(readAgentAttachmentFiles([file('photo.gif', 'pixels', 'image/gif')]))
      .resolves.toMatchObject({ ok: false, code: 'unsupported', fileName: 'photo.gif' });
    await expect(readAgentAttachmentFiles([file('empty.txt', '   ')]))
      .resolves.toMatchObject({ ok: false, code: 'empty' });
    await expect(readAgentAttachmentFiles([file('renamed.txt', 'a\0b')]))
      .resolves.toMatchObject({ ok: false, code: 'unsupported' });
    const unreadable = file('broken.txt', 'x');
    Object.defineProperty(unreadable, 'text', { value: async () => { throw new Error('no'); } });
    await expect(readAgentAttachmentFiles([unreadable]))
      .resolves.toMatchObject({ ok: false, code: 'read-failed' });
    await expect(readAgentAttachmentFiles(
      Array.from({ length: 6 }, (_, index) => file(`${index}.txt`, 'x')),
    )).resolves.toMatchObject({ ok: false, code: 'too-many' });
  });

  it('keeps exact character limits and rejects per-file or combined overflow', async () => {
    const exact = 'a'.repeat(AGENT_EXECUTION_ATTACHMENT_CHAR_LIMIT);
    await expect(readAgentAttachmentFiles([file('exact.txt', exact)]))
      .resolves.toMatchObject({ ok: true });
    await expect(readAgentAttachmentFiles([file('large.txt', `${exact}x`)]))
      .resolves.toMatchObject({ ok: false, code: 'too-large' });

    const current: AgentExecutionAttachment[] = [{
      id: 'current',
      kind: 'text',
      name: 'current.txt',
      sensitivity: 'sensitive',
      retained: false,
      contentText: 'a'.repeat(AGENT_EXECUTION_ATTACHMENTS_TOTAL_CHAR_LIMIT - 1),
    }];
    await expect(readAgentAttachmentFiles([file('overflow.txt', 'ab')], current))
      .resolves.toMatchObject({ ok: false, code: 'total-too-large' });
  });

  it('reads an image into raw base64 with a decoded size main will agree with', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2]);
    const result = await readAgentAttachmentFiles([imageFile('shot.png', bytes)]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [attachment] = result.attachments;
    expect(attachment).toMatchObject({
      kind: 'image',
      name: 'shot.png',
      mimeType: 'image/png',
      sensitivity: 'sensitive',
      retained: false,
      contentText: '',
    });
    // No `data:` prefix: the contract's base64 pattern rejects one, so a reader
    // that forgot to strip it would produce an attachment main silently drops.
    expect(attachment.imageBase64).toBe(base64(bytes));
    expect(attachment.imageBase64?.startsWith('data:')).toBe(false);
    // The size the composer shows is the size that ships. `normalizeAgentExecutionRequest`
    // rejects an image whose `sizeBytes` disagrees with its payload, so the two
    // halves are checked against each other rather than each against a constant.
    expect(attachment.sizeBytes).toBe(bytes.length);
    expect(decodedBase64Bytes(attachment.imageBase64 ?? '')).toBe(attachment.sizeBytes);
  });

  it('resolves a jpg by extension when the picker reports no MIME type', async () => {
    const result = await readAgentAttachmentFiles([
      imageFile('capture.jpg', new Uint8Array([255, 216, 255]), ''),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // `image/jpg` is not a registered type and `File.type` is routinely empty on
    // Windows. Either would be rejected by main, which accepts the three
    // canonical strings only.
    expect(result.attachments[0].mimeType).toBe('image/jpeg');
  });

  it('bounds images by count and by decoded bytes, separately from the text budgets', async () => {
    const small = new Uint8Array([1, 2, 3]);
    await expect(readAgentAttachmentFiles([
      imageFile('a.png', small),
      imageFile('b.png', small),
      imageFile('c.png', small),
    ])).resolves.toMatchObject({ ok: false, code: 'too-many-images' });

    // The count is against what is ALREADY attached, not just this selection.
    const current: AgentExecutionAttachment[] = [{
      id: 'current-image',
      kind: 'image',
      name: 'current.png',
      mimeType: 'image/png',
      sizeBytes: 3,
      sensitivity: 'sensitive',
      retained: false,
      contentText: '',
      imageBase64: base64(small),
    }];
    await expect(readAgentAttachmentFiles([imageFile('a.png', small), imageFile('b.png', small)], current))
      .resolves.toMatchObject({ ok: false, code: 'too-many-images' });
    await expect(readAgentAttachmentFiles([imageFile('a.png', small)], current))
      .resolves.toMatchObject({ ok: true });

    const oversize = new Uint8Array(AGENT_EXECUTION_IMAGE_BYTES_LIMIT + 1);
    await expect(readAgentAttachmentFiles([imageFile('huge.png', oversize)]))
      .resolves.toMatchObject({ ok: false, code: 'image-too-large', fileName: 'huge.png' });
    await expect(readAgentAttachmentFiles([imageFile('blank.png', new Uint8Array(0))]))
      .resolves.toMatchObject({ ok: false, code: 'empty', fileName: 'blank.png' });
  });

  it('accepts an image and a text file in one selection', async () => {
    const result = await readAgentAttachmentFiles([
      imageFile('shot.png', new Uint8Array([1, 2, 3])),
      file('notes.txt', 'plain notes'),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachments.map((attachment) => attachment.kind)).toEqual(['image', 'text']);
    expect(result.attachments[1].contentText).toBe('plain notes');
  });
});
