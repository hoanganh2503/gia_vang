// markets.js — Khối 4 (DXY), 5 (dầu WTI), 6 (bạc thế giới).
import { TV_SYMBOLS } from './config.js';
import { fmtNum2, fmtDateISO } from './format.js';
import { $, setStatus, errorHTML, isDark, mountTradingView, tickHTML } from './ui.js';
import { changeHTML } from './world-gold.js';

const valid = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;

// ---------- Khối 6: bạc ----------

export function renderSilverCard(card, state) {
  const body = $('[data-body]', card);
  const xag = state.spot?.data?.xag;
  const xau = state.spot?.data?.xau;
  const fx = state.fx?.data?.latest;
  if (!xag) {
    body.innerHTML = errorHTML('spot');
    setStatus(card, null);
    return;
  }
  const ref = valid(fx?.xag) ? 1 / fx.xag : NaN;
  const ratio = valid(xau?.price) ? xau.price / xag.price : NaN;
  body.innerHTML = `
    <p class="metric__value">${tickHTML('xag', xag.price, fmtNum2(xag.price), xag.price - ref)} <span class="unit">USD/oz</span></p>
    ${changeHTML(xag.price, ref, fmtNum2, fx ? `so với ${fmtDateISO(fx.date)}` : '')}
    <dl class="kv">
      <div><dt>Tỷ lệ vàng/bạc</dt><dd>${valid(ratio) ? fmtNum2(ratio) : '—'}</dd></div>
    </dl>`;
  setStatus(card, state.spot, { sourceTime: xag.updatedAt });
}

// ---------- Khối 4: DXY tự tính ----------

export function computeDXY(r) {
  if (!r) return NaN;
  const { eur, jpy, gbp, cad, sek, chf } = r;
  if (![eur, jpy, gbp, cad, sek, chf].every(valid)) return NaN;
  const EURUSD = 1 / eur;
  const GBPUSD = 1 / gbp;
  return 50.14348112
    * EURUSD ** -0.576
    * jpy ** 0.136
    * GBPUSD ** -0.119
    * cad ** 0.091
    * sek ** 0.042
    * chf ** 0.036;
}

export function renderDxyCard(card, state) {
  const body = $('[data-body]', card);
  const fx = state.fx?.data;
  const now = computeDXY(fx?.latest);
  if (!valid(now)) {
    body.innerHTML = errorHTML('fx');
    setStatus(card, null);
    return;
  }
  const prev = computeDXY(fx.prev);
  body.innerHTML = `
    <p class="metric__value">${tickHTML('dxy', now, fmtNum2(now), now - prev)}</p>
    ${changeHTML(now, prev, fmtNum2, fx.prev ? `so với ${fmtDateISO(fx.prev.date)}` : '')}
    <p class="note">DXY tính từ tỷ giá, cập nhật theo ngày (${fmtDateISO(fx.latest.date)}).
      <a href="https://www.tradingview.com/symbols/TVC-DXY/" target="_blank" rel="noopener">Diễn biến trong ngày ↗</a></p>`;
  // currency-api là dữ liệu ngày: chỉ coi là cũ khi quá 2 ngày
  setStatus(card, state.fx, { sourceTime: `${fx.latest.date}T00:00:00Z`, staleMs: 2 * 86400000 });
}

// ---------- Khối 5: WTI ----------
// Không có nguồn giá dầu miễn phí, không key mà trình duyệt gọi được (CORS),
// nên dùng widget Single Quote của TradingView (cập nhật liên tục).

export function mountWti(container) {
  mountTradingView(
    container,
    'single-quote',
    {
      symbol: TV_SYMBOLS.wti,
      width: '100%',
      isTransparent: true,
      colorTheme: isDark() ? 'dark' : 'light',
      locale: 'vi_VN',
    },
    { link: 'https://www.tradingview.com/symbols/TVC-USOIL/', label: 'dầu WTI' },
  );
}
