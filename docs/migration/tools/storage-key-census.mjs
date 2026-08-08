#!/usr/bin/env node
/**
 * storage-key-census.mjs — item 6.1, tier 1.
 *
 * Resolves every `localStorage.{getItem,setItem,removeItem}` call in `src/` to the key it
 * touches, and records whether that key is READ, WRITTEN or REMOVED, and from where.
 *
 * Why the TypeScript AST and not a grep: barely any call site passes a string literal. The
 * repo's house pattern is a module-scoped `const KEY = 'jp-…'`, often exported and imported
 * elsewhere, or a member of a shared `LS_KEYS` object, plus wrapper functions that take the
 * key as a parameter (`migrationRunner.readLocal/writeLocal`, `writeLocalStorageJson`). A grep
 * over literals sees a fraction of the sites and reports the rest as "never written" — which
 * is the exact verdict 6.1 is trying to establish, so a false one is worse than no tool.
 *
 * Resolution is recursive and import-aware. It covers:
 *   - string literals                              'jp-app-zoom'
 *   - consts at any scope depth                    const k = key(bookId)
 *   - imported consts and object members           LS_KEYS.calendarEvents
 *   - template literals, with span substitution    `jp-known-words-v1-${lang}`
 *   - string concatenation                         CHECKLIST_PREFIX + bundleId
 *   - key-builder calls, with argument inlining    knowledgeKey('ja') → jp-known-words-v1-ja
 *   - transitive storage wrappers                  writeLocalStorageJson(KEY, obj)
 *
 * A name only resolves through an import when that import actually points at the file that
 * declares it. `readJson` is a localStorage wrapper in `renderer/aeroEnvironment.ts` and an
 * fs wrapper in `main/immersion/index.ts`; bare-name matching credits the second one's file
 * reads to localStorage.
 *
 * Anything it cannot resolve is counted and listed under `unresolved`, never dropped.
 *
 * Usage: node docs/migration/tools/storage-key-census.mjs [--json <path>]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const SRC = path.join(REPO, 'src');

const STORAGE_METHODS = new Set(['getItem', 'setItem', 'removeItem']);
const OP_BY_METHOD = { getItem: 'read', setItem: 'write', removeItem: 'remove' };
const DYNAMIC = '${…}';
const MAX_DEPTH = 12;

const rel = (f) => path.relative(REPO, f).replace(/\\/g, '/');
const isTestFile = (p) => /__tests__|\.test\.|\.spec\./.test(p.replace(/\\/g, '/'));

function collectSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      collectSourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

const files = collectSourceFiles(SRC);
/** @type {Map<string, ts.SourceFile>} */
const parsed = new Map();
for (const file of files) {
  parsed.set(
    file,
    ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
  );
}

// ---------------------------------------------------------------------------
// per-file indexes: declarations (any depth), functions (any depth), imports
// ---------------------------------------------------------------------------

/** file -> Map(name -> [{pos, initializer}]) */
const declIndex = new Map();
/** file -> Map(name -> functionLikeNode) */
const fnIndex = new Map();
/** file -> Map(localName -> {file, importedName}) */
const importIndex = new Map();

function resolveModule(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null; // bare or ambient ('@/…' is Seanime, declared only)
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    base,
  ];
  return candidates.find((c) => parsed.has(c)) ?? null;
}

for (const [file, sf] of parsed) {
  const decls = new Map();
  const fns = new Map();
  const imports = new Map();

  const addDecl = (name, pos, initializer, iterable = null) => {
    if (!decls.has(name)) decls.set(name, []);
    decls.get(name).push({ pos, initializer, iterable });
  };

  const walk = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      addDecl(node.name.text, node.getStart(sf), node.initializer);
      if (
        ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer)
      ) {
        fns.set(node.name.text, node.initializer);
      }
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isArrayBindingPattern(node.name) &&
      !node.initializer &&
      node.parent?.parent &&
      ts.isForOfStatement(node.parent.parent)
    ) {
      // `for (const [key, value] of Object.entries(parsed.localStorage))` — the whole-store
      // restore path. Only the first binding is a key.
      const first = node.name.elements[0];
      if (first && ts.isBindingElement(first) && ts.isIdentifier(first.name)) {
        addDecl(first.name.text, node.getStart(sf), null, node.parent.parent.expression);
      }
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      !node.initializer &&
      node.parent?.parent &&
      ts.isForOfStatement(node.parent.parent)
    ) {
      // `for (const key of Object.values(LS_KEYS))` — the binding's value is every element
      // of the iterable. Without this, migrationRunner's sweep over every key resolves to
      // nothing and each key looks like it has one writer when it has two.
      addDecl(node.name.text, node.getStart(sf), null, node.parent.parent.expression);
    } else if (ts.isParameter(node) && ts.isIdentifier(node.name) && node.initializer) {
      // `(storage: GardenStorage = localStorage)` — a defaulted parameter is a binding like
      // any other, and this is how the injected-storage modules name their store.
      addDecl(node.name.text, node.getStart(sf), node.initializer);
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      fns.set(node.name.text, node);
    } else if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const target = resolveModule(file, node.moduleSpecifier.text);
      const clause = node.importClause;
      if (clause?.name) imports.set(clause.name.text, { file: target, importedName: 'default' });
      const named = clause?.namedBindings;
      if (named && ts.isNamedImports(named)) {
        for (const el of named.elements) {
          imports.set(el.name.text, {
            file: target,
            importedName: (el.propertyName ?? el.name).text,
          });
        }
      } else if (named && ts.isNamespaceImport(named)) {
        imports.set(named.name.text, { file: target, importedName: '*' });
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);

  declIndex.set(file, decls);
  fnIndex.set(file, fns);
  importIndex.set(file, imports);
}

/**
 * key value -> the constant names that hold it.
 *
 * This is what separates a one-way migration read from a dead setting. `LEGACY_WINS_KEY` is
 * read at boot, migrated into the main process and removed; `LEGACY_PRACTICE_FILTERS_KEY` is
 * read and deliberately left in place. Both are written by no current code path, and without
 * the name they are indistinguishable from a key nothing can ever create.
 */
const constNamesByValue = new Map();
const noteConstName = (value, name) => {
  if (typeof value !== 'string') return;
  if (!constNamesByValue.has(value)) constNamesByValue.set(value, new Set());
  constNamesByValue.get(value).add(name);
};

for (const [, decls] of declIndex) {
  for (const [name, records] of decls) {
    for (const record of records) {
      const init = record.initializer;
      if (!init) continue;
      if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
        noteConstName(init.text, name);
      } else if (ts.isArrayLiteralExpression(init)) {
        for (const el of init.elements) {
          if (ts.isStringLiteral(el)) noteConstName(el.text, name);
        }
      } else if (ts.isAsExpression(init) && ts.isArrayLiteralExpression(init.expression)) {
        for (const el of init.expression.elements) {
          if (ts.isStringLiteral(el)) noteConstName(el.text, name);
        }
      }
    }
  }
}

/** Names declared in exactly one file, used only as a last-resort fallback. */
const globalDecls = new Map();
for (const [file, decls] of declIndex) {
  for (const name of decls.keys()) {
    if (!globalDecls.has(name)) globalDecls.set(name, []);
    globalDecls.get(name).push(file);
  }
}

// ---------------------------------------------------------------------------
// the resolver
// ---------------------------------------------------------------------------

const S = (value) => ({ kind: value.includes(DYNAMIC) ? 'dynamic' : 'static', value });
const U = (detail) => ({ kind: 'unresolved', detail });

/** Nearest declaration record of `name` in `file` at or before `pos` (else the first one). */
function nearestDeclRecord(file, name, pos) {
  const list = declIndex.get(file)?.get(name);
  if (!list?.length) return null;
  const before = list.filter((d) => d.pos <= pos);
  return before.length ? before[before.length - 1] : list[0];
}

/** Just the initializer, for the common case. */
function nearestDecl(file, name, pos) {
  return nearestDeclRecord(file, name, pos)?.initializer ?? null;
}

/** Strip `as const` / `satisfies` / parens so an object or array literal is reachable. */
function unwrap(node) {
  let cur = node;
  while (
    cur &&
    (ts.isAsExpression(cur) || ts.isParenthesizedExpression(cur) || ts.isSatisfiesExpression?.(cur))
  ) {
    cur = cur.expression;
  }
  return cur;
}

/** Resolve an identifier to the object/array literal it holds, following imports. */
function literalFor(name, file, pos, predicate) {
  const local = unwrap(nearestDecl(file, name, pos));
  if (local && predicate(local)) return { node: local, file };

  const imported = importIndex.get(file)?.get(name);
  if (imported?.file) {
    const target = unwrap(nearestDecl(imported.file, imported.importedName, Infinity));
    if (target && predicate(target)) return { node: target, file: imported.file };
  }

  const owners = globalDecls.get(name);
  if (owners?.length === 1) {
    const target = unwrap(nearestDecl(owners[0], name, Infinity));
    if (target && predicate(target)) return { node: target, file: owners[0] };
  }
  return null;
}

/**
 * Every value an iterable expression can yield, for `for (const k of …)`.
 * Handles `Object.values(OBJ)`, `Object.keys(OBJ)`, a bare array literal, and an identifier
 * bound to either.
 */
function resolveIterable(expr, ctx) {
  const node = unwrap(expr);
  if (!node) return null;

  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const method = node.expression.name.text;
    const onObject = ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'Object';
    const arg = node.arguments[0];
    if (onObject && (method === 'values' || method === 'keys') && arg && ts.isIdentifier(arg)) {
      const found = literalFor(arg.text, ctx.file, node.getStart(), ts.isObjectLiteralExpression);
      if (!found) return null;
      const out = [];
      for (const p of found.node.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const propName = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;
        if (method === 'keys') {
          if (propName) out.push(S(propName));
        } else {
          out.push(resolveExpr(p.initializer, { file: found.file, pos: Infinity, bindings: new Map(), depth: ctx.depth + 1 }));
        }
      }
      return out;
    }
    return null;
  }

  const arrayNode = ts.isArrayLiteralExpression(node)
    ? { node, file: ctx.file }
    : ts.isIdentifier(node)
      ? literalFor(node.text, ctx.file, node.getStart(), ts.isArrayLiteralExpression)
      : null;
  if (arrayNode) {
    const out = [];
    for (const el of arrayNode.node.elements) {
      const elCtx = { file: arrayNode.file, pos: Infinity, bindings: new Map(), depth: ctx.depth + 1 };
      if (ts.isSpreadElement(el)) {
        // `[CURRENT_KEY, ...LEGACY_KEYS]` — the legacy list is part of the read set
        const spread = resolveIterable(el.expression, elCtx);
        if (spread) out.push(...spread);
        else out.push(U('unresolved spread'));
      } else {
        out.push(resolveExpr(el, elCtx));
      }
    }
    return out;
  }
  return null;
}

/** True when a function body sweeps the whole store rather than naming a key. */
function sweepsWholeStore(fnNode) {
  let found = false;
  const walk = (n) => {
    if (found) return;
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'key' &&
      isLocalStorageTarget(n.expression.expression)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(n, walk);
  };
  if (fnNode) walk(fnNode);
  return found;
}

/**
 * @param {ts.Expression} expr
 * @param {{file:string, pos:number, bindings:Map<string,object>, depth:number}} ctx
 */
function resolveExpr(expr, ctx) {
  if (!expr) return U('missing argument');
  if (ctx.depth > MAX_DEPTH) return U('recursion limit');
  const next = { ...ctx, depth: ctx.depth + 1 };

  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return S(expr.text);

  if (ts.isTemplateExpression(expr)) {
    let out = expr.head.text;
    for (const span of expr.templateSpans) {
      const part = resolveExpr(span.expression, next);
      out += (part.kind === 'unresolved' ? DYNAMIC : part.value) + span.literal.text;
    }
    return S(out);
  }

  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = resolveExpr(expr.left, next);
    const right = resolveExpr(expr.right, next);
    if (left.kind === 'unresolved' && right.kind === 'unresolved') return U('concat of two unknowns');
    return S((left.kind === 'unresolved' ? DYNAMIC : left.value) + (right.kind === 'unresolved' ? DYNAMIC : right.value));
  }

  if (ts.isParenthesizedExpression(expr)) return resolveExpr(expr.expression, next);
  if (ts.isAsExpression(expr) || ts.isTypeAssertionExpression(expr)) return resolveExpr(expr.expression, next);

  if (ts.isIdentifier(expr)) {
    const bound = ctx.bindings.get(expr.text);
    if (bound) return bound;

    const record = nearestDeclRecord(ctx.file, expr.text, expr.getStart());
    if (record?.iterable) {
      const values = resolveIterable(record.iterable, next);
      if (values?.length) return { kind: 'multi', branches: values };

      // `for (const k of lsKeysMatching(def))` / `Object.entries(parsed.localStorage)` —
      // an inventory scan or a whole-store restore. The key is whatever is in the store,
      // so record it as a sweep rather than as an unknown.
      let iter = unwrap(record.iterable);
      // `const keys = lsKeysMatching(def); for (const k of keys)` — follow the binding to
      // the call that produced the list before asking whether it sweeps the store.
      if (iter && ts.isIdentifier(iter)) {
        iter = unwrap(nearestDecl(ctx.file, iter.text, iter.getStart())) ?? iter;
      }
      if (iter && ts.isCallExpression(iter)) {
        if (ts.isIdentifier(iter.expression)) {
          const fn = fnIndex.get(ctx.file)?.get(iter.expression.text);
          if (sweepsWholeStore(fn)) {
            return { kind: 'enumerated', value: `${DYNAMIC} (whole-store sweep)` };
          }
        }
        if (
          ts.isPropertyAccessExpression(iter.expression) &&
          ts.isIdentifier(iter.expression.expression) &&
          iter.expression.expression.text === 'Object' &&
          iter.expression.name.text === 'entries'
        ) {
          return { kind: 'enumerated', value: `${DYNAMIC} (whole-store sweep)` };
        }
      }
      // `const keys = []; for (…) if (key(i).startsWith(PREFIX)) keys.push(…)` — the list is
      // built by a sweep in this same function, so the for-of over it is a sweep too.
      if (sweepsWholeStore(enclosingFunctions(expr)[0])) {
        return { kind: 'enumerated', value: `${DYNAMIC} (whole-store sweep)` };
      }
      return U(`for-of over ${record.iterable.getText?.().slice(0, 40) ?? '?'}`);
    }
    const local = record?.initializer ?? null;
    if (local) return resolveExpr(local, { ...next, pos: local.getStart() });

    const imported = importIndex.get(ctx.file)?.get(expr.text);
    if (imported?.file) {
      const target = nearestDecl(imported.file, imported.importedName, Infinity);
      if (target) {
        return resolveExpr(target, { file: imported.file, pos: Infinity, bindings: new Map(), depth: ctx.depth + 1 });
      }
    }

    const owners = globalDecls.get(expr.text);
    if (owners?.length === 1) {
      const target = nearestDecl(owners[0], expr.text, Infinity);
      if (target) {
        return resolveExpr(target, { file: owners[0], pos: Infinity, bindings: new Map(), depth: ctx.depth + 1 });
      }
    }
    return U(`identifier ${expr.text}`);
  }

  if (ts.isPropertyAccessExpression(expr)) {
    const objExpr = expr.expression;
    const propName = expr.name.text;

    if (ts.isIdentifier(objExpr)) {
      // `import * as store from './x'` — store.KEY is that module's exported KEY
      const ns = importIndex.get(ctx.file)?.get(objExpr.text);
      if (ns?.importedName === '*' && ns.file) {
        const target = nearestDecl(ns.file, propName, Infinity);
        if (target) {
          return resolveExpr(target, { file: ns.file, pos: Infinity, bindings: new Map(), depth: ctx.depth + 1 });
        }
      }

      const found = literalFor(objExpr.text, ctx.file, expr.getStart(), ts.isObjectLiteralExpression);
      if (found) {
        for (const p of found.node.properties) {
          if (!ts.isPropertyAssignment(p)) continue;
          const name = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;
          if (name === propName) {
            return resolveExpr(p.initializer, { file: found.file, pos: Infinity, bindings: new Map(), depth: ctx.depth + 1 });
          }
        }
      }
    }
    return U(`member ${objExpr.getText?.() ?? '?'}.${propName}`);
  }

  if (ts.isElementAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
    const index = expr.argumentExpression;
    const found = literalFor(expr.expression.text, ctx.file, expr.getStart(), ts.isArrayLiteralExpression);
    if (found && index && ts.isNumericLiteral(index)) {
      const element = found.node.elements[Number(index.text)];
      if (element) {
        return resolveExpr(element, { file: found.file, pos: Infinity, bindings: new Map(), depth: ctx.depth + 1 });
      }
    }
    // a namespace-qualified array, e.g. store.LEGACY_KEYS[0]
    if (ts.isPropertyAccessExpression(expr.expression)) return U('element access on member');
    return U(`element access ${expr.expression.text}[…]`);
  }

  // `LEGACY_KEYS.find((k) => localStorage.getItem(k))` — the legacy-fallback read. Any
  // element of that array can be the key, so all of them belong in the read set.
  if (
    ts.isCallExpression(expr) &&
    ts.isPropertyAccessExpression(expr.expression) &&
    ['find', 'at'].includes(expr.expression.name.text)
  ) {
    const elements = resolveIterable(expr.expression.expression, next);
    if (elements?.length) return { kind: 'multi', branches: elements };
  }

  // `localStorage.key(i)` inside a `for (…; i < localStorage.length; …)` sweep. The key is
  // whatever is in the store, so the honest answer is "every key", not "unknown".
  if (
    ts.isCallExpression(expr) &&
    ts.isPropertyAccessExpression(expr.expression) &&
    expr.expression.name.text === 'key' &&
    isLocalStorageTarget(expr.expression.expression)
  ) {
    return { kind: 'enumerated', value: `${DYNAMIC} (localStorage.key sweep)` };
  }

  if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) {
    const name = expr.expression.text;
    let fnNode = fnIndex.get(ctx.file)?.get(name);
    let fnFile = ctx.file;
    if (!fnNode) {
      const imported = importIndex.get(ctx.file)?.get(name);
      if (imported?.file) {
        fnNode = fnIndex.get(imported.file)?.get(imported.importedName);
        fnFile = imported.file;
      }
    }
    if (!fnNode) return U(`call ${name}()`);

    const body = ts.isArrowFunction(fnNode) && !ts.isBlock(fnNode.body)
      ? fnNode.body
      : fnNode.body?.statements?.find(ts.isReturnStatement)?.expression;
    if (!body) return U(`call ${name}() — no returned expression`);

    const bindings = new Map();
    fnNode.parameters.forEach((param, i) => {
      if (!ts.isIdentifier(param.name)) return;
      const arg = expr.arguments[i];
      bindings.set(param.name.text, arg ? resolveExpr(arg, next) : U('argument not supplied'));
    });
    return resolveExpr(body, { file: fnFile, pos: body.getStart(), bindings, depth: ctx.depth + 1 });
  }

  if (ts.isConditionalExpression(expr)) {
    // `current ? null : LEGACY_KEYS.find(…)` — a null branch is "no key", not an unknown key,
    // so it must not poison the branch that does name one.
    const isNullish = (node) =>
      node.kind === ts.SyntaxKind.NullKeyword ||
      (ts.isIdentifier(node) && node.text === 'undefined');
    const branches = [expr.whenTrue, expr.whenFalse]
      .filter((node) => !isNullish(node))
      .map((node) => resolveExpr(node, next));
    if (branches.length && branches.every((b) => b.kind !== 'unresolved')) {
      return branches.length === 1 ? branches[0] : { kind: 'multi', branches };
    }
  }

  return U(ts.SyntaxKind[expr.kind]);
}

// ---------------------------------------------------------------------------
// storage wrappers — functions that hand a parameter through to localStorage
// ---------------------------------------------------------------------------

/**
 * Is this call target the real `localStorage`?
 *
 * Covers the injected-storage pattern as well as the direct one:
 * `loadReadingGardenProgress(storage: GardenStorage = localStorage)` calls `storage.getItem`,
 * and matching only the bare identifier makes every such module look like it never touches
 * storage at all — `jp-reading-garden-v1` is live in the profile and was reported as an
 * orphan until this followed the parameter default.
 */
function isLocalStorageTarget(expr, file = null) {
  if (ts.isIdentifier(expr)) {
    if (expr.text === 'localStorage') return true;
    if (!file) return false;
    const init = nearestDecl(file, expr.text, expr.getStart());
    if (!init) return false;
    if (ts.isIdentifier(init)) return init.text === 'localStorage';
    if (ts.isPropertyAccessExpression(init)) return init.name.text === 'localStorage';
    return false;
  }
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text === 'localStorage';
  return false;
}

function eachStorageCall(sf, visit, file = null) {
  const walk = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      STORAGE_METHODS.has(node.expression.name.text) &&
      isLocalStorageTarget(node.expression.expression, file)
    ) {
      visit(node, node.expression.name.text);
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
}

/** All function-like ancestors of a node, innermost first. */
function enclosingFunctions(node) {
  const out = [];
  let cur = node.parent;
  while (cur) {
    if (
      ts.isFunctionDeclaration(cur) ||
      ts.isFunctionExpression(cur) ||
      ts.isArrowFunction(cur) ||
      ts.isMethodDeclaration(cur)
    ) {
      out.push(cur);
    }
    cur = cur.parent;
  }
  return out;
}

function functionName(fn) {
  if ((ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)) && fn.name && ts.isIdentifier(fn.name)) {
    return fn.name.text;
  }
  const parent = fn.parent;
  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (parent && ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  return null;
}

/** `${file}::${name}` -> {file, name, paramIndex, op} */
const wrappers = new Map();
const wrapperKey = (file, name) => `${file}::${name}`;

/** Which enclosing function owns `paramName`, and at which index. */
function paramOwner(node, paramName) {
  for (const fn of enclosingFunctions(node)) {
    const idx = fn.parameters.findIndex((p) => ts.isIdentifier(p.name) && p.name.text === paramName);
    if (idx >= 0) return { fn, idx };
  }
  return null;
}

// round 1 — direct localStorage callers
for (const [file, sf] of parsed) {
  eachStorageCall(sf, (call, method) => {
    const arg = call.arguments[0];
    if (!arg || !ts.isIdentifier(arg)) return;
    const owner = paramOwner(call, arg.text);
    if (!owner) return;
    const name = functionName(owner.fn);
    if (!name) return;
    const k = wrapperKey(file, name);
    if (!wrappers.has(k)) wrappers.set(k, { file, name, paramIndex: owner.idx, op: OP_BY_METHOD[method] });
  }, file);
}

/** Resolve a called identifier to a wrapper definition, honouring imports. */
function wrapperFor(file, calleeName) {
  const own = wrappers.get(wrapperKey(file, calleeName));
  if (own) return own;
  const imported = importIndex.get(file)?.get(calleeName);
  if (imported?.file) {
    const viaImport = wrappers.get(wrapperKey(imported.file, imported.importedName));
    if (viaImport) return viaImport;
  }
  return null;
}

// rounds 2..4 — wrappers of wrappers (writeLocalStorageJson → writeLocalStorage → setItem)
for (let round = 0; round < 3; round += 1) {
  let added = 0;
  for (const [file, sf] of parsed) {
    const walk = (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const target = wrapperFor(file, node.expression.text);
        if (target) {
          const arg = node.arguments[target.paramIndex];
          if (arg && ts.isIdentifier(arg)) {
            const owner = paramOwner(node, arg.text);
            const name = owner ? functionName(owner.fn) : null;
            if (name) {
              const k = wrapperKey(file, name);
              if (!wrappers.has(k)) {
                wrappers.set(k, { file, name, paramIndex: owner.idx, op: target.op });
                added += 1;
              }
            }
          }
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(sf);
  }
  if (!added) break;
}

// ---------------------------------------------------------------------------
// the census
// ---------------------------------------------------------------------------

const census = new Map();
const unresolved = [];

function record(key, op, site) {
  if (!census.has(key)) census.set(key, { read: [], write: [], remove: [] });
  const list = census.get(key)[op];
  if (!list.includes(site)) list.push(site);
}

function apply(resolution, op, site, expr) {
  if (resolution.kind === 'multi') {
    for (const branch of resolution.branches) apply(branch, op, site, expr);
    return;
  }
  if (resolution.kind === 'unresolved') {
    unresolved.push({ site, op, detail: resolution.detail, text: expr?.getText?.().slice(0, 90) ?? '' });
    return;
  }
  record(resolution.value, op, site);
}

for (const [file, sf] of parsed) {
  const siteOf = (node) => `${rel(file)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`;
  const ctx = (node) => ({ file, pos: node.getStart(sf), bindings: new Map(), depth: 0 });

  eachStorageCall(sf, (call, method) => {
    const arg = call.arguments[0];
    // a wrapper's own internal call is not a site — its callers are
    if (arg && ts.isIdentifier(arg) && paramOwner(call, arg.text)) return;
    apply(resolveExpr(arg, ctx(call)), OP_BY_METHOD[method], siteOf(call), arg);
  }, file);

  const walk = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const target = wrapperFor(file, node.expression.text);
      const arg = target ? node.arguments[target.paramIndex] : null;
      // A wrapper forwarding its own parameter to an inner wrapper is not a call site —
      // its own callers are, and this same walk reaches those.
      const forwarding = arg && ts.isIdentifier(arg) && paramOwner(node, arg.text);
      if (arg && !forwarding) apply(resolveExpr(arg, ctx(node)), target.op, siteOf(node), arg);
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
}

// ---------------------------------------------------------------------------
// classification
// ---------------------------------------------------------------------------

const appSites = (list) => list.filter((s) => !isTestFile(s));

const rows = [...census.entries()]
  .map(([key, ops]) => {
    const reads = appSites(ops.read);
    const writes = appSites(ops.write);
    const removes = appSites(ops.remove);
    let cls;
    if (!reads.length && !writes.length && !removes.length) cls = 'test-only';
    else if (reads.length && !writes.length) cls = 'read-never-written';
    else if (writes.length && !reads.length) cls = 'written-never-read';
    else cls = 'read-write';
    const constNames = [...(constNamesByValue.get(key) ?? [])];
    return {
      key,
      class: cls,
      constNames,
      legacyNamed: constNames.some((n) => /legacy/i.test(n)),
      dynamic: key.includes(DYNAMIC),
      reads: reads.length,
      writes: writes.length,
      removes: removes.length,
      testOnlySites: ops.read.length + ops.write.length + ops.remove.length - reads.length - writes.length - removes.length,
      readSites: reads,
      writeSites: writes,
      removeSites: removes,
    };
  })
  .sort((a, b) => a.key.localeCompare(b.key));

const summary = {
  generated: new Date().toISOString(),
  filesScanned: files.length,
  keys: rows.length,
  staticKeys: rows.filter((r) => !r.dynamic).length,
  dynamicKeys: rows.filter((r) => r.dynamic).length,
  wrappers: wrappers.size,
  byClass: rows.reduce((acc, r) => ({ ...acc, [r.class]: (acc[r.class] ?? 0) + 1 }), {}),
  unresolvedCount: unresolved.length,
};

const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const jsonPath = path.resolve(REPO, argValue('--json', 'docs/audit/STORAGE_CENSUS.json'));
fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
fs.writeFileSync(
  jsonPath,
  JSON.stringify(
    { summary, wrappers: [...wrappers.values()].map((w) => ({ ...w, file: rel(w.file) })), keys: rows, unresolved },
    null,
    2,
  ),
  'utf8',
);

console.log(JSON.stringify(summary, null, 2));
console.log(`\nwrote ${rel(jsonPath)}`);
if (unresolved.length) {
  console.log(`\n${unresolved.length} unresolved call sites:`);
  for (const u of unresolved) console.log(`  ${u.op.padEnd(6)} ${u.site}  ${u.detail}  ${u.text}`);
}
