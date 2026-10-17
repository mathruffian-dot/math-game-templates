// T7 盤面連線消除：事件分析（純函式，老師端與測試共用）
// 分群一律用穩定代碼 kind，不用帶文字的 reason。

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const tsOf = (e) => e.payload?.t || Date.parse(e.created_at || '') || 0;

export function summarize(events, now = Date.now()) {
  const players = new Map();
  const kinds = new Map();
  const combos = new Map();
  let shuffles = 0;
  const P = (name) => {
    if (!players.has(name)) {
      players.set(name, { player: name, content: '', score: 0, ok: 0, fails: 0, notCounted: 0, hints: 0, maxCombo: 0, games: 0, lastT: 0, kinds: new Map(), lastKind: '' });
    }
    return players.get(name);
  };
  const sorted = [...events].sort((a, b) => tsOf(a) - tsOf(b));
  for (const e of sorted) {
    const pl = e.payload || {};
    const p = P(e.player);
    if (pl.content) p.content = pl.content;
    p.lastT = Math.max(p.lastT, tsOf(e));
    if (e.kind === 'chain_ok') {
      p.ok++;
      if (typeof pl.score === 'number') p.score = pl.score;
      p.maxCombo = Math.max(p.maxCombo, num(pl.combo));
    } else if (e.kind === 'chain_fail') {
      if (typeof pl.score === 'number') p.score = pl.score;
      if (pl.counted === false) { p.notCounted++; continue; }
      p.fails++;
      const k = pl.kind || 'other';
      p.kinds.set(k, (p.kinds.get(k) || 0) + 1);
      p.lastKind = k;
      const kk = `${pl.content || ''}|${k}`;
      kinds.set(kk, (kinds.get(kk) || 0) + 1);
      const text = (pl.tiles || []).join(' ');
      const ck = `${pl.content || ''}|${k}|${text}`;
      combos.set(ck, (combos.get(ck) || 0) + 1);
    } else if (e.kind === 'hint') {
      p.hints++;
    } else if (e.kind === 'shuffle') {
      shuffles++;
    } else if (e.kind === 'game_end') {
      p.games++;
      if (typeof pl.score === 'number') p.score = pl.score;
      p.maxCombo = Math.max(p.maxCombo, num(pl.maxCombo));
    }
  }
  const list = [...players.values()].map((p) => {
    const top = [...p.kinds.entries()].sort((a, b) => b[1] - a[1])[0];
    const tries = p.ok + p.fails;
    return {
      player: p.player, content: p.content, score: p.score, ok: p.ok, fails: p.fails, notCounted: p.notCounted,
      tries, accuracy: tries ? p.ok / tries : null, hints: p.hints, maxCombo: p.maxCombo, games: p.games,
      topKind: top ? top[0] : '', topKindCount: top ? top[1] : 0, lastKind: p.lastKind,
      idleSec: p.lastT ? Math.max(0, Math.round((now - p.lastT) / 1000)) : null,
    };
  }).sort((a, b) => b.score - a.score || a.player.localeCompare(b.player));
  const kindList = [...kinds.entries()].map(([k, count]) => { const [content, kind] = k.split('|'); return { content, kind, count }; })
    .sort((a, b) => b.count - a.count);
  const comboList = [...combos.entries()].map(([k, count]) => { const [content, kind, text] = k.split('|'); return { content, kind, text, count }; })
    .sort((a, b) => b.count - a.count);
  return { players: list, kinds: kindList, combos: comboList, shuffles };
}

// 逐筆事件 CSV 列
export function eventRows(events) {
  return [...events].sort((a, b) => tsOf(a) - tsOf(b)).map((e) => {
    const p = e.payload || {};
    return {
      時間: new Date(tsOf(e)).toLocaleString('zh-TW', { hour12: false }),
      房號: e.room || '', 學生: e.player, 事件: e.kind, 內容包: p.content || '',
      方塊: Array.isArray(p.tiles) ? p.tiles.join(' ') : '', 鏈長: p.len ?? '',
      成立: e.kind === 'chain_ok' ? '是' : e.kind === 'chain_fail' ? '否' : '',
      誤解代碼: p.kind || '', 計入: p.counted === false ? '否' : e.kind === 'chain_fail' ? '是' : '',
      得分: p.points ?? '', 連擊: p.combo ?? '', 目前分數: p.score ?? '', 秒數: p.ms != null ? (p.ms / 1000).toFixed(1) : '',
      提示層級: p.level ?? '', 說明: p.summary || '',
    };
  });
}
