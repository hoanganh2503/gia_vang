// bang-gia.js — điểm vào của bang-gia.html (màn hình bảng giá).
// Dùng lại các hàm tải dữ liệu sẵn có; không import engine.js để tránh trùng hẹn giờ/sự kiện của dashboard.
import { REFRESH_MS, SLOW_REFRESH_MS, URLS, TZ_VN, TV_SYMBOLS } from './config.js';
import { fetchJSON, withCache } from './api.js';
import { fmtDateISO, todayVN, fmtVND, escapeHTML } from './format.js';
import { mountTradingView } from './ui.js';
import { loadSpot, loadFx, worldVndPerLuong } from './world-gold.js';
import { computeDXY } from './markets.js';
import { loadDomestic } from './domestic.js';

const $ = (id) => document.getElementById(id);
const valid = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
const okPrice = (n) => typeof n === 'number' && Number.isFinite(n) && n > 1e7 && n < 1e9;

// Loại vàng cho biểu đồ dưới (mã vang.today)
const TYPES = [
  { code: 'SJL1L10', tab: 'Miếng SJC', title: 'VÀNG MIẾNG SJC' },
  { code: 'SJ9999', tab: 'Nhẫn SJC', title: 'NHẪN SJC 9999' },
  { code: 'DOJINHTV', tab: 'Nhẫn DOJI', title: 'NHẪN DOJI HƯNG THỊNH VƯỢNG' },
  { code: 'BT9999NTT', tab: 'Nhẫn BTMC', title: 'NHẪN TRÒN TRƠN BẢO TÍN MINH CHÂU' },
];
const HIST_DAYS = 400;

// Mã TradingView: lấy giá + thay đổi trong ngày (so với phiên trước)
const TV = { xau: 'OANDA:XAUUSD', xag: 'TVC:SILVER', dxy: 'TVC:DXY', wti: 'NYMEX:CL1!' };

// Số kiểu Mỹ: 4,714.11
const nf = (d) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const NF = { 0: nf(0), 2: nf(2) };
const fmtUS = (n, d = 2) => (Number.isFinite(n) ? (NF[d] || nf(d)).format(n) : '—');
const signed = (n, d = 2) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtUS(Math.abs(n), d)}`;

const state = { spot: null, fx: null, dom: null, tv: null, vn: null, hist: {} };
let typeCode = TYPES[0].code;
let days = 7; // bắt đầu từ 7 ngày để mỗi loại vàng chạy đủ 7 → 30 → 90 ngày → 1 năm
let chart = null;

// ---------- Đồng hồ LED (giờ Việt Nam) ----------
const fTime = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ_VN, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
function tickClock() {
  const d = new Date();
  renderTickerTitle();
  // Mỗi ký tự một ô rộng cố định → khung không đổi độ rộng khi số nhảy
  $('led-time').innerHTML = [...fTime.format(d)]
    .map((ch) => `<span class="${ch === ':' ? 'c' : 'd'}">${ch}</span>`).join('');
}

// ---------- Widget TradingView ----------
// Khung nến của biểu đồ trái (mã interval của TradingView), nhớ lựa chọn trong trình duyệt này
const INTERVALS = [
  ['1', '1m'], ['5', '5m'], ['15', '15m'], ['30', '30m'], ['60', '1H'], ['240', '4H'], ['D', '1D'], ['W', '1W'], ['M', '1M'],
];
let interval = '60';
try { const v = localStorage.getItem('gv:bg:interval'); if (INTERVALS.some(([k]) => k === v)) interval = v; } catch { /* bỏ qua */ }

function renderIntervals() {
  $('tv-intervals').innerHTML = INTERVALS.map(([k, label]) =>
    `<button type="button" data-interval="${k}" aria-pressed="${k === interval}">${label}</button>`).join('');
}

function mountChart() {
  mountTradingView($('tv-chart'), 'advanced-chart', {
    autosize: true,
    symbol: TV_SYMBOLS.gold,
    interval,
    timezone: TZ_VN,
    theme: 'light',
    style: '1',
    locale: 'vi_VN',
    hide_top_toolbar: true,   // chừa góc trên trái cho đồng hồ
    hide_legend: true,
    hide_side_toolbar: true,
    hide_volume: false,
    allow_symbol_change: false,
    calendar: false,
    support_host: 'https://www.tradingview.com',
  }, { link: 'https://www.tradingview.com/symbols/XAUUSD/?exchange=OANDA', label: 'XAU/USD' });

}

// ---------- Dữ liệu ----------
// Giá + thay đổi trong ngày của các mã TradingView; mã nào lỗi thì bỏ qua mã đó
// Giá + thay đổi trong ngày của cả 4 mã TradingView trong 1 lần gọi
async function scanTv(timeout = 3000) {
  const keys = Object.keys(TV);
  const res = await fetch(URLS.tvScan[0], {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ symbols: { tickers: keys.map((k) => TV[k]) }, columns: ['close', 'change', 'change_abs'] }),
    cache: 'no-store',
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`TradingView scanner HTTP ${res.status}`);
  const j = await res.json();
  const out = {};
  for (const row of j?.data || []) {
    const k = keys.find((x) => TV[x] === row.s);
    const [close, pct, chg] = row.d || [];
    if (k && valid(close)) out[k] = { close, chg: Number(chg) || 0, pct: Number(pct) || 0 };
  }
  if (!Object.keys(out).length) throw new Error('TradingView scanner không trả dữ liệu');
  return out;
}

// Giá bạc Phú Quý (file data/phuquy.json do GitHub Actions cập nhật); dòng "BẠC MIẾNG PHÚ QUÝ 999 1 LƯỢNG"
function loadPhuQuy() {
  if (!URLS.phuquy.length) return Promise.reject(new Error('Chưa cấu hình URLS.phuquy'));
  return withCache('bg:pq', async () => {
    const j = await fetchJSON(URLS.phuquy, { bust: true });
    if (!j?.success || !Array.isArray(j.items)) throw new Error(j?.error || 'Phú Quý trả dữ liệu lạ');
    const norm = (s) => s.normalize('NFC').toUpperCase();
    const item = j.items.find((i) => /MIẾNG/.test(norm(i.name)) && /(^|\s)1 LƯỢNG($|\s|,)/.test(norm(i.name)))
      || j.items.find((i) => /LƯỢNG/.test(norm(i.unit || '')));
    if (!item) throw new Error('Không thấy dòng bạc 1 lượng');
    return { buy: item.buy, sell: item.sell, name: item.name, lastTime: j.lastTime, lastDate: j.lastDate };
  });
}

// ---------- Bảng giá các thương hiệu (dantocphattrien.vietnamnet.vn) ----------
// Trang HTML có Access-Control-Allow-Origin: *, nên đọc thẳng và lấy bảng #gv-price-body.
// Mỗi dòng: thương hiệu, loại vàng, mua (data-num), bán (data-num), mức chênh (span.t-chg), giờ cập nhật.
const VN_MS = 60 * 1000; // trang ~120 KB nên chỉ tải lại mỗi phút
let lastVn = 0;

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

async function loadVietnamnet() {
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

function loadHist(code) {
  return withCache(`bg:h:${code}`, async () => {
    const j = await fetchJSON(URLS.vangTodayHistory(code, HIST_DAYS), { timeout: 15000 });
    return (j.history || [])
      .map((h) => ({ date: h.date, buy: Number(h.prices?.[code]?.buy), sell: Number(h.prices?.[code]?.sell) }))
      .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && (okPrice(r.buy) || okPrice(r.sell)));
  });
}

async function settle(key, p) {
  try { state[key] = await p; } catch (e) { console.warn(`[bang-gia] ${key}:`, e?.message || e); }
}

// ---------- Bảng chỉ số ----------
// "▲ +7.095 (+0.18%)" — d: số chữ số thập phân của mức thay đổi tuyệt đối
function setChange(el, diff, pct, d = 2) {
  const base = el.className.replace(/ (up|down|flat)/g, '');
  if (!Number.isFinite(diff)) { el.textContent = '—'; el.className = `${base} flat`; return; }
  const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '■';
  const p = Number.isFinite(pct) ? ` (${pct > 0 ? '+' : pct < 0 ? '−' : ''}${fmtUS(Math.abs(pct))}%)` : '';
  // Dòng giá vàng xếp 2 dòng: mũi tên + mức chênh / phần trăm
  if (el.id === 'c-gold') el.innerHTML = `<span>${arrow} ${signed(diff, d)}</span><span>${p.trim()}</span>`;
  else el.textContent = `${arrow} ${signed(diff, d)}${p}`;
  el.className = `${base} ${cls}`;
  el.title = 'So với phiên trước';
}

// Ghi giá trị; nếu số hiển thị khác lần trước thì nháy 1 cái và đổi màu theo hướng
// (tăng xanh lá, giảm đỏ). Màu giữ nguyên tới lần thay đổi kế tiếp.
const lastShown = {};
const lastChangeAt = {};
// src: tên nguồn của số; đổi nguồn (vd. từ dự phòng sang TradingView) thì không tính là tăng/giảm.
function setValue(id, num, text, src = '') {
  const el = $(id);
  el.textContent = text;
  const prev = lastShown[id];
  if (!Number.isFinite(num)) return;
  lastShown[id] = { num, text, src };
  if (!prev || prev.text === text) return;
  lastChangeAt[id] = Date.now(); // dùng cho thời gian nghỉ của nhảy số giả lập
  if (prev.src !== src) { el.classList.remove('tick-up', 'tick-down', 'flash-up', 'flash-down'); return; }
  const dir = num > prev.num ? 'up' : 'down';
  el.classList.remove('tick-up', 'tick-down', 'flash-up', 'flash-down');
  void el.offsetWidth; // khởi động lại hiệu ứng nháy
  el.classList.add(`tick-${dir}`, `flash-${dir}`);
}

// Giá trực tiếp từ gold-api, mức thay đổi so với giá đóng cửa phiên trước (TradingView);
// không có TradingView thì so với tỷ giá ngày trước của currency-api.
function spotChange(price, tv, fxRef) {
  if (!valid(price)) return { diff: NaN, pct: NaN };
  const ref = tv ? tv.close - tv.chg : fxRef;
  if (!valid(ref)) return { diff: NaN, pct: NaN };
  return { diff: price - ref, pct: ((price - ref) / ref) * 100 };
}

function renderQuotes() {
  const tv = state.tv?.data || {};
  const fx = state.fx?.data?.latest;
  // Ưu tiên giá TradingView (cùng nguồn OANDA với biểu đồ nến); lỗi thì dùng gold-api
  // Giá vàng: OANDA (scanner) bám theo luồng PAXG từng giây (liveGold); dự phòng gold-api
  const xau = liveGold(tv.xau?.close) ?? state.spot?.data?.xau?.price;
  const xag = tv.xag?.close ?? state.spot?.data?.xag?.price;

  // Số chữ số thập phân theo cách TradingView hiển thị: vàng 3, DXY 3, WTI 2, bạc 5
  const xauSrc = tv.xau ? 'tv' : 'gold-api';
  setValue('v-gold', xau, fmtUS(xau, 3), xauSrc);
  const g = spotChange(xau, tv.xau, valid(fx?.xau) ? 1 / fx.xau : NaN);
  setChange($('c-gold'), g.diff, g.pct, 3);

  // jit.*: độ lệch giả lập ±0.01 (xem FAKE_TICK), về 0 mỗi khi API trả giá mới
  const perLuong = worldVndPerLuong(xau, fx?.vnd) + (valid(xau) ? jit.convert * 1e6 : 0);
  setValue('v-convert', perLuong, valid(perLuong) ? fmtUS(perLuong / 1e6) : '—', xauSrc);

  // Giá đã cộng độ lệch giả lập + mức thay đổi tính lại theo giá đóng cửa phiên trước
  const shown = (q, j) => {
    if (!q) return null;
    const ref = q.close - q.chg;
    const close = q.close + j;
    return { close, chg: close - ref, pct: valid(ref) ? ((close - ref) / ref) * 100 : NaN };
  };
  const dxy = shown(tv.dxy, jit.dxy);
  const wti = shown(tv.wti, jit.wti);

  if (dxy) {
    setValue('v-dxy', dxy.close, fmtUS(dxy.close, 3), 'tv');
    setChange($('c-dxy'), dxy.chg, dxy.pct, 3);
  } else { // dự phòng: DXY tự tính từ tỷ giá theo ngày
    const now = computeDXY(fx);
    const prev = computeDXY(state.fx?.data?.prev);
    setValue('v-dxy', now, fmtUS(now, 3), 'fx');
    const ok = valid(now) && valid(prev);
    setChange($('c-dxy'), ok ? now - prev : NaN, ok ? ((now - prev) / prev) * 100 : NaN, 3);
  }

  setValue('v-wti', wti?.close, fmtUS(wti?.close, 2));
  setChange($('c-wti'), wti ? wti.chg : NaN, wti?.pct, 2);

  const xagShown = valid(xag) ? xag + jit.xag : xag;
  setValue('v-silver', xagShown, fmtUS(xagShown, 5), tv.xag ? 'tv' : 'gold-api');
  const sv = spotChange(xagShown, tv.xag, valid(fx?.xag) ? 1 / fx.xag : NaN);
  setChange($('c-silver'), sv.diff, sv.pct, 5);

  // Bạc Phú Quý 1 lượng (VND)
  const pq = state.pq?.data;
  setValue('v-pq-buy', pq?.buy, pq?.buy ? fmtUS(pq.buy, 0) : '—');
  setValue('v-pq-sell', pq?.sell, pq?.sell ? fmtUS(pq.sell, 0) : '—');
  $('pq-label').title = !URLS.phuquy.length
    ? 'Chưa cấu hình proxy Phú Quý (URLS.phuquy trong js/gold/config.js)'
    : pq ? `Nguồn: giabac.phuquygroup.vn — ${pq.name}. Phú Quý cập nhật lúc ${pq.lastTime || '—'} ${pq.lastDate || ''}${state.pq.cached ? ' (đang hiện dữ liệu đã lưu)' : ''}`
      : 'Nguồn: giabac.phuquygroup.vn — chưa tải được';
}

// ---------- Biểu đồ giá vàng trong nước ----------
function renderTabs() {
  $('tabs-type').innerHTML = TYPES.map((t) =>
    `<button type="button" data-type="${t.code}" aria-pressed="${t.code === typeCode}">${t.tab}</button>`).join('');
  $('sjc-title').textContent = `BIỂU ĐỒ GIÁ ${TYPES.find((t) => t.code === typeCode).title}`;
  document.querySelectorAll('[data-days]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.days) === days)));
}

const fmtTr = (v) => fmtUS(v / 1e6, 1);

function renderChart() {
  const canvas = $('sjc-chart');
  const msg = $('sjc-msg');
  const show = (text) => { canvas.hidden = true; msg.textContent = text; msg.hidden = false; };

  if (!window.Chart) { show('Không tải được thư viện biểu đồ (Chart.js).'); return; }
  const res = state.hist[typeCode];
  if (!res) { show('Đang tải dữ liệu…'); return; }

  const map = new Map(res.data.map((r) => [r.date, r]));
  // Điểm "hôm nay" lấy từ giá hiện tại trong nước (vang.today + PNJ)
  const now = state.dom?.data?.items?.find((i) => i.code === typeCode);
  const today = todayVN();
  if (now && (okPrice(Number(now.buy)) || okPrice(Number(now.sell)))) {
    map.set(today, { date: today, buy: Number(now.buy), sell: Number(now.sell) });
  }
  const from = todayVN(-days);
  const rows = [...map.values()].filter((r) => r.date >= from).sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length < 2) { show('Chưa đủ dữ liệu cho khoảng thời gian này.'); return; }
  canvas.hidden = false;
  msg.hidden = true;

  const labels = rows.map((r) => fmtDateISO(r.date).slice(0, days > 90 ? 10 : 5));
  const buy = rows.map((r) => (okPrice(r.buy) ? r.buy : null));
  const sell = rows.map((r) => (okPrice(r.sell) ? r.sell : null));

  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = buy;
    chart.data.datasets[1].data = sell;
    chart.update('none');
    return;
  }
  const line = (label, data, color) => ({
    label, data, borderColor: color, backgroundColor: color, borderWidth: 2,
    pointRadius: 0, pointHoverRadius: 4, tension: 0.2, spanGaps: true,
  });
  chart = new window.Chart(canvas, {
    type: 'line',
    data: { labels, datasets: [line('Mua vào', buy, '#dc2626'), line('Bán ra', sell, '#16a34a')] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'center', labels: { usePointStyle: true, pointStyle: 'line', boxWidth: 24, color: '#1c2130' } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y == null ? '—' : fmtUS(c.parsed.y, 0)} đ/lượng` } },
      },
      scales: {
        x: { ticks: { color: '#6b7280', maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } },
        y: {
          position: 'left',
          title: { display: true, text: 'triệu đ/lượng', color: '#6b7280' },
          ticks: { color: '#6b7280', callback: (v) => fmtTr(v) },
          grid: { color: '#eef0f3' },
        },
      },
    },
  });
}

async function ensureHist(code, force = false) {
  if (!force && state.hist[code]) return;
  try { state.hist[code] = await loadHist(code); } catch (e) { console.warn('[bang-gia] lịch sử:', e?.message || e); }
}

// ---------- Bảng giá trong nước tự cuộn (khối dưới) ----------
const TYPE_ORDER = { sjc_bar: 0, ring_9999: 1, other: 2 };
const SOURCE_ORDER = ['SJC', 'PNJ TP.HCM', 'PNJ Hà Nội', 'DOJI Hà Nội', 'DOJI TP.HCM', 'DOJI', 'Bảo Tín Minh Châu'];
const VISIBLE_ROWS = 4;
const SECONDS_PER_ROW = 2; // nhanh gấp 1,5 lần so với 3 giây/dòng trước đây
let tickerKeys = '';

const vnd = (n) => (okPrice(n) ? fmtVND(n) : '—');
const gapOf = (i) => (okPrice(i.buy) && okPrice(i.sell) ? i.sell - i.buy : NaN);
const gapText = (g) => (Number.isFinite(g) ? `${fmtVND(g / 1000)}K` : '—');
const chText = (ch) => (!Number.isFinite(ch) ? '' : ch > 0 ? `▲ +${fmtVND(ch)}` : ch < 0 ? `▼ ${fmtVND(-ch)}` : '▲ +0');

// Dòng của bảng chạy: ưu tiên bảng vietnamnet (đủ thương hiệu); lỗi thì dùng giá vang.today như trước.
// Mỗi dòng: { key, name, title, buy, sell, changeBuy, changeSell, chBuyText, chSellText }
function tickerRows() {
  const vn = state.vn?.data?.rows;
  if (vn?.length) {
    return vn.map((r, idx) => ({
      ...r,
      key: `v${idx}`,
      name: `${r.brand} ${r.name}`.toUpperCase(),
      brandLabel: r.brand.toUpperCase(), rest: r.name.toUpperCase(),
      title: `${r.brand} — ${r.name}${r.time ? ` · cập nhật ${r.time}` : ''}`
        + (r.filled ? ` · SJC không niêm yết riêng nơi này, giá chép từ dòng "${r.from}"` : ''),
    }));
  }
  const items = state.dom?.data?.items || [];
  return [...items]
    .filter((i) => okPrice(i.buy) || okPrice(i.sell))
    .sort((a, b) => (TYPE_ORDER[a.type] - TYPE_ORDER[b.type])
      || ((SOURCE_ORDER.indexOf(a.source) + 1 || 99) - (SOURCE_ORDER.indexOf(b.source) + 1 || 99)))
    .map((i) => {
      // Tên + nơi bán, bỏ phần trùng (vd. "Vàng miếng SJC" của SJC → không thêm "SJC" lần nữa)
      const name = (i.name.toUpperCase().includes(i.source.toUpperCase()) ? i.name : `${i.name} ${i.source}`).toUpperCase();
      return { ...i, key: i.code, name, title: name, chBuyText: chText(i.changeBuy), chSellText: chText(i.changeSell) };
    });
}

// Giá tô màu theo mức chênh; mức chênh (▲ +x / ▼ x) hiện ngay bên phải giá
const dayCls = (ch) => (ch > 0 ? 'day-up' : ch < 0 ? 'day-down' : '');
const chgCls = (ch) => (ch > 0 ? 'up' : ch < 0 ? 'down' : 'flat');
const dayTitle = (ch) => (Number.isFinite(ch) && ch ? `Chênh lệch: ${ch > 0 ? '+' : '−'}${fmtVND(Math.abs(ch))} đ` : 'Không đổi');

function priceCell(key, n, ch, chTxt) {
  return `<span class="t-num ${dayCls(ch)}" data-k="${key}" data-v="${okPrice(n) ? n : ''}" title="${dayTitle(ch)}">`
    + `<b class="t-p">${vnd(n)}</b>`
    + (okPrice(n) && chTxt ? `<small class="t-chg ${chgCls(ch)}">${escapeHTML(chTxt)}</small>` : '')
    + '</span>';
}

function rowHTML(i, idx) {
  const g = gapOf(i);
  return `<div class="t-row${idx % 2 ? ' is-alt' : ''}">
    <span class="t-name" title="${escapeHTML(i.title)}"><span>${i.brandLabel
      ? `<b class="t-brand">${escapeHTML(i.brandLabel)}</b>${escapeHTML(i.rest)}`
      : escapeHTML(i.name)}</span></span>
    ${priceCell(`${i.key}:buy`, i.buy, i.changeBuy, i.chBuyText)}
    ${priceCell(`${i.key}:sell`, i.sell, i.changeSell, i.chSellText)}
    <span class="t-num" data-k="${i.key}:gap" data-v="${Number.isFinite(g) ? g : ''}"><b class="t-p">${gapText(g)}</b></span>
  </div>`;
}

// Cập nhật số tại chỗ (cả 2 bản sao của dòng trong vòng cuộn); nháy + đổi màu khi giá đổi
function updateCell(key, num, ch, chTxt) {
  const isGap = key.endsWith(':gap');
  const text = isGap ? gapText(num) : vnd(num);
  document.querySelectorAll(`[data-k="${key}"]`).forEach((el) => {
    if (!isGap) {
      el.classList.remove('day-up', 'day-down');
      if (dayCls(ch)) el.classList.add(dayCls(ch));
      el.title = dayTitle(ch);
      let c = el.querySelector('.t-chg');
      if (okPrice(num) && chTxt) {
        if (!c) { c = document.createElement('small'); el.append(c); }
        c.className = `t-chg ${chgCls(ch)}`;
        if (c.textContent !== chTxt) c.textContent = chTxt;
      } else c?.remove();
    }
    const p = el.querySelector('.t-p');
    if (p.textContent === text) return;
    const prev = Number(el.dataset.v);
    p.textContent = text;
    el.dataset.v = Number.isFinite(num) ? num : '';
    if (!el.dataset.v || !Number.isFinite(prev) || prev === num) return;
    const dir = num > prev ? 'up' : 'down';
    el.classList.remove('tick-up', 'tick-down', 'flash-up', 'flash-down');
    void el.offsetWidth;
    el.classList.add(`tick-${dir}`, `flash-${dir}`);
  });
}

function renderTicker() {
  const body = $('ticker-body');
  const rows = tickerRows();
  const vn = state.vn?.data;
  $('ticker-title').title = vn?.rows?.length
    ? `Nguồn: dantocphattrien.vietnamnet.vn/gia-vang${vn.updated ? ` — cập nhật ${vn.updated}` : ''}${state.vn.cached ? ' (đang hiện dữ liệu đã lưu)' : ''}`
    : 'Nguồn: vang.today / PNJ (chưa tải được bảng vietnamnet)';
  if (!rows.length) {
    if (!state.dom && !state.vn) body.innerHTML = '<p class="t-msg">Đang tải giá trong nước…</p>';
    tickerKeys = '';
    return;
  }
  const keys = rows.map((i) => `${i.key}=${i.name}`).join('|');
  if (keys === tickerKeys) {
    // Cùng danh sách: chỉ cập nhật số, không dựng lại để vòng cuộn không bị giật
    for (const i of rows) {
      updateCell(`${i.key}:buy`, i.buy, i.changeBuy, i.chBuyText);
      updateCell(`${i.key}:sell`, i.sell, i.changeSell, i.chSellText);
      updateCell(`${i.key}:gap`, gapOf(i));
    }
    return;
  }
  tickerKeys = keys;
  const list = rows.map((r, idx) => rowHTML(r, idx)).join('');
  const loop = rows.length > VISIBLE_ROWS;
  // Lặp vòng: 2 bản sao nối nhau, cuộn đúng 1 bản (−50%) rồi quay về đầu, không thấy chỗ nối
  body.innerHTML = `<div class="t-track${loop ? ' is-loop' : ''}" style="--dur:${rows.length * SECONDS_PER_ROW}s">${list}${loop ? list : ''}</div>`;
}

// Tiêu đề: GIÁ VÀNG SÁNG NAY / CHIỀU NAY / TỐI NAY dd/mm/yyyy (giờ Việt Nam)
const fHour = new Intl.DateTimeFormat('en-GB', { timeZone: TZ_VN, hour: '2-digit', hour12: false });
const fDay = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ_VN, day: '2-digit', month: '2-digit', year: 'numeric' });
function renderTickerTitle() {
  const d = new Date();
  const h = Number(fHour.format(d)) % 24;
  const part = h < 12 ? 'SÁNG NAY' : h < 18 ? 'CHIỀU NAY' : 'TỐI NAY';
  const t = `GIÁ VÀNG ${part} ${fDay.format(d)}`;
  const el = $('ticker-title');
  if (el.textContent !== t) el.textContent = t;
}

// ---------- Hẹn giờ ----------
let timers = [];
let fastBusy = false;
let lastSlow = 0;

async function refreshFast() {
  if (fastBusy) return;
  fastBusy = true;
  const vnDue = Date.now() - lastVn >= VN_MS;
  if (vnDue) lastVn = Date.now();
  await Promise.all([
    settle('spot', loadSpot()), settle('dom', loadDomestic()),
    URLS.phuquy.length && settle('pq', loadPhuQuy()),
    vnDue && settle('vn', withCache('gv:bg:vn', loadVietnamnet)),
  ]);
  fastBusy = false;
  renderQuotes();
  renderChart();
  renderTicker();
}
async function refreshSlow() {
  lastSlow = Date.now();
  await Promise.all([settle('fx', loadFx()), ensureHist(typeCode, true)]);
  renderQuotes();
  renderChart();
}

// ---------- Nhảy số giả lập ----------
// Cứ 0,5–1 giây, tối đa 1 trong các dòng Quy đổi, DXY, WTI, Bạc thế giới lệch ±0.01 quanh giá thật
// (hoặc trở về giá thật) cho có cảm giác nhảy số. Mỗi dòng nghỉ ≥ 3 giây giữa 2 lần đổi số; độ lệch không quá 0.01.
// Đây là số KHÔNG có thật — đặt FAKE_TICK = false để tắt. (Giá vàng không giả lập: đi theo biểu đồ nến.)
const FAKE_TICK = true;
const jit = { convert: 0, dxy: 0, wti: 0, xag: 0 };
const JIT_ID = { convert: 'v-convert', dxy: 'v-dxy', wti: 'v-wti', xag: 'v-silver' };
const JIT_REST_MS = 3000; // dòng vừa đổi số (thật hay giả) phải nghỉ ít nhất 3 giây
let jitTimer = null;
function scheduleJitter() {
  clearTimeout(jitTimer);
  if (!FAKE_TICK) return;
  jitTimer = setTimeout(() => {
    // Mỗi lượt tối đa 1 dòng nhảy, chỉ chọn trong các dòng đã nghỉ đủ lâu.
    // Dòng đang lệch thì lượt của nó đưa về giá thật; dòng đang đúng giá thì lệch ±0.01.
    const now = Date.now();
    const ready = Object.keys(jit).filter((k) => now - (lastChangeAt[JIT_ID[k]] || 0) >= JIT_REST_MS);
    if (ready.length) {
      const k = ready[Math.floor(Math.random() * ready.length)];
      jit[k] = jit[k] !== 0 ? 0 : (Math.random() < 0.5 ? -0.01 : 0.01);
      renderQuotes();
    }
    scheduleJitter();
  }, 500 + Math.random() * 500);
}

// Bảng chỉ số (vàng, quy đổi, DXY, WTI, bạc) cập nhật mỗi 1 giây: 1 lần gọi lấy cả 4 mã.
// Lượt nào lỗi thì giữ số cũ, lượt sau thử lại.
const LIVE_MS = 1000;
let liveBusy = false;
async function refreshLive() {
  if (liveBusy) return;
  liveBusy = true;
  try {
    const data = await scanTv();
    updateBasis(data.xau?.close);
    state.tv = { data: { ...(state.tv?.data || {}), ...data }, at: Date.now(), cached: false };
    renderQuotes();
  } catch { /* lượt sau thử lại */ } finally {
    liveBusy = false;
  }
}

// Biểu đồ trong nước tự chuyển sau mỗi ROTATE_MS: 7 → 30 → 90 ngày → 1 năm, rồi sang loại vàng kế tiếp, lặp vòng.
// Bấm tab thì đếm lại từ lựa chọn đó.
const DAY_STEPS = [7, 30, 90, 365];
const ROTATE_MS = 30 * 1000; // 30 giây/lần
// Cách chạy: một nhịp 1 giây riêng (không bị start()/stop() hủy) so giờ hiện tại với mốc rotateAt,
// quá mốc thì chuyển và đặt mốc mới. Lỗi khi vẽ biểu đồ hay tải dữ liệu không làm dừng việc chuyển tab.
let rotateAt = Infinity; // đặt mốc khi boot()
function restartRotate() { rotateAt = Date.now() + ROTATE_MS; }
function nextChart() {
  const di = DAY_STEPS.indexOf(Number(days));
  if (di >= 0 && di < DAY_STEPS.length - 1) return [typeCode, DAY_STEPS[di + 1]];
  const ti = TYPES.findIndex((t) => t.code === typeCode);
  return [TYPES[(ti + 1) % TYPES.length].code, DAY_STEPS[0]];
}
function rotateTick() {
  if (document.hidden || Date.now() < rotateAt) return;
  rotateAt = Date.now() + ROTATE_MS;
  const [code, d] = nextChart();
  selectChart(code, d).catch((e) => console.warn('[bang-gia] chuyển biểu đồ lỗi:', e));
}
setInterval(() => { try { rotateTick(); } catch (e) { console.warn('[bang-gia] rotateTick:', e); } }, 1000);

async function selectChart(code, d) {
  typeCode = code;
  days = d;
  renderTabs();
  try { renderChart(); } catch (e) { console.warn('[bang-gia] vẽ biểu đồ lỗi:', e); }
  if (!state.hist[code]) {
    await ensureHist(code);
    if (typeCode === code) renderChart();
  }
}

function start() {
  stop();
  timers.push(setInterval(tickClock, 1000));
  timers.push(setInterval(refreshLive, LIVE_MS));
  scheduleJitter();
  timers.push(setInterval(refreshFast, REFRESH_MS));
  timers.push(setInterval(refreshSlow, SLOW_REFRESH_MS));
}
function stop() { timers.forEach(clearInterval); timers = []; clearTimeout(jitTimer); }

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stop(); return; }
  tickClock();
  restartRotate();
  refreshFast();
  if (Date.now() - lastSlow >= SLOW_REFRESH_MS) refreshSlow();
  start();
});

document.addEventListener('click', async (e) => {
  const iv = e.target.closest('[data-interval]');
  if (iv) {
    if (iv.dataset.interval === interval) return;
    interval = iv.dataset.interval;
    try { localStorage.setItem('gv:bg:interval', interval); } catch { /* bỏ qua */ }
    renderIntervals();
    mountChart();
    return;
  }
  const t = e.target.closest('[data-type]');
  if (t) { selectChart(t.dataset.type, days); restartRotate(); return; }
  const d = e.target.closest('[data-days]');
  if (d) { selectChart(typeCode, Number(d.dataset.days)); restartRotate(); }
});

// ---------- Giá vàng theo thời gian thực ----------
// TradingView scanner chỉ đổi giá OANDA:XAUUSD sau 10–30 giây, còn biểu đồ nến nhận giá liên tục
// (luồng này TradingView không cho trang ngoài kết nối). Vì vậy giá vàng hiển thị =
//   giá giữa PAXG/USDT của Binance (websocket, đổi ~10 lần/giây) + độ chênh (basis).
// Mỗi khi scanner trả giá OANDA mới, basis được đặt lại = OANDA − PAXG lúc đó, nên số luôn bám OANDA
// và được chỉnh về đúng giá OANDA mỗi lần API cập nhật. Mất luồng Binance thì dùng thẳng giá scanner.
const PAXG_WS = 'wss://stream.binance.com:9443/ws/paxgusdt@bookTicker';
const PAXG_STALE_MS = 15000;
const GOLD_RENDER_MS = 500; // vẽ lại tối đa 2 lần/giây cho dễ nhìn
let paxgMid = NaN;
let paxgAt = 0;
let basis = NaN;
let lastScanXau = NaN;
let paxgRetry = 1000;
let goldRenderPending = false;

function connectPaxg() {
  let ws;
  try { ws = new WebSocket(PAXG_WS); } catch { return; }
  ws.onopen = () => { paxgRetry = 1000; };
  ws.onmessage = (e) => {
    let j;
    try { j = JSON.parse(e.data); } catch { return; }
    const mid = (Number(j.b) + Number(j.a)) / 2;
    if (!valid(mid)) return;
    paxgMid = mid;
    paxgAt = Date.now();
    if (!valid(basis) && valid(lastScanXau)) basis = lastScanXau - mid;
    if (!goldRenderPending) {
      goldRenderPending = true;
      setTimeout(() => { goldRenderPending = false; renderQuotes(); }, GOLD_RENDER_MS);
    }
  };
  ws.onclose = () => {
    setTimeout(connectPaxg, paxgRetry);
    paxgRetry = Math.min(paxgRetry * 2, 30000);
  };
}

// Scanner trả giá OANDA mới → đặt lại độ chênh theo giá PAXG hiện tại
function updateBasis(scanXau) {
  if (!valid(scanXau) || scanXau === lastScanXau) return;
  lastScanXau = scanXau;
  if (valid(paxgMid) && Date.now() - paxgAt < PAXG_STALE_MS) basis = scanXau - paxgMid;
}

function liveGold(scanXau) {
  if (valid(paxgMid) && valid(basis) && Date.now() - paxgAt < PAXG_STALE_MS) return paxgMid + basis;
  return scanXau;
}

function boot() {
  restartRotate();
  connectPaxg();
  tickClock();
  renderTabs();
  renderIntervals();
  mountChart();
  refreshLive();
  refreshFast();
  refreshSlow();
  start();
}

if (window.__appReady) boot();
else document.addEventListener('app:ready', boot, { once: true });
