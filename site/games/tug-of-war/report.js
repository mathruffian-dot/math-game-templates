// 拔河對戰・學習報告：讀 mg_events → 逐人、每題、誤解排行、逐筆事件，並匯出 CSV
import { getBackend } from '../../shared/backend.js';
import { queryParam } from '../../shared/identity.js';
import { toCsv, download } from '../../shared/csv.js';
import { BANK as DEFAULT_BANK } from './bank.js';
import { BANK as RATIO_BANK } from './bank-ratio.js';
import { escapeHtml, renderMath } from './render-math.js';
import { GAME, summarize } from './logic.js';

// 新增題庫時，把它 import 進來加到這裡，報告才查得到題目文字與誤解說明
const BANKS = [DEFAULT_BANK, RATIO_BANK];
const QINDEX = Object.fromEntries(BANKS.flatMap((b) => b.questions.map((q) => [q.id, { stem: q.stem, bank: b.title }])));
const KIND_LABELS = Object.assign({ format_invalid: '輸入格式看不懂（不計分）' }, ...BANKS.map((b) => b.misconceptions || {}));

const $ = (s) => document.querySelector(s);
const pct = (v) => `${v}%`;
let data = null;

function table(rows, cols) {
  if (!rows.length) return '<p class="muted">沒有資料</p>';
  return `<table><thead><tr>${cols.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? 'num' : ''}">${c.html ? c.html(r) : escapeHtml(r[c.key])}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

function flatEvent(e) {
  const p = e.payload || {};
  return {
    id: e.id, created_at: e.created_at, room: e.room || '', player: e.player, kind: e.kind,
    qid: p.qid ?? '', type: p.type ?? '', given: p.given ?? '', correct: p.correct ?? '', misconception: p.misconception ?? '',
    ms: p.ms ?? '', team: p.team ?? '', pullApplied: p.pullApplied ?? '', attempt: p.attempt ?? '', counted: p.counted ?? '',
    bank: p.bank ?? '', round: p.round ?? '', payload: p,
  };
}

function render() {
  const { events, sum } = data;
  const players = sum.players.length;
  const correct = sum.players.reduce((a, p) => a + p.correct, 0);
  $('#cards').innerHTML = `
    <div><b>${events.length}</b>事件</div>
    <div><b>${sum.totalAnswers}</b>計分作答</div>
    <div><b>${players}</b>位學生</div>
    <div><b>${sum.totalAnswers ? Math.round((correct / sum.totalAnswers) * 1000) / 10 : 0}%</b>整體正確率</div>
    <div><b>${events.filter((e) => e.kind === 'match_end').length}</b>場結束</div>`;

  const maxMis = sum.misconceptions[0]?.count || 1;
  $('#t-mis').innerHTML = table(sum.misconceptions, [
    { label: '誤解代碼', html: (r) => `<code>${escapeHtml(r.kind)}</code>` },
    { label: '說明', key: 'label' },
    { label: '次數', num: true, html: (r) => `<span class="bar" style="width:${Math.round((r.count / maxMis) * 80)}px"></span>${r.count}` },
    { label: '人數', key: 'players', num: true },
    { label: '出現在哪些題', key: 'qids' },
  ]);
  $('#t-q').innerHTML = table(sum.questions, [
    { label: '題號', key: 'qid' },
    { label: '題目', html: (r) => renderMath(QINDEX[r.qid]?.stem || '') },
    { label: '作答', key: 'answers', num: true },
    { label: '正確率', num: true, html: (r) => pct(r.accuracy) },
    { label: '首次正確率', num: true, html: (r) => pct(r.firstTryAccuracy) },
    { label: '最常見誤解', html: (r) => (r.topMisconception ? `<code>${escapeHtml(r.topMisconception)}</code> ${escapeHtml(KIND_LABELS[r.topMisconception] || '')}` : '') },
  ]);
  $('#t-p').innerHTML = table(sum.players, [
    { label: '學生', key: 'player' },
    { label: '房號', key: 'rooms' },
    { label: '隊伍', html: (r) => r.teams.replace('red', '紅').replace('blue', '藍') },
    { label: '作答', key: 'answers', num: true },
    { label: '答對', key: 'correct', num: true },
    { label: '正確率', num: true, html: (r) => pct(r.accuracy) },
    { label: '平均秒數', key: 'avgSec', num: true },
    { label: '最常見誤解', html: (r) => (r.topMisconception ? `<code>${escapeHtml(r.topMisconception)}</code>` : '') },
  ]);
  const shown = events.slice(-500).reverse().map(flatEvent);
  $('#ev-note').textContent = events.length > 500 ? `（畫面只列最新 500 筆，CSV 有全部 ${events.length} 筆）` : `（共 ${events.length} 筆）`;
  $('#t-ev').innerHTML = table(shown, [
    { label: '時間', html: (r) => escapeHtml(new Date(r.created_at).toLocaleTimeString('zh-TW', { hour12: false })) },
    { label: '房號', key: 'room' },
    { label: '玩家', key: 'player' },
    { label: '事件', key: 'kind' },
    { label: '題號', key: 'qid' },
    { label: '作答內容', key: 'given' },
    { label: '對錯', html: (r) => (r.kind !== 'answer' ? '' : r.counted === false ? '不計' : r.correct ? '<span class="ok">對</span>' : '<span class="bad">錯</span>') },
    { label: '誤解', html: (r) => (r.misconception ? `<code>${escapeHtml(r.misconception)}</code>` : '') },
    { label: '秒', num: true, html: (r) => (r.ms !== '' ? (r.ms / 1000).toFixed(1) : '') },
    { label: '拉力', key: 'pullApplied', num: true },
    { label: '其他', html: (r) => (r.kind === 'answer' ? '' : `<code>${escapeHtml(JSON.stringify(r.payload))}</code>`) },
  ]);
  $('#out').classList.remove('hidden');
}

async function load(e) {
  e && e.preventDefault();
  const all = $('#all').checked;
  const codes = $('#rooms').value.toUpperCase().split(/[\s,，、]+/).filter(Boolean);
  if (!all && !codes.length) { $('#status').textContent = '請輸入房號，或勾選「全部」。'; return; }
  $('#status').textContent = '讀取中…';
  try {
    const be = await getBackend();
    if (be.mode === 'local') $('#mode-badge').classList.remove('hidden');
    let events = [];
    if (all) events = await be.listEvents(GAME, null);
    else for (const c of [...new Set(codes)]) events.push(...(await be.listEvents(GAME, c)));
    events.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : (a.id || 0) - (b.id || 0)));
    data = { events, sum: summarize(events, QINDEX, KIND_LABELS) };
    $('#status').textContent = `讀到 ${events.length} 筆事件（${all ? '全部' : codes.join('、')}）。`;
    render();
  } catch (err) {
    $('#status').textContent = '讀取失敗：' + (err.message || err);
  }
}

function exportCsv(kind) {
  if (!data) return;
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const tag = $('#all').checked ? 'all' : $('#rooms').value.toUpperCase().split(/[\s,，、]+/).filter(Boolean).join('-');
  const name = (k) => `tug-of-war_${k}_${tag}_${stamp}.csv`;
  const { sum, events } = data;
  if (kind === 'players') download(name('players'), toCsv(sum.players, ['player', 'rooms', 'teams', 'answers', 'correct', 'accuracy', 'avgSec', 'topMisconception']));
  if (kind === 'questions') download(name('questions'), toCsv(sum.questions, ['qid', 'stem', 'answers', 'correct', 'accuracy', 'firstTryAccuracy', 'topMisconception']));
  if (kind === 'misconceptions') download(name('misconceptions'), toCsv(sum.misconceptions, ['kind', 'label', 'count', 'players', 'qids']));
  if (kind === 'events') download(name('events'), toCsv(events.map(flatEvent)));
}

$('#q').addEventListener('submit', load);
document.querySelectorAll('[data-csv]').forEach((b) => b.addEventListener('click', () => exportCsv(b.dataset.csv)));
const pre = queryParam('rooms');
if (pre) { $('#rooms').value = pre.split(',').join(', '); load(); }
getBackend().then((be) => be.mode === 'local' && $('#mode-badge').classList.remove('hidden'));
