import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { app, BrowserWindow } = require('electron');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { NHK_WEBVIEW_EXTRACT_SCRIPT } = await import(pathToFileURL(path.join(root, 'src/renderer/nhkWebviewScript.ts')).href);

const url = 'https://news.web.nhk/newsweb/na/na-k10015174811000';
const markers = [
  'イランの革命防衛隊は12日',
  'イギリスの海事機関',
  'イランメディア',
  '米中央軍',
  'UAE',
  'ペルシャ湾内',
  '官房副長官',
  '注目ワード',
  'あわせて読みたい',
];

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  try {
    await win.loadURL(url, {
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    let result = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        result = await win.webContents.executeJavaScript(NHK_WEBVIEW_EXTRACT_SCRIPT, true);
      } catch (err) {
        console.log('execute error', attempt, err instanceof Error ? err.message : err);
      }
      if (result?.ready) break;
      if (result?.consent) console.log('consent click attempt', attempt);
      await new Promise((r) => setTimeout(r, 800 + attempt * 400));
    }

    console.log(
      'result',
      result ? { ready: result.ready, consent: result.consent, source: result.source, textLen: result.textLen } : null,
    );
    if (result?.ready) {
      const plain = result.html.replace(/<[^>]+>/g, ' ');
      for (const m of markers) console.log(m, plain.includes(m));
      const pass =
        ['イギリスの海事機関', 'UAE', 'ペルシャ湾内', '官房副長官', 'イランメディア', '米中央軍'].every((m) => plain.includes(m)) &&
        !plain.includes('注目ワード') &&
        !plain.includes('あわせて読みたい');
      console.log('PASS', pass);
      await win.destroy();
      app.exit(pass ? 0 : 1);
      return;
    }
  } catch (err) {
    console.error('test failed', err);
  }

  await win.destroy();
  app.exit(1);
});