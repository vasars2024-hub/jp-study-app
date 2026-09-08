/**
 * The props for one button in a segmented control.
 *
 * D333, measured live 2026-09-08: 55 `className={seg(active)}` call sites over
 * 14 files, plus 13 inline copies of the same ternary, marked the chosen option
 * with the `primary` class and **nothing else** — no `aria-pressed`, no
 * `aria-selected`, no `role`. Read with a screen reader, `Automatic` and
 * `Manual` announced identically, as did every icon size, density, font and
 * colour row in Settings.
 *
 * It returns PROPS rather than a class name on purpose: the previous helper
 * could only ever hand back a string, which is exactly why the state had
 * nowhere to travel. Spread it — `<button type="button" {...seg(active)}>` —
 * and the state cannot be applied without the class or the class without the
 * state.
 *
 * `aria-pressed` rather than `aria-checked`: these are ordinary toggle buttons,
 * some of them genuinely multi-select (the kana script and group rows), and the
 * repo already settled on `aria-pressed` for that idiom in D6. A single-select
 * row is still described correctly by it — one button pressed, the rest not.
 */
export interface SegButtonProps {
  className: string;
  'aria-pressed': boolean;
}

export function segButton(active: boolean): SegButtonProps {
  return {
    className: active ? 'btn small primary' : 'btn small',
    'aria-pressed': active,
  };
}
