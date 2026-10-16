// QR Code：用 qrcode-generator（純同步、瀏覽器友善）
const SRC = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
let loading;
function load() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  loading ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = SRC; s.onload = () => res(window.qrcode); s.onerror = rej;
    document.head.appendChild(s);
  });
  return loading;
}

// 回傳 <img>，size 為像素寬
export async function qrImage(text, size = 220) {
  const qrcode = await load();
  const qr = qrcode(0, 'M');
  qr.addData(text); qr.make();
  const img = new Image();
  const cell = Math.max(2, Math.floor(size / (qr.getModuleCount() + 8)));
  img.src = qr.createDataURL(cell, cell * 4);
  img.alt = text; img.width = size; img.height = size;
  return img;
}

export function joinUrl(params) {
  const u = new URL(location.href);
  u.search = '';
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}
