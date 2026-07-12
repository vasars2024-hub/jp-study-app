const id = 'K10015174811';
const markers = ['イギリスの海事', 'UAE', 'ペルシャ湾内', '官房副長官'];
const tries = [
  `https://www3.nhk.or.jp/news/html/${id}/${id}.html`,
  `https://www3.nhk.or.jp/news/html/20260712/${id}/${id}.html`,
  `https://news.web.nhk/news/u/news/html/20260712/${id}_2607121217_0712122421.html`,
  `https://imgu.web.nhk/news/u/news/html/20260712/${id}_2607121217_0712122421.html`,
  `https://api.web.nhk/r8/t/newsarticle/na/na-k10015174811000.html`,
  `https://news.web.nhk/newsweb/na/na-k10015174811000.html`,
  `https://news.web.nhk/newsweb/na/na-k10015174811000?output=raw`,
  `https://news.web.nhk/newsweb/na/na-k10015174811000?output=html`,
  `https://news.web.nhk/newsweb/na/na-k10015174811000?output=json`,
  `https://news.web.nhk/newsweb/na/na-k10015174811000?output=detail`,
  `https://news.web.nhk/newsweb/na/na-k10015174811000?lp=detail`,
];

for (const url of tries) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ja' }, redirect: 'follow' });
    const text = await res.text();
    const found = markers.filter((m) => text.includes(m));
    console.log(res.status, url.replace('https://', ''), 'len', text.length, found.join(',') || '-');
  } catch (e) {
    console.log('fail', url, e.message);
  }
}