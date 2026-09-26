// @vitest-environment node
/**
 * The companion's window/selection helper, against a fake PowerShell and a fake
 * clipboard:
 *  - copying a selection out of another app puts the user's clipboard back
 *    whole — a picture, rich text — not just its plain text (a copied picture
 *    used to be replaced by an empty string);
 *  - a helper that is slow to start is stopped and the next command tries a
 *    fresh one (it used to stay running while the companion was marked broken
 *    for the rest of the session).
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Store = { text: string; html: string; rtf: string; image: { png: string } | null };

const h = vi.hoisted(() => ({
  clip: { text: '', html: '', rtf: '', image: null } as Store,
  children: [] as Array<{ killed: boolean; stdinLines: string[]; emitLine: (line: string) => void }>,
  /** What each new fake PowerShell does. */
  behaviour: 'ready' as 'ready' | 'silent',
}));

vi.mock('electron', () => {
  const image = (png: string | null) => ({ isEmpty: () => !png, png });
  return {
    clipboard: {
      readText: () => h.clip.text,
      readHTML: () => h.clip.html,
      readRTF: () => h.clip.rtf,
      readImage: () => image(h.clip.image?.png ?? null),
      readBookmark: () => ({ title: '', url: '' }),
      writeText: (text: string) => { h.clip = { text, html: '', rtf: '', image: null }; },
      write: (data: { text?: string; html?: string; rtf?: string; image?: { png: string | null } }) => {
        h.clip = { text: data.text ?? '', html: data.html ?? '', rtf: data.rtf ?? '', image: data.image?.png ? { png: data.image.png } : null };
      },
      clear: () => { h.clip = { text: '', html: '', rtf: '', image: null }; },
    },
  };
});

vi.mock('node:child_process', () => ({
  spawn: () => {
    const child = new EventEmitter() as EventEmitter & Record<string, unknown>;
    const stdout = new EventEmitter() as EventEmitter & { setEncoding: () => void };
    stdout.setEncoding = () => undefined;
    const record = { killed: false, stdinLines: [] as string[], emitLine: (line: string) => stdout.emit('data', `${line}\n`) };
    child.stdout = stdout;
    child.stderr = new EventEmitter();
    child.kill = () => { record.killed = true; };
    child.stdin = {
      write: (line: string) => {
        record.stdinLines.push(line);
        const [id, cmd] = line.trim().split(' ');
        const info = { hwnd: 4242, title: 'Notes — Notepad', pid: 999_999, process: 'notepad' };
        if (cmd === 'copy') {
          // The app in front answers Ctrl+C: the selection replaces every format.
          h.clip = { text: '選択した言葉', html: '', rtf: '', image: null };
          setTimeout(() => record.emitLine(JSON.stringify({ id, sent: true, info })), 0);
        } else if (cmd === 'info') {
          setTimeout(() => record.emitLine(JSON.stringify({ id, info })), 0);
        }
        return true;
      },
      end: () => undefined,
    };
    h.children.push(record);
    if (h.behaviour === 'ready') setTimeout(() => record.emitLine('{"ready":true}'), 0);
    return child;
  },
}));

const realPlatform = process.platform;

beforeEach(() => {
  vi.resetModules();
  h.children.length = 0;
  h.behaviour = 'ready';
  Object.defineProperty(process, 'platform', { value: 'win32' });
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(process, 'platform', { value: realPlatform });
});

describe('captureSelection', () => {
  it('reads the selection and puts a copied picture and rich text back afterwards', async () => {
    h.clip = { text: '', html: '<b>bold</b>', rtf: '{\\rtf1 bold}', image: { png: 'PNGDATA' } };
    const { captureSelection } = await import('../companionContext');
    const got = await captureSelection();
    expect(got).toMatchObject({ text: '選択した言葉', fromSelection: true });
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(h.clip).toEqual({ text: '', html: '<b>bold</b>', rtf: '{\\rtf1 bold}', image: { png: 'PNGDATA' } });
  });

  it('puts plain copied text back as it was', async () => {
    h.clip = { text: 'what the user had copied', html: '', rtf: '', image: null };
    const { captureSelection } = await import('../companionContext');
    await captureSelection();
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(h.clip.text).toBe('what the user had copied');
  });
});

describe('the helper process', () => {
  it('a helper slow to start is stopped, and the next command starts a fresh one', async () => {
    vi.useFakeTimers();
    h.behaviour = 'silent';
    const { foregroundInfo } = await import('../companionContext');
    const first = foregroundInfo();
    await vi.advanceTimersByTimeAsync(8_100);
    expect(await first).toBeNull();
    expect(h.children).toHaveLength(1);
    expect(h.children[0].killed).toBe(true);

    h.behaviour = 'ready';
    const second = foregroundInfo();
    await vi.advanceTimersByTimeAsync(50);
    expect(h.children).toHaveLength(2);
    expect(await second).toMatchObject({ hwnd: 4242, title: 'Notes — Notepad' });
  });
});
