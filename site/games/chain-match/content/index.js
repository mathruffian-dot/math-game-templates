// 內容包清單：新增一個內容包後，在這裡加一行 import 並放進 PACKS。
// 網址 ?content=<id>（例 math/ratio）只接受這裡登記的 id；老師端下拉選單也讀這裡。
import ratio from './math/ratio.js';
import idiom from './chinese/idiom.js';
import affix from './english/affix.js';

export const PACKS = [ratio, idiom, affix];
export const DEFAULT_PACK = PACKS[0].id;

export const getPack = (id) => PACKS.find((p) => p.id === id) || null;

// 誤解代碼的中文說明（老師端用；找不到就顯示代碼本身）
export function kindLabel(kind, packId) {
  const p = getPack(packId);
  if (p?.misconceptions?.[kind]) return p.misconceptions[kind];
  for (const x of PACKS) if (x.misconceptions?.[kind]) return x.misconceptions[kind];
  return kind;
}
