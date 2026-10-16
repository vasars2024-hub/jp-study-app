'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * A fake OpenAI-compatible VISION server, owned by the snip flow, for "Read text with AI"
 * (src/main/ocrAiVisionProvider.ts): what the harness's fake (tools/e2e/world.cjs) does not
 * do — read a picture. It answers every chat-completions request that carries an image part
 * with a fixed transcription in the reader's JSON shape, and records what it was sent (the
 * model, whether a picture came, its media type, the schema asked for). Ephemeral loopback
 * port (never 11434 / 1234), started and stopped by the flow. Nothing reaches a real AI API.
 *
 *   const vision = await startFakeVision({ model, text: '窓辺の猫' });
 *   ... point Settings > AI at vision.base, snip ...
 *   vision.hits → [{ path, model, images, mime, schema, status }]
 *   await vision.close();
 */
const http = require('node:http');

async function startFakeVision({ model, text }) {
  const hits = [];
  const state = { text };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const json = (status, body) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (req.method === 'GET' && url.pathname === '/v1/models') return json(200, { object: 'list', data: [{ id: model, object: 'model' }] });
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch { body = {}; }
      const parts = (Array.isArray(body.messages) ? body.messages : []).flatMap((m) => (Array.isArray(m.content) ? m.content : []));
      const images = parts.filter((p) => p && p.type === 'image_url' && p.image_url && typeof p.image_url.url === 'string');
      const hit = {
        path: url.pathname,
        model: body.model ?? null,
        images: images.length,
        mime: images[0] ? (/^data:([^;]+);base64,/.exec(images[0].image_url.url) || [])[1] || null : null,
        schema: Boolean(body.response_format && body.response_format.json_schema),
        status: 0,
      };
      hits.push(hit);
      if (req.method !== 'POST' || url.pathname !== '/v1/chat/completions') {
        hit.status = 404;
        return json(404, { error: { message: 'fake vision: no such route' } });
      }
      if (body.model !== model) {
        hit.status = 404;
        return json(404, { error: { message: `fake vision: model "${body.model}" not found` } });
      }
      if (!images.length) {
        hit.status = 400;
        return json(400, { error: { message: 'fake vision: no picture in the request' } });
      }
      hit.status = 200;
      const content = JSON.stringify({ regions: [{ image: 1, lines: [{ text: state.text, confidence: 0.98 }] }] });
      return json(200, {
        id: `chatcmpl-e2e-vision-${hits.length}`,
        object: 'chat.completion',
        created: 1791000000,
        model,
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 900, completion_tokens: 40, total_tokens: 940 },
      });
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    port,
    base: `http://127.0.0.1:${port}/v1`,
    hits,
    get text() { return state.text; },
    set text(value) { state.text = value; },
    async close() {
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

module.exports = { startFakeVision };
