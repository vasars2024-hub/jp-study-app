import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html lang="ja"><body><p>これはテストです。</p></body></html>', {
  url: 'https://example.com/page', pretendToBeVisual: true, runScripts: 'dangerously',
});
const w = dom.window;
const listeners = { message: [] };
w.chrome = {
  runtime: { id: 'test', getURL: (p) => 'chrome-extension://t/' + p,
    onMessage: { addListener: (f) => listeners.message.push(f) },
    sendMessage: () => Promise.resolve({ ok: true }) },
  storage: { local: { get: () => Promise.resolve({}), set: () => Promise.resolve() },
    onChanged: { addListener: () => {} } },
};
for (const f of ['shared.js', 'settings.js', 'content.js']) {
  const code = readFileSync('extension/' + f, 'utf8');
  try { w.eval(code); console.log('OK   ', f); }
  catch (e) { console.log('THROW', f, '->', e.constructor.name + ': ' + e.message); }
}
console.log('__jpStudyContentLoaded =', w.__jpStudyContentLoaded);
console.log('onMessage listeners registered =', listeners.message.length);
console.log('globals matching /jp/i  =', JSON.stringify(Object.keys(w).filter((k) => /^__?jp/i.test(k))));
console.log('normalizePattern reachable? ', typeof w.normalizePattern);
console.log('DOM nodes the extension added:', dom.window.document.querySelectorAll('[class*="jp-study"]').length);
