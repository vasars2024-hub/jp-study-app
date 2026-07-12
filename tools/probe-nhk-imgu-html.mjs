const markers = ['イギリスの海事機関', 'UAE', 'ペルシャ湾内', '官房副長官', 'イランメディア'];
const tries = [
  'https://news.web.nhk/news/u/news/html/20260712/K10015174811_2607121217_0712122421.html',
  'https://news.web.nhk/news/u/news/html/20260712/K10015174811_2607121217_0712122421_01.html',
  'https://news.web.nhk/news/u/news/html/20260712/K10015174811.html',
  'https://news.web.nhk/news/u/news/html/20260712/K10015174811_2607121217.html',
  'https://www3.nhk.or.jp/news/html/20260712/k10015174811c.html?part=body',
  'https://api.web.nhk/r8/t/newsarticle/na/na-k10015174811000/raw.json',
  'https://api.web.nhk/r8/t/newsarticle/na/na-k10015174811000/rawhtml.json',
  'https://api.web.nhk/r8/t/newsarticle/na/na-k10015174811000/rawHtml.json',
  'https://api.web.nhk/r8/t/newsarticle/na/na-k10015174811000?rawHtmlFlg=true',
];

for (const url of tries) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'text/html,application/json,*/*',
      Referer: 'https://news.web.nhk/newsweb/na/na-k10015174811000',
    },
  });
  const text = await res.text();
  const found = markers.filter((m) => text.includes(m));
  console.log(res.status, url.split('/').slice(-2).join('/'), 'len', text.length, found.join(',') || '-');
}