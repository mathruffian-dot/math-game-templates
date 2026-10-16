import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMath, plainMath, escapeHtml } from '../../site/games/tug-of-war/render-math.js';

test('分數上下排列', () => {
  assert.equal(renderMath('[frac:3|4]'), '<span class="frac"><span>3</span><span>4</span></span>');
  assert.equal(renderMath('x = [frac:-1|2]'), 'x = <span class="frac"><span>-1</span><span>2</span></span>');
});

test('上標：數字、字母、大括號、負指數', () => {
  assert.equal(renderMath('x^2 + 3x'), 'x<sup>2</sup> + 3x');
  assert.equal(renderMath('x^12'), 'x<sup>12</sup>');
  assert.equal(renderMath('a^n'), 'a<sup>n</sup>');
  assert.equal(renderMath('x^{n+1}'), 'x<sup>n+1</sup>');
  assert.equal(renderMath('10^-3'), '10<sup>-3</sup>');
  assert.equal(renderMath('x^2y'), 'x<sup>2</sup>y');
});

test('線段上橫線與幾何符號', () => {
  assert.equal(renderMath('[seg:AB] = 3'), '<span class="overline">AB</span> = 3');
  assert.equal(renderMath('△ABC 中 ∠A = 30°'), '△ABC 中 ∠A = 30°');
});

test('組合：分數裡有上標與線段', () => {
  assert.equal(renderMath('[frac:x^2|[seg:AB]]'), '<span class="frac"><span>x<sup>2</sup></span><span><span class="overline">AB</span></span></span>');
});

test('HTML 一律跳脫', () => {
  assert.equal(renderMath('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(renderMath('[frac:<b>|2]'), '<span class="frac"><span>&lt;b&gt;</span><span>2</span></span>');
  assert.equal(escapeHtml(`"'&`), '&quot;&#39;&amp;');
  assert.equal(renderMath(null), '');
});

test('plainMath 轉純文字', () => {
  assert.equal(plainMath('[frac:3|4]'), '3/4');
  assert.equal(plainMath('[frac:x+1|2]'), '(x+1)/2');
  assert.equal(plainMath('[frac:-1|2]'), '-1/2');
  assert.equal(plainMath('x^{n+1} + x^2'), 'x^(n+1) + x^2');
  assert.equal(plainMath('[seg:AB]'), 'AB');
});
