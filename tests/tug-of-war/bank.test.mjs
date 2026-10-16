// 題庫格式檢查：老師或 Agent 換題庫後跑這支，確認每題都有誤解代碼與診斷
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANK as POLY } from '../../site/games/tug-of-war/bank.js';
import { BANK as RATIO } from '../../site/games/tug-of-war/bank-ratio.js';
import { validateBank, checkAnswer, KIND_RE } from '../../site/games/tug-of-war/logic.js';

for (const [name, bank, n] of [['多項式除法', POLY, 12], ['比與比例式', RATIO, 8]]) {
  test(`${name}題庫通過 validateBank`, () => {
    assert.deepEqual(validateBank(bank), []);
    assert.equal(bank.questions.length, n);
  });

  test(`${name}題庫：正解判對、每個誘答判錯並帶出 kind 與診斷`, () => {
    const labels = bank.misconceptions || {};
    for (const q of bank.questions) {
      if (q.type === 'choice') {
        q.options.forEach((o, i) => {
          const r = checkAnswer(q, i);
          assert.equal(r.correct, !!o.correct, `${q.id} 選項 ${i}`);
          if (!o.correct) {
            assert.match(r.misconception, KIND_RE);
            assert.ok(labels[r.misconception], `${q.id} 的 ${r.misconception} 沒有寫在 misconceptions 說明`);
            assert.ok(r.feedback);
          }
        });
      } else if (q.type === 'input') {
        for (const a of q.answers) assert.equal(checkAnswer(q, a).correct, true, `${q.id} ${a}`);
        for (const w of q.wrongAnswers || []) {
          const r = checkAnswer(q, w.answer);
          assert.equal(r.correct, false);
          assert.equal(r.misconception, w.misconception);
          assert.ok(labels[w.misconception], `${q.id} 的 ${w.misconception} 沒有說明`);
        }
      } else if (q.type === 'order') {
        assert.equal(checkAnswer(q, q.items).correct, true);
        assert.equal(checkAnswer(q, [...q.items].reverse()).correct, false);
        assert.ok(labels[q.misconception], `${q.id} 的 ${q.misconception} 沒有說明`);
      }
    }
  });
}

test('兩份題庫題號不重複（報告頁會合併查題目）', () => {
  const ids = [...POLY.questions, ...RATIO.questions].map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('validateBank 能抓出常見錯誤', () => {
  const bad = { title: 't', questions: [
    { id: 'a', type: 'choice', stem: 's', options: [{ text: '1', correct: true }, { text: '2', misconception: 'Bad Kind', feedback: '' }] },
    { id: 'a', type: 'input', stem: 's', answers: ['x'], feedback: 'f' },
    { id: 'c', type: 'drag', stem: 's' },
  ] };
  const errs = validateBank(bad);
  assert.ok(errs.some((e) => e.includes('snake_case')));
  assert.ok(errs.some((e) => e.includes('診斷')));
  assert.ok(errs.some((e) => e.includes('id 重複')));
  assert.ok(errs.some((e) => e.includes('必須都是數字')));
  assert.ok(errs.some((e) => e.includes('不支援')));
});
