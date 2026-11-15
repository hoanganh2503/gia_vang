// world-gold.js — Khối 2 (biểu đồ nến XAUUSD) và khối 3 (quy đổi vàng thế giới sang VND).
import { URLS, OZ_TO_LUONG, TV_SYMBOLS, TZ_VN } from './config.js';
import { fetchJSON, withCache } from './api.js';
import { fmtVND, fmtNum2, fmtPct, fmtSigned, fmtDateISO, trend, isoDateUTC } from './format.js';
import { $, setStatus, errorHTML, isDark, mountTradingView, tickHTML } from './ui.js';

const valid = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;

// ---------- Dữ liệu ----------

async function goldApi(sym) {
  const j = await fetchJSON(URLS.goldApi(sym));
  if (!valid(j.price)) throw new Error(`Giá ${sym} không hợp lệ`);
  return { price: j.price, updatedAt: j.updatedAt };
}

// Giá XAU, XAG (gold-api.com) — gọi mỗi 10 giây
export function loadSpot() {
  return withCache('spot', async () => {
    const [xau, xag] = await Promise.allSettled([goldApi('XAU'), goldApi('XAG')]);
    if (xau.status === 'rejected' && xag.status === 'rejected') throw xau.reason;
    return {
      xau: xau.status === 'fulfilled' ? xau.value : null,
      xag: xag.status === 'fulfilled' ? xag.value : null,
    };
  });
}

function pickRates(j) {
  const u = j?.usd;
  if (!u || !valid(u.vnd)) throw new Error('Tỷ giá không hợp lệ');
  const keys = ['vnd', 'eur', 'jpy', 'gbp', 'cad', 'sek', 'chf', 'xau', 'xag'];
  return { date: j.date, ...Object.fromEntries(keys.map((k) => [k, u[k]])) };
}

// Tỷ giá gốc USD (currency-api) hôm nay + ngày trước đó — nguồn chỉ cập nhật theo ngày
export function loadFx() {
  return withCache('fx', async () => {
    const latest = pickRates(await fetchJSON(URLS.currency('latest')));
    let prev = null;
    try {
      const d = new Date(`${latest.date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 1);
      prev = pickRates(await fetchJSON(URLS.currency(isoDateUTC(d))));
    } catch { /* thiếu ngày trước thì bỏ qua phần thay đổi */ }
    return { latest, prev };
  });
}

// Giá thế giới quy đổi VND/lượng
export function worldVndPerLuong(xauUsd, usdvnd) {
  return valid(xauUsd) && valid(usdvnd) ? xauUsd * usdvnd * OZ_TO_LUONG : NaN;
}

// ---------- Khối 3 ----------

export function changeHTML(cur, ref, fmt = fmtNum2, refLabel = '') {
  if (!valid(cur) || !valid(ref)) return '<span class="change flat">—</span>';
  const diff = cur - ref;
  const t = trend(diff);
  return `<span class="change ${t.cls}"><span aria-hidden="true">${t.arrow}</span> ${fmtSigned(diff, fmt)} (${fmtPct((diff / ref) * 100)})${refLabel ? ` <small>${refLabel}</small>` : ''}</span>`;
}

export function renderGoldCard(card, state) {
  const body = $('[data-body]', card);
  const spot = state.spot?.data?.xau;
  const fx = state.fx?.data?.latest;

  if (!spot) {
    body.innerHTML = errorHTML('spot');
    setStatus(card, null);
    return;
  }

  const ref = valid(fx?.xau) ? 1 / fx.xau : NaN; // currency-api: usd.xau = ounce / USD
  const usdvnd = fx?.vnd;
  const perLuong = worldVndPerLuong(spot.price, usdvnd);
  const sjc = state.domestic?.data?.sjcSell;
  const gap = valid(sjc) && valid(perLuong) ? sjc - perLuong : NaN;
  const gapT = trend(gap);

  body.innerHTML = `
    <p class="metric__value">${tickHTML('xau', spot.price, fmtNum2(spot.price), spot.price - ref)} <span class="unit">USD/oz</span></p>
    ${changeHTML(spot.price, ref, fmtNum2, fx ? `so với ${fmtDateISO(fx.date)}` : '')}
    <dl class="kv">
      <div><dt>Quy đổi / lượng</dt><dd>${valid(perLuong) ? tickHTML('world', perLuong, fmtVND(perLuong), spot.price - ref) : '—'} <span class="unit">đ</span></dd></div>
      <div><dt>Quy đổi / chỉ</dt><dd>${valid(perLuong) ? tickHTML('world-chi', perLuong / 10, fmtVND(perLuong / 10), spot.price - ref) : '—'} <span class="unit">đ</span></dd></div>
      <div><dt>Tỷ giá USD/VND</dt><dd>${valid(usdvnd) ? fmtVND(usdvnd) : (state.fx ? '—' : '<button type="button" class="btn btn--ghost btn--sm" data-retry="fx">Thử lại</button>')}</dd></div>
      <div><dt>SJC bán − thế giới</dt><dd class="change ${gapT.cls}">${valid(gap) ? `<span aria-hidden="true">${gapT.arrow}</span> ${fmtSigned(gap)} (${fmtPct((gap / perLuong) * 100, 1)})` : '—'}</dd></div>
    </dl>`;
  setStatus(card, state.spot, { sourceTime: spot.updatedAt });
}

// ---------- Khối 2 ----------

export function mountGoldChart(container) {
  mountTradingView(
    container,
    'advanced-chart',
    {
      autosize: true,
      symbol: TV_SYMBOLS.gold,
      interval: '60',
      timezone: TZ_VN,
      theme: isDark() ? 'dark' : 'light',
      style: '1',
      locale: 'vi_VN',
      allow_symbol_change: true,
      calendar: false,
      support_host: 'https://www.tradingview.com',
    },
    { link: 'https://www.tradingview.com/symbols/XAUUSD/?exchange=OANDA', label: 'XAU/USD' },
  );
}
