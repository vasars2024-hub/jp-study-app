/**
 * A texthooker WebSocket server for the visual-novel flow: the shape Textractor's
 * WebSocket extension and LunaTranslator speak (each hooked line is one text frame).
 *
 * No dependency: RFC 6455 is small when the server only ever SENDS unmasked text frames
 * and reads (and discards) whatever the client sends. Listens on 127.0.0.1, ephemeral port.
 */
import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';

export interface TexthookerServer {
  port: number;
  url: string;
  /** Sockets currently open (a connected app). */
  clients: () => number;
  /** Every handshake path seen, in order. */
  handshakes: string[];
  /** Send one hooked line to every connected client. Resolves with how many got it. */
  send(line: string): number;
  /** Resolves once at least `n` clients are connected (or rejects after `timeoutMs`). */
  waitForClient(n?: number, timeoutMs?: number): Promise<void>;
  close(): Promise<void>;
}

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function textFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let head: Buffer;
  if (len < 126) head = Buffer.from([0x81, len]);
  else if (len < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x81;
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x81;
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([head, payload]);
}

export async function startTexthooker(): Promise<TexthookerServer> {
  const sockets = new Set<Duplex>();
  const handshakes: string[] = [];
  const server = http.createServer((_req, res) => {
    res.writeHead(426, { 'content-type': 'text/plain' });
    res.end('websocket only');
  });
  server.on('upgrade', (req, socket) => {
    handshakes.push(req.url ?? '/');
    const key = String(req.headers['sec-websocket-key'] ?? '');
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      '',
    ].join('\r\n'));
    sockets.add(socket);
    socket.on('data', (chunk: Buffer) => {
      // A close frame (opcode 8) from the client: answer it and drop the socket.
      if (chunk.length && (chunk[0] & 0x0f) === 0x8) {
        try {
          socket.end(Buffer.from([0x88, 0]));
        } catch {
          /* already gone */
        }
        sockets.delete(socket);
      }
      // Pings (opcode 9) are answered with an empty pong.
      if (chunk.length && (chunk[0] & 0x0f) === 0x9) socket.write(Buffer.from([0x8a, 0]));
    });
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    url: `ws://127.0.0.1:${port}`,
    clients: () => sockets.size,
    handshakes,
    send(line: string) {
      const frame = textFrame(line);
      for (const s of sockets) s.write(frame);
      return sockets.size;
    },
    async waitForClient(n = 1, timeoutMs = 15_000) {
      const deadline = Date.now() + timeoutMs;
      while (sockets.size < n) {
        if (Date.now() > deadline) throw new Error(`no texthooker client connected within ${timeoutMs} ms`);
        await new Promise((r) => setTimeout(r, 100));
      }
    },
    close: () => new Promise<void>((resolve) => {
      for (const s of sockets) s.destroy();
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}
