const pageUrl = 'https://news.web.nhk/newsweb/na/na-k10015174811000';
const html = await fetch(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());

const js = [...new Set([...html.matchAll(/src="([^"]+\.js[^"]*)"/g)].map((m) => m[1]))];
console.log('js count', js.length);
for (const u of js.slice(0, 25)) console.log(u);

const abs = js.map((u) => (u.startsWith('http') ? u : new URL(u, pageUrl).href));
const needles = ['newsarticle', 'paragraph', 'articleBody', '/r8/t/newsarticle'];
for (const url of abs.slice(0, 30)) {
  try {
    const code = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
    const hits = needles.filter((n) => code.includes(n));
    if (!hits.length) continue;
    console.log('HIT', url.split('/').slice(-2).join('/'), hits);
    const apis = [...new Set([...code.matchAll(/\/r8\/t\/[a-zA-Z0-9_/-]+/g)].map((m) => m[0]))];
    const interesting = apis.filter((a) => /article|body|paragraph|detail|content/i.test(a));
    if (interesting.length) console.log('  ', interesting.slice(0, 15));
  } catch (e) {
    console.log('fail', url, e.message);
  }
}