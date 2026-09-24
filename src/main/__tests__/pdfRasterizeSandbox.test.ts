// @vitest-environment node
/**
 * The PDF rasterizer parses untrusted files (audit robust #4). It used to run
 * with nodeIntegration on, contextIsolation off and webSecurity off, and took
 * page images from an unauthenticated ipcMain listener. Now: sandboxed, private
 * session, one protocol that serves only pdf.js and the one PDF being worked on,
 * and results come back as executeJavaScript return values.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  windows: [] as Array<{ options: { webPreferences: Record<string, unknown> }; scripts: string[]; urls: string[] }>,
  handled: [] as string[],
  ipcOn: 0,
}));

vi.mock('electron', () => {
  class FakeWindow {
    scripts: string[] = [];
    urls: string[] = [];
    destroyed = false;
    webContents = {
      setWindowOpenHandler: () => undefined,
      on: () => undefined,
      executeJavaScript: async (code: string) => {
        this.scripts.push(code);
        if (code.includes('getDocument')) return 2;
        if (code.includes('toDataURL')) return `data:image/jpeg;base64,${Buffer.from('jpg').toString('base64')}`;
        return true;
      },
    };
    constructor(public options: { webPreferences: Record<string, unknown> }) {
      h.windows.push(this);
    }
    loadURL(url: string) {
      this.urls.push(url);
      return Promise.resolve();
    }
    isDestroyed() {
      return this.destroyed;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  return {
    BrowserWindow: FakeWindow,
    ipcMain: { on: () => { h.ipcOn += 1; } },
    session: {
      fromPartition: () => ({
        setPermissionRequestHandler: () => undefined,
        setPermissionCheckHandler: () => undefined,
        protocol: { handle: (scheme: string) => h.handled.push(scheme) },
      }),
    },
  };
});

const { rasterizePdf, resolvePdfRasterRequest, registerPdfForRasterTest, PDF_RASTER_SCHEME } = await import('../pdfRasterize');

let dir: string | null = null;
afterEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe('pdfRasterize sandbox', () => {
  it('runs sandboxed with no Node and no IPC, and writes the pages it gets back', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-raster-'));
    const pdf = path.join(dir, 'scan.pdf');
    fs.writeFileSync(pdf, '%PDF-1.4');
    const names = await rasterizePdf(pdf, path.join(dir, 'pages'));
    expect(names).toEqual(['0001.jpg', '0002.jpg']);
    const prefs = h.windows[0].options.webPreferences;
    expect(prefs).toMatchObject({ sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true });
    expect(h.ipcOn).toBe(0);
    expect(h.handled).toEqual([PDF_RASTER_SCHEME]);
    expect(h.windows[0].scripts.join('\n')).not.toMatch(/require\(|ipcRenderer|node:fs/);
    // The token is revoked once the job ends.
    const token = /doc\/([a-f0-9]{32})\.pdf/.exec(h.windows[0].scripts[0])?.[1];
    expect(resolvePdfRasterRequest(`gumpdf://raster/doc/${token}.pdf`)).toBeNull();
  });

  it('serves only pdf.js and a registered PDF, on its own origin', () => {
    const token = 'a'.repeat(32);
    registerPdfForRasterTest(token, 'C:/books/scan.pdf');
    expect(resolvePdfRasterRequest(`gumpdf://raster/doc/${token}.pdf`)).toMatchObject({ kind: 'file', file: 'C:/books/scan.pdf' });
    expect(resolvePdfRasterRequest('gumpdf://raster/index.html')).toEqual({ kind: 'page' });
    expect(resolvePdfRasterRequest('gumpdf://raster/pdf.mjs')).toMatchObject({ kind: 'file', type: 'text/javascript' });
    for (const bad of [
      'gumpdf://raster/../../Windows/win.ini',
      `gumpdf://raster/doc/${'b'.repeat(32)}.pdf`,
      'gumpdf://other/pdf.mjs',
      'gumpdf://raster/C:/Users/secret.json',
      'file:///C:/Windows/win.ini',
    ]) {
      expect(resolvePdfRasterRequest(bad)).toBeNull();
    }
    registerPdfForRasterTest(token, null);
  });
});
