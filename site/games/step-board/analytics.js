// 老師端分析（純函式，可用 node 測試）：把 mg_events 整理成即時看板與 CSV
// 只用穩定代碼分群（kind、stepKey），不用帶數字的回饋文字。

const timeOf = (e) => e.payload?.t ?? (Date.parse(e.created_at) || 0);

export function summarize(events, { now = Date.now() } = {}) {
  const players = new Map();
  const kinds = new Map();
  const steps = new Map();
  const getP = (id) => {
    if (!players.has(id)) {
      players.set(id, {
        player: id, content: null, joinedAt: null, lastAt: 0, lastProgressAt: 0,
        problemsDone: 0, stepsDone: 0, checks: 0, firstTryOk: 0, errors: 0, hints: 0, score: 0,
        problemNo: 1, stepIndex: 0, stepCount: null, stepKey: null, lastErrorKind: null, kinds: new Map(),
      });
    }
    return players.get(id);
  };
  const getS = (content, key, index) => {
    const k = `${content}|${key}`;
    if (!steps.has(k)) steps.set(k, { content, stepKey: key, stepIndex: index, done: 0, totalMs: 0, maxMs: 0, errors: 0, hints: 0 });
    return steps.get(k);
  };
  const sorted = [...events].sort((a, b) => timeOf(a) - timeOf(b) || (a.id ?? 0) - (b.id ?? 0));
  const triedStep = new Set(); // 用來算「首次檢查就正確」

  for (const e of sorted) {
    const t = timeOf(e);
    const p = getP(e.player);
    const d = e.payload || {};
    p.lastAt = Math.max(p.lastAt, t);
    if (d.content) p.content = d.content;
    if (e.kind === 'join') {
      p.joinedAt ??= t;
      p.lastProgressAt = Math.max(p.lastProgressAt, t);
    } else if (e.kind === 'step_check') {
      p.checks++;
      p.problemNo = d.problemNo ?? p.problemNo;
      p.stepCount = d.stepCount ?? p.stepCount;
      p.stepKey = d.stepKey ?? p.stepKey;
      const tryKey = `${e.player}|${d.problemId}|${d.stepIndex}`;
      const first = !triedStep.has(tryKey) && d.kind !== 'incomplete';
      if (d.kind !== 'incomplete') triedStep.add(tryKey);
      const s = d.stepKey ? getS(d.content, d.stepKey, d.stepIndex) : null;
      if (d.ok) {
        p.stepsDone++;
        if (first) p.firstTryOk++;
        p.score += d.stepScore || 0;
        p.stepIndex = (d.stepIndex ?? 0) + 1;
        p.lastProgressAt = t;
        if (s) { s.done++; s.totalMs += d.ms || 0; s.maxMs = Math.max(s.maxMs, d.ms || 0); }
      } else if (d.kind && d.kind !== 'incomplete') {
        p.errors++;
        p.lastErrorKind = d.kind;
        p.kinds.set(d.kind, (p.kinds.get(d.kind) || 0) + 1);
        const kk = `${d.content}|${d.kind}`;
        kinds.set(kk, (kinds.get(kk) || 0) + 1);
        if (s) s.errors++;
        p.stepIndex = d.stepIndex ?? p.stepIndex;
      }
    } else if (e.kind === 'hint') {
      p.hints++;
      if (d.stepKey) getS(d.content || p.content, d.stepKey, d.stepIndex).hints++;
    } else if (e.kind === 'problem_done') {
      p.problemsDone++;
      p.score += d.bonus || 0;
      p.problemNo = (d.problemNo ?? p.problemsDone) + 1;
      p.stepIndex = 0;
      p.stepKey = null;
      p.lastProgressAt = t;
    }
  }

  const playerRows = [...players.values()]
    .map((p) => {
      const top = [...p.kinds.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        ...p,
        kinds: undefined,
        topKind: top ? top[0] : null,
        topKindCount: top ? top[1] : 0,
        firstTryRate: p.stepsDone ? p.firstTryOk / p.stepsDone : null,
        idleSec: p.lastProgressAt ? Math.max(0, Math.round((now - p.lastProgressAt) / 1000)) : null,
      };
    })
    .sort((a, b) => String(a.player).localeCompare(String(b.player), 'zh-Hant', { numeric: true }));

  const kindRows = [...kinds.entries()]
    .map(([k, count]) => { const [content, kind] = k.split('|'); return { content, kind, count }; })
    .sort((a, b) => b.count - a.count);

  const stepRows = [...steps.values()]
    .map((s) => ({ ...s, avgMs: s.done ? Math.round(s.totalMs / s.done) : null }))
    .sort((a, b) => (b.avgMs ?? -1) - (a.avgMs ?? -1));

  return { players: playerRows, kinds: kindRows, steps: stepRows };
}

// 逐筆事件攤平成 CSV 列
export function eventRows(events) {
  return [...events].sort((a, b) => timeOf(a) - timeOf(b)).map((e) => {
    const d = e.payload || {};
    return {
      時間: new Date(timeOf(e)).toLocaleString('zh-TW', { hour12: false }),
      房號: e.room ?? '',
      學生: e.player,
      事件: e.kind,
      內容: d.content ?? '',
      題目: d.problemId ?? '',
      第幾題: d.problemNo ?? '',
      第幾步: d.stepIndex != null ? d.stepIndex + 1 : '',
      步驟代碼: d.stepKey ?? '',
      正確: d.ok == null ? '' : d.ok ? '是' : '否',
      誤解代碼: d.ok === false ? d.kind ?? '' : '',
      錯的槽: Array.isArray(d.wrongSlots) ? d.wrongSlots.join(' ') : '',
      放法: d.placement ? JSON.stringify(d.placement) : '',
      卡槽: d.slot ?? '',
      卡片: d.card ?? '',
      動作: d.action ?? '',
      提示層級: d.hintLevel ?? d.level ?? '',
      毫秒: d.ms ?? '',
      本步得分: d.stepScore ?? '',
      整題得分: d.score ?? '',
    };
  });
}
