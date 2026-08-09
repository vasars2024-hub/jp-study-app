// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  AGENT_EXECUTION_ATTACHMENT_CHAR_LIMIT,
  AGENT_EXECUTION_ATTACHMENTS_TOTAL_CHAR_LIMIT,
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
    await expect(readAgentAttachmentFiles([file('photo.png', 'pixels', 'image/png')]))
      .resolves.toMatchObject({ ok: false, code: 'unsupported', fileName: 'photo.png' });
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
});
