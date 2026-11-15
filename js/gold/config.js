// config.js — URL nguồn, múi giờ, hằng số. Mọi nguồn ở đây đều không cần key và cho phép CORS.

export const TZ_VN = 'Asia/Ho_Chi_Minh';

export const CITIES = [
  { name: 'Hà Nội', tz: 'Asia/Ho_Chi_Minh' },
  { name: 'New York', tz: 'America/New_York' },
  { name: 'London', tz: 'Europe/London' },
  { name: 'Zurich', tz: 'Europe/Zurich' },
  { name: 'Hồng Kông', tz: 'Asia/Hong_Kong' },
  { name: 'Tokyo', tz: 'Asia/Tokyo' },
];

// Chu kỳ làm mới
export const REFRESH_MS = 10 * 1000;          // giá vàng/bạc thế giới + giá trong nước: 10 giây
export const SLOW_REFRESH_MS = 30 * 60 * 1000; // tỷ giá (currency-api) và lịch sử: 30 phút (nguồn chỉ đổi theo ngày)
export const STALE_MS = 2 * 60 * 60 * 1000;    // quá 2 giờ → gắn nhãn "Dữ liệu cũ"

// Hằng số quy đổi
export const GRAM_PER_OZ = 31.1034768;
export const GRAM_PER_LUONG = 37.5;
export const OZ_TO_LUONG = GRAM_PER_LUONG / GRAM_PER_OZ;

export const URLS = {
  goldApi: (sym) => [`https://api.gold-api.com/price/${sym}`],
  // date = 'latest' hoặc 'YYYY-MM-DD'
  currency: (date = 'latest') => [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.min.json`,
    `https://${date}.currency-api.pages.dev/v1/currencies/usd.min.json`,
  ],
  vangToday: ['https://www.vang.today/api/prices'],
  vangTodayHistory: (type, days) => [`https://www.vang.today/api/prices?type=${type}&days=${days}`],
  pnj: ['https://edge-cf-api.pnj.io/ecom-frontend/v1/get-gold-price?zone=00'],
  // Giá bạc Phú Quý: trang gốc không có CORS nên GitHub Actions (.github/workflows/phuquy.yml)
  // lấy giá định kỳ và ghi vào file này trong repo; cùng tên miền nên trình duyệt đọc được.
  phuquy: ['data/phuquy.json'],
  // Giá + thay đổi trong ngày của một mã TradingView (có CORS, không key) — dùng ở bang-gia.html
  tvQuote: (sym) => [`https://scanner.tradingview.com/symbol?symbol=${encodeURIComponent(sym)}&fields=close,change,change_abs`],
};

// Mã của vang.today → nguồn + tên hiển thị. type: sjc_bar | ring_9999 | other
export const VANG_TODAY_CODES = {
  SJL1L10: { source: 'SJC', name: 'Vàng miếng SJC', type: 'sjc_bar' },
  SJ9999: { source: 'SJC', name: 'Nhẫn SJC 9999', type: 'ring_9999' },
  DOHNL: { source: 'DOJI Hà Nội', name: 'Vàng miếng SJC', type: 'sjc_bar' },
  DOHCML: { source: 'DOJI TP.HCM', name: 'Vàng miếng SJC', type: 'sjc_bar' },
  DOJINHTV: { source: 'DOJI', name: 'Nhẫn Hưng Thịnh Vượng 9999', type: 'ring_9999' },
  BTSJC: { source: 'Bảo Tín Minh Châu', name: 'Vàng miếng SJC', type: 'sjc_bar' },
  BT9999NTT: { source: 'Bảo Tín Minh Châu', name: 'Nhẫn tròn trơn 9999', type: 'ring_9999' },
  PQHNVM: { source: 'PNJ Hà Nội', name: 'Vàng miếng SJC', type: 'sjc_bar' },
  PQHN24NTT: { source: 'PNJ Hà Nội', name: 'Nhẫn trơn 24K', type: 'ring_9999' },
  VNGSJC: { source: 'VN Gold', name: 'Vàng miếng SJC', type: 'sjc_bar' },
  VIETTINMSJC: { source: 'VietinBank Gold', name: 'Vàng miếng SJC', type: 'sjc_bar' },
};

// Mã PNJ lấy trực tiếp (giá niêm yết theo nghìn đồng/chỉ → ×10.000 ra VND/lượng)
export const PNJ_CODES = {
  SJC: { name: 'Vàng miếng SJC', type: 'sjc_bar' },
  N24K: { name: 'Nhẫn trơn PNJ 999.9', type: 'ring_9999' },
  '24K': { name: 'Nữ trang 999.9', type: 'other' },
};
export const PNJ_UNIT_TO_LUONG = 10000;

// Mã dùng cho biểu đồ lịch sử trong nước và chênh lệch với thế giới
export const HISTORY_SJC = 'SJL1L10';
export const HISTORY_RING = 'SJ9999';
export const HISTORY_DAYS = 1100;

export const TV_SYMBOLS = {
  gold: 'OANDA:XAUUSD',
  dxy: 'TVC:DXY',
  wti: 'TVC:USOIL',
};
