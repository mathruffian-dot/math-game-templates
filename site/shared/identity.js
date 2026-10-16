// 學生身分：班級-座號（班級版）或暱稱（試玩版）。不收真實姓名。
export const CLASS_ID = /^(\d{3})-(\d{1,2})$/;

export function normalizeClassId(raw) {
  const m = String(raw || '').trim().replace(/[－—–_\s]/g, '-').match(CLASS_ID);
  return m ? `${m[1]}-${String(Number(m[2])).padStart(2, '0')}` : null;
}

export function normalizeNickname(raw) {
  const s = String(raw || '').trim().replace(/\s+/g, ' ');
  return s.length >= 1 && s.length <= 12 ? s : null;
}

// mode: 'class' | 'demo'
export function parsePlayer(raw, mode = 'class') {
  return mode === 'class' ? normalizeClassId(raw) : normalizeNickname(raw);
}

export function remember(game, key, value) {
  try { localStorage.setItem(`mg:${game}:${key}`, JSON.stringify(value)); } catch {}
}
export function recall(game, key) {
  try { return JSON.parse(localStorage.getItem(`mg:${game}:${key}`)); } catch { return null; }
}
export function forget(game, key) {
  try { localStorage.removeItem(`mg:${game}:${key}`); } catch {}
}

export function queryParam(name) {
  return new URLSearchParams(location.search).get(name);
}
