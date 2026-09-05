import { describe, it, expect, beforeEach } from 'vitest';
import { forceCollect, resolveCollector, resetGcBorrowForTests } from '../debugGc';

/**
 * The defect these cover, measured 2026-09-05: `/mem {gc:true}` called
 * `v8.setFlagsFromString` twice and `vm.runInNewContext('gc')` once PER REQUEST, and main died
 * on the fifth call with `ReferenceError: require is not defined at Immediate.<anonymous>` —
 * after the route had already answered 200. The test that matters most is therefore not "does
 * it collect" but "how many times does it touch V8 across repeated calls".
 */
describe('debugGc — the forced collection the debug bridge borrows', () => {
  beforeEach(() => resetGcBorrowForTests());

  const borrowDeps = () => {
    const flags: string[] = [];
    const contexts: string[] = [];
    let collected = 0;
    return {
      flags,
      contexts,
      collected: () => collected,
      deps: {
        globalGc: undefined,
        setFlagsFromString: (f: string) => { flags.push(f); },
        runInNewContext: (code: string) => { contexts.push(code); return () => { collected += 1; }; },
      },
    };
  };

  it('borrows exactly once no matter how many times it is called — this is the crash fix', () => {
    const h = borrowDeps();
    for (let i = 0; i < 10; i += 1) expect(forceCollect(h.deps).ran).toBe(true);
    expect(h.collected()).toBe(10);
    // One borrow, one restore, one context — for TEN collections. The old code did 20 flag
    // flips and 10 fresh V8 contexts for the same work.
    expect(h.contexts).toEqual(['gc']);
    expect(h.flags).toEqual(['--expose_gc', '--no-expose_gc']);
  });

  it('prefers globalThis.gc and then touches no V8 flag and mints no context at all', () => {
    const h = borrowDeps();
    let native = 0;
    const out = forceCollect({ ...h.deps, globalGc: () => { native += 1; } });
    expect(out).toMatchObject({ ran: true, source: 'native' });
    expect(native).toBe(1);
    expect(h.flags).toEqual([]);
    expect(h.contexts).toEqual([]);
  });

  it('restores the flag even when the borrow throws, and does not retry the borrow', () => {
    const flags: string[] = [];
    let attempts = 0;
    const deps = {
      globalGc: undefined,
      setFlagsFromString: (f: string) => { flags.push(f); },
      runInNewContext: () => { attempts += 1; throw new Error('no vm here'); },
    };
    const first = forceCollect(deps);
    const second = forceCollect(deps);
    expect(first.ran).toBe(false);
    expect(first.source).toBe('failed');
    expect(first.reason).toContain('no vm here');
    expect(second.source).toBe('failed');
    // The retry is the loop hazard: a failing borrow re-toggling flags on every request is
    // the same unsafe pattern the fix removes.
    expect(attempts).toBe(1);
    expect(flags).toEqual(['--expose_gc', '--no-expose_gc']);
  });

  it('never throws when the collector itself throws, and says so honestly', () => {
    const deps = {
      globalGc: undefined,
      setFlagsFromString: () => undefined,
      runInNewContext: () => () => { throw new Error('collector exploded'); },
    };
    const out = forceCollect(deps);
    expect(out.ran).toBe(false);
    expect(out.source).toBe('failed');
    expect(out.reason).toContain('collector exploded');
  });

  it('refuses honestly when the vm returns something that is not a function', () => {
    const out = forceCollect({
      globalGc: undefined,
      setFlagsFromString: () => undefined,
      runInNewContext: () => 'not a function',
    });
    expect(out.ran).toBe(false);
    expect(out.source).toBe('failed');
    expect(out.reason).toContain('did not expose gc');
  });

  it('resolveCollector reports the source without collecting', () => {
    const h = borrowDeps();
    const out = resolveCollector(h.deps);
    expect(out.ran).toBe(false);
    expect(out.source).toBe('borrowed');
    expect(h.collected()).toBe(0);
  });
});
