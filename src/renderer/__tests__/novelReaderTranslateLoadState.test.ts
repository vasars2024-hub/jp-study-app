// @vitest-environment node
/**
 * Regression: "Translating current chapter…" while a 1,223 MB GGUF loads.
 *
 * `translateChapterRange` has always done three things before translating — attach the model
 * progress listener, check `translateStatus().ready`, and call `translateEnsureReady()` so a load
 * failure surfaces as its own reason. `translateCurrentChapter` did none of them, so the single
 * chapter button sat on an unchanging "current chapter" status for the ~15 s of a cold load, and a
 * failed load arrived as whatever `translateChapter` happened to throw. Rubric category 8, and the
 * same defect `1c874da9` fixed on the Dictionary example panel.
 *
 * A source guard rather than a mount: `NovelReader` needs the whole `window.api` surface and the
 * point here is which calls the callback makes, not what it renders. The body is isolated by
 * brace-matching from the callback's own `const` so the assertions cannot be satisfied by the
 * range path's copy further up the file — that is what makes this a guard rather than a grep.
 * `vitest.config.ts` only picks up `.test.ts` under this directory, so this is deliberately not
 * `.test.tsx`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** `core.autocrlf=true` and no `.gitattributes`: a fresh checkout of this file is CRLF. */
const source = readFileSync(resolve(__dirname, '../views/NovelReader.tsx'), 'utf8').replace(/\r/g, '');

/** The body of a `const <name> = useCallback(async () => { … })`, by brace matching. */
function callbackBody(name: string): string {
  const start = source.indexOf(`const ${name} = useCallback(`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const open = source.indexOf('{', source.indexOf('=>', start));
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced braces in ${name}`);
}

describe('NovelReader single-chapter translate reports the model load', () => {
  const body = callbackBody('translateCurrentChapter');

  it('isolates the callback rather than matching the whole file', () => {
    // If this ever fails the guard below is measuring the wrong text, which is the only way it
    // could pass while the product is broken.
    expect(body).toContain("t('epub.translate.status.current')");
    expect(body).not.toContain('const translateChapterRange');
    expect(body.length).toBeLessThan(source.length / 4);
  });

  it('subscribes to model progress and detaches it again', () => {
    expect(body).toContain('window.api.onTranslateModelProgress(');
    expect(body).toContain("t('epub.translate.status.loadingModelPct'");
    // Detached in a `finally`, so an aborted translate cannot leave a listener writing this
    // surface's status during someone else's later load.
    expect(body).toMatch(/finally\s*\{[^}]*offModel\(\)/);
  });

  it('waits for the model instead of translating into a cold runtime', () => {
    expect(body).toContain('status.ready');
    expect(body).toContain('window.api.translateEnsureReady()');
    expect(body).toContain("t('epub.translate.status.loadingModel')");
  });

  it('surfaces the load failure reason rather than a downstream throw', () => {
    expect(body).toMatch(/ready\.error \|\| t\('epub\.translate\.failed'\)/);
  });

  /**
   * The control that keeps this honest: the range path is the reference implementation, so if it
   * ever loses these steps the single-chapter guard above is asserting against nothing.
   */
  it('matches the range path it was modelled on', () => {
    const range = callbackBody('translateChapterRange');
    for (const call of ['window.api.onTranslateModelProgress(', 'window.api.translateEnsureReady()', 'status.ready']) {
      expect(range, `range path lost ${call}`).toContain(call);
    }
  });
});
