import { parseHTML } from 'linkedom';
import { extractReadableFromHtml } from '../src/main/readabilityExtract.ts';

const url = 'https://www3.nhk.or.jp/news/html/K10015174811/K10015174811.html';
const html = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ja' } }).then((r) => r.text());

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

console.log('raw html len', html.length);
for (const m of markers) console.log(m, html.includes(m));

const { document } = parseHTML(html);
const article = document.querySelector('#main, main, article, .content--detail-body, #content');
console.log('\nselectors');
for (const sel of ['#main', 'main', 'article', '.content--detail-body', '#content', '.content--detail', '.article-main']) {
  const el = document.querySelector(sel);
  if (el) console.log(sel, (el.textContent ?? '').replace(/\s/g, '').length);
}

const body = document.querySelector('.content--detail-body') ?? document.querySelector('#content') ?? document.querySelector('main');
if (body) {
  const plain = (body.textContent ?? '').replace(/\s+/g, ' ');
  console.log('\nbody markers:');
  for (const m of markers) console.log(m, plain.includes(m));
  const ps = [...body.querySelectorAll('p')];
  console.log('p count', ps.length);
  ps.slice(0, 3).forEach((p, i) => console.log(`p${i}`, (p.textContent ?? '').slice(0, 100)));
}

const extracted = extractReadableFromHtml(html, url);
console.log('\nreadability len', (extracted.content ?? '').replace(/<[^>]+>/g, '').replace(/\s/g, '').length);
for (const m of markers) console.log(m, (extracted.content ?? '').includes(m));