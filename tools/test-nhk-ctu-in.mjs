import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { app, BrowserWindow } = require('electron');

const urls = [
  'https://news.web.nhk/newsweb/na/na-k10015174811000?ctu=in',
  'https://news.web.nhk/newsweb/na/na-k10015174811000?_reload=1&ctu=in',
];

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
  for (const url of urls) {
    await win.loadURL(url);
    await new Promise((r) => setTimeout(r, 8000));
    const info = await win.webContents.executeJavaScript(`({
      mainLen: (document.querySelector('main')?.innerText || '').replace(/\\s/g,'').length,
      marker: (document.body?.innerText || '').includes('イギリスの海事'),
      consent: (document.body?.innerText || '').includes('ご利用にあたって'),
      step: (document.body?.innerText || '').includes('1/2') ? '1/2' : '',
    })`, true);
    console.log(url.split('?')[1] || 'base', info);
  }
  await win.destroy();
  app.exit(0);
});