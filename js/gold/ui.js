// ui.js — tiện ích giao diện dùng chung: nhãn trạng thái thẻ, lỗi + nút Thử lại, widget TradingView.
import { fmtTime, fmtDateTime, escapeHTML } from './format.js';
import { STALE_MS } from './config.js';

export const $ = (sel, root = document) => root.querySelector(sel);

export const isDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

/**
 * Gắn trạng thái chung cho một thẻ.
 * res: kết quả từ withCache ({ data, at, cached }) hoặc null khi chưa có gì.
 * sourceTime: thời điểm dữ liệu theo nguồn (để gắn nhãn "Dữ liệu cũ").
 */
export function setStatus(card, res, { sourceTime, staleMs = STALE_MS } = {}) {
  const badge = $('[data-badge]', card);
  const at = $('[data-at]', card);
  let text = '';
  let cls = '';
  if (res?.cached) {
    text = `Dữ liệu lúc ${fmtTime(res.at)}`;
    cls = 'badge--warn';
  } else if (sourceTime && Date.now() - new Date(sourceTime).getTime() > staleMs) {
    text = 'Dữ liệu cũ';
    cls = 'badge--warn';
  }
  if (badge) {
    badge.textContent = text;
    badge.className = `badge ${cls}`;
    badge.hidden = !text;
  }
  if (at) {
    const t = sourceTime || res?.at;
    at.textContent = t ? fmtDateTime(t) : '—';
    if (t) at.dateTime = new Date(t).toISOString();
  }
  card.classList.toggle('is-cached', !!res?.cached);
}

// ---------- Màu lên/xuống theo lần thay đổi gần nhất ----------
// Nhớ giá trị trước của từng ô (lưu localStorage để tải lại trang vẫn giữ màu).
const TICK_KEY = 'gv:ticks';
let ticks = {};
try { ticks = JSON.parse(localStorage.getItem(TICK_KEY) || '{}') || {}; } catch { ticks = {}; }
let tickSaveTimer = null;
function saveTicks() {
  clearTimeout(tickSaveTimer);
  tickSaveTimer = setTimeout(() => {
    try { localStorage.setItem(TICK_KEY, JSON.stringify(ticks)); } catch { /* bỏ qua */ }
  }, 200);
}

/**
 * Bọc một giá trị hiển thị: xanh ▲ nếu lần đổi gần nhất là tăng, đỏ ▼ nếu giảm,
 * nháy nền khi vừa đổi. Chưa từng thấy đổi thì dùng fallbackDir (vd. so với hôm trước).
 */
export function tickHTML(id, value, text, fallbackDir = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return text;
  const prev = ticks[id];
  let dir = prev?.dir || 0;
  let changed = false;
  if (prev && prev.v !== value) {
    dir = value > prev.v ? 1 : -1;
    changed = true;
  }
  if (!prev || changed) { ticks[id] = { v: value, dir }; saveTicks(); }
  const d = dir || Math.sign(fallbackDir || 0);
  if (!d) return `<span class="tick">${text}</span>`;
  const cls = d > 0 ? 'up' : 'down';
  return `<span class="tick ${cls}${changed ? ` flash-${cls}` : ''}" title="${d > 0 ? 'Tăng' : 'Giảm'} so với lần cập nhật trước"><span class="tick__arrow" aria-hidden="true">${d > 0 ? '▲' : '▼'}</span>${text}</span>`;
}

export function errorHTML(key, msg = 'Chưa tải được') {
  return `<div class="error-box"><span>${escapeHTML(msg)}</span><button type="button" class="btn btn--ghost btn--sm" data-retry="${key}">Thử lại</button></div>`;
}

export function loadingHTML() {
  return '<div class="skeleton" aria-hidden="true"></div><span class="sr-only">Đang tải…</span>';
}

/**
 * Nhúng widget TradingView bằng đoạn mã chính thức (script + JSON cấu hình).
 * Nếu script không tải được (chặn quảng cáo, mất mạng) → khung thông báo kèm link.
 */
export function mountTradingView(container, widget, config, { link, label }) {
  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'tradingview-widget-container';
  const inner = document.createElement('div');
  inner.className = 'tradingview-widget-container__widget';
  wrap.appendChild(inner);

  const fallback = () => {
    container.innerHTML = `<div class="tv-fallback"><p>Không tải được widget TradingView (có thể do trình chặn quảng cáo hoặc mất mạng).</p><a href="${link}" target="_blank" rel="noopener">Xem ${escapeHTML(label)} trên TradingView ↗</a></div>`;
  };

  const s = document.createElement('script');
  s.src = `https://s3.tradingview.com/external-embedding/embed-widget-${widget}.js`;
  s.async = true;
  s.textContent = JSON.stringify(config);
  s.onerror = fallback;
  wrap.appendChild(s);
  container.appendChild(wrap);

  // Script tải được nhưng không tạo iframe sau 20 giây → coi như lỗi
  setTimeout(() => {
    if (container.contains(wrap) && !wrap.querySelector('iframe')) fallback();
  }, 20000);
}
