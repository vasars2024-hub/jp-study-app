import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { app, BrowserWindow, session } = require('electron');

const url = 'https://news.web.nhk/newsweb/na/na-k10015174811000';

app.whenReady().then(async () => {
  const requests = [];
  session.defaultSession.webRequest.onCompleted({ urls: ['*://*/*'] }, (details) => {
    if (/nhk/i.test(details.url)) requests.push({ status: details.statusCode, url: details.url });
  });

  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
  await win.loadURL(url);
  for (let i = 0; i < 6; i += 1) {
    await new Promise((r) => setTimeout(r, 5000));
    const len = await win.webContents.executeJavaScript(`(document.querySelector('main')?.innerText || '').replace(/\\s/g,'').length`, true);
    const marker = await win.webContents.executeJavaScript(`(document.body?.innerText || '').includes('イギリスの海事')`, true);
    console.log(`t+${(i + 1) * 5}s`, 'len', len, 'marker', marker);
  }

  console.log('\nall nhk requests', requests.length);
  for (const r of requests) console.log(r.status, r.url.replace('https://', ''));

  await win.destroy();
  app.exit(0);
});