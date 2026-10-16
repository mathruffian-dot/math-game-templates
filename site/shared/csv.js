// CSV 匯出（Excel 開啟不亂碼：加 BOM）
export function toCsv(rows, columns) {
  const cols = columns || [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
}

export function download(filename, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([type.startsWith('text/csv') ? '\ufeff' + text : text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// 誤解統計：依 kind 分群（不要用帶數字的 reason 分群，會碎成單例）
export function countBy(rows, key) {
  const m = new Map();
  for (const r of rows) { const k = typeof key === 'function' ? key(r) : r[key]; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
