// 題庫文字的簡易數學記號（純函式，瀏覽器與 node 測試共用）
//   [frac:a|b]  上下排列的分數 a/b（不支援分數裡再放分數）
//   x^2、x^{n+1} 上標（^ 後接一串數字、單一字母，或用大括號包住）
//   [seg:AB]    線段，上橫線
//   △ ∠ ≅ ∼ 等符號請直接打字元
// renderMath 會先跳脫 HTML，題庫或學生輸入的文字都不會被當成程式碼執行。

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const SUP = /\^(?:\{([^}]*)\}|(-?\d+|[a-zA-Z]))/g;
const FRAC = /\[frac:([^\]|]*)\|([^\]]*)\]/g;
const SEG = /\[seg:([^\]]+)\]/g;

const sup = (s) => s.replace(SUP, (_, braced, simple) => `<sup>${braced ?? simple}</sup>`);

// 轉成 HTML 字串（可直接放進 innerHTML）
export function renderMath(text) {
  let s = escapeHtml(text);
  s = s.replace(SEG, '<span class="overline">$1</span>');
  s = s.replace(FRAC, (_, a, b) => `<span class="frac"><span>${sup(a)}</span><span>${sup(b)}</span></span>`);
  return sup(s);
}

// 轉成純文字（CSV、留痕、報告用）：[frac:3|4] → 3/4、x^{n+1} → x^(n+1)、[seg:AB] → AB
export function plainMath(text) {
  const wrap = (t) => (/^[-+]?[\w.]+$/.test(t.trim()) ? t.trim() : `(${t.trim()})`);
  return String(text ?? '')
    .replace(SEG, '$1')
    .replace(FRAC, (_, a, b) => `${wrap(a)}/${wrap(b)}`)
    .replace(SUP, (_, braced, simple) => (braced != null ? `^(${braced})` : `^${simple}`));
}
