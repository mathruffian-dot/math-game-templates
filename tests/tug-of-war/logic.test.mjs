// 拔河對戰純邏輯測試：node --test tests/tug-of-war/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../../site/games/tug-of-war/logic.js';

// 可重現的亂數
function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test('parseNumber：整數、小數、分數、帶分數、負號、全形', () => {
  const cases = [
    ['3', 3], ['-2', -2], ['+5', 5], ['0.75', 0.75], ['.5', 0.5], ['-.5', -0.5],
    ['3/4', 0.75], ['-3/4', -0.75], ['3/-4', -0.75], ['-3/-4', 0.75], ['6/8', 0.75],
    ['1 1/2', 1.5], ['-1 1/2', -1.5], [' 3 / 4 ', 0.75],
    ['３／４', 0.75], ['－２', -2], ['−2', -2], ['０．７５', 0.75], ['１　１/２', 1.5], ['1.5/3', 0.5],
  ];
  for (const [raw, v] of cases) assert.ok(L.numbersEqual(L.parseNumber(raw), v), `${raw} → ${L.parseNumber(raw)}，應為 ${v}`);
});

test('parseNumber：看不懂或除以 0 回傳 null', () => {
  for (const raw of ['', '   ', 'abc', '3/0', '1 1/0', '3//4', '--2', '3/4/5', 'x', '1,000', '2x']) {
    assert.equal(L.parseNumber(raw), null, raw);
  }
});

test('numbersEqual 容許浮點誤差但不把近似值當相等', () => {
  assert.ok(L.numbersEqual(0.1 + 0.2, 0.3));
  assert.ok(!L.numbersEqual(1 / 3, 0.333));
  assert.ok(!L.numbersEqual(null, 0));
});

const inputQ = {
  id: 'q', type: 'input', stem: 's', answers: ['3/4', '0.75'], numeric: true, feedback: '一般診斷',
  wrongAnswers: [{ answer: '4/3', misconception: 'ratio_reversed', feedback: '顛倒了' }],
};

test('checkAnswer input：分數小數等價、全形可接受、誘答對到誤解', () => {
  for (const g of ['3/4', '0.75', '６/８', '.75', ' 3/4 ']) assert.equal(L.checkAnswer(inputQ, g).correct, true, g);
  const r = L.checkAnswer(inputQ, '8/6');
  assert.equal(r.correct, false);
  assert.equal(r.misconception, 'ratio_reversed');
  assert.equal(r.feedback, '顛倒了');
  const other = L.checkAnswer(inputQ, '1');
  assert.equal(other.misconception, 'unclassified');
  assert.equal(other.feedback, '一般診斷');
});

test('checkAnswer input：空白與格式錯誤不計分', () => {
  assert.equal(L.checkAnswer(inputQ, '').counted, false);
  const r = L.checkAnswer(inputQ, '三分之一');
  assert.equal(r.counted, false);
  assert.equal(r.misconception, 'format_invalid');
});

test('checkAnswer input：非數值題用文字比對', () => {
  const q = { id: 'q', type: 'input', stem: 's', answers: ['AB'], numeric: false, feedback: 'f' };
  assert.equal(L.checkAnswer(q, ' ａｂ ').correct, true);
  assert.equal(L.checkAnswer(q, 'BA').correct, false);
});

test('checkAnswer choice：正確、誘答誤解、未選', () => {
  const q = { id: 'c', type: 'choice', stem: 's', options: [
    { text: '[frac:2|3]', correct: true },
    { text: '[frac:3|2]', misconception: 'ratio_reversed', feedback: 'fb' },
  ] };
  assert.deepEqual(L.checkAnswer(q, 0).correct, true);
  assert.equal(L.checkAnswer(q, 0).givenText, '2/3');
  const w = L.checkAnswer(q, 1);
  assert.equal(w.correct, false);
  assert.equal(w.misconception, 'ratio_reversed');
  assert.equal(L.checkAnswer(q, 5).counted, false);
});

test('checkAnswer order：全對、第一個錯的位置、指定錯序、未排完', () => {
  const q = { id: 'o', type: 'order', stem: 's', items: ['A', 'B', 'C'], misconception: 'procedure_order', feedback: 'f',
    wrongOrders: [{ order: ['B', 'A', 'C'], misconception: 'swap_ab', feedback: 'AB 顛倒' }] };
  assert.equal(L.checkAnswer(q, ['A', 'B', 'C']).correct, true);
  const r = L.checkAnswer(q, ['A', 'C', 'B']);
  assert.equal(r.correct, false);
  assert.equal(r.firstWrong, 1);
  assert.equal(r.misconception, 'procedure_order');
  assert.equal(L.checkAnswer(q, ['B', 'A', 'C']).misconception, 'swap_ab');
  assert.equal(L.checkAnswer(q, ['A']).counted, false);
});

test('drawNext：每輪不重複直到用完，換輪第一題不等於上一題', () => {
  const ids = Array.from({ length: 12 }, (_, i) => `q${i}`);
  const rng = seeded(7);
  let deck = null;
  let last = null;
  for (let round = 0; round < 50; round++) {
    const seen = new Set();
    for (let i = 0; i < ids.length; i++) {
      const r = L.drawNext(deck, ids, rng);
      deck = r.deck;
      if (i === 0 && last) assert.notEqual(r.id, last, '換輪後第一題和上一題相同');
      assert.ok(!seen.has(r.id), `第 ${round} 輪重複出現 ${r.id}`);
      seen.add(r.id);
      last = r.id;
    }
    assert.equal(seen.size, ids.length);
  }
});

test('drawNext：題庫換了就重洗；單題題庫也能運作', () => {
  const r1 = L.drawNext({ order: ['x', 'y'], pos: 1 }, ['a', 'b', 'c']);
  assert.ok(['a', 'b', 'c'].includes(r1.id));
  let deck = null;
  for (let i = 0; i < 3; i++) { const r = L.drawNext(deck, ['only']); assert.equal(r.id, 'only'); deck = r.deck; }
});

test('shuffle 不改原陣列、元素相同', () => {
  const a = [1, 2, 3, 4, 5];
  const b = L.shuffle(a, seeded(3));
  assert.deepEqual(a, [1, 2, 3, 4, 5]);
  assert.deepEqual([...b].sort(), a);
});

test('隊伍平衡：人少的隊優先、同人數進紅隊、同一 id 回原隊', () => {
  let s = L.newRoomState();
  const teams = [];
  for (let i = 1; i <= 7; i++) {
    const r = L.joinPlayer(s, `715-0${i}`, 1000 + i);
    s = r.state;
    teams.push(r.team);
  }
  assert.deepEqual(teams, ['red', 'blue', 'red', 'blue', 'red', 'blue', 'red']);
  const again = L.joinPlayer(s, '715-02', 9999);
  assert.equal(again.state, undefined, '重進不需寫入');
  assert.equal(again.team, 'blue');
  assert.equal(again.rejoin, true);
  // 有人被移到紅隊造成不平衡時，新進者補到藍隊
  s.players['715-01'].team = 'red';
  s.players['715-02'].team = 'red';
  assert.equal(L.assignTeam(s.players, 'new'), 'blue');
});

test('加入人數上限', () => {
  let s = L.newRoomState();
  for (let i = 0; i < L.MAX_PLAYERS; i++) s = L.joinPlayer(s, `p${i}`).state;
  const r = L.joinPlayer(s, 'late');
  assert.equal(r.state, undefined);
  assert.match(r.error, /已滿/);
});

test('clampRope 與 judge', () => {
  assert.equal(L.clampRope(150), 100);
  assert.equal(L.clampRope(-150), -100);
  assert.equal(L.clampRope(12.345), 12.3);
  assert.equal(L.judge(-0.1), 'red');
  assert.equal(L.judge(3), 'blue');
  assert.equal(L.judge(0), 'draw');
});

test('pullAmount：人數校正與最小值', () => {
  assert.equal(L.pullAmount(1, 1), 4);
  assert.equal(L.pullAmount(1, 3), 4);
  assert.equal(L.pullAmount(2, 6), 4);
  assert.equal(L.pullAmount(1, 15), 0.8);
  assert.equal(L.pullAmount(1, 1, 0.5), 2);
  assert.equal(L.pullAmount(1, 500), 0.5);
});

function playingRoom(n = 2) {
  let s = L.newRoomState({ durationSec: 60 });
  for (let i = 0; i < n; i++) s = L.joinPlayer(s, `p${i}`, 0).state; // p0 紅、p1 藍…
  return L.startMatch(s, 1000);
}

test('開始比賽：只能從 waiting 開始，設定 endsAt', () => {
  const s = playingRoom();
  assert.equal(s.status, 'playing');
  assert.equal(s.endsAt, 1000 + 60000);
  assert.equal(L.startMatch(s, 2000), undefined);
  const custom = L.startMatch(L.newRoomState(), 0, 120);
  assert.equal(custom.endsAt, 120000);
});

test('applyAnswer：紅隊負向、藍隊正向、答錯不拉繩但記錄、不改原物件', () => {
  const s = playingRoom(2);
  const r1 = L.applyAnswer(s, { id: 'p0', correct: true, weight: 1 }, 2000);
  assert.equal(r1.state.rope, -4);
  assert.equal(r1.pullApplied, 4);
  assert.equal(s.rope, 0, '不應改到傳入的 state');
  const r2 = L.applyAnswer(r1.state, { id: 'p1', correct: true, weight: 2 }, 2000);
  assert.equal(r2.state.rope, 4);
  const r3 = L.applyAnswer(r2.state, { id: 'p1', correct: false, weight: 3 }, 2000);
  assert.equal(r3.state.rope, 4);
  assert.equal(r3.pullApplied, 0);
  assert.equal(r3.state.players.p1.wrong, 1);
  assert.equal(r3.state.players.p1.correct, 1);
  assert.equal(L.applyAnswer(r3.state, { id: 'ghost', correct: true }, 2000).state, undefined);
});

test('applyAnswer：拉到 ±100 立即結束且只算到 100', () => {
  let s = playingRoom(2);
  s.rope = 98;
  const r = L.applyAnswer(s, { id: 'p1', correct: true, weight: 3 }, 2000);
  assert.equal(r.state.rope, 100);
  assert.equal(r.pullApplied, 2);
  assert.equal(r.state.status, 'ended');
  assert.equal(r.state.winner, 'blue');
  assert.equal(r.state.endReason, 'rope');
  assert.equal(r.endedNow, true);
  const after = L.applyAnswer(r.state, { id: 'p0', correct: true }, 2001);
  assert.equal(after.state, undefined, '結束後的作答不再改狀態');
});

test('applyAnswer：時間已過就改為結束、不拉繩', () => {
  let s = playingRoom(2);
  s.rope = -10;
  const r = L.applyAnswer(s, { id: 'p1', correct: true }, s.endsAt);
  assert.equal(r.pullApplied, 0);
  assert.equal(r.state.status, 'ended');
  assert.equal(r.state.winner, 'red');
  assert.equal(r.state.endReason, 'time');
});

test('到期推進：未到期不寫入、到期依 rope 判勝、0 為平手、只成功一次', () => {
  const s = playingRoom(2);
  assert.equal(L.expireIfDue(s, s.endsAt - 1), undefined);
  const e = L.expireIfDue(s, s.endsAt);
  assert.equal(e.status, 'ended');
  assert.equal(e.winner, 'draw');
  assert.equal(L.expireIfDue(e, s.endsAt + 5000), undefined, '已結束的房間不再寫入');
  assert.equal(L.endMatch(e, 'teacher'), undefined);
  // 模擬 transact：多端同時到期，只有第一個改得動
  let db = s, writes = 0;
  for (let i = 0; i < 5; i++) { const n = L.expireIfDue(db, s.endsAt + i); if (n) { db = n; writes++; } }
  assert.equal(writes, 1);
});

test('再來一局：保留隊伍、歸零、局數 +1；比賽中不可重設', () => {
  let s = playingRoom(4);
  s = L.applyAnswer(s, { id: 'p0', correct: true }, 2000).state;
  assert.equal(L.resetRound(s), undefined);
  s = L.endMatch(s, 'teacher', 3000);
  const r = L.resetRound(s);
  assert.equal(r.status, 'waiting');
  assert.equal(r.round, 2);
  assert.equal(r.rope, 0);
  assert.equal(r.winner, null);
  assert.equal(r.players.p0.correct, 0);
  assert.equal(r.players.p0.team, 'red');
});

test('teamStats 加總', () => {
  let s = playingRoom(3);
  s = L.applyAnswer(s, { id: 'p0', correct: true }, 2000).state;
  s = L.applyAnswer(s, { id: 'p2', correct: false }, 2000).state;
  const t = L.teamStats(s);
  assert.deepEqual(t.red, { players: 2, correct: 1, wrong: 1 });
  assert.deepEqual(t.blue, { players: 1, correct: 0, wrong: 0 });
});

test('30 人整場作答後 state 仍遠小於 256KB', () => {
  let s = L.newRoomState();
  for (let i = 1; i <= 30; i++) s = L.joinPlayer(s, `715-${String(i).padStart(2, '0')}`, Date.now()).state;
  s = L.startMatch(s, Date.now());
  for (let k = 0; k < 3000; k++) {
    const id = `715-${String((k % 30) + 1).padStart(2, '0')}`;
    const r = L.applyAnswer(s, { id, correct: k % 3 !== 0, weight: 1 + (k % 3) }, s.startedAt + 1000);
    if (!r.state) break;
    s = r.state;
    if (s.status !== 'playing') s = L.resetRound(s) && L.startMatch(L.resetRound(s), s.endedAt);
  }
  const bytes = Buffer.byteLength(JSON.stringify(s));
  assert.ok(bytes < 8 * 1024, `state 大小 ${bytes} bytes`);
});

test('summarize：逐人、每題、誤解排行（用 kind 分群）、排除不計分', () => {
  const ev = (player, qid, correct, misconception, extra = {}) => ({ kind: 'answer', room: 'ABCD', player, payload: { qid, correct, misconception, ms: 2000, team: 'red', attempt: 1, ...extra } });
  const events = [
    ev('715-01', 'q1', true, null),
    ev('715-01', 'q2', false, 'subtraction_sign'),
    ev('715-01', 'q2', true, null, { attempt: 2 }),
    ev('715-02', 'q2', false, 'subtraction_sign'),
    ev('715-02', 'q1', false, 'quotient_degree'),
    ev('715-02', 'q1', false, 'format_invalid', { counted: false }),
    { kind: 'join', room: 'ABCD', player: '715-02', payload: {} },
  ];
  const s = L.summarize(events, { q1: { stem: '[frac:1|2]' } }, { subtraction_sign: '相減沒變號' });
  assert.equal(s.totalAnswers, 5);
  const p1 = s.players.find((p) => p.player === '715-01');
  assert.equal(p1.answers, 3);
  assert.equal(p1.correct, 2);
  assert.equal(p1.accuracy, 66.7);
  assert.equal(p1.avgSec, 2);
  const q2 = s.questions.find((q) => q.qid === 'q2');
  assert.equal(q2.answers, 3);
  assert.equal(q2.firstTryAccuracy, 0);
  assert.equal(q2.topMisconception, 'subtraction_sign');
  assert.equal(s.questions.find((q) => q.qid === 'q1').stem, '1/2');
  assert.equal(s.misconceptions[0].kind, 'subtraction_sign');
  assert.equal(s.misconceptions[0].count, 2);
  assert.equal(s.misconceptions[0].players, 2);
  assert.equal(s.misconceptions[0].label, '相減沒變號');
  assert.ok(!s.misconceptions.some((m) => m.kind === 'format_invalid'));
});
