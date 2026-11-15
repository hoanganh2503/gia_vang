// main.js — khởi động, hẹn giờ làm mới, tạm dừng khi tab ẩn.
import { REFRESH_MS, SLOW_REFRESH_MS } from './config.js';
import { fmtDateTime } from './format.js';
import { $ } from './ui.js';
import { initClock, tickClock } from './clock.js';
import { loadSpot, loadFx, renderGoldCard, mountGoldChart } from './world-gold.js';
import { renderSilverCard, renderDxyCard, mountWti } from './markets.js';
import {
  loadDomestic, loadHistory, renderDomesticTable, renderDomesticChart, resetChart,
} from './domestic.js';

const state = { spot: null, fx: null, domestic: null, history: null };
let range = '1y';

const el = {
  updated: $('#last-updated'),
  clocks: $('#clocks'),
  gold: $('#card-gold'),
  silver: $('#card-silver'),
  dxy: $('#card-dxy'),
  wti: $('#wti-widget'),
  tvGold: $('#tv-gold'),
  table: $('#domestic-table'),
  chart: $('#domestic-chart'),
};

const loaders = { spot: loadSpot, fx: loadFx, domestic: loadDomestic, history: loadHistory };

function renderAll() {
  renderGoldCard(el.gold, state);
  renderSilverCard(el.silver, state);
  renderDxyCard(el.dxy, state);
  renderDomesticTable(el.table, state);
}

let lastOk = 0;
function markUpdated() {
  lastOk = Date.now();
  el.updated.textContent = fmtDateTime(lastOk);
  el.updated.dateTime = new Date(lastOk).toISOString();
}

// Tải song song các khóa; khối nào lỗi tự hiện lỗi của nó, giữ giá trị cũ nếu đã có.
async function refresh(keys) {
  const results = await Promise.allSettled(keys.map((k) => loaders[k]()));
  let anyFresh = false;
  results.forEach((r, i) => {
    const k = keys[i];
    if (r.status === 'fulfilled') {
      state[k] = r.value;
      if (!r.value.cached) anyFresh = true;
    } else {
      console.warn(`[gia_vang] Không tải được "${k}":`, r.reason?.message || r.reason);
    }
  });
  if (anyFresh) markUpdated();
  renderAll();
  if (keys.includes('history') || keys.includes('fx')) renderDomesticChart(el.chart, state, range);
}

// ---------- Hẹn giờ ----------
const FAST = ['spot', 'domestic'];
const SLOW = ['fx', 'history'];
let timers = [];
let lastSlow = 0;
let started = false;
let fastBusy = false;

function start() {
  stop();
  timers.push(setInterval(tickClock, 1000));
  timers.push(setInterval(() => {
    if (fastBusy) return; // lượt trước chưa xong (mạng chậm) thì bỏ lượt này
    fastBusy = true;
    refresh(FAST).finally(() => { fastBusy = false; });
  }, REFRESH_MS));
  timers.push(setInterval(() => { lastSlow = Date.now(); refresh(SLOW); }, SLOW_REFRESH_MS));
}
function stop() {
  timers.forEach(clearInterval);
  timers = [];
}

// Tạm dừng khi tab ẩn, làm mới ngay khi quay lại
document.addEventListener('visibilitychange', () => {
  if (!started) return;
  if (document.hidden) { stop(); return; }
  tickClock();
  const keys = [...FAST];
  if (Date.now() - lastSlow >= SLOW_REFRESH_MS) { lastSlow = Date.now(); keys.push(...SLOW); }
  refresh(keys);
  start();
});

// ---------- Sự kiện ----------
document.addEventListener('click', (e) => {
  const retry = e.target.closest('[data-retry]');
  if (retry) {
    retry.disabled = true;
    retry.textContent = 'Đang tải…';
    refresh([retry.dataset.retry]);
    return;
  }
  const r = e.target.closest('[data-range]');
  if (r) {
    range = r.dataset.range;
    document.querySelectorAll('[data-range]').forEach((b) => b.setAttribute('aria-pressed', String(b === r)));
    renderDomesticChart(el.chart, state, range);
  }
});

// Đổi chế độ sáng/tối: dựng lại widget TradingView và biểu đồ theo màu mới
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (!started) return;
  mountGoldChart(el.tvGold);
  mountWti(el.wti);
  resetChart();
  renderDomesticChart(el.chart, state, range);
});

// ---------- Khởi động: chỉ sau khi dashboard.js xác nhận phiên đăng nhập ----------
function init() {
  if (started) return;
  started = true;
  initClock(el.clocks);
  mountGoldChart(el.tvGold);
  mountWti(el.wti);
  lastSlow = Date.now();
  refresh([...FAST, ...SLOW]);
  start();
}

if (window.__appReady) init();
else document.addEventListener('app:ready', init, { once: true });
