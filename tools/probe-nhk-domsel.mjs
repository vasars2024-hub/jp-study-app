const base = 'https://news.web.nhk';
const chunks = ['9435-84fbb4254a29e972.js', '4788-b18606c716529b34.js', '2457-7615a65e1c1d9a51.js', '68-a90faf60b0707807.js'];
for (const file of chunks) {
  const code = await fetch(`${base}/_next/static/chunks/${file}`, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
  console.log('\n===', file, '===');
  for (const pat of [/className:"([^"]{3,60})"/g, /"([a-z0-9]{6,12})"/g]) {
    const classes = [...new Set([...code.matchAll(pat)].map((m) => m[1]).filter((c) => /article|body|paragraph|marked|detail|news/i.test(c)))];
    if (classes.length) console.log('classes', classes.slice(0, 20));
  }
  const snippets = [];
  for (const needle of ['markedBody', 'paragraph', 'ArticleBody', 'NewsArticle', 'detailFlg']) {
    let pos = 0;
    while ((pos = code.indexOf(needle, pos + 1)) >= 0 && snippets.length < 6) {
      snippets.push(code.slice(Math.max(0, pos - 100), pos + 250).replace(/\s+/g, ' '));
    }
  }
  snippets.slice(0, 4).forEach((s, i) => console.log(`snippet${i}`, s));
}