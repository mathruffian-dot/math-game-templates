// 內容清單：新增一個 content 檔後，在這裡加一行 import 並放進 CONTENTS。
// 網址 ?content=<id> 只接受這裡登記的 id。
import linearEquation from './linear-equation.js';
import proportion from './proportion.js';
import polyDivision from './poly-division.js';

export const CONTENTS = [linearEquation, proportion, polyDivision];
export const DEFAULT_CONTENT = CONTENTS[0].id;

export const getContent = (id) => CONTENTS.find((c) => c.id === id) || null;

// 誤解代碼與步驟代碼的中文名稱（老師端用；找不到就顯示代碼本身）
export function kindLabel(kind, contentId) {
  const c = getContent(contentId);
  if (c?.kinds?.[kind]) return c.kinds[kind];
  for (const x of CONTENTS) if (x.kinds?.[kind]) return x.kinds[kind];
  return kind === 'other' ? '其他（未歸類）' : kind;
}
export const stepLabel = (key, contentId) => getContent(contentId)?.stepLabels?.[key] || key;
