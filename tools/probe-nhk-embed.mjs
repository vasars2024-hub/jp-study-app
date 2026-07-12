const id = 'na-k10015174811000';
const urls = [
  `https://o.embed.nhk/newsweb/na/${id}`,
  `https://o.embed.nhk/newsweb/na/${id}?lp=summary`,
  `https://o.embed.nhk/newsweb/na/${id}?lp=detail`,
  `https://o.embed.nhk/newsweb/na/${id}?lp=full`,
  `https://o.embed.nhk/newsweb/na/${id}?lp=article`,
  `https://news.web.nhk/newsweb/na/${id}?output=amp`,
  `https://news.web.nhk/newsweb/na/${id}?mode=reader`,
];
const markers = ['イギリスの海事機関', '官房副長官', 'UAE', 'ペルシャ湾内'];

for (const url of urls) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' }, redirect: 'follow' });
    const text = await res.text();
    const found = markers.filter((m) => text.includes(m));
    console.log(res.status, url.replace('https://', ''), 'len', text.length, found.join(',') || '-');
  } catch (e) {
    console.log('fail', url, e.message);
  }
}