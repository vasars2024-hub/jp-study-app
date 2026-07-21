#!/usr/bin/env node
/**
 * MCP stdio server that proxies to the jp-study-app dev debug bridge.
 *
 * Zero dependencies on purpose: MCP over stdio is newline-delimited JSON-RPC,
 * and the app side is plain HTTP, so nothing here needs npm install and
 * package.json stays untouched.
 *
 * Reads the port/token the running app wrote to <project>/debug/bridge.json.
 * If the app isn't running, every tool returns a clear "app not running"
 * message rather than a connection stack trace.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, '..', '..');
const BRIDGE_FILE = path.join(PROJECT_ROOT, 'debug', 'bridge.json');

const PROTOCOL_VERSION = '2025-06-18';

function bridgeInfo() {
  try {
    const raw = fs.readFileSync(BRIDGE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed?.port || !parsed?.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function call(route, payload, method = 'POST') {
  const info = bridgeInfo();
  if (!info) {
    return {
      ok: false,
      error:
        'App not running (no debug/bridge.json). Start it with `npm start` from the project root, then retry.',
    };
  }
  const url = `http://127.0.0.1:${info.port}${route}`;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${info.token}`,
        'content-type': 'application/json',
      },
      body: method === 'POST' ? JSON.stringify(payload ?? {}) : undefined,
    });
    return await res.json();
  } catch (err) {
    return {
      ok: false,
      error: `Could not reach the app on port ${info.port} (${String(err)}). It may have exited; restart with \`npm start\`.`,
    };
  }
}

const WINDOW_PROP = {
  type: 'string',
  description:
    'Which window: "focused" (default), "main", a numeric window id, or a substring of the window title/URL such as "blanc" or "mini".',
};

const TOOLS = [
  {
    name: 'app_health',
    description:
      'Check whether the app is running and list its open windows (id, title, url, bounds, visibility). Call this first when unsure of app state.',
    inputSchema: { type: 'object', properties: {} },
    run: () => call('/health', null, 'GET'),
  },
  {
    name: 'app_logs',
    description:
      'Read recent console output and errors from the running app, newest last. Use this to see real stack traces instead of guessing at a failure.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max entries to return (default 200).' },
        level: { type: 'string', description: 'Filter by level, e.g. "error". Omit for all.' },
        match: { type: 'string', description: 'Only entries containing this substring.' },
      },
    },
    run: (args) => {
      const q = new URLSearchParams();
      if (args.limit) q.set('limit', String(args.limit));
      if (args.level) q.set('level', String(args.level));
      if (args.match) q.set('match', String(args.match));
      return call(`/logs?${q.toString()}`, null, 'GET');
    },
  },
  {
    name: 'app_eval',
    description:
      'Evaluate a JavaScript expression inside a window and return the result. For inspection and debugging only — implement real changes by editing source files.',
    inputSchema: {
      type: 'object',
      properties: {
        js: { type: 'string', description: 'JavaScript expression to evaluate.' },
        window: WINDOW_PROP,
      },
      required: ['js'],
    },
    run: (args) => call('/eval', args),
  },
  {
    name: 'app_dom',
    description:
      'Get the outerHTML of an element in a window. Use to verify rendered structure, classes, and attributes after a change.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector (default "body").' },
        maxChars: { type: 'number', description: 'Truncate beyond this length (default 40000).' },
        window: WINDOW_PROP,
      },
    },
    run: (args) => call('/dom', args),
  },
  {
    name: 'app_text',
    description:
      'Get the visible innerText of an element. Cheaper than app_dom when you only need to confirm wording or labels.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector (default "body").' },
        window: WINDOW_PROP,
      },
    },
    run: (args) => call('/text', args),
  },
  {
    name: 'app_screenshot',
    description:
      'Capture a window and return the image. Use to confirm visual/layout changes look right.',
    inputSchema: { type: 'object', properties: { window: WINDOW_PROP } },
    run: (args) => call('/screenshot', args),
    image: true,
  },
  {
    name: 'app_click',
    description:
      'Click at window coordinates. Get coordinates from app_eval on getBoundingClientRect(), or from a screenshot.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        button: { type: 'string', description: '"left" (default), "right", or "middle".' },
        clickCount: { type: 'number', description: '2 for a double-click.' },
        window: WINDOW_PROP,
      },
      required: ['x', 'y'],
    },
    run: (args) => call('/click', args),
  },
  {
    name: 'app_type',
    description: 'Type text into the focused element of a window.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' }, window: WINDOW_PROP },
      required: ['text'],
    },
    run: (args) => call('/type', args),
  },
  {
    name: 'app_key',
    description:
      'Press a single key, e.g. "Enter", "Escape", "Tab", "ArrowDown", with optional modifiers.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        modifiers: {
          type: 'array',
          items: { type: 'string' },
          description: 'e.g. ["control"], ["shift"], ["alt"].',
        },
        window: WINDOW_PROP,
      },
      required: ['key'],
    },
    run: (args) => call('/key', args),
  },
  {
    name: 'app_reload',
    description:
      'Reload a window. Rarely needed — Vite hot-reload usually applies edits automatically.',
    inputSchema: { type: 'object', properties: { window: WINDOW_PROP } },
    run: (args) => call('/reload', args),
  },
];

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function toolResult(tool, args) {
  const out = await tool.run(args ?? {});

  // Screenshots come back as a file path; inline the image so it can be viewed.
  if (tool.image && out?.ok && out.path) {
    try {
      const data = fs.readFileSync(out.path).toString('base64');
      return {
        content: [
          { type: 'text', text: `Captured ${out.size?.width}x${out.size?.height} — ${out.path}` },
          { type: 'image', data, mimeType: 'image/png' },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Captured to ${out.path} but could not read it: ${err}` }],
      };
    }
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
    isError: out?.ok === false,
  };
}

async function handleMessage(msg) {
  const { id, method, params } = msg;

  // Notifications carry no id and expect no response.
  if (id === undefined || id === null) return;

  switch (method) {
    case 'initialize':
      return reply(id, {
        protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'jp-study-app-bridge', version: '1.0.0' },
      });

    case 'ping':
      return reply(id, {});

    case 'tools/list':
      return reply(
        id,
        { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) },
      );

    case 'tools/call': {
      const tool = BY_NAME.get(params?.name);
      if (!tool) return replyError(id, -32602, `Unknown tool: ${params?.name}`);
      try {
        return reply(id, await toolResult(tool, params?.arguments));
      } catch (err) {
        return reply(id, {
          content: [{ type: 'text', text: `Tool failed: ${String(err)}` }],
          isError: true,
        });
      }
    }

    default:
      return replyError(id, -32601, `Method not found: ${method}`);
  }
}

// Requests are async, so stdin closing must not kill responses still in flight.
let pending = 0;
let stdinClosed = false;

function maybeExit() {
  // Let the event loop drain rather than calling process.exit(): forcing an
  // exit while the stdin handle is closing trips a libuv assertion on Windows.
  if (stdinClosed && pending === 0) {
    process.exitCode = 0;
    process.stdin.pause();
  }
}

async function dispatch(msg) {
  pending += 1;
  try {
    await handleMessage(msg);
  } finally {
    pending -= 1;
    maybeExit();
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue; // ignore malformed frames rather than dying
    }
    void dispatch(msg);
  }
});

process.stdin.on('end', () => {
  stdinClosed = true;
  maybeExit();
});
