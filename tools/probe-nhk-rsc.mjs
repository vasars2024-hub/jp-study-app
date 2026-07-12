import fs from 'node:fs';

const html = await fetch('https://news.web.nhk/newsweb/na/na-k10015174811000', {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ja' },
}).then((r) => r.text());

// Search RSC payload for paragraph blocks or article detail
const markers = [
  'イギリスの海事',
  '官房副長官',
  'ペルシャ湾内',
  '\\u30a4\\u30ae\\u30ea\\u30b9',
  '"type":"paragraph"',
  'paragraph',
  'detailContent',
  'articleDetail',
  'bodyBlocks',
  'contentBlocks',
];
for (const m of markers) {
  const i = html.indexOf(m);
  console.log(m, i >= 0 ? `yes @${i}` : 'no');
  if (i >= 0) console.log(' ', html.slice(i, i + Math.min(180, m.length + 120)).replace(/\s+/g, ' '));
}

// Extract newsarticle JSON embedded in page
const naIdx = html.indexOf('na-k10015174811000');
const chunks = [];
let pos = 0;
while ((pos = html.indexOf('na-k10015174811000', pos + 1)) >= 0 && chunks.length < 8) {
  chunks.push(html.slice(Math.max(0, pos - 100), pos + 300).replace(/\s+/g, ' '));
}
console.log('\ncontexts around article id:');
chunks.forEach((c, i) => console.log(i, c.slice(0, 250)));

// Look for paragraph array in escaped strings
const paraIdx = html.indexOf('"type":"paragraph"');
console.log('\nparagraph json', paraIdx);
if (paraIdx < 0) {
  const alt = html.indexOf('type\\":\\"paragraph');
  console.log('escaped paragraph', alt, alt >= 0 ? html.slice(alt, alt + 200) : '');
}