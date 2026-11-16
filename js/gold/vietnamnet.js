// vietnamnet.js — bảng giá vàng các thương hiệu (dantocphattrien.vietnamnet.vn/gia-vang),
// dùng chung cho bảng chạy ở bang-gia.html và bảng "Giá vàng trong nước" ở trang tổng quan.
import { URLS } from './config.js';

const okPrice = (n) => typeof n === 'number' && Number.isFinite(n) && n > 1e7 && n < 1e9;

// Rút gọn tên nơi bán: (TP.) Hồ Chí Minh → HCM
export const shortPlace = (s) => s.replace(/(TP\.?\s*)?Hồ Chí Minh/gi, 'HCM');

// Trang HTML có Access-Control-Allow-Origin: *, nên đọc thẳng và lấy bảng #gv-price-body.
// Mỗi dòng: thương hiệu, loại vàng, mua (data-num), bán (data-num), mức chênh (span.t-chg), giờ cập nhật.
export const VN_MS = 60 * 1000; // trang ~120 KB nên chỉ tải lại mỗi phút

// 63 tỉnh thành cũ (trước sáp nhập 2025). SJC chỉ niêm yết vài nơi; tỉnh nào thiếu thì
// thêm dòng "Vàng SJC 1L, 10L, 1KG" chép giá từ dòng SJC có sẵn (ưu tiên TP. Hồ Chí Minh).
const OLD_PROVINCES = [
  'An Giang', 'Bà Rịa - Vũng Tàu', 'Bắc Giang', 'Bắc Kạn', 'Bạc Liêu', 'Bắc Ninh', 'Bến Tre', 'Bình Định',
  'Bình Dương', 'Bình Phước', 'Bình Thuận', 'Cà Mau', 'Cần Thơ', 'Cao Bằng', 'Đà Nẵng', 'Đắk Lắk', 'Đắk Nông',
  'Điện Biên', 'Đồng Nai', 'Đồng Tháp', 'Gia Lai', 'Hà Giang', 'Hà Nam', 'Hà Nội', 'Hà Tĩnh', 'Hải Dương',
  'Hải Phòng', 'Hậu Giang', 'Hòa Bình', 'Hưng Yên', 'Khánh Hòa', 'Kiên Giang', 'Kon Tum', 'Lai Châu', 'Lâm Đồng',
  'Lạng Sơn', 'Lào Cai', 'Long An', 'Nam Định', 'Nghệ An', 'Ninh Bình', 'Ninh Thuận', 'Phú Thọ', 'Phú Yên',
  'Quảng Bình', 'Quảng Nam', 'Quảng Ngãi', 'Quảng Ninh', 'Quảng Trị', 'Sóc Trăng', 'Sơn La', 'Tây Ninh',
  'Thái Bình', 'Thái Nguyên', 'Thanh Hóa', 'Thừa Thiên Huế', 'Tiền Giang', 'TP. Hồ Chí Minh', 'Trà Vinh',
  'Tuyên Quang', 'Vĩnh Long', 'Vĩnh Phúc', 'Yên Bái',
];
// Tên nơi bán trên bảng SJC khác tên tỉnh
const PROVINCE_ALIAS = {
  'Quảng Ninh': ['Hạ Long'], 'Đồng Nai': ['Biên Hòa'], 'Thừa Thiên Huế': ['Huế'],
  'TP. Hồ Chí Minh': ['Hồ Chí Minh', 'TPHCM'],
};
const SJC_BAR = 'Vàng SJC 1L, 10L, 1KG';
// So khớp không dấu, không phân biệt hoa thường ("Hòa" = "Hoà")
const fold = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();

function parseChange(el) {
  if (!el) return { ch: undefined, text: '' };
  const text = el.textContent.trim();
  const n = Number(text.replace(/[^\d]/g, '')) || 0;
  return { ch: el.classList.contains('down') ? -n : n, text };
}

function fillSjcProvinces(rows) {
  const sjc = rows.filter((r) => r.brand === 'SJC');
  const bars = sjc.filter((r) => fold(r.name).endsWith(fold(SJC_BAR)));
  const tpl = bars.find((r) => fold(r.name).startsWith(fold('TP. Hồ Chí Minh'))) || bars[0];
  if (!tpl) return rows;
  const has = (p) => [p, ...(PROVINCE_ALIAS[p] || [])].some((a) => sjc.some((r) => fold(r.name).startsWith(fold(a))));
  const filled = OLD_PROVINCES.filter((p) => !has(p)).map((p) => ({
    ...tpl, name: `${p} ${SJC_BAR}`, filled: true, from: tpl.name,
  }));
  // Dòng SJC: dòng thật trước, các tỉnh thêm vào nối sau
  const lastSjc = rows.lastIndexOf(sjc[sjc.length - 1]);
  return spreadBrands([...rows.slice(0, lastSjc + 1), ...filled, ...rows.slice(lastSjc + 1)]);
}

// SJC đứng liền một loạt ở đầu bảng (không bị xen thương hiệu khác vào giữa);
// các thương hiệu còn lại rải đều dọc phần sau (giữ thứ tự trong mỗi thương hiệu).
// Dòng thứ k của thương hiệu có n dòng nằm ở vị trí (k + 0,5) / n, rồi xếp theo vị trí đó.
function spreadBrands(rows) {
  const sjc = rows.filter((r) => r.brand === 'SJC');
  const groups = new Map();
  rows.filter((r) => r.brand !== 'SJC').forEach((r) => { if (!groups.has(r.brand)) groups.set(r.brand, []); groups.get(r.brand).push(r); });
  const order = [...groups.keys()];
  return [...sjc, ...[...groups.values()]
    .flatMap((g) => g.map((r, k) => ({ r, pos: (k + 0.5) / g.length, b: order.indexOf(r.brand) })))
    .sort((x, y) => x.pos - y.pos || x.b - y.b)
    .map((x) => x.r)];
}

export async function loadVietnamnet() {
  const res = await fetch(URLS.vietnamnet[0], { cache: 'no-store', signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const trs = [...doc.querySelectorAll('#gv-price-body tr')];
  if (!trs.length) throw new Error('không thấy bảng #gv-price-body');
  const rows = trs.map((tr) => {
    const td = tr.querySelectorAll('td');
    if (td.length < 4) return null;
    const num = (c) => Number(c.dataset.num) || 0;
    const b = parseChange(td[2].querySelector('.t-chg'));
    const s = parseChange(td[3].querySelector('.t-chg'));
    return {
      brand: td[0].textContent.trim(), name: td[1].textContent.trim(),
      buy: num(td[2]), sell: num(td[3]),
      changeBuy: b.ch, changeSell: s.ch, chBuyText: b.text, chSellText: s.text,
      time: td[4]?.textContent.trim() || '',
    };
  }).filter((r) => r && r.brand !== 'XAU' && (okPrice(r.buy) || okPrice(r.sell))); // XAU tính bằng USD → bỏ
  const caption = doc.querySelector('#gv-price-table caption')?.textContent.trim() || '';
  return { rows: fillSjcProvinces(rows), updated: caption.match(/Cập nhật ([^·]+)/)?.[1]?.trim() || '' };
}

