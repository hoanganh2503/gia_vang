// clock.js — Khối 1: giờ thế giới.
import { CITIES } from './config.js';

const fmts = CITIES.map((c) => ({
  ...c,
  time: new Intl.DateTimeFormat('vi-VN', { timeZone: c.tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
  date: new Intl.DateTimeFormat('vi-VN', { timeZone: c.tz, weekday: 'short', day: '2-digit', month: '2-digit' }),
  hour: new Intl.DateTimeFormat('en-US', { timeZone: c.tz, hour: 'numeric', hour12: false }),
}));

let nodes = [];

export function initClock(root) {
  root.innerHTML = fmts
    .map((c) => `<li class="clock"><span class="clock__city">${c.name}</span><span class="clock__time" data-t>--:--:--</span><span class="clock__date" data-d></span></li>`)
    .join('');
  nodes = [...root.children].map((li) => ({ li, t: li.querySelector('[data-t]'), d: li.querySelector('[data-d]') }));
  tickClock();
}

export function tickClock() {
  const now = new Date();
  fmts.forEach((c, i) => {
    const n = nodes[i];
    if (!n) return;
    n.t.textContent = c.time.format(now);
    n.d.textContent = c.date.format(now);
    const h = Number(c.hour.format(now)) % 24;
    n.li.classList.toggle('clock--night', h < 6 || h >= 19);
  });
}
