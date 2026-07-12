import { parseHTML } from 'linkedom';

const html = await fetch('https://news.web.nhk/newsweb/na/na-k10015174811000', {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ja' },
}).then((r) => r.text());

const idx = html.indexOf('内容について確認しました');
console.log(html.slice(idx - 400, idx + 800).replace(/\s+/g, ' '));

const { document } = parseHTML(html);
for (const el of document.querySelectorAll('input[type=checkbox],label,button')) {
  const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (/確認|次へ|利用しない|同意/.test(t) || el.tagName === 'INPUT') {
    console.log(el.tagName, el.id, el.className, t.slice(0, 80));
  }
}