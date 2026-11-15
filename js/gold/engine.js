// engine.js — lõi dùng chung cho dashboard.html và tuy-chinh.html:
// tải dữ liệu, hẹn giờ làm mới, tạm dừng khi tab ẩn, vẽ lại các thành phần ĐANG CÓ trên trang.
// Mỗi thành phần được tìm theo id mỗi lần vẽ, nên trang tùy chỉnh có thể thêm/bớt bất cứ lúc nào.
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
let loadedOnce = false;

const el = {
  get updated() { return $('#last-updated'); },
  get clocks() { return $('#clocks'); },
  get gold() { return $('#card-gold'); },
  get silver() { return $('#card-silver'); },
  get dxy() { return $('#card-dxy'); },
  get wti() { return $('#wti-widget'); },
  get tvGold() { return $('#tv-gold'); },
  get table() { return $('#domestic-table'); },
  get chart() { return $('#domestic-chart'); },
};

const loaders = { spot: loadSpot, fx: loadFx, domestic: loadDomestic, history: loadHistory };

function renderAll() {
  if (el.gold) renderGoldCard(el.gold, state);
  if (el.silver) renderSilverCard(el.silver, state);
  if (el.dxy) renderDxyCard(el.dxy, state);
  if (el.table) renderDomesticTable(el.table, state);
}

function renderChart() {
  if (el.chart) renderDomesticChart(el.chart, state, range);
}

function markUpdated() {
  const t = Date.now();
  const u = el.updated;
  if (!u) return;
  u.textContent = fmtDateTime(t);
  u.dateTime = new Date(t).toISOString();
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
  loadedOnce = true;
  if (anyFresh) markUpdated();
  renderAll();
  if (keys.includes('history') || keys.includes('fx')) renderChart();
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
    document.querySelectorAll('[data-range]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.range === range)));
    renderChart();
  }
});

// Đổi chế độ sáng/tối: dựng lại widget TradingView và biểu đồ theo màu mới
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (!started) return;
  if (el.tvGold) mountGoldChart(el.tvGold);
  if (el.wti) mountWti(el.wti);
  resetChart();
  renderChart();
});

// ---------- API cho trang ----------

/** Gọi sau khi một thành phần vừa được đưa vào trang (trang tùy chỉnh). */
export function mountWidget(id) {
  if (!started) return;
  switch (id) {
    case 'clock': if (el.clocks) initClock(el.clocks); break;
    case 'tv-gold': if (el.tvGold) mountGoldChart(el.tvGold); break;
    case 'wti': if (el.wti) mountWti(el.wti); break;
    case 'domestic-chart':
      resetChart();
      document.querySelectorAll('[data-range]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.range === range)));
      if (loadedOnce) renderChart();
      break;
    default: if (loadedOnce) renderAll();
  }
}

/** Gọi sau khi một thành phần bị gỡ khỏi trang. */
export function unmountWidget(id) {
  if (id === 'domestic-chart') resetChart();
}

/** Bắt đầu: vẽ những thành phần đang có, tải dữ liệu, hẹn giờ làm mới. */
export function startEngine() {
  if (started) return;
  started = true;
  if (el.clocks) initClock(el.clocks);
  if (el.tvGold) mountGoldChart(el.tvGold);
  if (el.wti) mountWti(el.wti);
  lastSlow = Date.now();
  refresh([...FAST, ...SLOW]);
  start();
}

/** Chạy fn khi trang đã xác nhận phiên đăng nhập (sự kiện app:ready). */
export function whenAppReady(fn) {
  if (window.__appReady) fn();
  else document.addEventListener('app:ready', fn, { once: true });
}
