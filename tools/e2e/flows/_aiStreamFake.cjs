'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * A second fake OpenAI-compatible server, owned by the AI flows themselves, for what the
 * harness's fake (tools/e2e/world.cjs) does not do: a reply that streams its first part
 * and then HOLDS the rest, the way a slow model does — so a flow can see chunks arrive
 * on screen before the reply is complete, press Cancel, and check that the partial text
 * stays. Ephemeral loopback port (never 11434 / 1234), started and stopped by the flow.
 *
 *   const slow = await startSlowAiStream({ model });
 *   slow.prefix = '{"explanation":"E2E slow: the first half';   // what the next reply streams
 *   ... point Settings > AI at slow.base, ask, Cancel ...
 *   slow.hits  → [{ path, stream, chunks, aborted }]
 *   await slow.close();
 *
 * A held reply is finished (with `rest`) after `holdMs`, so a flow that never cancels
 * still ends.
 */
const http = require('node:http');

async function startSlowAiStream({ model, holdMs = 30000 } = {}) {
  const hits = [];
  const open = new Set();
  const state = {
    prefix: '{"text":"',
    rest: '"}',
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ object: 'list', data: [{ id: model, object: 'model' }] }));
      return;
    }
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch { body = {}; }
      const hit = { path: url.pathname, stream: body.stream === true, chunks: 0, aborted: false, done: false };
      hits.push(hit);
      if (url.pathname !== '/v1/chat/completions' || body.stream !== true) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'the slow fake only streams' } }));
        return;
      }
      const chunk = (content) => `data: ${JSON.stringify({ id: 'e2e-slow', object: 'chat.completion.chunk', model, choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(chunk(state.prefix));
      hit.chunks += 1;
      open.add(res);
      const timer = setTimeout(() => {
        if (res.writableEnded) return;
        res.write(chunk(state.rest));
        hit.chunks += 1;
        res.write(`data: ${JSON.stringify({ id: 'e2e-slow', object: 'chat.completion.chunk', model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
        hit.done = true;
        res.end('data: [DONE]\n\n');
      }, holdMs);
      res.on('close', () => {
        clearTimeout(timer);
        open.delete(res);
        if (!hit.done) hit.aborted = true;
      });
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    port,
    base: `http://127.0.0.1:${port}/v1`,
    hits,
    get prefix() { return state.prefix; },
    set prefix(value) { state.prefix = value; },
    get rest() { return state.rest; },
    set rest(value) { state.rest = value; },
    async close() {
      for (const res of open) res.destroy();
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

module.exports = { startSlowAiStream };
