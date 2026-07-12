import { parseHTML } from 'linkedom';

const url = 'https://news.web.nhk/newsweb/na/na-k10015174811000';
const html = await fetch(url, {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept-Language': 'ja' },
}).then((r) => r.text());

const { document } = parseHTML(html);
const main = document.querySelector('main');
if (!main) {
  console.log('no main');
  process.exit(1);
}

const markers = ['イギリスの海事機関', 'イランメディア', 'UAE', 'ペルシャ湾内', '官房副長官', '米中央軍', '注目ワード'];
const plain = (main.textContent ?? '').replace(/\s+/g, ' ');
console.log('main text len', plain.replace(/\s/g, '').length);
for (const m of markers) console.log(m, plain.includes(m));

const ps = [...main.querySelectorAll('p')];
console.log('p count', ps.length);
ps.slice(0, 5).forEach((p, i) => console.log(`p${i}`, (p.textContent ?? '').slice(0, 100)));
ps.slice(-5).forEach((p, i) => console.log(`p-end${i}`, (p.textContent ?? '').slice(0, 100)));

const h2s = [...main.querySelectorAll('h2,h3')];
console.log('h2/h3 count', h2s.length);
h2s.forEach((h) => console.log(h.tagName, (h.textContent ?? '').trim().slice(0, 80)));

// Find article body container
for (const sel of ['[class*="article"]', '[class*="body"]', '[class*="marked"]', 'article']) {
  const els = main.querySelectorAll(sel);
  if (els.length) console.log(sel, els.length, [...els].map((e) => (e.className || e.tagName) + ':' + (e.textContent ?? '').replace(/\s/g, '').length).slice(0, 5));
}