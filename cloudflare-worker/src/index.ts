// jp-study-pings — anonymous download counter for the app's learner heat map.
//
// POST /ping   → reads only Cloudflare's CF-IPCountry header (never the IP),
//                increments that country's counter in KV, returns {"ok":true}.
// GET  /counts → returns aggregate { "JP": 12, "US": 40, ... }.
//
// No IP, cookie, or identifier is read or stored. KV writes aren't atomic, so a
// rare simultaneous ping can lose one increment — perfectly fine for a fun map.

export interface Env {
  COUNTS: KVNamespace;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'content-type': 'application/json',
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    if (req.method === 'POST' && url.pathname === '/ping') {
      // Country only. The IP is never read or stored.
      const country = req.headers.get('CF-IPCountry') ?? 'XX';
      if (!/^[A-Z]{2}$/.test(country)) {
        return new Response('{"ok":true}', { headers: CORS });
      }
      const cur = parseInt((await env.COUNTS.get(country)) ?? '0', 10) || 0;
      await env.COUNTS.put(country, String(cur + 1));
      return new Response('{"ok":true}', { headers: CORS });
    }

    if (req.method === 'GET' && url.pathname === '/counts') {
      const list = await env.COUNTS.list();
      const out: Record<string, number> = {};
      for (const k of list.keys) {
        out[k.name] = parseInt((await env.COUNTS.get(k.name)) ?? '0', 10) || 0;
      }
      return new Response(JSON.stringify(out), { headers: CORS });
    }

    return new Response('not found', { status: 404, headers: CORS });
  },
};
