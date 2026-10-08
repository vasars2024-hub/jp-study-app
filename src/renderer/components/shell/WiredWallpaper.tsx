/**
 * WIRED wallpaper: the city's wiring seen from below.
 *
 * Utility poles and sagging power lines in silhouette against the cold
 * gradient, a faint watermark of the operator's current layer (layer descent,
 * `wiredMechanics/layer.ts`), and a single signal pulse that walks
 * the wires. All of it is one static inline SVG plus CSS; the only motion is
 * the pulse (stroke-dashoffset on one short path, stepped at ~4 fps) and it is
 * gated by the idle / motion settings and OS reduced motion in wired-navi.css.
 *
 * Original artwork drawn for this app. Text nodes are content-neutral fiction
 * codes (node ids, layer number), so they stay literal.
 */
import { memo, useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { formatLayer } from '../../wiredMechanics/layer';
import { useWiredLayer } from '../../wiredMechanics/layerStore';
import { useWiredMemory } from '../../wiredMechanics/memoryFeed';
import { loadWiredMechanicsSettings, onWiredMechanicsSettingsChanged } from '../../wiredMechanics/settings';

/**
 * Translated strings that the Wired CSS draws with `content:` (the SYSTEM
 * PROMPT strip on dialogs, the UNMOUNTING line on a closing window). CSS cannot
 * call t(), but `content: var(--x)` can print a custom property that holds a
 * string token — so the catalog text is published on <html> here, re-published
 * on a language switch, and removed when the Wired shell unmounts.
 */
const CSS_STRINGS: Array<[prop: string, key: string]> = [
  ['--wn-kicker-prompt', 'wired.prompt.kicker'],
  ['--wn-unmounting', 'wired.window.unmounting'],
];

function cssString(text: string): string {
  return `"${text.replace(/["\\]/g, '\\$&').replace(/\n/g, ' ')}"`;
}

function useWiredCssStrings(): void {
  const { t, lang } = useT();
  useEffect(() => {
    const root = document.documentElement;
    for (const [prop, key] of CSS_STRINGS) root.style.setProperty(prop, cssString(t(key)));
    return () => {
      for (const [prop] of CSS_STRINGS) root.style.removeProperty(prop);
    };
    // `lang`, not `t`: t's identity is stable across a language switch.
  }, [lang, t]);
}

/** Wire spans: [x1, y1, x2, y2, sag]. Quadratic sag, control point at the midpoint. */
const SPANS: Array<[number, number, number, number, number]> = [
  // off-screen left → pole A
  [-40, 268, 152, 246, 34],
  [-40, 300, 152, 282, 30],
  [-40, 330, 168, 246, 46],
  // pole A → pole C (far, small)
  [152, 246, 800, 452, 120],
  [212, 246, 820, 452, 132],
  [168, 282, 806, 470, 104],
  [196, 282, 816, 470, 112],
  // pole C → pole B
  [800, 452, 1338, 296, 118],
  [820, 452, 1418, 296, 126],
  [806, 470, 1352, 334, 98],
  [816, 470, 1402, 334, 104],
  // pole B → off-screen right
  [1418, 296, 1660, 256, 40],
  [1402, 334, 1660, 300, 36],
  [1338, 296, 1660, 330, 62],
];

function span([x1, y1, x2, y2, sag]: [number, number, number, number, number]): string {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2 + sag;
  return `M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`;
}

/** The pulse rides one continuous line: left edge → A → C → B → right edge. */
const PULSE_PATH = `${span(SPANS[0])} ${span(SPANS[3]).replace(/^M[^Q]+/, '')} ${span(SPANS[7]).replace(/^M[^Q]+/, '')}`;

function Pole({ x, top, scale }: { x: number; top: number; scale: number }) {
  const w = 12 * scale;
  const arm = 78 * scale;
  return (
    <g className="wired-wall-pole">
      <rect x={x - w / 2} y={top} width={w} height={900 - top} />
      <rect x={x - arm / 2} y={top + 34 * scale} width={arm} height={5 * scale} />
      <rect x={x - (arm * 0.72) / 2} y={top + 70 * scale} width={arm * 0.72} height={4 * scale} />
      {/* insulators */}
      {[-0.46, -0.16, 0.16, 0.46].map((f) => (
        <rect key={f} x={x + arm * f - 2 * scale} y={top + 26 * scale} width={4 * scale} height={9 * scale} />
      ))}
      {/* pole-top transformer can */}
      <rect x={x + w / 2} y={top + 96 * scale} width={20 * scale} height={30 * scale} />
      <rect x={x + w / 2 + 2 * scale} y={top + 92 * scale} width={16 * scale} height={4 * scale} />
      {/* step bolts */}
      {Array.from({ length: 6 }, (_, i) => (
        <rect key={i} x={x - w / 2 - 5 * scale} y={top + (150 + i * 46) * scale} width={5 * scale} height={2 * scale} />
      ))}
    </g>
  );
}

/** The column's resting text when there is nothing due (or memory is off). */
const FIXED_KANJI = '語 彙 文 法 記 憶 読 解 聴 解';

/**
 * "The Wired remembers": with the mechanic on, the kanji column carries the
 * kanji of the cards due now and the node lines print the operator's real last
 * query / last capture / due count. Updates arrive from `memoryFeed` on lookup,
 * deck and review events — the wallpaper never polls.
 */
function useWallMemory() {
  const [mech, setMech] = useState(loadWiredMechanicsSettings);
  useEffect(() => onWiredMechanicsSettingsChanged(setMech), []);
  const memory = useWiredMemory(mech.wiredRemembers);
  const { layer } = useWiredLayer();
  return { memory, layer: mech.layerDescent ? layer : 9 };
}

function WiredWallpaper() {
  useWiredCssStrings();
  const { t } = useT();
  const { memory, layer } = useWallMemory();
  const kanji = memory && memory.dueKanji.length ? memory.dueKanji.join(' ') : FIXED_KANJI;
  return (
    <div className="wired-wall-atmosphere" aria-hidden="true">
      <svg
        className="wired-wall-lines"
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        <text className="wired-wall-watermark" x="1560" y="836" textAnchor="end">
          {formatLayer(layer)}
        </text>
        <g className="wired-wall-wires">
          {SPANS.map((s, i) => (
            <path key={i} d={span(s)} />
          ))}
        </g>
        <path className="wired-wall-pulse" d={PULSE_PATH} pathLength={1000} />
        <Pole x={800} top={440} scale={0.42} />
        <Pole x={180} top={230} scale={1} />
        <Pole x={1378} top={282} scale={0.86} />
      </svg>
      <span className={`wired-wall-kana${memory && memory.dueKanji.length ? ' is-live' : ''}`} lang="ja">
        {kanji}
      </span>
      {memory ? (
        <>
          <span className="wired-wall-node node-a">
            {t('wiredMech.mem.lastQuery')} <b lang="ja">{memory.lastQuery ?? '----'}</b>
          </span>
          <span className="wired-wall-node node-b">
            {t('wiredMech.mem.lastCapture')} <b lang="ja">{memory.lastMined ?? '----'}</b>
          </span>
          <span className={`wired-wall-node node-c${memory.dueCount > 0 ? ' is-due' : ''}`}>
            {t('wiredMech.mem.due', { count: memory.dueCount })}
          </span>
        </>
      ) : (
        <>
          <span className="wired-wall-node node-a">NODE: STUDY-LOCAL</span>
          <span className="wired-wall-node node-b">ARCHIVE / LINGUA</span>
          <span className="wired-wall-node node-c">LINK STATUS: LISTENING</span>
        </>
      )}
    </div>
  );
}

export default memo(WiredWallpaper);
