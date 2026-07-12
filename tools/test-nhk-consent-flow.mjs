import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { app, BrowserWindow } = require('electron');

const url = 'https://news.web.nhk/newsweb/na/na-k10015174811000';

const stepScript = `(() => {
  const info = { step: '', checkbox: false, nextDisabled: true, bodyLen: 0 };
  info.bodyLen = (document.body?.innerText || '').replace(/\\s/g, '').length;
  if (document.body?.innerText?.includes('1/2')) info.step = '1/2';
  else if (document.body?.innerText?.includes('2/2')) info.step = '2/2';
  else if (document.body?.innerText?.includes('ご利用にあたって')) info.step = 'terms';
  const cb = document.querySelector('input[type=checkbox]');
  info.checkbox = !!cb?.checked;
  const next = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').includes('次へ'));
  info.nextDisabled = next ? next.disabled : true;
  info.hasMarker = (document.body?.innerText || '').includes('イギリスの海事');
  return info;
})()`;

const clickScript = `(() => {
  const cb = document.querySelector('input[type=checkbox]');
  if (cb && !cb.checked) {
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    cb.dispatchEvent(new Event('input', { bubbles: true }));
    cb.click();
    cb.closest('label')?.click();
  }
  const next = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').trim().includes('次へ'));
  if (next && !next.disabled) { next.click(); return 'clicked-next'; }
  return cb?.checked ? 'checked-only' : 'no-action';
})()`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
  await win.loadURL(url);
  await new Promise((r) => setTimeout(r, 3000));

  for (let i = 0; i < 12; i += 1) {
    const info = await win.webContents.executeJavaScript(stepScript, true);
    console.log('before', i, info);
    if (info.hasMarker) break;
    const action = await win.webContents.executeJavaScript(clickScript, true);
    console.log('action', action);
    await new Promise((r) => setTimeout(r, 1200));
  }

  const final = await win.webContents.executeJavaScript(stepScript, true);
  const len = await win.webContents.executeJavaScript(`(document.querySelector('main')?.innerText || '').replace(/\\s/g,'').length`, true);
  const marker = await win.webContents.executeJavaScript(`(document.body?.innerText || '').includes('イギリスの海事')`, true);
  console.log('final', final, 'mainLen', len, 'marker', marker);

  await win.destroy();
  app.exit(marker ? 0 : 1);
});