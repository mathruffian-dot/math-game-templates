// 紅藍格鬥・發展式出招：出招設定與「解題板每完成一步就攻擊」的整合測試（重用 step-board 的 engine 與 content）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../../site/games/tug-of-war/logic.js';
import { checkStep, mulberry32 } from '../../site/games/step-board/engine.js';
import { getContent } from '../../site/games/step-board/content/index.js';

test('normalizePlay：預設評量式；發展式 content 不認得就用第一個', () => {
  assert.deepEqual(L.normalizePlay(undefined), { play: 'quiz', content: null });
  assert.deepEqual(L.normalizePlay('quiz', 'proportion'), { play: 'quiz', content: null });
  assert.deepEqual(L.normalizePlay('steps', 'poly-division'), { play: 'steps', content: 'poly-division' });
  assert.deepEqual(L.normalizePlay('steps', 'hack'), { play: 'steps', content: 'linear-equation' });
  const s = L.newRoomState({ play: 'steps', content: 'proportion' });
  assert.equal(s.play, 'steps');
  assert.equal(s.content, 'proportion');
  assert.equal(L.newRoomState().play, 'quiz');
});

test('發展式 content 都存在於 step-board', () => {
  for (const c of L.STEP_CONTENTS) assert.ok(getContent(c), c);
});

test('stepAttackWeight：一般步驟 1、最後一步為最後一擊 2', () => {
  assert.equal(L.stepAttackWeight(0, 3), 1);
  assert.equal(L.stepAttackWeight(1, 3), 1);
  assert.equal(L.stepAttackWeight(2, 3), 2);
});

test('三種 content：照正解逐步檢查，每步都造成傷害、最後一步較重', () => {
  for (const id of L.STEP_CONTENTS) {
    const content = getContent(id);
    for (let seed = 1; seed <= 30; seed++) {
      const p = content.makeProblem(mulberry32(seed));
      let s = L.newRoomState({ play: 'steps', content: id });
      s = L.joinPlayer(s, 'a', 0).state;
      s = L.joinPlayer(s, 'b', 0).state;
      s = L.startMatch(s, 0);
      const dmg = [];
      p.steps.forEach((st, i) => {
        assert.ok(checkStep(st, st.accept[0]).ok, `${id} seed ${seed} 第 ${i + 1} 步`);
        const r = L.applyAnswer(s, { id: 'a', correct: true, weight: L.stepAttackWeight(i, p.steps.length) }, 1000);
        dmg.push(r.damage);
        s = r.state;
      });
      assert.ok(dmg.every((d) => d > 0));
      if (p.steps.length < 3) assert.ok(dmg[dmg.length - 1] > dmg[0], `${id}：最後一擊較重`);
    }
  }
});

test('錯誤的一步：不攻擊、連擊歸零、之後修正答對傷害減半', () => {
  const content = getContent('linear-equation');
  const p = content.makeProblem(mulberry32(7));
  let s = L.joinPlayer(L.joinPlayer(L.newRoomState(), 'a', 0).state, 'b', 0).state;
  s = L.startMatch(s, 0);
  const st = p.steps[0];
  const wrongPlacement = Object.fromEntries(Object.keys(st.accept[0]).map((k) => [k, st.cards.find((c) => c.id !== st.accept[0][k]).id]));
  const res = checkStep(st, wrongPlacement);
  assert.equal(res.ok, false);
  const r1 = L.applyAnswer(s, { id: 'a', correct: res.ok, weight: 1 }, 1000);
  assert.equal(r1.damage, 0);
  assert.equal(r1.state.hp.red, 100);
  const r2 = L.applyAnswer(r1.state, { id: 'a', correct: true, weight: 1, factor: L.RETRY_FACTOR }, 2000);
  assert.equal(r2.damage, 5);
});
