const base = 'https://news.web.nhk/newsweb/na/na-k10015174811000';
const markers = ['イギリスの海事', 'UAE', 'ペルシャ湾内', 'イランメディア', '官房副長官', 'markedBody', 'paragraph', 'type'];

const res = await fetch(`${base}?_rsc=1`, {
  headers: {
    'User-Agent': 'Mozilla/5.0',
    Accept: 'text/x-component',
    'Accept-Language': 'ja',
    RSC: '1',
  },
});
const text = await res.text();
console.log('len', text.length);
for (const m of markers) console.log(m, text.includes(m));

// decode unicode escapes
const decoded = text.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
console.log('\ndecoded markers:');
for (const m of markers.slice(0, 5)) console.log(m, decoded.includes(m));

const idx = decoded.indexOf('イギリス');
if (idx >= 0) console.log('\nイギリス context', decoded.slice(idx, idx + 300));

// search paragraph blocks
const paraIdx = text.indexOf('paragraph');
console.log('\nparagraph occurrences', (text.match(/paragraph/g) ?? []).length);
if (paraIdx >= 0) console.log('first', text.slice(paraIdx - 50, paraIdx + 200));

// save for inspection
import fs from 'node:fs';
fs.writeFileSync('tools/nhk-rsc.txt', text.slice(0, 200000));
console.log('saved tools/nhk-rsc.txt');