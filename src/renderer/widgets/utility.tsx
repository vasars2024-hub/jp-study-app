import { useState } from 'react';

// ---------- Calculator ----------
// A small, safe calculator: buttons build an expression evaluated with a tiny
// shunting-yard parser (no eval, no globals).
const KEYS = ['C', '(', ')', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '=', ''];

function evaluate(expr: string): string {
  const tokens = expr.match(/\d+\.?\d*|[+\-*/()]/g);
  if (!tokens) return '';
  const out: (number | string)[] = [];
  const ops: string[] = [];
  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };
  const apply = () => {
    const op = ops.pop();
    const b = out.pop();
    const a = out.pop();
    if (op === undefined || typeof a !== 'number' || typeof b !== 'number') throw new Error('bad');
    out.push(op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b);
  };
  for (const tk of tokens) {
    if (/^\d/.test(tk)) out.push(parseFloat(tk));
    else if (tk === '(') ops.push(tk);
    else if (tk === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') apply();
      ops.pop();
    } else {
      while (ops.length && prec[ops[ops.length - 1]] >= prec[tk]) apply();
      ops.push(tk);
    }
  }
  while (ops.length) apply();
  const r = out[0];
  if (typeof r !== 'number' || !Number.isFinite(r)) throw new Error('bad');
  return String(Math.round(r * 1e10) / 1e10);
}

export function Calculator() {
  const [expr, setExpr] = useState('');
  const [showResult, setShowResult] = useState(false);
  const press = (k: string) => {
    if (k === '') return;
    // Engineering Pad key clack (§6/§8) — no-op outside the wired pack.
    if (document.documentElement.getAttribute('data-materials') === 'wired') {
      window.dispatchEvent(new CustomEvent('wired:switch-clack'));
    }
    if (k === 'C') {
      setExpr('');
      setShowResult(false);
      return;
    }
    if (k === '=') {
      try {
        setExpr(evaluate(expr));
      } catch {
        setExpr('Error');
      }
      setShowResult(true);
      return;
    }
    setExpr((e) => (showResult && /[0-9.]/.test(k) ? k : (showResult && e === 'Error' ? '' : e) + k));
    setShowResult(false);
  };
  return (
    <div className="wgt wgt-calc">
      <div className="wgt-calc-display">{expr || '0'}</div>
      <div className="wgt-calc-keys">
        {KEYS.filter((k) => k !== '').map((k) => (
          <button
            key={k}
            className={`wgt-calc-key ${k === '=' ? 'eq' : ''} ${'+-*/'.includes(k) ? 'op' : ''}`}
            onClick={() => press(k)}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
