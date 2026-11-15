/**
 * phuquy-fetch.mjs — Lấy bảng giá bạc Phú Quý và ghi ra file JSON (chạy bằng GitHub Actions).
 *
 * Vì sao: giabac.phuquygroup.vn không có CORS nên trình duyệt không gọi thẳng được.
 * Script này chạy trên máy chủ GitHub (không bị CORS), ghi data/phuquy.json vào repo;
 * bang-gia.html đọc file đó (cùng tên miền nên không bị chặn).
 *
 * Chạy tay: node tools/phuquy-fetch.mjs data/phuquy.json   (cần Node 18+)
 * Chỉ ghi file khi giá hoặc giờ cập nhật của Phú Quý thay đổi, để không tạo commit thừa.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const SOURCE = 'https://giabac.phuquygroup.vn';
const OUT = process.argv[2] || 'data/phuquy.json';

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

const text = (html) => decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const price = (s) => {
  const n = Number(String(s).replace(/[^\d]/g, ''));
  return n > 0 ? n : null;
};

// Mỗi <tr> có ô tên sản phẩm → { name, unit, buy, sell }
function parseTable(html) {
  const items = [];
  for (const row of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || []) {
    const cell = (cls) => {
      const m = new RegExp(`<td[^>]*class="[^"]*${cls}[^"]*"[^>]*>([\\s\\S]*?)<\\/td>`, 'i').exec(row);
      return m ? text(m[1]) : '';
    };
    const name = cell('silver-product-name');
    if (!name) continue;
    items.push({
      name,
      unit: cell('silver-unit').replace(/\s*\/\s*/g, '/'),
      buy: price(cell('silver-buy-price')),
      sell: price(cell('silver-sell-price')),
    });
  }
  return items;
}

async function get(path, type) {
  const res = await fetch(`${SOURCE}${path}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: type },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return type.includes('json') ? res.json() : res.text();
}

const [html, time] = await Promise.all([
  get('/PhuQuyPrice/SilverPricePartial', 'text/html'),
  get('/PhuQuyPrice/GetDateTimeUpdate', 'application/json').catch(() => ({})),
]);

const items = parseTable(html);
if (!items.length || !items.some((i) => i.buy || i.sell)) {
  console.error('Không đọc được bảng giá Phú Quý — giữ nguyên file cũ.');
  process.exit(1);
}

const data = { success: true, lastTime: time.lastTime || null, lastDate: time.lastDate || null, items };

let old = null;
try { old = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* chưa có file */ }
const same = old && JSON.stringify({ ...old, fetchedAt: undefined }) === JSON.stringify(data);
if (same) {
  console.log('Giá không đổi, không ghi file.');
} else {
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify({ ...data, fetchedAt: new Date().toISOString() }, null, 2)}\n`);
  console.log(`Đã ghi ${OUT}:`, items.map((i) => `${i.name}: ${i.buy ?? '—'} / ${i.sell ?? '—'}`).join(' | '));
}
