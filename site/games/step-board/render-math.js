// 數學記號渲染（純函式，瀏覽器與 node 測試都可用）
// 支援的寫法（題目、卡片、回饋、提示都可以用）：
//   [frac:分子|分母]  → 分數上下排列，例：[frac:3|4]、−[frac:x+1|2]
//   x^2、x^{10}        → 上標（平方、次方）
//   [seg:AB]           → 線段上橫線 AB
//   ASCII 減號 -        → 一律換成數學減號 −（所以 renderMath 只用在數學文字上）
// 三角形 △、角 ∠ 直接寫字元即可，例：△ABC、∠ABC（頂點順序依題意）。

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const TOKEN = /\[(frac|seg):([^\]]*)\]/g;
const SUP = /\^(?:\{([^}]*)\}|(−?\d+|[a-zA-Z]))/g;

// 一般文字：跳脫 HTML、上標、減號
function inline(s) {
  return escapeHtml(s)
    .replace(/-/g, '−')
    .replace(SUP, (_, braced, simple) => `<sup>${braced ?? simple}</sup>`);
}

// 回傳 HTML 字串
export function renderMath(text) {
  const s = String(text ?? '');
  let out = '';
  let last = 0;
  for (const m of s.matchAll(TOKEN)) {
    out += inline(s.slice(last, m.index));
    if (m[1] === 'frac') {
      const [num, den = ''] = m[2].split('|');
      out += `<span class="frac"><span>${inline(num)}</span><span>${inline(den)}</span></span>`;
    } else {
      out += `<span class="overline">${inline(m[2])}</span>`;
    }
    last = m.index + m[0].length;
  }
  return out + inline(s.slice(last));
}

// 純文字（CSV、老師報表、無障礙標籤用）：分數寫成 a/b、上標用 ²³
const SUP_CHARS = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '−': '⁻', '-': '⁻' };
export function plainMath(text) {
  return String(text ?? '')
    .replace(TOKEN, (_, type, body) => {
      if (type === 'seg') return `線段${body}`;
      const [num, den = ''] = body.split('|');
      const wrap = (t) => (/[+\-−\s]/.test(t.trim().replace(/^[−-]/, '')) ? `(${t})` : t);
      return `${wrap(num)}/${wrap(den)}`;
    })
    .replace(SUP, (_, braced, simple) => [...String(braced ?? simple)].map((c) => SUP_CHARS[c] ?? c).join(''));
}
