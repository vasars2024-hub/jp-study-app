import { parseHTML } from 'linkedom';

const ampUrl = 'https://news.web.nhk/newsweb/na/na-k10015174811000?output=amp';
const html = await fetch(ampUrl, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ja' } }).then((r) => r.text());
const { document } = parseHTML(html);

const markers = ['イギリスの海事機関', '官房副長官', 'UAE', 'ペルシャ湾内', 'イランメディア', '米中央軍', '注目ワード'];
console.log('raw html markers:');
for (const m of markers) console.log(' ', m, html.includes(m));

const main = document.querySelector('main');
const article = document.querySelector('article');
console.log('\nmain text len', (main?.textContent ?? '').replace(/\s/g, '').length);
console.log('article text len', (article?.textContent ?? '').replace(/\s/g, '').length);
console.log('main p count', main?.querySelectorAll('p').length);
console.log('body p count', document.body?.querySelectorAll('p').length);

for (const m of markers) {
  console.log(' main has', m, (main?.textContent ?? '').includes(m));
}

// print long paragraphs from main
const ps = [...(main?.querySelectorAll('p') ?? [])].map((p) => (p.textContent ?? '').trim()).filter((t) => t.length > 40);
console.log('\nlong paragraphs', ps.length);
ps.slice(0, 5).forEach((p, i) => console.log(i, p.slice(0, 100)));
ps.slice(-3).forEach((p, i) => console.log('end', i, p.slice(0, 100)));