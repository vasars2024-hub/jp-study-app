import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { app, BrowserWindow, session } = require('electron');

const url = 'https://news.web.nhk/newsweb/na/na-k10015174811000';
const markers = ['イギリスの海事', 'UAE', 'markedBody', 'paragraph', 'detailedArticleBody'];

app.whenReady().then(async () => {
  const requests = [];
  session.defaultSession.webRequest.onCompleted({ urls: ['*://*/*'] }, (details) => {
    if (/nhk/i.test(details.url) && details.url.includes('json') || details.url.includes('_rsc') || details.url.includes('api')) {
      requests.push({ status: details.statusCode, url: details.url, len: 0 });
    }
  });

  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
  await win.loadURL(url);
  await new Promise((r) => setTimeout(r, 12000));

  const plain = await win.webContents.executeJavaScript(`(document.querySelector('main')?.innerText || '').replace(/\\s/g,'').length`, true);
  const hasMarker = await win.webContents.executeJavaScript(`(document.body?.innerText || '').includes('イギリスの海事')`, true);
  console.log('main text len', plain, 'has marker', hasMarker);

  const interesting = requests.filter((r) => /api\.web\.nhk|r8|_rsc|newsarticle|detail|body/i.test(r.url));
  for (const r of interesting.slice(0, 40)) console.log(r.status, r.url.replace('https://', '').slice(0, 120));

  await win.destroy();
  app.exit(0);
});