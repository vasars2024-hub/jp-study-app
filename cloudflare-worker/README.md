# jp-study-pings — the learner heat-map backend

A tiny, free Cloudflare Worker that counts app installs by country for the
Resources app's world heat map. It stores **only** aggregate per-country counts —
never an IP, cookie, or any identifier.

You only need to do this once. It's copy-paste; no backend experience required.

## What you'll end up with

A URL like `https://jp-study-pings.YOURNAME.workers.dev` that you paste into the
app at `src/shared/stats.ts` (the `STATS_BASE` constant).

## Steps

1. **Make a free Cloudflare account** at https://dash.cloudflare.com.

2. **Install Wrangler** (Cloudflare's CLI) and log in:
   ```bash
   npm install -g wrangler
   wrangler login          # opens a browser to authorize
   ```

3. **Open this folder** in a terminal:
   ```bash
   cd cloudflare-worker
   ```

4. **Create the KV store** (where the counts live):
   ```bash
   wrangler kv namespace create COUNTS
   ```
   It prints something like `id = "abc123..."`. Copy that id into
   `wrangler.toml`, replacing `PASTE_YOUR_KV_NAMESPACE_ID_HERE`.

5. **Deploy:**
   ```bash
   wrangler deploy
   ```
   It prints your Worker URL, e.g. `https://jp-study-pings.yourname.workers.dev`.

6. **Point the app at it.** Open `src/shared/stats.ts` and set:
   ```ts
   export const STATS_BASE = 'https://jp-study-pings.yourname.workers.dev';
   ```
   (Until you do this, the app simply skips the ping and the map stays empty —
   nothing breaks.)

## Test it

```bash
curl -X POST https://jp-study-pings.yourname.workers.dev/ping
curl https://jp-study-pings.yourname.workers.dev/counts
# → {"US":1}   (your country, derived by Cloudflare)
```

Watch live pings while testing:
```bash
wrangler tail
```

## Free-tier headroom

Cloudflare's free plan allows 100,000 requests/day and 1,000 KV writes/day. The
app pings once per install and fetches `/counts` once per launch, so you'll stay
far under the limits.

## Privacy

- `/ping` reads only the `CF-IPCountry` header that Cloudflare adds at its edge.
  The Worker never sees or stores the visitor's IP address.
- Only a running total per country is kept. There is no per-user record.
- `/counts` returns just those totals and is safe to fetch anonymously.
