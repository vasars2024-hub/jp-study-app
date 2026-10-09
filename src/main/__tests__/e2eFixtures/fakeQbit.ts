// A fake qBittorrent WebUI (the v2 API subset the app speaks) for the scraper
// pipeline E2E suite. Listens on 127.0.0.1 on an ephemeral port.
//
// It "downloads" by placing the generated test video (a hard link) into the save
// path once a torrent has been listed `completeAfterPolls` times, and can drop
// Japanese sidecar subtitles next to it, so the files the poller finds are real.
//
// Dialects:
//   v5 — login answers 204 (success) / 401 (refused); `torrents/add` answers
//        5.2-style JSON counts; pause/resume are `stop`/`start`.
//   v4 — login answers `200 Ok.` / `200 Fails.`; `torrents/add` answers
//        `Ok.`, or `200 Fails.` when `rejectAdds` is set.
// Sessions expire on demand (`expireSessions`), so the client's re-login path
// runs. `reportedSavePath` makes the daemon describe its paths the way a remote
// (Docker / NAS) client does — POSIX paths that do not exist on this machine —
// while the files are really written under `defaultSavePath`.

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { placeMedia } from './media';
import { parseTorrentFile } from '../../scraper/torrentFile';

/** The parts of a multipart/form-data body (enough of RFC 7578 for qBittorrent's add form). */
function parseMultipart(body: Buffer, boundary: string): Array<{ name: string; fileName?: string; data: Buffer }> {
  const marker = Buffer.from(`--${boundary.replace(/^"|"$/g, '')}`);
  const out: Array<{ name: string; fileName?: string; data: Buffer }> = [];
  let at = body.indexOf(marker);
  while (at >= 0) {
    const start = at + marker.length;
    if (body.subarray(start, start + 2).toString() === '--') break;
    const next = body.indexOf(marker, start);
    if (next < 0) break;
    const part = body.subarray(start + 2, next - 2); // skip CRLF after the marker and before the next
    const split = part.indexOf('\r\n\r\n');
    const head = part.subarray(0, split).toString();
    const name = /name="([^"]*)"/.exec(head)?.[1] ?? '';
    const fileName = /filename="([^"]*)"/.exec(head)?.[1];
    out.push({ name, ...(fileName !== undefined ? { fileName } : {}), data: part.subarray(split + 4) });
    at = next;
  }
  return out;
}

export interface FakeTorrent {
  hash: string;
  name: string;
  /** Where the files really are on this machine. */
  localDir: string;
  category: string;
  tags: string;
  state: string;
  progress: number;
  size: number;
}

export interface FakeQbitOptions {
  password: string;
  username?: string;
  mediaPath: string;
  defaultSavePath: string;
  version?: '4' | '5';
  /** How many `torrents/info` listings a torrent stays downloading. Default 1 (complete on first look). */
  completeAfterPolls?: number;
  /** `torrents/add` answers `200 Fails.` (the 4.x refusal). */
  rejectAdds?: boolean;
  /** Report this POSIX directory instead of `defaultSavePath` (a remote client's view). */
  reportedSavePath?: string;
  /** Sidecar subtitles written beside each completed video, keyed by suffix (`.ja.srt`). */
  sidecars?: Record<string, string | Buffer>;
  /** Send a `WEBUI_SID=` cookie ahead of the real `SID=` one on login. */
  decoyCookie?: boolean;
}

export interface FakeQbit {
  port: number;
  torrents: Map<string, FakeTorrent>;
  /** `METHOD /path` for every request. */
  calls: string[];
  /** Login attempts, successful or not. */
  logins: () => number;
  expireSessions(): void;
  close(): Promise<void>;
}

export async function startFakeQbit(opts: FakeQbitOptions): Promise<FakeQbit> {
  const torrents = new Map<string, FakeTorrent>();
  const calls: string[] = [];
  const sids = new Set<string>();
  const polls = new Map<string, number>();
  const v5 = (opts.version ?? '5') === '5';
  const username = opts.username ?? 'admin';
  let logins = 0;

  const reportedDir = (t: FakeTorrent): string => (opts.reportedSavePath
    ? `${opts.reportedSavePath.replace(/\/+$/, '')}/${path.relative(opts.defaultSavePath, t.localDir).split(path.sep).filter(Boolean).join('/')}`.replace(/\/+$/, '')
    : t.localDir);
  const reportedJoin = (dir: string, name: string): string => (opts.reportedSavePath ? `${dir}/${name}` : path.join(dir, name));

  const info = (t: FakeTorrent) => {
    const savePath = reportedDir(t);
    return {
      hash: t.hash,
      name: t.name,
      save_path: savePath,
      content_path: reportedJoin(savePath, t.name),
      category: t.category,
      tags: t.tags,
      state: t.state,
      progress: t.progress,
      size: t.size,
      total_size: t.size,
      amount_left: t.progress >= 1 ? 0 : t.size,
      completion_on: t.progress >= 1 ? Math.floor(Date.now() / 1000) : -1,
      added_on: Math.floor(Date.now() / 1000),
      dlspeed: 0,
      upspeed: 0,
      num_seeds: 1,
      num_leechs: 0,
      eta: t.progress >= 1 ? 8640000 : 60,
      ratio: 0,
    };
  };

  const complete = (t: FakeTorrent) => {
    placeMedia(opts.mediaPath, path.join(t.localDir, t.name));
    const stem = t.name.replace(/\.[^.]+$/, '');
    for (const [suffix, body] of Object.entries(opts.sidecars ?? {})) {
      fs.writeFileSync(path.join(t.localDir, `${stem}${suffix}`), body);
    }
    t.progress = 1;
    t.state = 'uploading';
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://qbit.invalid');
    const chunks: Buffer[] = [];
    let raw = '';
    req.on('data', (chunk: Buffer) => { chunks.push(chunk); });
    req.on('end', () => {
      const bytes = Buffer.concat(chunks);
      raw = bytes.toString();
      calls.push(`${req.method} ${url.pathname}`);
      const json = (value: unknown) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(value));
      };
      const text = (status: number, body = '') => {
        res.writeHead(status, { 'content-type': 'text/plain; charset=UTF-8' });
        res.end(body);
      };

      if (url.pathname === '/api/v2/app/version') {
        text(200, v5 ? 'v5.2.3' : 'v4.6.7');
        return;
      }
      if (url.pathname === '/api/v2/app/webapiVersion') {
        text(200, v5 ? '2.11.4' : '2.9.3');
        return;
      }
      if (url.pathname === '/api/v2/auth/login') {
        logins += 1;
        const form = new URLSearchParams(raw);
        if (form.get('username') !== username || form.get('password') !== opts.password) {
          if (v5) text(401);
          else text(200, 'Fails.');
          return;
        }
        const sid = crypto.randomBytes(12).toString('hex');
        sids.add(sid);
        res.writeHead(v5 ? 204 : 200, {
          // With `decoyCookie`, a cookie whose name ENDS in `SID` comes first, so a
          // client reading `SID=` without anchoring the name picks the wrong value.
          'set-cookie': [
            ...(opts.decoyCookie ? ['WEBUI_SID=decoy; path=/'] : []),
            `SID=${sid}; HttpOnly; SameSite=Strict; path=/`,
          ],
          'content-type': 'text/plain; charset=UTF-8',
        });
        res.end(v5 ? undefined : 'Ok.');
        return;
      }

      const sid = /(?:^|;\s*)SID=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
      if (!sid || !sids.has(sid)) {
        text(403, 'Forbidden');
        return;
      }

      switch (url.pathname) {
        case '/api/v2/app/preferences':
          json({ save_path: opts.reportedSavePath ?? opts.defaultSavePath, temp_path_enabled: false });
          return;
        case '/api/v2/app/defaultSavePath':
          text(200, opts.reportedSavePath ?? opts.defaultSavePath);
          return;
        case '/api/v2/torrents/add': {
          if (opts.rejectAdds) {
            text(200, 'Fails.');
            return;
          }
          // `.torrent` files arrive as multipart/form-data `torrents` parts.
          const multipart = /multipart\/form-data;\s*boundary=(.+)$/i.exec(req.headers['content-type'] ?? '');
          const parts = multipart ? parseMultipart(bytes, multipart[1]) : [];
          const form = multipart
            ? new URLSearchParams(parts.filter((p) => !p.fileName).map((p) => [p.name, p.data.toString()]))
            : new URLSearchParams(raw);
          const requested = form.get('savepath') || '';
          const localDir = requested && !opts.reportedSavePath ? requested : opts.defaultSavePath;
          const added: string[] = [];
          for (const part of parts.filter((p) => p.name === 'torrents')) {
            const info = parseTorrentFile(part.data);
            if (!info.ok) continue;
            fs.mkdirSync(localDir, { recursive: true });
            torrents.set(info.infoHash, {
              hash: info.infoHash,
              name: info.name,
              localDir,
              category: form.get('category') ?? '',
              tags: form.get('tags') ?? '',
              state: 'downloading',
              progress: 0,
              size: fs.statSync(opts.mediaPath).size,
            });
            added.push(info.infoHash);
          }
          for (const magnet of (form.get('urls') ?? '').split(/\r?\n/).filter(Boolean)) {
            const hash = (/btih:([0-9a-zA-Z]+)/.exec(magnet)?.[1] ?? '').toLowerCase();
            if (!hash) continue;
            const dn = decodeURIComponent((/[?&]dn=([^&]+)/.exec(magnet)?.[1] ?? hash).replace(/\+/g, ' '));
            fs.mkdirSync(localDir, { recursive: true });
            torrents.set(hash, {
              hash,
              name: `${dn}.mkv`,
              localDir,
              category: form.get('category') ?? '',
              tags: form.get('tags') ?? '',
              state: 'downloading',
              progress: 0,
              size: fs.statSync(opts.mediaPath).size,
            });
            added.push(hash);
          }
          if (v5) json({ success_count: added.length, failure_count: 0, pending_count: 0, added_torrent_ids: added });
          else text(200, 'Ok.');
          return;
        }
        case '/api/v2/torrents/info': {
          for (const t of torrents.values()) {
            const n = (polls.get(t.hash) ?? 0) + 1;
            polls.set(t.hash, n);
            if (t.progress < 1 && n >= (opts.completeAfterPolls ?? 1)) complete(t);
          }
          const hashes = url.searchParams.get('hashes');
          const wanted = hashes ? new Set(hashes.toLowerCase().split('|')) : null;
          json([...torrents.values()].filter((t) => !wanted || wanted.has(t.hash)).map(info));
          return;
        }
        case '/api/v2/torrents/properties': {
          const t = torrents.get((url.searchParams.get('hash') ?? '').toLowerCase());
          if (!t) {
            text(404, 'Not Found');
            return;
          }
          json({ save_path: reportedDir(t), total_size: t.size, pieces_have: t.progress >= 1 ? 1 : 0, pieces_num: 1 });
          return;
        }
        case '/api/v2/torrents/files': {
          const t = torrents.get((url.searchParams.get('hash') ?? '').toLowerCase());
          if (!t) {
            text(404, 'Not Found');
            return;
          }
          json([{ index: 0, name: t.name, size: t.size, progress: t.progress, priority: 1, is_seed: t.progress >= 1 }]);
          return;
        }
        case '/api/v2/torrents/stop':
        case '/api/v2/torrents/start':
          text(v5 ? 200 : 404, v5 ? '' : 'Not Found');
          return;
        case '/api/v2/torrents/pause':
        case '/api/v2/torrents/resume':
          text(v5 ? 404 : 200, v5 ? 'Not Found' : '');
          return;
        case '/api/v2/sync/maindata':
          json({
            rid: 1,
            full_update: true,
            torrents: Object.fromEntries([...torrents].map(([hash, t]) => [hash, info(t)])),
            server_state: { free_space_on_disk: 1e9, connection_status: 'connected' },
          });
          return;
        case '/api/v2/transfer/info':
          json({ connection_status: 'connected', dl_info_speed: 0, up_info_speed: 0 });
          return;
        default:
          text(404, 'Not Found');
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: (server.address() as AddressInfo).port,
    torrents,
    calls,
    logins: () => logins,
    expireSessions: () => sids.clear(),
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}
