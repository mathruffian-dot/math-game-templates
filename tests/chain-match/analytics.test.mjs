// T7 老師看板分析：依 kind 分群、最常失敗組合、逐人摘要
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, eventRows } from '../../site/games/chain-match/analytics.js';

const ev = (player, kind, payload, t) => ({ player, kind, room: 'ABCD', payload: { v: 1, content: 'math/ratio', ...payload, t } });

test('summarize：成立率、kind 分布、最常失敗組合、短鏈不計入', () => {
  const events = [
    ev('715-01', 'join', {}, 1),
    ev('715-01', 'chain_ok', { tiles: ['2', '3', '4', '6'], len: 4, combo: 1, score: 2 }, 2),
    ev('715-01', 'chain_fail', { tiles: ['2', '3', '3', '2'], kind: 'reversed', counted: true, score: 1 }, 3),
    ev('715-02', 'chain_fail', { tiles: ['2', '3', '3', '2'], kind: 'reversed', counted: true, score: 0 }, 4),
    ev('715-02', 'chain_fail', { tiles: ['2', '3'], kind: 'short', counted: false, score: 0 }, 5),
    ev('715-02', 'hint', { level: 1 }, 6),
    ev('715-02', 'shuffle', { reason: 'no_move' }, 7),
    ev('715-01', 'game_end', { score: 1, maxCombo: 1 }, 8),
  ];
  const s = summarize(events, 10000);
  assert.equal(s.players.length, 2);
  const p1 = s.players.find((p) => p.player === '715-01');
  assert.equal(p1.ok, 1); assert.equal(p1.fails, 1); assert.equal(p1.accuracy, 0.5); assert.equal(p1.games, 1); assert.equal(p1.score, 1);
  const p2 = s.players.find((p) => p.player === '715-02');
  assert.equal(p2.fails, 1); assert.equal(p2.notCounted, 1); assert.equal(p2.hints, 1); assert.equal(p2.topKind, 'reversed');
  assert.deepEqual(s.kinds, [{ content: 'math/ratio', kind: 'reversed', count: 2 }]);
  assert.equal(s.combos[0].text, '2 3 3 2'); assert.equal(s.combos[0].count, 2);
  assert.equal(s.shuffles, 1);
  const rows = eventRows(events);
  assert.equal(rows.length, events.length);
  assert.equal(rows[2].誤解代碼, 'reversed');
  assert.equal(rows[4].計入, '否');
});
