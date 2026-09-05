import { describe, expect, it } from 'vitest';
import {
  EMPTY_WITNESS,
  INPUT_WITNESS_SOURCE,
  cdpKeyEvents,
  cdpModifierMask,
  cdpMouseEvents,
  normaliseWitness,
  summariseDelivery,
} from '../debugBridgeInput';

describe('summariseDelivery — the honesty gate', () => {
  it('reports NOT ok when the renderer observed nothing, however much was sent', () => {
    // The exact shape measured on 2026-09-05: three chars sent, zero events seen.
    const receipt = summariseDelivery(
      { keydown: 0, mousedown: 0, textInput: '' },
      { keydown: 0, mousedown: 0, textInput: '' },
      'key',
      3,
      'sendInputEvent',
    );
    expect(receipt.ok).toBe(false);
    expect(receipt.sent).toBe(3);
    expect(receipt.delivered).toBe(0);
    expect(receipt.error).toMatch(/renderer observed none/);
  });

  it('reports ok only from the channel that was driven, never from `sent`', () => {
    // Mouse arrived, keys did not: a key receipt must still be false.
    const before = { keydown: 0, mousedown: 0, textInput: '' };
    const after = { keydown: 0, mousedown: 4, textInput: '' };
    expect(summariseDelivery(before, after, 'key', 3, 'cdp').ok).toBe(false);
    expect(summariseDelivery(before, after, 'mouse', 1, 'cdp').ok).toBe(true);
  });

  it('counts delivery and insertion separately — a key can arrive with nothing focused', () => {
    const receipt = summariseDelivery(
      { keydown: 10, mousedown: 0, textInput: 'xx' },
      { keydown: 13, mousedown: 0, textInput: 'xx' },
      'key',
      3,
      'cdp',
    );
    expect(receipt.ok).toBe(true);
    expect(receipt.delivered).toBe(3);
    expect(receipt.inserted).toBe(0);
    expect(receipt.error).toBeUndefined();
  });

  it('credits inserted characters when an editable target had focus', () => {
    const receipt = summariseDelivery(
      { keydown: 0, mousedown: 0, textInput: '' },
      { keydown: 3, mousedown: 0, textInput: 'red' },
      'key',
      3,
      'cdp',
    );
    expect(receipt.delivered).toBe(3);
    expect(receipt.inserted).toBe(3);
  });

  it('never reports a negative count when the page renavigated and reset the witness', () => {
    const receipt = summariseDelivery(
      { keydown: 40, mousedown: 0, textInput: 'abcd' },
      { keydown: 0, mousedown: 0, textInput: '' },
      'key',
      3,
      'cdp',
    );
    expect(receipt.ok).toBe(false);
    expect(receipt.delivered).toBe(0);
    expect(receipt.inserted).toBe(0);
  });

  it('names the transport, so a fallback run is not mistaken for a CDP one', () => {
    const before = { keydown: 0, mousedown: 0, textInput: '' };
    const after = { keydown: 1, mousedown: 0, textInput: '' };
    expect(summariseDelivery(before, after, 'key', 1, 'cdp').transport).toBe('cdp');
    expect(summariseDelivery(before, after, 'key', 1, 'sendInputEvent').transport).toBe(
      'sendInputEvent',
    );
  });
});

describe('normaliseWitness', () => {
  it('degrades a missing or half-shaped reading to zeros rather than throwing', () => {
    expect(normaliseWitness(undefined)).toEqual(EMPTY_WITNESS);
    expect(normaliseWitness(null)).toEqual(EMPTY_WITNESS);
    expect(normaliseWitness({ keydown: 'nope', textInput: 5 })).toEqual(EMPTY_WITNESS);
    expect(normaliseWitness({ keydown: 2, mousedown: 1, textInput: 'a' })).toEqual({
      keydown: 2,
      mousedown: 1,
      textInput: 'a',
    });
  });

  it('zeros make the receipt say NOT delivered — the safe direction', () => {
    const w = normaliseWitness(undefined);
    expect(summariseDelivery(w, w, 'key', 5, 'cdp').ok).toBe(false);
  });
});

describe('INPUT_WITNESS_SOURCE', () => {
  it('is idempotent and samples all three channels', () => {
    expect(INPUT_WITNESS_SOURCE).toContain('if (!w.__jpBridgeInput)');
    for (const channel of ['keydown', 'mousedown', 'beforeinput']) {
      expect(INPUT_WITNESS_SOURCE).toContain(channel);
    }
  });

  it('listens in the capture phase, so a handler calling stopPropagation cannot hide delivery', () => {
    expect(INPUT_WITNESS_SOURCE.match(/, true\)/g)?.length).toBe(3);
  });
});

describe('cdpModifierMask', () => {
  it('maps the names the bridge accepts to the protocol bits', () => {
    expect(cdpModifierMask([])).toBe(0);
    expect(cdpModifierMask(['alt'])).toBe(1);
    expect(cdpModifierMask(['control'])).toBe(2);
    expect(cdpModifierMask(['meta'])).toBe(4);
    expect(cdpModifierMask(['shift'])).toBe(8);
    expect(cdpModifierMask(['Control', 'Shift'])).toBe(10);
  });

  it('ignores an unknown name instead of failing the whole press', () => {
    expect(cdpModifierMask(['hyper', 'shift'])).toBe(8);
  });
});

describe('cdpKeyEvents', () => {
  it('gives a printable character the `text` that makes it insert', () => {
    const [down, up] = cdpKeyEvents('r');
    expect(down.type).toBe('keyDown');
    expect(down.text).toBe('r');
    expect(down.code).toBe('KeyR');
    expect(down.windowsVirtualKeyCode).toBe(82);
    expect(up.type).toBe('keyUp');
    expect(up.text).toBeUndefined();
  });

  it('withholds `text` from a named key, so Enter is not typed as the word', () => {
    const [down] = cdpKeyEvents('Tab');
    expect(down.key).toBe('Tab');
    expect(down.windowsVirtualKeyCode).toBe(9);
    expect(down.text).toBeUndefined();
  });

  it('sends Enter as a carriage return, which is what a text field expects', () => {
    const [down] = cdpKeyEvents('Enter');
    expect(down.text).toBe('\r');
  });

  it('suppresses `text` under Ctrl — Ctrl+A must select, not type "a"', () => {
    const [down] = cdpKeyEvents('a', ['control']);
    expect(down.modifiers).toBe(2);
    expect(down.text).toBeUndefined();
  });

  it('keeps `text` under Shift alone, which is an ordinary capital', () => {
    const [down] = cdpKeyEvents('A', ['shift']);
    expect(down.modifiers).toBe(8);
    expect(down.text).toBe('A');
  });

  it('accepts an unmapped name with a best-effort descriptor rather than refusing', () => {
    const [down] = cdpKeyEvents('F13');
    expect(down.key).toBe('F13');
    expect(down.text).toBeUndefined();
    expect(down.type).toBe('keyDown');
  });

  it('handles a digit and a non-alphanumeric character', () => {
    expect(cdpKeyEvents('7')[0].code).toBe('Digit7');
    expect(cdpKeyEvents('-')[0].code).toBe('');
    expect(cdpKeyEvents('-')[0].text).toBe('-');
  });

  it('handles a multi-byte Japanese character as printable', () => {
    const [down] = cdpKeyEvents('あ');
    expect(down.text).toBe('あ');
  });
});

describe('cdpMouseEvents', () => {
  it('holds the button mask down on press and clears it on release', () => {
    const [down, up] = cdpMouseEvents(120, 340, 'left', 1);
    expect(down).toMatchObject({ type: 'mousePressed', x: 120, y: 340, buttons: 1, clickCount: 1 });
    expect(up).toMatchObject({ type: 'mouseReleased', buttons: 0 });
  });

  it('uses the right mask per button', () => {
    expect(cdpMouseEvents(0, 0, 'right', 1)[0].buttons).toBe(2);
    expect(cdpMouseEvents(0, 0, 'middle', 1)[0].buttons).toBe(4);
  });

  it('carries clickCount and modifiers through to both events', () => {
    const events = cdpMouseEvents(5, 6, 'left', 2, ['shift']);
    for (const event of events) {
      expect(event.clickCount).toBe(2);
      expect(event.modifiers).toBe(8);
    }
  });
});
