// format.js — định dạng số, tiền, thời gian (kiểu Việt Nam, giờ Việt Nam).
import { TZ_VN } from './config.js';

const nfVND = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const ok = (n) => typeof n === 'number' && Number.isFinite(n);

export const fmtVND = (n) => (ok(n) ? nfVND.format(Math.round(n)) : '—');
export const fmtNum2 = (n) => (ok(n) ? nf2.format(n) : '—');
export const fmtUSD = (n) => (ok(n) ? `${nf2.format(n)} USD` : '—');

// 143.800.000 → "143,8 tr"
export const fmtVNDShort = (n) => (ok(n) ? `${nf1.format(n / 1e6)} tr` : '—');

export function fmtPct(n, digits = 2) {
  if (!ok(n)) return '—';
  return `${n > 0 ? '+' : ''}${n.toLocaleString('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export function fmtSigned(n, f = fmtVND) {
  if (!ok(n)) return '—';
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${f(Math.abs(n))}`;
}

const dtParts = new Intl.DateTimeFormat('vi-VN', {
  timeZone: TZ_VN, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', hour12: false,
});
const tParts = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ_VN, hour: '2-digit', minute: '2-digit', hour12: false });

function parts(fmt, d) {
  const o = {};
  for (const p of fmt.formatToParts(d)) o[p.type] = p.value;
  return o;
}

// "09:30 15/11/2026"
export function fmtDateTime(d) {
  const t = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(t.getTime())) return '—';
  const p = parts(dtParts, t);
  return `${p.hour}:${p.minute} ${p.day}/${p.month}/${p.year}`;
}

// "09:30"
export function fmtTime(d) {
  const t = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(t.getTime())) return '—';
  const p = parts(tParts, t);
  return `${p.hour}:${p.minute}`;
}

// "2026-11-15" → "15/11/2026"
export function fmtDateISO(s) {
  const [y, m, d] = String(s).split('-');
  return d ? `${d}/${m}/${y}` : s;
}

// Ngày hiện tại theo giờ Việt Nam, dạng YYYY-MM-DD
export function todayVN(offsetDays = 0) {
  const t = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ_VN }).format(t);
}

// Ngày theo UTC, dạng YYYY-MM-DD (currency-api đặt tên phiên bản theo ngày UTC)
export function isoDateUTC(d) {
  return d.toISOString().slice(0, 10);
}

export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Mũi tên + lớp màu cho thay đổi
export function trend(n) {
  if (!ok(n) || n === 0) return { cls: 'flat', arrow: '■' };
  return n > 0 ? { cls: 'up', arrow: '▲' } : { cls: 'down', arrow: '▼' };
}
