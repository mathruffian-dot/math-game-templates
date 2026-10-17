// 英文內容包：構詞（錯誤否定字首必被判錯，且 reason 指出正確字首）
import test from 'node:test';
import assert from 'node:assert/strict';
import pack, { WORDS, NEG, PREFIXES, SUFFIXES, tileText, tagOf } from '../../site/games/chain-match/content/english/affix.js';
import { commonPackChecks } from './_packs.mjs';

const T = (...ms) => ms.map((m) => ({ text: tileText(m), value: m, tag: tagOf(m) }));

test('共通檢查：plant 必成立、誘答鏈必不成立', () => {
  const kinds = commonPackChecks(pack);
  assert.ok(kinds.has('wrong_prefix'));
});

test('單字表：沒有重複、拼字就是詞素直接相接、核心字至少 40 個', () => {
  assert.equal(new Set(WORDS.map((w) => w.parts.join('+'))).size, WORDS.length);
  assert.equal(new Set(WORDS.map((w) => w.word)).size, WORDS.length);
  assert.ok(WORDS.filter((w) => !w.coincidence).length >= 40);
  for (const w of WORDS) {
    assert.ok(w.parts.length >= 2 && w.parts.length <= 3, w.word);
    assert.match(w.word, /^[a-z]+$/);
    assert.ok(w.zh);
    assert.equal(pack.check(T(...w.parts)).ok, true, w.word);
  }
  // 不收需要改拼字的字
  for (const bad of ['happyness', 'happyly', 'possiblely', 'writeer', 'useer', 'politeer']) {
    assert.ok(!WORDS.some((w) => w.word === bad), bad);
  }
});

test('範例：un+happy、re+write、dis+agree、im+possible、care+ful、kind+ness、un+kind+ness', () => {
  for (const ms of [['un', 'happy'], ['re', 'write'], ['dis', 'agree'], ['im', 'possible'], ['care', 'ful'], ['kind', 'ness'], ['un', 'kind', 'ness']]) {
    const r = pack.check(T(...ms));
    assert.equal(r.ok, true, ms.join('+'));
    assert.equal(r.gain, ms.length >= 3 ? 4 : 2);
  }
});

test('錯誤否定字首：判 wrong_prefix 並指出正確字首', () => {
  const cases = [
    [['un', 'possible'], 'im', 'impossible'],
    [['un', 'polite'], 'im', 'impolite'],
    [['un', 'correct'], 'in', 'incorrect'],
    [['un', 'honest'], 'dis', 'dishonest'],
    [['in', 'happy'], 'un', 'unhappy'],
    [['dis', 'kind'], 'un', 'unkind'],
    [['un', 'agree'], 'dis', 'disagree'],
    [['un', 'polite', 'ly'], 'im', 'impolitely'],
  ];
  for (const [ms, right, word] of cases) {
    const r = pack.check(T(...ms));
    assert.equal(r.kind, 'wrong_prefix', ms.join('+'));
    assert.equal(r.counted, true);
    assert.equal(r.rightPrefix, right);
    assert.ok(r.reason.includes(`${right}-`) && r.reason.includes(word), r.reason);
  }
  // 每一個否定字首開頭的合法字，換成其他否定字首（若不是合法字）都要判 wrong_prefix
  for (const w of WORDS.filter((x) => x.neg)) {
    for (const n of NEG) {
      if (n === w.parts[0]) continue;
      const alt = [n, ...w.parts.slice(1)];
      if (WORDS.some((x) => x.parts.join('+') === alt.join('+'))) continue;
      assert.equal(pack.check(T(...alt)).kind, 'wrong_prefix', alt.join('+'));
    }
  }
});

test('巧合字不會被拿來當否定字首的建議（un+play 不建議 display）', () => {
  const r = pack.check(T('un', 'play'));
  assert.equal(r.kind, 'not_a_word');
  assert.equal(pack.check(T('dis', 'play')).ok, true);
});

test('order：字首放後面、字尾放前面', () => {
  const a = pack.check(T('happy', 'un'));
  assert.equal(a.kind, 'order'); assert.match(a.reason, /un- 要放在最前面/); assert.match(a.reason, /unhappy/);
  const b = pack.check(T('ness', 'kind'));
  assert.equal(b.kind, 'order'); assert.match(b.reason, /-ness 要接在字根後面/); assert.match(b.reason, /kindness/);
  assert.equal(pack.check(T('kind', 'un', 'ness')).kind, 'order');
});

test('not_a_word 與 short', () => {
  const y = pack.check(T('happy', 'ness'));
  assert.equal(y.kind, 'not_a_word'); assert.match(y.reason, /y/);
  assert.equal(pack.check(T('ful', 'ly')).kind, 'not_a_word', '沒有字根');
  assert.equal(pack.check(T('kind', 'help')).kind, 'not_a_word');
  assert.equal(pack.check(T('re', 'kind')).kind, 'not_a_word');
  const s = pack.check(T('kind'));
  assert.equal(s.kind, 'short'); assert.equal(s.counted, false);
});

test('方塊文字標出位置：字首 un-、字尾 -ful', () => {
  assert.equal(tileText('un'), 'un-');
  assert.equal(tileText('ful'), '-ful');
  assert.equal(tileText('kind'), 'kind');
  assert.ok(PREFIXES.every((p) => tagOf(p) === 'prefix'));
  assert.ok(SUFFIXES.every((s) => tagOf(s) === 'suffix'));
  // 從文字也能判斷（沒有 value 時）
  assert.equal(pack.check([{ text: 'un-' }, { text: 'kind' }]).ok, true);
});
