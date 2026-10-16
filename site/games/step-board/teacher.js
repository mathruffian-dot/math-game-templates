// T3 拖拉解題板：老師端（開課堂、QR、限時、即時看板、CSV）
// 網址 teacher.html?room=房號 可直接回到已開的課堂（重新整理不會遺失）。
import { getBackend } from '../../shared/backend.js';
import { remember, recall, queryParam } from '../../shared/identity.js';
import { qrImage } from '../../shared/qr.js';
import { toCsv, download } from '../../shared/csv.js';
import { GAME_ID } from './engine.js';
import { CONTENTS, getContent, kindLabel, stepLabel } from './content/index.js';
import { summarize, eventRows } from './analytics.js';
import { escapeHtml } from './render-math.js';

const $ = (s) => document.querySelector(s);
const POLL_MS = 5000;
let be = null;
let code = null;
let room = null;
let unsub = null;
let poller = null;
let lastEvents = [];
let lastSummary = null;

function toast(msg, ms = 2400) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), ms);
}
const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const STATUS = { waiting: '等待開始（學生可以先加入）', running: '進行中', ended: '已結束' };

function studentUrl(c, ns) {
  const u = new URL('index.html', location.href);
  u.search = '';
  u.searchParams.set('room', c);
  if (ns === 'demo') u.searchParams.set('ns', 'demo');
  return u.toString();
}

// ---------- 開房 ----------
async function createRoom() {
  const content = $('#content-select').value;
  const minutes = Math.min(45, Math.max(1, Number($('#minutes').value) || 15));
  const ns = $('#ns-select').value;
  $('#create-btn').disabled = true;
  try {
    const c = await be.createRoom(GAME_ID, { content, ns, status: 'waiting', durationSec: minutes * 60, endsAt: null, createdAt: Date.now() });
    await openRoom(c);
  } catch (err) {
    toast('開房失敗：' + (err.message || err));
  } finally {
    $('#create-btn').disabled = false;
  }
}

async function openRoom(c) {
  c = String(c || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(c)) { toast('房號格式不對'); return; }
  const r = await be.getRoom(GAME_ID, c);
  if (!r) { toast('找不到房號 ' + c + '（房間 2 天後會過期）'); return; }
  unsub?.();
  code = c;
  room = r.state;
  remember(GAME_ID, 'teacher-room', c);
  const u = new URL(location.href);
  u.searchParams.set('room', c);
  history.replaceState(null, '', u);
  const link = studentUrl(c, room.ns);
  $('#room-code').textContent = c;
  $('#join-link').value = link;
  const qr = $('#qr');
  qr.innerHTML = '';
  try { qr.appendChild(await qrImage(link, 240)); } catch { qr.textContent = '（QR 載入失敗，請改用連結）'; }
  $('#room-panel').classList.remove('hidden');
  $('#dash').classList.remove('hidden');
  unsub = be.subscribeRoom(GAME_ID, c, (s) => { room = s; renderRoom(); });
  renderRoom();
  clearInterval(poller);
  refresh();
  poller = setInterval(refresh, POLL_MS);
}

function renderRoom() {
  if (!room) return;
  const content = getContent(room.content);
  $('#room-content').textContent = `${content?.title || room.content}（${content?.unit || ''}）・${Math.round((room.durationSec || 0) / 60)} 分鐘`;
  const over = room.status === 'running' && Date.now() >= room.endsAt;
  $('#room-status').textContent = over ? '時間到' : STATUS[room.status] || room.status;
  $('#start-btn').disabled = room.status !== 'waiting';
  $('#extend-btn').disabled = room.status !== 'running';
  $('#end-btn').disabled = room.status === 'ended';
  tick();
}
function tick() {
  if (!room) return;
  const t = $('#room-timer');
  if (room.status === 'running') {
    const left = room.endsAt - Date.now();
    t.textContent = left > 0 ? `剩 ${mmss(left)}` : '時間到';
    t.classList.toggle('urgent', left <= 60000);
    if (left <= 0) endRoom(true);
  } else t.textContent = '';
}
setInterval(tick, 500);

async function update(fn) {
  try { room = await be.transact(GAME_ID, code, fn); renderRoom(); }
  catch (err) { toast('更新失敗：' + (err.message || err)); }
}
const startRoom = () => update((s) => (s.status !== 'waiting' ? undefined : { ...s, status: 'running', startedAt: Date.now(), endsAt: Date.now() + (s.durationSec || 900) * 1000 }));
const extendRoom = () => update((s) => (s.status !== 'running' ? undefined : { ...s, endsAt: Math.max(s.endsAt, Date.now()) + 60000 }));
let ending = false;
async function endRoom(auto = false) {
  if (ending) return;
  if (!auto && !confirm('確定要提前結束？學生畫面會立刻停止。')) return;
  ending = true;
  await update((s) => (s.status === 'ended' ? undefined : (auto && Date.now() < s.endsAt) ? undefined : { ...s, status: 'ended', endsAt: Math.min(s.endsAt || Date.now(), Date.now()) }));
  ending = false;
}

// ---------- 即時看板 ----------
async function refresh() {
  if (!code) return;
  try {
    lastEvents = await be.listEvents(GAME_ID, code);
    lastSummary = summarize(lastEvents);
    renderDash(lastSummary);
    $('#updated').textContent = `更新於 ${new Date().toLocaleTimeString('zh-TW', { hour12: false })}，每 5 秒自動更新`;
  } catch (err) {
    $('#updated').textContent = '讀取失敗，稍後重試：' + (err.message || err);
  }
}

function renderDash(sum) {
  const ps = sum.players;
  const total = (k) => ps.reduce((a, p) => a + (p[k] || 0), 0);
  const steps = total('stepsDone'), first = total('firstTryOk');
  $('#kpis').innerHTML = [
    ['加入人數', ps.length],
    ['完成題數', total('problemsDone')],
    ['完成步數', steps],
    ['首次正確率', steps ? Math.round((first / steps) * 100) + '%' : '—'],
    ['提示次數', total('hints')],
  ].map(([k, v]) => `<div class="kpi"><b>${v}</b><span>${k}</span></div>`).join('');

  const max = Math.max(1, ...sum.kinds.map((k) => k.count));
  $('#kind-bars').innerHTML = sum.kinds.length
    ? sum.kinds.slice(0, 10).map((k) => `
      <div class="bar-row" title="${escapeHtml(k.kind)}">
        <span class="bar-label">${escapeHtml(kindLabel(k.kind, k.content))}<small class="muted"> ${escapeHtml(k.kind)}</small></span>
        <span class="bar-track"><span class="bar" style="width:${(k.count / max) * 100}%"></span></span>
        <span class="bar-num">${k.count}</span>
      </div>`).join('')
    : '<p class="muted">目前還沒有錯誤紀錄。</p>';

  $('#step-table').innerHTML = `<thead><tr><th>步驟</th><th>完成次數</th><th>平均秒數</th><th>最久秒數</th><th>錯誤</th><th>提示</th></tr></thead><tbody>${
    sum.steps.map((s) => `<tr>
      <td>${escapeHtml(stepLabel(s.stepKey, s.content))}</td><td>${s.done}</td>
      <td>${s.avgMs == null ? '—' : (s.avgMs / 1000).toFixed(1)}</td><td>${s.done ? (s.maxMs / 1000).toFixed(0) : '—'}</td>
      <td>${s.errors}</td><td>${s.hints}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">尚無資料</td></tr>'
  }</tbody>`;

  $('#player-table').innerHTML = `<thead><tr><th>學生</th><th>目前位置</th><th>完成題</th><th>完成步</th><th>首次正確率</th><th>錯誤</th><th>提示</th><th>最常見誤解</th><th>分數</th><th>閒置</th></tr></thead><tbody>${
    ps.map((p) => {
      const where = p.stepCount ? `第 ${p.problemNo} 題 第 ${Math.min(p.stepIndex + 1, p.stepCount)}/${p.stepCount} 步${p.stepKey ? '（' + escapeHtml(stepLabel(p.stepKey, p.content)) + '）' : ''}` : `第 ${p.problemNo} 題`;
      const idle = p.idleSec != null && room?.status === 'running' && p.idleSec > 90;
      return `<tr>
        <td>${escapeHtml(p.player)}</td><td>${where}</td><td>${p.problemsDone}</td><td>${p.stepsDone}</td>
        <td>${p.firstTryRate == null ? '—' : Math.round(p.firstTryRate * 100) + '%'}</td>
        <td>${p.errors}</td><td>${p.hints}</td>
        <td>${p.topKind ? escapeHtml(kindLabel(p.topKind, p.content)) + `（${p.topKindCount}）` : '—'}</td>
        <td>${p.score}</td><td class="${idle ? 'idle' : ''}">${p.idleSec == null ? '—' : p.idleSec + ' 秒'}</td></tr>`;
    }).join('') || '<tr><td colspan="10" class="muted">還沒有學生加入</td></tr>'
  }</tbody>`;
}

function exportPlayers() {
  if (!lastSummary) return;
  const rows = lastSummary.players.map((p) => ({
    房號: code, 學生: p.player, 內容: p.content, 完成題數: p.problemsDone, 完成步數: p.stepsDone,
    首次正確步數: p.firstTryOk, 首次正確率: p.firstTryRate == null ? '' : Math.round(p.firstTryRate * 100) + '%',
    檢查次數: p.checks, 錯誤次數: p.errors, 提示次數: p.hints, 分數: p.score,
    最常見誤解代碼: p.topKind || '', 最常見誤解: p.topKind ? kindLabel(p.topKind, p.content) : '', 該誤解次數: p.topKindCount,
    最近誤解代碼: p.lastErrorKind || '',
  }));
  download(`step-board-${code}-逐人摘要.csv`, toCsv(rows));
}
function exportEvents() {
  download(`step-board-${code}-逐筆事件.csv`, toCsv(eventRows(lastEvents)));
}

// ---------- 啟動 ----------
async function init() {
  be = await getBackend();
  $('#mode-badge').classList.toggle('hidden', be.mode !== 'local');
  $('#content-select').innerHTML = CONTENTS.map((c) => `<option value="${c.id}">${escapeHtml(c.title)}（${escapeHtml(c.unit)}）</option>`).join('');
  $('#create-btn').addEventListener('click', createRoom);
  $('#reopen-btn').addEventListener('click', () => openRoom($('#reopen-code').value));
  $('#start-btn').addEventListener('click', startRoom);
  $('#extend-btn').addEventListener('click', extendRoom);
  $('#end-btn').addEventListener('click', () => endRoom(false));
  $('#copy-btn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#join-link').value); toast('已複製學生連結'); }
    catch { $('#join-link').select(); toast('請手動複製'); }
  });
  $('#csv-players').addEventListener('click', exportPlayers);
  $('#csv-events').addEventListener('click', exportEvents);
  const initial = queryParam('room') || recall(GAME_ID, 'teacher-room');
  if (initial) {
    $('#reopen-code').value = initial;
    if (queryParam('room')) openRoom(initial);
  }
}
init();
