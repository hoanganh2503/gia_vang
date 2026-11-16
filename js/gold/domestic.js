// domestic.js — Khối 7 (biểu đồ vàng trong nước) và khối 8 (bảng giá trong nước).
import {
  URLS, VANG_TODAY_CODES, PNJ_CODES, PNJ_UNIT_TO_LUONG, HISTORY_SJC, HISTORY_RING, HISTORY_DAYS,
} from './config.js';
import { fetchJSON, withCache, loadCache, saveCache, mapLimit } from './api.js';
import {
  fmtVND, fmtVNDShort, fmtPct, fmtSigned, fmtDateTime, fmtDateISO, escapeHTML, trend, todayVN,
} from './format.js';
import { $, setStatus, errorHTML, tickHTML } from './ui.js';
import { worldVndPerLuong } from './world-gold.js';
import { loadVietnamnet, shortPlace, VN_MS } from './vietnamnet.js';

// Giá 1 lượng hợp lệ: số dương trong khoảng 10 triệu – 1 tỷ đồng
const okPrice = (n) => typeof n === 'number' && Number.isFinite(n) && n > 1e7 && n < 1e9;

// ---------- Dữ liệu ----------

async function fetchVangToday() {
  const j = await fetchJSON(URLS.vangToday, { bust: true });
  if (!j?.success || !j.prices) throw new Error('vang.today trả dữ liệu lạ');
  const items = [];
  for (const [code, p] of Object.entries(j.prices)) {
    if (p.currency !== 'VND') continue; // bỏ XAUUSD
    const meta = VANG_TODAY_CODES[code] || { source: 'Khác', name: p.name, type: 'other' };
    const buy = Number(p.buy);
    const sell = Number(p.sell);
    if (!okPrice(buy) && !okPrice(sell)) continue;
    items.push({
      code, ...meta,
      buy: okPrice(buy) ? buy : null,
      sell: okPrice(sell) ? sell : null,
      changeBuy: Number(p.change_buy) || 0,
      changeSell: Number(p.change_sell) || 0,
    });
  }
  if (!items.length) throw new Error('vang.today không có giá');
  return { items, updatedAt: j.timestamp ? j.timestamp * 1000 : null };
}

// "14/11/2026 09:10:06" (giờ VN) → epoch ms
function parseVNDate(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/.exec(s || '');
  if (!m) return null;
  return Date.parse(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] || '00'}+07:00`);
}

async function fetchPNJ() {
  const j = await fetchJSON(URLS.pnj, { bust: true });
  const rows = Array.isArray(j?.data) ? j.data : [];
  const items = [];
  for (const r of rows) {
    const meta = PNJ_CODES[r.masp];
    if (!meta) continue;
    const buy = Number(r.giamua) * PNJ_UNIT_TO_LUONG;
    const sell = Number(r.giaban) * PNJ_UNIT_TO_LUONG;
    if (!okPrice(buy) && !okPrice(sell)) continue;
    items.push({
      code: `PNJ_${r.masp}`, source: 'PNJ TP.HCM', ...meta,
      buy: okPrice(buy) ? buy : null,
      sell: okPrice(sell) ? sell : null,
      changeBuy: 0,
      changeSell: 0,
    });
  }
  if (!items.length) throw new Error('PNJ không có giá');
  return { items, updatedAt: parseVNDate(j.updateDate) };
}

// Bảng các thương hiệu (vietnamnet, giống bảng chạy ở bang-gia.html): trang nặng nên chỉ tải lại mỗi phút,
// giữa các lần thì dùng lại kết quả trước.
let vnRes = null;
let vnAt = 0;
async function loadVn() {
  if (vnRes && Date.now() - vnAt < VN_MS) return vnRes;
  vnAt = Date.now();
  try { vnRes = await withCache('gv:bg:vn', loadVietnamnet); } catch (e) { console.warn('[gia_vang] vietnamnet:', e?.message || e); }
  return vnRes;
}

// Gọi các nguồn độc lập; nguồn nào lỗi thì dùng dữ liệu đã lưu của nguồn đó.
export async function loadDomestic() {
  const [vt, pnj, vn] = await Promise.allSettled([
    withCache('dom:vt', fetchVangToday),
    withCache('dom:pnj', fetchPNJ),
    loadVn(),
  ]);
  const parts = [];
  if (vt.status === 'fulfilled') parts.push({ name: 'vang.today', ...vt.value });
  if (pnj.status === 'fulfilled') parts.push({ name: 'PNJ', ...pnj.value });
  const vnData = vn.status === 'fulfilled' && vn.value?.data?.rows?.length ? vn.value : null;
  if (!parts.length && !vnData) throw vt.reason || pnj.reason;

  const items = parts.flatMap((p) => p.data.items);
  const find = (code) => items.find((i) => i.code === code);
  const firstOf = (type) => items.find((i) => i.type === type && okPrice(i.sell));

  const sjc = find(HISTORY_SJC) || find('PNJ_SJC') || firstOf('sjc_bar');
  const ring = find(HISTORY_RING) || find('PNJ_N24K') || firstOf('ring_9999');
  return {
    data: {
      items,
      sjcSell: sjc?.sell ?? null,
      sjcLabel: sjc ? `${sjc.source}` : '',
      ringSell: ring?.sell ?? null,
      sources: parts.map((p) => ({ name: p.name, updatedAt: p.data.updatedAt, cached: p.cached, at: p.at })),
      vn: vnData ? { rows: vnData.data.rows, updated: vnData.data.updated, cached: vnData.cached } : null,
    },
    cached: vnData ? vnData.cached : parts.every((p) => p.cached),
    at: Math.max(...parts.map((p) => p.at), vnData?.at || 0),
  };
}

// Lịch sử theo ngày từ vang.today (≈ 1 năm có sẵn)
export function loadHistory() {
  return withCache('hist', async () => {
    const get = async (type) => {
      const j = await fetchJSON(URLS.vangTodayHistory(type, HISTORY_DAYS), { timeout: 15000 });
      return (j.history || [])
        .map((h) => ({ date: h.date, buy: h.prices?.[type]?.buy, sell: h.prices?.[type]?.sell }))
        .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && okPrice(r.sell));
    };
    const [sjc, ring] = await Promise.allSettled([get(HISTORY_SJC), get(HISTORY_RING)]);
    if (sjc.status === 'rejected' && ring.status === 'rejected') throw sjc.reason;
    return {
      sjc: sjc.status === 'fulfilled' ? sjc.value : [],
      ring: ring.status === 'fulfilled' ? ring.value : [],
    };
  });
}

// ---------- Khối 8: bảng ----------

const SOURCE_ORDER = ['SJC', 'PNJ TP.HCM', 'PNJ Hà Nội', 'DOJI Hà Nội', 'DOJI TP.HCM', 'DOJI', 'Bảo Tín Minh Châu'];
const TYPE_ORDER = { sjc_bar: 0, ring_9999: 1, other: 2 };

function money(n, tickId, fallbackDir = 0) {
  if (n == null) return '—';
  const html = `<span class="full">${fmtVND(n)}</span><span class="short">${fmtVNDShort(n)}</span>`;
  return tickId ? tickHTML(tickId, n, html, fallbackDir) : html;
}

export function renderDomesticTable(card, state) {
  const body = $('[data-body]', card);
  const res = state.domestic;
  if (!res) {
    body.innerHTML = errorHTML('domestic');
    setStatus(card, null);
    return;
  }
  const { items, sources, sjcSell, sjcLabel, vn } = res.data;
  const sorted = [...items].sort((a, b) => {
    const ta = TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
    if (ta) return ta;
    const sa = SOURCE_ORDER.indexOf(a.source);
    const sb = SOURCE_ORDER.indexOf(b.source);
    return (sa < 0 ? 99 : sa) - (sb < 0 ? 99 : sb);
  });

  const changeLine = (ch, txt) => (ch ? `<br><small class="change ${trend(ch).cls}">${escapeHTML(txt || fmtSigned(ch))}</small>` : '');
  // Có bảng vietnamnet thì hiện y như bảng chạy ở màn hình bảng giá: SJC liền một loạt, rồi các thương hiệu khác
  const vnRows = vn?.rows?.map((r, idx) => {
    const spread = okPrice(r.buy) && okPrice(r.sell) ? r.sell - r.buy : null;
    const tip = r.filled ? ` title="SJC không niêm yết riêng nơi này, giá chép từ dòng &quot;${escapeHTML(r.from)}&quot;"` : '';
    return `<tr${tip}>
      <td>${escapeHTML(r.brand)}</td>
      <td>${escapeHTML(shortPlace(r.name))}</td>
      <td class="num">${money(okPrice(r.buy) ? r.buy : null, `dom:v${idx}:buy`, r.changeBuy)}${changeLine(r.changeBuy, r.chBuyText)}</td>
      <td class="num">${money(okPrice(r.sell) ? r.sell : null, `dom:v${idx}:sell`, r.changeSell)}${changeLine(r.changeSell, r.chSellText)}</td>
      <td class="num">${money(spread)}</td>
    </tr>`;
  }).join('');
  const rows = vnRows || sorted.map((i) => {
    const spread = okPrice(i.buy) && okPrice(i.sell) ? i.sell - i.buy : null;
    const ch = i.changeSell ? trend(i.changeSell) : null;
    return `<tr>
      <td>${escapeHTML(i.source)}</td>
      <td>${escapeHTML(i.name)}</td>
      <td class="num">${money(i.buy, `dom:${i.code}:buy`, i.changeBuy)}</td>
      <td class="num">${money(i.sell, `dom:${i.code}:sell`, i.changeSell)}${ch ? `<br><small class="change ${ch.cls}"><span aria-hidden="true">${ch.arrow}</span> ${fmtSigned(i.changeSell)}</small>` : ''}</td>
      <td class="num">${money(spread)}</td>
    </tr>`;
  }).join('');

  const xau = state.spot?.data?.xau?.price;
  const usdvnd = state.fx?.data?.latest?.vnd;
  const world = worldVndPerLuong(xau, usdvnd);
  const gap = okPrice(sjcSell) && Number.isFinite(world) ? sjcSell - world : NaN;
  const gapT = trend(gap);

  body.innerHTML = `
    <div class="table-wrap${vnRows ? ' table-wrap--scroll' : ''}">
      <table class="table">
        <thead><tr><th scope="col">${vnRows ? 'Thương hiệu' : 'Nguồn'}</th><th scope="col">Loại vàng</th><th scope="col" class="num">Mua vào</th><th scope="col" class="num">Bán ra</th><th scope="col" class="num">Chênh lệch mua–bán</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="2">Thế giới quy đổi (không thuế, phí)</td><td class="num">—</td><td class="num">${Number.isFinite(world) ? money(world, 'world-table') : '—'}</td><td class="num">—</td></tr></tfoot>
      </table>
    </div>
    <p class="gap-line">Chênh lệch giá bán vàng miếng SJC (${escapeHTML(sjcLabel || '—')}) so với thế giới quy đổi:
      <strong class="change ${gapT.cls}">${Number.isFinite(gap) ? `<span aria-hidden="true">${gapT.arrow}</span> ${fmtSigned(gap)} đ/lượng (${fmtPct((gap / world) * 100, 1)})` : '—'}</strong></p>
    <p class="note">Đơn vị: đồng/lượng. ${vnRows ? `Bảng giá: vietnamnet${vn.updated ? ` ${escapeHTML(vn.updated)}` : ''}${vn.cached ? ' <em>(lỗi, đang hiện dữ liệu đã lưu)</em>' : ''}. SJC không niêm yết ở tỉnh nào thì giá chép từ SJC HCM. ` : ''}Giá niêm yết: ${sources.map((s) => `${escapeHTML(s.name)} ${s.updatedAt ? fmtDateTime(s.updatedAt) : '—'}${s.cached ? ' <em>(lỗi, đang hiện dữ liệu đã lưu)</em>' : ''}`).join(' · ')}</p>`;
  // Giá trong nước chỉ đổi vài lần mỗi ngày nên không gắn nhãn "cũ" theo giờ niêm yết.
  setStatus(card, res);
}

// ---------- Khối 7: biểu đồ ----------

const RANGES = { '1m': 31, '3m': 92, '1y': 366, all: Infinity };
const WORLD_STEP = { '1m': 1, '3m': 2, '1y': 7, all: 7 };
let chart = null;
let renderToken = 0;

// Giá thế giới quy đổi theo ngày, lấy từ currency-api có phiên bản theo ngày (có cả xau và vnd).
// Kết quả theo từng ngày không đổi nên lưu vĩnh viễn trong localStorage.
async function worldOnDate(date) {
  const c = loadCache(`wx:${date}`);
  if (c?.data) return c.data;
  const j = await fetchJSON(URLS.currency(date), { timeout: 10000 });
  const u = j?.usd;
  if (!(u?.xau > 0) || !(u?.vnd > 0)) return null;
  const v = worldVndPerLuong(1 / u.xau, u.vnd);
  saveCache(`wx:${date}`, v);
  return v;
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function resetChart() {
  if (chart) { chart.destroy(); chart = null; }
}

export async function renderDomesticChart(card, state, range) {
  const body = $('[data-body]', card);
  const msg = $('[data-msg]', card);
  const canvas = $('canvas', card);
  const token = ++renderToken;

  if (!window.Chart) {
    msg.textContent = 'Không tải được thư viện biểu đồ (Chart.js).';
    msg.hidden = false;
    canvas.hidden = true;
    return;
  }
  const hist = state.history?.data;
  if (!hist) {
    resetChart();
    body.querySelector('.error-box')?.remove();
    canvas.hidden = true;
    msg.hidden = true;
    body.insertAdjacentHTML('afterbegin', errorHTML('history'));
    setStatus(card, null);
    return;
  }
  body.querySelector('.error-box')?.remove();

  // Gộp theo ngày, tăng dần
  const map = new Map();
  for (const r of hist.sjc) map.set(r.date, { ...map.get(r.date), sjc: r.sell });
  for (const r of hist.ring) map.set(r.date, { ...map.get(r.date), ring: r.sell });
  // Thêm điểm hôm nay từ giá hiện tại nếu lịch sử chưa có
  const today = todayVN();
  const d = state.domestic?.data;
  if (d && !map.has(today)) map.set(today, { sjc: d.sjcSell ?? undefined, ring: d.ringSell ?? undefined });

  let dates = [...map.keys()].sort();
  const days = RANGES[range] ?? Infinity;
  if (Number.isFinite(days)) {
    const from = todayVN(-days);
    dates = dates.filter((x) => x >= from);
  }

  if (dates.length < 2) {
    resetChart();
    canvas.hidden = true;
    msg.textContent = 'Đang tích lũy dữ liệu, biểu đồ sẽ hiện sau vài ngày.';
    msg.hidden = false;
    setStatus(card, state.history);
    return;
  }
  canvas.hidden = false;
  msg.hidden = true;

  const labels = dates.map(fmtDateISO);
  const sjc = dates.map((x) => map.get(x).sjc ?? null);
  const ring = dates.map((x) => map.get(x).ring ?? null);
  const world = dates.map(() => null);

  const colors = { sjc: cssVar('--c-sjc'), ring: cssVar('--c-ring'), world: cssVar('--c-world') };
  const grid = cssVar('--border');
  const text = cssVar('--muted');

  const datasets = [
    { label: 'SJC bán ra', data: sjc, borderColor: colors.sjc, backgroundColor: colors.sjc },
    { label: 'Nhẫn 9999 bán ra', data: ring, borderColor: colors.ring, backgroundColor: colors.ring },
    { label: 'Thế giới quy đổi', data: world, borderColor: colors.world, backgroundColor: colors.world, borderDash: [5, 4] },
  ].map((ds) => ({ ...ds, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.15, spanGaps: true }));

  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets.forEach((ds, i) => { ds.data = datasets[i].data; });
    chart.update('none');
  } else {
    chart = new window.Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: text, usePointStyle: true, pointStyle: 'line' } },
          tooltip: {
            callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y == null ? '—' : fmtVND(c.parsed.y)} đ` },
          },
        },
        scales: {
          x: { ticks: { color: text, maxTicksLimit: 8, maxRotation: 0 }, grid: { color: grid } },
          y: { ticks: { color: text, callback: (v) => fmtVNDShort(v) }, grid: { color: grid } },
        },
      },
    });
  }
  setStatus(card, state.history);

  // Đường thế giới: lấy mẫu theo bước để hạn chế số request
  const step = WORLD_STEP[range] ?? 7;
  const fxDate = state.fx?.data?.latest?.date;
  const idxs = [];
  for (let i = dates.length - 1; i >= 0; i -= step) idxs.push(i);
  const live = worldVndPerLuong(state.spot?.data?.xau?.price, state.fx?.data?.latest?.vnd);
  const values = await mapLimit(idxs, 6, async (i) => {
    const date = dates[i];
    if (date === today && Number.isFinite(live)) return live;
    if (fxDate && date > fxDate) return null;
    return worldOnDate(date);
  });
  if (token !== renderToken || !chart) return;
  idxs.forEach((i, k) => { if (Number.isFinite(values[k])) world[i] = values[k]; });
  chart.data.datasets[2].data = world;
  chart.update('none');
}
