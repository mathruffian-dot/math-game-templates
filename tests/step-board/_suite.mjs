// 三個 content 共用的測試流程：固定種子跑 N 題，逐步驗證
//  1. validateProblem 無問題（卡槽 ≤3、卡片文字不重複、誘答不在 accept…）
//  2. 每組 accept 用「獨立驗算器」確認數學正確
//  3. 每張誘答卡放進任何槽，驗算器都判定不成立；且有一條同 kind 的診斷規則指到它
//  4. 每條 diagnose 規則都能觸發出自己的 kind
//  5. 最後答案與獨立重算一致、數字範圍合理（由各 content 測試提供）
import assert from 'node:assert/strict';
import { mulberry32, validateProblem, slotIds, checkStep, placementForRule, cardById } from '../../site/games/step-board/engine.js';

export const N = 2000;

export function runSuite(content, { verify, checkAnswer, checkRange }) {
  const triggered = new Set();
  const trapKinds = new Set();
  let steps = 0;
  for (let seed = 1; seed <= N; seed++) {
    const p = content.makeProblem(mulberry32(seed));
    const issues = validateProblem(p);
    assert.deepEqual(issues, [], `seed ${seed}：${issues.join('；')}`);
    checkAnswer(p, seed);
    checkRange(p, seed);
    p.steps.forEach((step, i) => {
      steps++;
      const slots = slotIds(step);
      const values = (pl) => Object.fromEntries(slots.map((s) => [s, cardById(step, pl[s])?.value]));
      for (const ans of step.accept) {
        assert.ok(verify(p, i, values(ans), step), `seed ${seed} 第${i + 1}步 accept 不成立：${JSON.stringify(ans)}`);
        assert.equal(checkStep(step, ans).ok, true);
      }
      for (const card of step.cards.filter((c) => c.trap)) {
        trapKinds.add(card.trap);
        assert.ok(content.kinds[card.trap], `誘答 kind ${card.trap} 沒有中文說明`);
        for (const slot of slots) {
          const pl = { ...step.accept[0], [slot]: card.id };
          assert.equal(verify(p, i, values(pl), step), false, `seed ${seed} 第${i + 1}步 誘答 ${card.text} 放在 ${slot} 竟然成立`);
          assert.equal(checkStep(step, pl).ok, false);
        }
        const rule = (step.diagnose || []).find((r) => r.kind === card.trap && Object.values(r.when).some((w) => [].concat(w).includes(card.id)));
        assert.ok(rule, `seed ${seed} 第${i + 1}步 誘答 ${card.text}（${card.trap}）沒有對應的診斷規則`);
      }
      for (const rule of step.diagnose || []) {
        const res = checkStep(step, placementForRule(step, rule));
        assert.equal(res.ok, false, `seed ${seed} 第${i + 1}步 規則 ${rule.kind} 的放法竟然被接受`);
        assert.equal(res.kind, rule.kind, `seed ${seed} 第${i + 1}步 規則 ${rule.kind} 被前面的規則 ${res.kind} 搶走`);
        assert.ok(res.wrongSlots.length > 0);
        assert.ok(content.kinds[rule.kind], `kind ${rule.kind} 沒有中文說明`);
        triggered.add(rule.kind);
      }
    });
  }
  // 每一種登記的誤解，在 N 題中至少被某條規則觸發過
  for (const k of Object.keys(content.kinds)) assert.ok(triggered.has(k), `誤解 ${k} 在 ${N} 題中從未能觸發`);
  return { steps, triggered: triggered.size, trapKinds: trapKinds.size };
}
