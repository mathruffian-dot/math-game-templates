// 內容檔共用的數字與式子格式（輸出 render-math 記號：[frac:a|b]、x^2，減號一律用 −）

export const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };

// 有理數（分母恆正、已約分）
export function rat(n, d = 1) {
  if (d === 0) throw new Error('分母不可為 0');
  const s = d < 0 ? -1 : 1;
  const g = gcd(n, d);
  return { n: (s * n) / g, d: (s * d) / g };
}
export const ratEq = (a, b) => a.n === b.n && a.d === b.d;

// 整數：負號用 −
export const num = (n) => (n < 0 ? `−${-n}` : String(n));
// 帶正負號的整數：+5、−5
export const sgn = (n) => (n < 0 ? `−${-n}` : `+${n}`);
// 運算式中的「＋ 5」「− 5」（前後有空白）
export const op = (n) => (n < 0 ? `− ${-n}` : `+ ${n}`);

// 負數加括號：(−6)；正數不加
export const paren = (n) => (n < 0 ? `(−${-n})` : String(n));
// 運算式中的單項式「＋ 4x」「− 4x」
export const opTerm = (c, p) => `${c < 0 ? '−' : '+'} ${term(Math.abs(c), p)}`;

// 有理數文字：整數直接寫；分數用 [frac]，負號放在分數前
export function ratText(r) {
  if (r.d === 1) return num(r.n);
  return `${r.n < 0 ? '−' : ''}[frac:${Math.abs(r.n)}|${r.d}]`;
}

// 單項式 c·x^p；signed=true 時正數也寫 +
export function term(c, p, { signed = false } = {}) {
  const sign = c < 0 ? '−' : signed ? '+' : '';
  const a = Math.abs(c);
  const coef = p > 0 && a === 1 ? '' : String(a);
  const v = p === 0 ? '' : p === 1 ? 'x' : `x^${p}`;
  return sign + coef + v;
}

// 多項式（係數由高次到低次），例：[1, 0, -9] → x^2 − 9
export function polyText(coefs) {
  const deg = coefs.length - 1;
  const parts = [];
  coefs.forEach((c, i) => {
    if (c === 0) return;
    const p = deg - i;
    const t = term(Math.abs(c), p);
    if (!parts.length) parts.push((c < 0 ? '−' : '') + t);
    else parts.push(`${c < 0 ? '−' : '+'} ${t}`);
  });
  return parts.length ? parts.join(' ') : '0';
}

// 一次式 ax + b 的文字，例：3x + 5、−x − 7
export const linText = (a, b) => `${term(a, 1)} ${op(b)}`;

export const nonzero = (rng, lo, hi) => {
  for (;;) {
    const v = lo + Math.floor(rng() * (hi - lo + 1));
    if (v !== 0) return v;
  }
};
