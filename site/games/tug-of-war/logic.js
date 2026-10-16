// 拔河對戰：純邏輯（不碰 DOM、不連網路），瀏覽器與 node 測試共用。
// 房間狀態的所有改動都寫成「輸入舊 state → 回傳新 state」，放進 backend.transact 使用；
// 回傳 undefined 代表「不需要寫入」（例如比賽已結束）。
import { plainMath } from './render-math.js';

export const GAME = 'tug-of-war';
export const ROPE_LIMIT = 100;        // |rope| ≥ 100 立即獲勝
export const COOLDOWN_MS = 3000;      // 答錯冷卻
export const PULL_BASE = 12;          // 拉力基準：weight × 12 ÷ max(3, 隊伍人數)
export const RETRY_FACTOR = 0.5;      // 看過診斷後再試一次答對，拉力減半
export const MAX_PLAYERS = 50;
export const DEFAULT_DURATION_SEC = 300;
export const KIND_RE = /^[a-z][a-z0-9_]*$/;

const clone = (v) => JSON.parse(JSON.stringify(v));
const round1 = (x) => Math.round(x * 10) / 10;

// ---------- 答案正規化 ----------
// 全形英數符號 → 半形；各種減號 → '-'
export function toHalfWidth(s) {
  return String(s ?? '')
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ')
    .replace(/[−–—﹣]/g, '-');
}

// 支援：整數、小數（.5）、分數（-3/4、3/-4）、帶分數（1 1/2）、全形數字。看不懂回傳 null。
export function parseNumber(raw) {
  let s = toHalfWidth(raw).trim().replace(/\s+/g, ' ');
  if (!s) return null;
  const NUM = '(\\d+(?:\\.\\d+)?|\\.\\d+)';
  let m = s.match(/^([+-]?)(\d+) (\d+)\/(\d+)$/);
  if (m) {
    const d = Number(m[4]);
    if (!d) return null;
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) + Number(m[3]) / d);
  }
  s = s.replace(/\s/g, '');
  m = s.match(new RegExp(`^([+-]?)${NUM}/([+-]?)${NUM}$`));
  if (m) {
    const d = Number(m[4]);
    if (!d) return null;
    const sign = (m[1] === '-' ? -1 : 1) * (m[3] === '-' ? -1 : 1);
    return sign * (Number(m[2]) / d);
  }
  m = s.match(new RegExp(`^([+-]?)${NUM}$`));
  if (m) return (m[1] === '-' ? -1 : 1) * Number(m[2]);
  return null;
}

export function numbersEqual(a, b) {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

export function normalizeText(s) {
  return toHalfWidth(s).toLowerCase().replace(/\s+/g, '');
}

// ---------- 判題 ----------
// given：choice 為選項在 q.options 中的索引；input 為字串；order 為字串陣列
// 回傳 { counted, correct, misconception, feedback, givenText, firstWrong? }
// counted=false 表示「不算一次作答」（空白、格式看不懂、沒排完），不扣分也不冷卻，但仍會留痕。
export function checkAnswer(q, given) {
  if (q.type === 'choice') {
    const opt = q.options[given];
    if (!opt) return { counted: false, correct: false, misconception: 'empty', feedback: '請先選一個選項。', givenText: '' };
    return opt.correct
      ? { counted: true, correct: true, misconception: null, feedback: q.explain || '', givenText: plainMath(opt.text) }
      : { counted: true, correct: false, misconception: opt.misconception || 'unclassified', feedback: opt.feedback || q.feedback || '', givenText: plainMath(opt.text) };
  }
  if (q.type === 'input') {
    const raw = String(given ?? '').trim().slice(0, 40);
    if (!raw) return { counted: false, correct: false, misconception: 'empty', feedback: '請先輸入答案。', givenText: '' };
    const numeric = q.numeric !== false;
    let same;
    if (numeric) {
      const v = parseNumber(raw);
      if (v === null) return { counted: false, correct: false, misconception: 'format_invalid', feedback: '看不懂這個數字。可以輸入整數、小數或分數，例如 -3/4、0.75、1 1/2。', givenText: raw };
      same = (a) => numbersEqual(parseNumber(a), v);
    } else {
      const t = normalizeText(raw);
      same = (a) => normalizeText(a) === t;
    }
    if (q.answers.some(same)) return { counted: true, correct: true, misconception: null, feedback: q.explain || '', givenText: raw };
    const hit = (q.wrongAnswers || []).find((w) => same(w.answer));
    return { counted: true, correct: false, misconception: hit?.misconception || q.misconception || 'unclassified', feedback: hit?.feedback || q.feedback || '', givenText: raw };
  }
  if (q.type === 'order') {
    const arr = Array.isArray(given) ? given : [];
    const givenText = arr.map(plainMath).join(' → ');
    if (arr.length !== q.items.length) return { counted: false, correct: false, misconception: 'incomplete', feedback: '還有步驟沒排進去。', givenText };
    const firstWrong = arr.findIndex((x, i) => x !== q.items[i]);
    if (firstWrong === -1) return { counted: true, correct: true, misconception: null, feedback: q.explain || '', givenText, firstWrong };
    const hit = (q.wrongOrders || []).find((w) => w.order.length === arr.length && w.order.every((x, i) => x === arr[i]));
    return { counted: true, correct: false, misconception: hit?.misconception || q.misconception || 'order_wrong', feedback: hit?.feedback || q.feedback || '', givenText, firstWrong };
  }
  throw new Error('未知題型：' + q.type);
}

export function correctAnswerText(q) {
  if (q.type === 'choice') return plainMath(q.options.find((o) => o.correct)?.text);
  if (q.type === 'input') return plainMath(q.answers[0]);
  if (q.type === 'order') return q.items.map(plainMath).join(' → ');
  return '';
}

// ---------- 洗牌與出題 ----------
export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// deck = { order:[題號...], pos }。題目全部出完才重新洗牌，且新一輪第一題不會和上一題相同。
export function drawNext(deck, ids, rng = Math.random) {
  let d = deck && Array.isArray(deck.order) ? { order: deck.order.filter((x) => ids.includes(x)), pos: deck.pos | 0 } : null;
  // 題庫換過（題號集合不同）就重洗
  if (!d || d.order.length !== ids.length) d = { order: shuffle(ids, rng), pos: 0 };
  if (d.pos >= d.order.length) {
    const last = d.order[d.order.length - 1];
    let order = shuffle(ids, rng);
    if (order.length > 1 && order[0] === last) [order[0], order[1]] = [order[1], order[0]];
    d = { order, pos: 0 };
  }
  const id = d.order[d.pos];
  return { id, deck: { order: d.order, pos: d.pos + 1 } };
}

// ---------- 房間狀態 ----------
// state = { v, ns, bank, status:'waiting'|'playing'|'ended', round, durationSec, startedAt, endsAt, endedAt,
//           rope, winner:'red'|'blue'|'draw'|null, endReason:'rope'|'time'|'teacher'|null,
//           players:{ [id]:{ team, correct, wrong, joinedAt } } }
export function newRoomState({ ns = 'class', bank = 'default', durationSec = DEFAULT_DURATION_SEC } = {}) {
  return { v: 1, ns, bank, status: 'waiting', round: 1, durationSec, startedAt: null, endsAt: null, endedAt: null, rope: 0, winner: null, endReason: null, players: {} };
}

export function teamSize(state, team) {
  return Object.values(state.players || {}).filter((p) => p.team === team).length;
}

// 同一 id 回原隊；新加入者進人數較少的隊，同人數進紅隊
export function assignTeam(players, id) {
  if (players && players[id]) return players[id].team;
  const vals = Object.values(players || {});
  const red = vals.filter((p) => p.team === 'red').length;
  const blue = vals.length - red;
  return blue < red ? 'blue' : 'red';
}

// 回傳 { state, team, rejoin, error }；state 為 undefined 代表不需寫入
export function joinPlayer(state, id, now = Date.now()) {
  if (!state || !state.players) return { state: undefined, error: '房間資料異常' };
  if (state.players[id]) return { state: undefined, team: state.players[id].team, rejoin: true };
  if (Object.keys(state.players).length >= MAX_PLAYERS) return { state: undefined, error: `房間已滿（上限 ${MAX_PLAYERS} 人）` };
  const next = clone(state);
  const team = assignTeam(next.players, id);
  next.players[id] = { team, correct: 0, wrong: 0, joinedAt: now };
  return { state: next, team, rejoin: false };
}

export const clampRope = (v) => Math.max(-ROPE_LIMIT, Math.min(ROPE_LIMIT, round1(v)));
export const judge = (rope) => (rope < 0 ? 'red' : rope > 0 ? 'blue' : 'draw');

// 人數校正：每隊總拉力看「答對率 × 權重」，不是看人多
export function pullAmount(weight = 1, size = 1, factor = 1) {
  return Math.max(0.5, round1(((Number(weight) || 1) * PULL_BASE * factor) / Math.max(3, size)));
}

export function startMatch(state, now = Date.now(), durationSec) {
  if (!state || state.status !== 'waiting') return undefined;
  const next = clone(state);
  next.status = 'playing';
  next.durationSec = durationSec || next.durationSec || DEFAULT_DURATION_SEC;
  next.startedAt = now;
  next.endsAt = now + next.durationSec * 1000;
  next.rope = 0;
  next.winner = null;
  next.endReason = null;
  return next;
}

export function endMatch(state, reason = 'time', now = Date.now()) {
  if (!state || state.status !== 'playing') return undefined;
  const next = clone(state);
  next.status = 'ended';
  next.endedAt = now;
  next.endReason = reason;
  next.winner = judge(next.rope);
  return next;
}

// 任何一端都可以呼叫：到期才結束，未到期回傳 undefined（transact 不寫入）
export function expireIfDue(state, now = Date.now()) {
  if (!state || state.status !== 'playing' || !state.endsAt || now < state.endsAt) return undefined;
  return endMatch(state, 'time', now);
}

// 再來一局：保留隊伍，歸零繩子與答對數
export function resetRound(state) {
  if (!state || state.status === 'playing') return undefined;
  const next = clone(state);
  next.status = 'waiting';
  next.round = (next.round || 1) + 1;
  Object.assign(next, { startedAt: null, endsAt: null, endedAt: null, rope: 0, winner: null, endReason: null });
  for (const p of Object.values(next.players)) { p.correct = 0; p.wrong = 0; }
  return next;
}

// 學生作答後的狀態更新。回傳 { state, pullApplied, endedNow }
export function applyAnswer(state, { id, correct, weight = 1, factor = 1 }, now = Date.now()) {
  if (!state || state.status !== 'playing') return { state: undefined, pullApplied: 0, endedNow: false };
  if (state.endsAt && now >= state.endsAt) return { state: endMatch(state, 'time', now), pullApplied: 0, endedNow: true };
  const me = state.players?.[id];
  if (!me) return { state: undefined, pullApplied: 0, endedNow: false };
  const next = clone(state);
  const p = next.players[id];
  let pullApplied = 0;
  if (correct) {
    p.correct += 1;
    const before = next.rope;
    next.rope = clampRope(before + (p.team === 'blue' ? 1 : -1) * pullAmount(weight, teamSize(next, p.team), factor));
    pullApplied = round1(Math.abs(next.rope - before));
    if (Math.abs(next.rope) >= ROPE_LIMIT) {
      const ended = endMatch(next, 'rope', now);
      return { state: ended, pullApplied, endedNow: true };
    }
  } else {
    p.wrong += 1;
  }
  return { state: next, pullApplied, endedNow: false };
}

export function teamStats(state) {
  const out = { red: { players: 0, correct: 0, wrong: 0 }, blue: { players: 0, correct: 0, wrong: 0 } };
  for (const p of Object.values(state?.players || {})) {
    const t = out[p.team];
    if (!t) continue;
    t.players += 1; t.correct += p.correct || 0; t.wrong += p.wrong || 0;
  }
  return out;
}

// ---------- 題庫檢查（換題庫後先跑這個） ----------
export function validateBank(bank) {
  const errs = [];
  if (!bank || typeof bank !== 'object') return ['BANK 不是物件'];
  if (!bank.title) errs.push('缺少 title');
  if (!Array.isArray(bank.questions) || !bank.questions.length) return [...errs, 'questions 必須是非空陣列'];
  const seen = new Set();
  bank.questions.forEach((q, i) => {
    const at = `第 ${i + 1} 題（${q.id || '無 id'}）`;
    if (!q.id) errs.push(`${at} 缺少 id`);
    else if (seen.has(q.id)) errs.push(`${at} id 重複`);
    seen.add(q.id);
    if (!q.stem) errs.push(`${at} 缺少 stem`);
    if (q.weight != null && !(q.weight >= 1 && q.weight <= 5)) errs.push(`${at} weight 應介於 1～5`);
    const kindOk = (k) => typeof k === 'string' && KIND_RE.test(k);
    if (q.type === 'choice') {
      if (!Array.isArray(q.options) || q.options.length < 2) errs.push(`${at} 選項至少 2 個`);
      else {
        const nCorrect = q.options.filter((o) => o.correct).length;
        if (nCorrect !== 1) errs.push(`${at} 正確選項必須剛好 1 個（目前 ${nCorrect}）`);
        q.options.forEach((o, j) => {
          if (!o.text) errs.push(`${at} 選項 ${j + 1} 缺少 text`);
          if (!o.correct && !kindOk(o.misconception)) errs.push(`${at} 選項 ${j + 1} 的 misconception 需為英文 snake_case`);
          if (!o.correct && !o.feedback) errs.push(`${at} 選項 ${j + 1} 缺少診斷 feedback`);
        });
        const texts = q.options.map((o) => o.text);
        if (new Set(texts).size !== texts.length) errs.push(`${at} 選項文字重複`);
      }
    } else if (q.type === 'input') {
      if (!Array.isArray(q.answers) || !q.answers.length) errs.push(`${at} answers 不可為空`);
      else if (q.numeric !== false && q.answers.some((a) => parseNumber(a) === null)) errs.push(`${at} numeric 題的 answers 必須都是數字`);
      if (!q.feedback) errs.push(`${at} 缺少 feedback`);
      (q.wrongAnswers || []).forEach((w, j) => {
        if (!kindOk(w.misconception) || !w.feedback) errs.push(`${at} wrongAnswers ${j + 1} 需有 misconception 與 feedback`);
        if (q.numeric !== false && parseNumber(w.answer) === null) errs.push(`${at} wrongAnswers ${j + 1} 的 answer 不是數字`);
        if (q.numeric !== false && q.answers.some((a) => numbersEqual(parseNumber(a), parseNumber(w.answer)))) errs.push(`${at} wrongAnswers ${j + 1} 和正確答案相同`);
      });
    } else if (q.type === 'order') {
      if (!Array.isArray(q.items) || q.items.length < 2) errs.push(`${at} items 至少 2 個`);
      else if (new Set(q.items).size !== q.items.length) errs.push(`${at} items 不可重複`);
      if (!q.feedback) errs.push(`${at} 缺少 feedback`);
    } else {
      errs.push(`${at} 題型 ${q.type} 不支援（只有 choice / input / order）`);
    }
    if (q.misconception != null && !kindOk(q.misconception)) errs.push(`${at} misconception 需為英文 snake_case`);
  });
  return errs;
}

// ---------- 報告彙整 ----------
// events：listEvents 的列；questionIndex：{ [qid]: { stem, bank } }；kindLabels：{ kind: 中文說明 }
export function summarize(events, questionIndex = {}, kindLabels = {}) {
  const answers = events.filter((e) => e.kind === 'answer' && e.payload && e.payload.counted !== false);
  const players = new Map();
  const questions = new Map();
  const kinds = new Map();
  for (const e of answers) {
    const p = e.payload;
    const pl = players.get(e.player) || { player: e.player, rooms: new Set(), teams: new Set(), answers: 0, correct: 0, msTotal: 0, mis: new Map() };
    pl.rooms.add(e.room || '單人'); if (p.team) pl.teams.add(p.team);
    pl.answers += 1; if (p.correct) pl.correct += 1; pl.msTotal += Number(p.ms) || 0;
    if (!p.correct && p.misconception) pl.mis.set(p.misconception, (pl.mis.get(p.misconception) || 0) + 1);
    players.set(e.player, pl);

    const q = questions.get(p.qid) || { qid: p.qid, answers: 0, correct: 0, first: 0, firstCorrect: 0, mis: new Map() };
    q.answers += 1; if (p.correct) q.correct += 1;
    if ((p.attempt || 1) === 1) { q.first += 1; if (p.correct) q.firstCorrect += 1; }
    if (!p.correct && p.misconception) q.mis.set(p.misconception, (q.mis.get(p.misconception) || 0) + 1);
    questions.set(p.qid, q);

    if (!p.correct && p.misconception) {
      const k = kinds.get(p.misconception) || { kind: p.misconception, count: 0, players: new Set(), qids: new Set() };
      k.count += 1; k.players.add(e.player); k.qids.add(p.qid);
      kinds.set(p.misconception, k);
    }
  }
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  return {
    totalAnswers: answers.length,
    players: [...players.values()].map((p) => ({
      player: p.player, rooms: [...p.rooms].join(' '), teams: [...p.teams].join(' '), answers: p.answers, correct: p.correct,
      accuracy: pct(p.correct, p.answers), avgSec: p.answers ? Math.round(p.msTotal / p.answers / 100) / 10 : 0, topMisconception: top(p.mis),
    })).sort((a, b) => a.player.localeCompare(b.player)),
    questions: [...questions.values()].map((q) => ({
      qid: q.qid, stem: plainMath(questionIndex[q.qid]?.stem || ''), answers: q.answers, correct: q.correct,
      accuracy: pct(q.correct, q.answers), firstTryAccuracy: pct(q.firstCorrect, q.first), topMisconception: top(q.mis),
    })).sort((a, b) => a.accuracy - b.accuracy),
    misconceptions: [...kinds.values()].map((k) => ({
      kind: k.kind, label: kindLabels[k.kind] || '', count: k.count, players: k.players.size, qids: [...k.qids].join(' '),
    })).sort((a, b) => b.count - a.count),
  };
}
