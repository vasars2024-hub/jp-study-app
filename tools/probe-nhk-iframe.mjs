import { parseHTML } from 'linkedom';

const html = await fetch('https://news.web.nhk/newsweb/na/na-k10015174811000', {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ja' },
}).then((r) => r.text());

const { document } = parseHTML(html);
console.log('iframes', document.querySelectorAll('iframe').length);
document.querySelectorAll('iframe').forEach((f, i) => console.log(i, f.getAttribute('src')));

// Search inline scripts for イギリス or long escaped strings
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
for (const s of scripts) {
  if (s.includes('イギリス') || s.includes('ペルシャ湾') || s.includes('markedBody')) {
    console.log('script hit len', s.length, s.slice(0, 200));
  }
}

// Check JSON-LD for full description
for (const block of document.querySelectorAll('script[type="application/ld+json"]')) {
  const text = block.textContent ?? '';
  console.log('ld+json len', text.length, 'has イギリス', text.includes('イギリス'));
}