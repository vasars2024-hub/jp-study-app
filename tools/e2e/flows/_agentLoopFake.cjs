'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * A planner fake owned by the Agent flow, for what the harness's fake (tools/e2e/world.cjs) does
 * not do: answer the SAME request differently on its second planning round, from the tool
 * results the app fed back. An OpenAI-compatible server on an ephemeral loopback port (never
 * 11434 / 1234), started and stopped by the flow.
 *
 *   const fake = await startAgentLoopFake({ model });
 *   ... point Settings > AI at fake.base, plan a request carrying one of the marks ...
 *   fake.hits → [{ mark, round, sawSeed }]
 *   await fake.close();
 *
 * Marks (in the user's request):
 *   AGENT_LOOP_MARK    round 1 reads the calendar and asks to continue; round 2 (the prompt
 *                      carries "Planning round 2") makes a reminder named after the seeded
 *                      event it found in the fed-back calendar.list output — or, when the
 *                      output is missing, plans nothing, so the flow's check fails.
 *   AGENT_SNOOZE_MARK  one step: flashcard.schedule-reviews, 3 days, in AGENT_SNOOZE_FOLDER.
 *   AGENT_BADPLAN_MARK prose instead of a plan, so the app refuses it with a code.
 */
const http = require('node:http');

const AGENT_LOOP_MARK = '[e2e-loop]';
const AGENT_SNOOZE_MARK = '[e2e-snooze]';
const AGENT_BADPLAN_MARK = '[e2e-badplan]';
const AGENT_LOOP_SEED = 'E2E loop seed 7319';
const AGENT_LOOP_REMINDER = `E2E loop reminder: ${AGENT_LOOP_SEED}`;
const AGENT_SNOOZE_FOLDER = 'E2E-snooze';

function tomorrowKey() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function promptText(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  return messages.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
}

function answer(prompt, hits) {
  if (!/You are the offline planning model for Gum/.test(prompt)) return null;
  if (prompt.includes(AGENT_BADPLAN_MARK)) {
    hits.push({ mark: 'badplan' });
    return 'I would rather talk about the weather today.';
  }
  if (prompt.includes(AGENT_SNOOZE_MARK)) {
    hits.push({ mark: 'snooze' });
    return JSON.stringify({
      summary: 'E2E snooze: postpone the due reviews by three days.',
      steps: [{ label: 'Snooze the due reviews', operation: 'flashcard.schedule-reviews', arguments: { days: 3, folder: AGENT_SNOOZE_FOLDER } }],
      continue: false,
    });
  }
  if (!prompt.includes(AGENT_LOOP_MARK)) return null;
  const round = /Planning round 2 of/.test(prompt) ? 2 : 1;
  const sawSeed = prompt.includes(AGENT_LOOP_SEED);
  hits.push({ mark: 'loop', round, sawSeed });
  if (round === 1) {
    return JSON.stringify({
      summary: 'E2E loop: first read the calendar, then decide.',
      steps: [{ label: 'Read the calendar', operation: 'calendar.list', arguments: {} }],
      continue: true,
    });
  }
  if (!sawSeed) return JSON.stringify({ summary: 'E2E loop: the calendar results never arrived.', steps: [], continue: false });
  return JSON.stringify({
    summary: 'E2E loop: a reminder about what the calendar showed.',
    steps: [{ label: 'Make the reminder', operation: 'calendar.create-reminder', arguments: { title: AGENT_LOOP_REMINDER, date: tomorrowKey() } }],
    continue: false,
  });
}

async function startAgentLoopFake({ model }) {
  const hits = [];
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
      const content = url.pathname === '/v1/chat/completions' ? answer(promptText(body), hits) : null;
      if (content === null) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'the agent-loop fake only plans' } }));
        return;
      }
      if (body.stream === true) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ id: 'e2e-loop', object: 'chat.completion.chunk', model, choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ id: 'e2e-loop', object: 'chat.completion.chunk', model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
        res.end('data: [DONE]\n\n');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'e2e-loop',
        object: 'chat.completion',
        model,
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    port,
    base: `http://127.0.0.1:${port}/v1`,
    hits,
    async close() {
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

module.exports = {
  startAgentLoopFake,
  AGENT_LOOP_MARK,
  AGENT_SNOOZE_MARK,
  AGENT_BADPLAN_MARK,
  AGENT_LOOP_SEED,
  AGENT_LOOP_REMINDER,
  AGENT_SNOOZE_FOLDER,
};
