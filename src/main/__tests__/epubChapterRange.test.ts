// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import AdmZip from 'adm-zip';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// mining.ts registers IPC and reads app paths at import time; stub just enough
// for the module to load. Nothing here touches the mining config or the
// tokenizer — `extractEpubSections` is pure zip reading.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'epub-range-test-'));

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot, getName: () => 'test' },
  ipcMain: { handle: () => undefined, removeHandler: () => undefined },
  dialog: {},
  shell: {},
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined },
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
}));

// Imported in beforeAll rather than at the top level: the mock factory closes
// over `tmpRoot`, so mining.ts must not load until this module body has run. A
// top-level `await import` would do that too, but tsc rejects it under this
// project's module setting.
let extractEpubSections: typeof import('../mining').extractEpubSections;

beforeAll(async () => {
  ({ extractEpubSections } = await import('../mining'));
});

/** Six spine items, each with a distinguishable heading and body. */
function writeEpub(name: string, chapterCount = 6): string {
  const zip = new AdmZip();
  zip.addFile(
    'META-INF/container.xml',
    Buffer.from(
      `<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`,
      'utf-8',
    ),
  );

  const items: string[] = [];
  const refs: string[] = [];
  for (let i = 1; i <= chapterCount; i++) {
    items.push(`<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`);
    refs.push(`<itemref idref="c${i}"/>`);
    zip.addFile(
      `OEBPS/c${i}.xhtml`,
      Buffer.from(
        `<html><body><h1>Chapter ${i}</h1><p>ほんぶん${i}。これは第${i}章の本文です。</p></body></html>`,
        'utf-8',
      ),
    );
  }

  zip.addFile(
    'OEBPS/content.opf',
    Buffer.from(
      `<?xml version="1.0"?><package><metadata><dc:title>Test Novel</dc:title></metadata>`
        + `<manifest>${items.join('')}</manifest><spine>${refs.join('')}</spine></package>`,
      'utf-8',
    ),
  );

  const target = path.join(tmpRoot, name);
  zip.writeZip(target);
  return target;
}

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('extractEpubSections', () => {
  it('numbers sections by spine position, in reading order', () => {
    const result = extractEpubSections(writeEpub('order.epub'));
    expect(result.sectionCount).toBe(6);
    expect(result.sections.map((section) => section.index)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.sections.map((section) => section.title)).toEqual([
      'Chapter 1',
      'Chapter 2',
      'Chapter 3',
      'Chapter 4',
      'Chapter 5',
      'Chapter 6',
    ]);
  });

  it('reads ONLY the requested range — the rest is never decoded', () => {
    const result = extractEpubSections(writeEpub('range.epub'), { from: 2, to: 4 });

    expect(result.range).toEqual({ from: 2, to: 4 });
    // Every section is still listed, so the caller knows the real numbering...
    expect(result.sections).toHaveLength(6);
    // ...but only 2–4 carry text. This is the property that makes a scoped run
    // cheaper than a whole-book run rather than merely narrower.
    const decoded = result.sections.filter((section) => section.decoded);
    expect(decoded.map((section) => section.index)).toEqual([2, 3, 4]);
    for (const section of result.sections) {
      if (section.decoded) {
        expect(section.text).toContain(`第${section.index}章`);
      } else {
        expect(section.text).toBe('');
        expect(section.title).toBe('');
      }
    }
  });

  it('scopes a single chapter to exactly that chapter', () => {
    const result = extractEpubSections(writeEpub('single.epub'), { from: 5, to: 5 });
    const decoded = result.sections.filter((section) => section.decoded);
    expect(decoded).toHaveLength(1);
    expect(decoded[0].index).toBe(5);
    expect(decoded[0].text).toContain('第5章');
    expect(decoded[0].text).not.toContain('第4章');
    expect(decoded[0].text).not.toContain('第6章');
  });

  it('decodes everything when no range is given', () => {
    const result = extractEpubSections(writeEpub('whole.epub'));
    expect(result.range).toBeNull();
    expect(result.sections.every((section) => section.decoded)).toBe(true);
  });

  it('treats a full-span range as the whole book, not as a scoped run', () => {
    const result = extractEpubSections(writeEpub('full.epub'), { from: 1, to: 6 });
    expect(result.range).toBeNull();
    expect(result.sections.every((section) => section.decoded)).toBe(true);
  });

  it('clamps a range that runs past the end', () => {
    const result = extractEpubSections(writeEpub('clamp.epub'), { from: 5, to: 99 });
    expect(result.range).toEqual({ from: 5, to: 6 });
    expect(result.sections.filter((section) => section.decoded).map((s) => s.index)).toEqual([5, 6]);
  });
});
