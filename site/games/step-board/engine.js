// T3 拖拉解題板：通用引擎（純邏輯，沒有 DOM，可用 node:test 測試）
//
// 題目資料結構（content 的 makeProblem(rng) 回傳）：
// {
//   id, title, stem, figure?,            // figure：SVG 字串，可省略
//   params,                             // 產生這題的參數（留痕用）
//   answer,                             // 最後答案（測試用，獨立重算比對）
//   layout?,                            // 省略 = 一般算式行；{type:'longdiv', ...} = 直式
//   steps: [{
//     key: 'move',                      // 穩定代碼（老師端統計「卡最久的步驟」用）
//     goal: '這一步要做什麼',
//     line: ['3x', {slot:'a'}, '=', {slot:'b'}, {frac:[[{slot:'n'}],[{slot:'d'}]]}],
//     cards: [{id, text, value, trap?}], // trap = 這張卡對準的誤解代碼（誘答卡才有）
//     accept: [{a:'c1', b:'c4'}, ...],   // 可接受的組合（等價寫法各列一組）
//     diagnose: [{when:{a:'c2'}, kind:'sign_not_flipped', feedback:'…', slots?:['a']}],
//     hints: ['層1方向', '層2關鍵關係', '層3幾乎給出一個槽'],
//     scaffold?: '顯示鷹架文字',
//     grid?: {row:'q'|0|1|…, bar?:true}  // 只有直式版面使用
//   }]
// }
// 內容檔建議用 buildStep(spec, rng)：以語意 key 寫卡片與規則，引擎洗牌並換成中性 id（c1、c2…），
// 避免從 DOM 屬性看出哪張是正解。

export const GAME_ID = 'step-board';

// ---------- 亂數 ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export const newSeed = () => (Math.random() * 2 ** 32) >>> 0;

export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// 洗牌卡片（保留卡片內容，只換順序）
export const shuffleCards = (cards, rng = Math.random) => shuffle(cards, rng);

// ---------- 卡槽 ----------
export function walkLine(line, visit) {
  for (const tok of line || []) {
    if (tok && typeof tok === 'object' && tok.frac) {
      walkLine(tok.frac[0], visit);
      walkLine(tok.frac[1], visit);
    } else visit(tok);
  }
}
export function slotIds(step) {
  const ids = [];
  walkLine(step.line, (t) => { if (t && typeof t === 'object' && t.slot) ids.push(t.slot); });
  return ids;
}
export const emptyPlacement = (step) => Object.fromEntries(slotIds(step).map((id) => [id, null]));
export const cardById = (step, id) => step.cards.find((c) => c.id === id) || null;

const matches = (want, got) => (Array.isArray(want) ? want.includes(got) : want === got);

// ---------- 檢查一步 ----------
// placement：{slotId: cardId|null}
// 回傳 {ok, kind, feedback, wrongSlots}；kind='incomplete' 表示還有空格（不算錯誤）
export function checkStep(step, placement = {}) {
  const ids = slotIds(step);
  const missing = ids.filter((id) => !placement[id]);
  if (missing.length) {
    return { ok: false, kind: 'incomplete', feedback: '還有空格沒有放卡片。', wrongSlots: missing };
  }
  let best = null;
  for (const ans of step.accept) {
    const wrong = ids.filter((id) => ans[id] !== placement[id]);
    if (!best || wrong.length < best.length) best = wrong;
  }
  if (!best.length) return { ok: true, kind: 'ok', feedback: '這一步成立！', wrongSlots: [] };
  for (const rule of step.diagnose || []) {
    const hit = Object.entries(rule.when).every(([slot, want]) => matches(want, placement[slot]));
    if (hit) {
      return { ok: false, kind: rule.kind, feedback: rule.feedback, wrongSlots: rule.slots || Object.keys(rule.when) };
    }
  }
  return {
    ok: false,
    kind: step.fallbackKind || 'other',
    feedback: step.fallback || '這一行還不成立，對照上一行，再檢查紅框的格子。',
    wrongSlots: best,
  };
}

// 第三層提示：找出第一個放錯或空著的槽，以及應該放的卡（以第一組 accept 為準）
export function revealHint(step, placement = {}) {
  const ans = step.accept[0];
  for (const slot of slotIds(step)) {
    if (placement[slot] !== ans[slot]) return { slot, cardId: ans[slot] };
  }
  return null;
}

// 放好卡片後，把算式行轉成純文字（留痕、回顧用）
export function placementText(step, placement = {}) {
  const out = {};
  for (const slot of slotIds(step)) out[slot] = cardById(step, placement[slot])?.text ?? null;
  return out;
}

// ---------- 計分 ----------
// 完成一步才得分；提示扣分但不歸零；錯誤扣小分（有上限）；整題零錯零提示加成。
export const SCORING = {
  stepBase: 10,
  hintCost: [0, 2, 4, 6], // 用到第 n 層提示時的累計扣分
  errorCost: 1,
  errorCap: 3,
  stepMin: 3,
  cleanBonus: 5,
};
export function stepScore({ errors = 0, hintLevel = 0 } = {}, S = SCORING) {
  const hint = S.hintCost[Math.min(hintLevel, S.hintCost.length - 1)];
  const err = Math.min(errors * S.errorCost, S.errorCap);
  return Math.max(S.stepMin, S.stepBase - hint - err);
}
// results：[{errors, hintLevel}]（每步一筆）
export function problemScore(results, S = SCORING) {
  const steps = results.map((r) => stepScore(r, S));
  const clean = results.length > 0 && results.every((r) => !r.errors && !r.hintLevel);
  const bonus = clean ? S.cleanBonus : 0;
  return { steps, bonus, total: steps.reduce((a, b) => a + b, 0) + bonus };
}

// ---------- 內容作者工具 ----------
// spec：{key, goal, line, cards:[{key, text, value, trap?}], accept:[{slot:cardKey}],
//        diagnose:[{when:{slot:cardKey|[cardKey]}, kind, feedback, slots?}], hints, scaffold?, grid?}
export function buildStep(spec, rng = Math.random) {
  const order = shuffle(spec.cards, rng);
  const idOf = new Map(order.map((c, i) => [c.key, `c${i + 1}`]));
  const map = (k) => {
    if (Array.isArray(k)) return k.map(map);
    if (!idOf.has(k)) throw new Error(`step ${spec.key}: 找不到卡片 ${k}`);
    return idOf.get(k);
  };
  const mapObj = (o) => Object.fromEntries(Object.entries(o).map(([slot, k]) => [slot, map(k)]));
  const { cards, accept, diagnose = [], ...rest } = spec;
  return {
    ...rest,
    cards: order.map(({ key, ...c }) => ({ id: idOf.get(key), ...c })),
    accept: accept.map(mapObj),
    diagnose: diagnose.map((r) => ({ ...r, when: mapObj(r.when) })),
  };
}

// 檢查一題資料是否自洽；回傳問題清單（空陣列 = 通過）。測試與新增內容時都可用。
export function validateProblem(p) {
  const issues = [];
  const say = (i, msg) => issues.push(`第 ${i + 1} 步：${msg}`);
  if (!p || !Array.isArray(p.steps) || !p.steps.length) return ['沒有步驟'];
  p.steps.forEach((s, i) => {
    const slots = slotIds(s);
    const cardIds = new Set(s.cards.map((c) => c.id));
    if (!slots.length) say(i, '沒有卡槽');
    if (slots.length > 3) say(i, `卡槽 ${slots.length} 個，超過 3 個`);
    if (new Set(slots).size !== slots.length) say(i, '卡槽 id 重複');
    if (cardIds.size !== s.cards.length) say(i, '卡片 id 重複');
    const texts = s.cards.map((c) => c.text);
    if (new Set(texts).size !== texts.length) say(i, `卡片文字重複：${texts.join('、')}`);
    if (!s.accept?.length) say(i, '沒有 accept');
    if (!s.goal) say(i, '沒有 goal');
    if (!Array.isArray(s.hints) || s.hints.length !== 3) say(i, '提示必須剛好三層');
    for (const ans of s.accept || []) {
      for (const slot of slots) if (!cardIds.has(ans[slot])) say(i, `accept 缺少槽 ${slot} 或卡片不存在`);
      const used = slots.map((sl) => ans[sl]);
      if (new Set(used).size !== used.length) say(i, 'accept 同一張卡用了兩次（卡片只能用一次）');
      for (const id of used) if (s.cards.find((c) => c.id === id)?.trap) say(i, `誘答卡 ${id} 出現在 accept`);
    }
    for (const r of s.diagnose || []) {
      if (!r.kind || !r.feedback) say(i, '診斷規則缺 kind 或 feedback');
      for (const [slot, want] of Object.entries(r.when)) {
        if (!slots.includes(slot)) say(i, `診斷規則的槽 ${slot} 不存在`);
        for (const id of [].concat(want)) if (!cardIds.has(id)) say(i, `診斷規則的卡 ${id} 不存在`);
      }
    }
  });
  return issues;
}

// 讓某條診斷規則成立的放法：以第一組 accept 為底，覆蓋規則指定的槽（測試用）
export function placementForRule(step, rule) {
  const base = { ...step.accept[0] };
  for (const [slot, want] of Object.entries(rule.when)) base[slot] = [].concat(want)[0];
  return base;
}
