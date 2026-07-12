import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { isRecommendationHeading } from '../src/shared/readabilityClean.ts';

const require = createRequire(import.meta.url);
const { app, BrowserWindow } = require('electron');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { NHK_WEBVIEW_EXTRACT_SCRIPT } = await import(pathToFileURL(path.join(root, 'src/renderer/nhkWebviewScript.ts')).href);
const { cleanReaderArticleHtml } = await import(pathToFileURL(path.join(root, 'src/renderer/readabilityArticle.ts')).href);

const url = 'https://news.web.nhk/newsweb/na/na-k10015174811000';

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
  await win.loadURL(url);
  let result = null;
  for (let i = 0; i < 10; i += 1) {
    result = await win.webContents.executeJavaScript(NHK_WEBVIEW_EXTRACT_SCRIPT, true);
    if (result?.ready) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!result?.ready) {
    console.log('not ready');
    app.exit(1);
    return;
  }
  const cleaned = cleanReaderArticleHtml(result.html, result.title ?? '', {});
  const plain = cleaned.replace(/<[^>]+>/g, ' ');
  const markers = ['イギリスの海事機関', 'UAE', '官房副長官', '注目ワード', 'あわせて読みたい'];
  for (const m of markers) console.log(m, plain.includes(m));
  console.log('len', plain.replace(/\s/g, '').length);
  await win.destroy();
  app.exit(0);
});