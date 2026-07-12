const kid = 'K10015174811';
const id = 'na-k10015174811000';
const markers = ['イギリスの海事', 'UAE', 'ペルシャ湾内', 'paragraph', 'markedBody'];
const tries = [
  `https://news.web.nhk/news/u/news/html/20260712/${kid}_2607121217_0712122421.json`,
  `https://news.web.nhk/news/u/news/html/20260712/${kid}.json`,
  `https://api.web.nhk/r8/t/newsarticle/na/${id}/markedbody.json`,
  `https://api.web.nhk/r8/t/newsarticle/na/${id}/markedBody.json`,
  `https://api.web.nhk/r8/t/newsarticle/na/${id}/content.json`,
  `https://api.web.nhk/r8/t/newsarticle/na/${id}/full.json`,
  `https://api.web.nhk/r8/t/newsarticle/na/${id}/text.json`,
  `https://api.web.nhk/r8/t/newsarticle/na/${id}/body`,
  `https://news.web.nhk/api/newsarticle/na/${id}`,
  `https://news.web.nhk/newsweb/api/na/${id}`,
  `https://news.web.nhk/newsweb/na/${id}/body`,
  `https://news.web.nhk/newsweb/na/${id}/detail`,
  `https://news.web.nhk/newsweb/na/${id}/markedbody`,
];

for (const url of tries) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json, text/plain, */*',
        Referer: 'https://news.web.nhk/newsweb/na/na-k10015174811000',
        Origin: 'https://news.web.nhk',
      },
    });
    const text = await res.text();
    const found = markers.filter((m) => text.includes(m));
    if (res.status === 200 && text.length > 1000) {
      console.log('HIT', res.status, url, 'len', text.length, found);
      console.log(' sample', text.slice(0, 300));
    } else {
      console.log(res.status, url.replace('https://news.web.nhk/', '').replace('https://api.web.nhk/', 'api/'), 'len', text.length, found.join(',') || '-');
    }
  } catch (e) {
    console.log('fail', url, e.message);
  }
}