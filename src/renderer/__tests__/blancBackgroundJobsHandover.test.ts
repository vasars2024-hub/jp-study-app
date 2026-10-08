import { afterEach, describe, expect, it, vi } from 'vitest';
import { decideBlancJobs, installBlancBackgroundJobs } from '../blancBackgroundJobs';
import {
  __resetStudyOsJobsForTests,
  announceStudyOsJobsReady,
  noteStudyOsJobInstalled,
} from '../studyOsJobsReady';

describe('decideBlancJobs', () => {
  it('takes the jobs over only when no Study OS window is alive', () => {
    expect(decideBlancJobs({ studyOsAlive: false, studyOsJobsReady: false, installed: false })).toBe('install');
    expect(decideBlancJobs({ studyOsAlive: false, studyOsJobsReady: false, installed: true })).toBe('keep');
  });

  it('keeps its jobs while Study OS is alive but has not acked its own', () => {
    expect(decideBlancJobs({ studyOsAlive: true, studyOsJobsReady: false, installed: true })).toBe('keep');
    expect(decideBlancJobs({ studyOsAlive: true, studyOsJobsReady: false, installed: false })).toBe('keep');
  });

  it('drops them only on the jobs-ready ack', () => {
    expect(decideBlancJobs({ studyOsAlive: true, studyOsJobsReady: true, installed: true })).toBe('drop');
    expect(decideBlancJobs({ studyOsAlive: true, studyOsJobsReady: true, installed: false })).toBe('keep');
  });
});

function fakeApi(initial: { alive: boolean; ready: boolean }) {
  let aliveCb: ((alive: boolean) => void) | null = null;
  let readyCb: ((ready: boolean) => void) | null = null;
  return {
    api: {
      blancStudyOsAlive: () => Promise.resolve(initial.alive),
      onStudyOsAlive: (cb: (alive: boolean) => void) => {
        aliveCb = cb;
        return () => {
          aliveCb = null;
        };
      },
      blancStudyOsJobsReadyState: () => Promise.resolve(initial.ready),
      onStudyOsJobsReady: (cb: (ready: boolean) => void) => {
        readyCb = cb;
        return () => {
          readyCb = null;
        };
      },
    },
    alive: (v: boolean) => aliveCb?.(v),
    ready: (v: boolean) => readyCb?.(v),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('installBlancBackgroundJobs handover', () => {
  it('does not drop its jobs when Study OS merely becomes alive; drops on the ack', async () => {
    const off = vi.fn();
    const install = vi.fn(() => Promise.resolve(off));
    const fake = fakeApi({ alive: false, ready: false });
    const dispose = installBlancBackgroundJobs(fake.api, install);
    await flush();
    expect(install).toHaveBeenCalledTimes(1);

    fake.alive(true);
    await flush();
    expect(off).not.toHaveBeenCalled();

    fake.ready(true);
    expect(off).toHaveBeenCalledTimes(1);

    // Study OS closes: the ack resets and Blanc takes over again.
    fake.ready(false);
    fake.alive(false);
    await flush();
    expect(install).toHaveBeenCalledTimes(2);
    dispose();
  });

  it('discards an install that finished after the ack arrived', async () => {
    const off = vi.fn();
    let finish!: (u: () => void) => void;
    const install = vi.fn(() => new Promise<() => void>((resolve) => {
      finish = resolve;
    }));
    const fake = fakeApi({ alive: false, ready: false });
    const dispose = installBlancBackgroundJobs(fake.api, install);
    await flush();
    fake.alive(true);
    fake.ready(true);
    finish(off);
    await flush();
    expect(off).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('does not install while Study OS is alive but still loading', async () => {
    const install = vi.fn(() => Promise.resolve(() => undefined));
    const fake = fakeApi({ alive: true, ready: false });
    const dispose = installBlancBackgroundJobs(fake.api, install);
    await flush();
    expect(install).not.toHaveBeenCalled();
    dispose();
  });

  it('falls back to the alive signal when main has no ack channel', async () => {
    const off = vi.fn();
    const install = vi.fn(() => Promise.resolve(off));
    let aliveCb: ((a: boolean) => void) | null = null;
    const dispose = installBlancBackgroundJobs(
      {
        blancStudyOsAlive: () => Promise.resolve(false),
        onStudyOsAlive: (cb) => {
          aliveCb = cb;
          return () => undefined;
        },
      },
      install,
    );
    await flush();
    expect(install).toHaveBeenCalledTimes(1);
    (aliveCb as ((a: boolean) => void) | null)?.(true);
    expect(off).toHaveBeenCalledTimes(1);
    dispose();
  });
});

describe('announceStudyOsJobsReady', () => {
  afterEach(() => __resetStudyOsJobsForTests());

  it('acks main only once bridges and mining are both installed', async () => {
    const ack = vi.fn(() => Promise.resolve(true));
    void announceStudyOsJobsReady({ blancStudyOsJobsReady: ack });
    await flush();
    expect(ack).not.toHaveBeenCalled();
    noteStudyOsJobInstalled('bridges');
    await flush();
    expect(ack).not.toHaveBeenCalled();
    noteStudyOsJobInstalled('mining');
    await flush();
    expect(ack).toHaveBeenCalledTimes(1);
  });

  it('survives a StrictMode-style install/uninstall/reinstall', async () => {
    const ack = vi.fn(() => Promise.resolve(true));
    const unBridges = noteStudyOsJobInstalled('bridges');
    unBridges();
    unBridges();
    noteStudyOsJobInstalled('bridges');
    noteStudyOsJobInstalled('mining');
    await announceStudyOsJobsReady({ blancStudyOsJobsReady: ack });
    expect(ack).toHaveBeenCalledTimes(1);
  });
});
