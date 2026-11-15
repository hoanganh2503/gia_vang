// builder.js — trang tùy chỉnh (tuy-chinh.html): tự chọn thành phần, kéo thả, chỉnh kích thước.
// Hoàn toàn độc lập với dashboard.html; chỉ dùng chung lõi dữ liệu (engine.js).
// Bố cục lưu trong localStorage "gv:builder" của trình duyệt đang dùng.
import { startEngine, mountWidget, unmountWidget, whenAppReady } from './engine.js';

const STORE_KEY = 'gv:builder';
const SORTABLE_URL = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js';

const SRC = {
  goldApi: '<a href="https://gold-api.com" target="_blank" rel="noopener">gold-api.com</a>',
  currency: '<a href="https://github.com/fawazahmed0/exchange-api" target="_blank" rel="noopener">currency-api</a>',
  vangToday: '<a href="https://www.vang.today" target="_blank" rel="noopener">vang.today</a>',
  pnj: '<a href="https://giavang.pnj.com.vn" target="_blank" rel="noopener">PNJ</a>',
};

// Mọi thành phần có trên dashboard. Markup giống dashboard để engine.js vẽ được.
const COMPONENTS = {
  clock: {
    title: 'Giờ thế giới', desc: 'Hà Nội, New York, London, Zurich, Hồng Kông, Tokyo', w: 6,
    html: `<div class="card">
      <header class="card__head"><h2>Giờ thế giới</h2></header>
      <ul id="clocks" class="clocks clocks--card"></ul>
    </div>`,
  },
  gold: {
    title: 'Vàng thế giới (XAU)', desc: 'USD/oz, quy đổi VND/lượng, chênh lệch SJC', w: 3,
    html: `<article id="card-gold" class="card metric">
      <header class="card__head"><h2>Vàng thế giới (XAU)</h2><span class="badge" data-badge hidden></span></header>
      <div data-body><div class="skeleton"></div></div>
      <footer class="card__foot">Nguồn: ${SRC.goldApi}, ${SRC.currency} · <time data-at>—</time></footer>
    </article>`,
  },
  silver: {
    title: 'Bạc thế giới (XAG)', desc: 'USD/oz, tỷ lệ vàng/bạc', w: 3,
    html: `<article id="card-silver" class="card metric">
      <header class="card__head"><h2>Bạc thế giới (XAG)</h2><span class="badge" data-badge hidden></span></header>
      <div data-body><div class="skeleton"></div></div>
      <footer class="card__foot">Nguồn: ${SRC.goldApi} · <time data-at>—</time></footer>
    </article>`,
  },
  dxy: {
    title: 'Chỉ số DXY', desc: 'Tự tính từ tỷ giá, theo ngày', w: 3,
    html: `<article id="card-dxy" class="card metric">
      <header class="card__head"><h2>Chỉ số DXY</h2><span class="badge" data-badge hidden></span></header>
      <div data-body><div class="skeleton"></div></div>
      <footer class="card__foot">Nguồn: tự tính từ ${SRC.currency} · <time data-at>—</time></footer>
    </article>`,
  },
  wti: {
    title: 'Dầu WTI', desc: 'Widget TradingView TVC:USOIL', w: 3,
    html: `<article class="card metric">
      <header class="card__head"><h2>Dầu WTI</h2></header>
      <div id="wti-widget" class="wti-widget"></div>
      <footer class="card__foot">Nguồn: <a href="https://www.tradingview.com/symbols/TVC-USOIL/" target="_blank" rel="noopener">TradingView TVC:USOIL</a> · trực tiếp</footer>
    </article>`,
  },
  'domestic-table': {
    title: 'Giá vàng trong nước', desc: 'Bảng SJC, DOJI, PNJ, Bảo Tín Minh Châu…', w: 12,
    html: `<div id="domestic-table" class="card">
      <header class="card__head"><h2>Giá vàng trong nước</h2><span class="badge" data-badge hidden></span></header>
      <div data-body><div class="skeleton skeleton--tall"></div></div>
      <footer class="card__foot">Nguồn: ${SRC.vangToday}, ${SRC.pnj} · tải lúc <time data-at>—</time></footer>
    </div>`,
  },
  'tv-gold': {
    title: 'Biểu đồ nến XAU/USD', desc: 'TradingView, khung 1 giờ', w: 12, height: true,
    html: `<div class="card tv-card"><div id="tv-gold" class="tv-chart"></div></div>`,
  },
  'domestic-chart': {
    title: 'Diễn biến trong nước', desc: 'SJC, nhẫn 9999, thế giới quy đổi theo ngày', w: 12, height: true,
    html: `<div id="domestic-chart" class="card">
      <header class="card__head">
        <h2 class="h-sm">Giá bán trong nước và thế giới quy đổi</h2>
        <span class="badge" data-badge hidden></span>
        <div class="seg" role="group" aria-label="Khoảng thời gian">
          <button type="button" data-range="1m" aria-pressed="false">1 tháng</button>
          <button type="button" data-range="3m" aria-pressed="false">3 tháng</button>
          <button type="button" data-range="1y" aria-pressed="true">1 năm</button>
          <button type="button" data-range="all" aria-pressed="false">Tất cả</button>
        </div>
      </header>
      <div data-body class="chart-box">
        <p data-msg class="chart-msg" hidden></p>
        <canvas aria-label="Biểu đồ giá bán SJC, nhẫn 9999 và giá thế giới quy đổi theo ngày" role="img"></canvas>
      </div>
      <footer class="card__foot">Đơn vị: đồng/lượng. Nguồn: ${SRC.vangToday}, thế giới quy đổi từ currency-api · <time data-at>—</time></footer>
    </div>`,
  },
};

const WIDTHS = [[3, '1/4'], [4, '1/3'], [6, '1/2'], [8, '2/3'], [9, '3/4'], [12, 'Toàn bộ']];
const HEIGHTS = [['', 'Cao mặc định'], ['320', 'Thấp'], ['450', 'Vừa'], ['600', 'Cao'], ['800', 'Rất cao']];

const $ = (s, r = document) => r.querySelector(s);
const canvas = () => $('#canvas');
const toast = (msg, type) => { try { App.toast(msg, type); } catch { /* bỏ qua */ } };

let cfg = { mode: 'edit', items: [] };
let sortables = [];

// ---------- Lưu / đọc ----------

function normalize(raw) {
  const okW = new Set(WIDTHS.map(([w]) => w));
  const okH = new Set(HEIGHTS.map(([h]) => h).filter(Boolean));
  const seen = new Set();
  const items = [];
  for (const it of Array.isArray(raw?.items) ? raw.items : []) {
    const c = COMPONENTS[it?.id];
    if (!c || seen.has(it.id)) continue;
    seen.add(it.id);
    items.push({
      id: it.id,
      w: okW.has(Number(it.w)) ? Number(it.w) : c.w,
      ...(c.height && okH.has(String(it.h)) ? { h: String(it.h) } : {}),
    });
  }
  return { mode: raw?.mode === 'view' ? 'view' : 'edit', items };
}

function load() {
  try { cfg = normalize(JSON.parse(localStorage.getItem(STORE_KEY) || 'null')); } catch { cfg = normalize(null); }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch { /* bỏ qua */ }
}

// ---------- Thành phần trên khung ----------

function opts(list, cur) {
  return list.map(([v, l]) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${l}</option>`).join('');
}

function makeWidget(item) {
  const c = COMPONENTS[item.id];
  const box = document.createElement('div');
  box.className = 'bw';
  box.dataset.id = item.id;
  box.dataset.w = String(item.w);
  if (item.h) box.style.setProperty('--wh', `${item.h}px`);
  box.innerHTML = `
    <div class="bw__bar">
      <button type="button" class="bw__handle" aria-label="Kéo để di chuyển ${c.title}" title="Kéo để di chuyển">⠿</button>
      <span class="bw__name">${c.title}</span>
      <select data-act="w" aria-label="Độ rộng" title="Độ rộng">${opts(WIDTHS, item.w)}</select>
      ${c.height ? `<select data-act="h" aria-label="Chiều cao" title="Chiều cao">${opts(HEIGHTS, item.h || '')}</select>` : ''}
      <button type="button" class="bw__remove" data-act="remove" aria-label="Gỡ ${c.title}" title="Gỡ khỏi trang">✕</button>
    </div>
    ${c.html}`;
  return box;
}

function addWidget(id, index = cfg.items.length) {
  if (!COMPONENTS[id] || cfg.items.some((x) => x.id === id)) return;
  const item = { id, w: COMPONENTS[id].w };
  cfg.items.splice(index, 0, item);
  const box = makeWidget(item);
  canvas().insertBefore(box, canvas().children[index] || null);
  save();
  renderPalette();
  mountWidget(id);
}

function removeWidget(id) {
  cfg.items = cfg.items.filter((x) => x.id !== id);
  canvas().querySelector(`.bw[data-id="${id}"]`)?.remove();
  unmountWidget(id);
  save();
  renderPalette();
}

function readOrder() {
  const order = [...canvas().querySelectorAll(':scope > .bw')].map((b) => b.dataset.id);
  cfg.items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  save();
}

function buildCanvas() {
  canvas().innerHTML = '';
  for (const it of cfg.items) canvas().appendChild(makeWidget(it));
}

// ---------- Danh sách thành phần ----------

function renderPalette() {
  const used = new Set(cfg.items.map((x) => x.id));
  $('#palette').innerHTML = Object.entries(COMPONENTS).map(([id, c]) => `
    <li class="pal-item${used.has(id) ? ' is-used' : ''}" data-add="${id}">
      <span class="pal-item__grip" aria-hidden="true">⠿</span>
      <span class="pal-item__text"><strong>${c.title}</strong><small>${c.desc}</small></span>
      <button type="button" class="btn btn--ghost btn--sm" data-add-btn="${id}" ${used.has(id) ? 'disabled aria-label="Đã có trên trang"' : `aria-label="Thêm ${c.title}"`}>${used.has(id) ? '✓' : '+'}</button>
    </li>`).join('');
  $('#palette-count').textContent = `${used.size}/${Object.keys(COMPONENTS).length}`;
}

// ---------- Kéo thả ----------

function loadSortable() {
  if (window.Sortable) return Promise.resolve(window.Sortable);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SORTABLE_URL;
    s.onload = () => resolve(window.Sortable);
    s.onerror = () => reject(new Error('Không tải được thư viện kéo thả'));
    document.head.appendChild(s);
  });
}

async function enableDrag() {
  if (sortables.length) return;
  let Sortable;
  try { Sortable = await loadSortable(); } catch (err) {
    toast(`${err.message}. Vẫn thêm bằng nút + và chỉnh kích thước được.`, 'error');
    return;
  }
  if (cfg.mode !== 'edit' || sortables.length) return;
  sortables.push(Sortable.create($('#palette'), {
    group: { name: 'bld', pull: 'clone', put: false },
    sort: false,
    filter: '.is-used, button',
    preventOnFilter: false,
    draggable: '.pal-item',
    animation: 150,
  }));
  sortables.push(Sortable.create(canvas(), {
    group: { name: 'bld', pull: false, put: true },
    handle: '.bw__handle, .pal-item',
    draggable: '.bw, .pal-item',
    animation: 150,
    ghostClass: 'bw--ghost',
    chosenClass: 'bw--chosen',
    onAdd: (evt) => {
      // Thả từ danh sách → thay bản sao bằng thành phần thật tại đúng vị trí
      const id = evt.item.dataset.add;
      const index = [...canvas().children].indexOf(evt.item);
      evt.item.remove();
      addWidget(id, Math.max(0, index));
    },
    onUpdate: readOrder,
  }));
}

function disableDrag() {
  sortables.forEach((s) => s.destroy());
  sortables = [];
}

// ---------- Chế độ ----------

function setMode(mode) {
  cfg.mode = mode;
  save();
  document.body.classList.toggle('bld-view', mode === 'view');
  document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  if (mode === 'edit') enableDrag(); else disableDrag();
}

// ---------- Xuất / nhập ----------

function exportJSON() {
  const blob = new Blob([`${JSON.stringify({ version: 1, items: cfg.items }, null, 2)}\n`], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'trang-tuy-chinh.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importJSON(file) {
  try {
    const raw = JSON.parse(await file.text());
    if (!Array.isArray(raw?.items)) throw new Error('file không đúng định dạng');
    for (const it of cfg.items) unmountWidget(it.id);
    cfg = { ...normalize(raw), mode: cfg.mode };
    save();
    buildCanvas();
    renderPalette();
    cfg.items.forEach((it) => mountWidget(it.id));
    toast('Đã nhập bố cục.', 'success');
  } catch (err) {
    toast(`Không nhập được: ${err.message}`, 'error');
  }
}

// ---------- Sự kiện ----------

function bindEvents() {
  document.addEventListener('click', async (e) => {
    const t = e.target;
    const addBtn = t.closest('[data-add-btn]');
    if (addBtn) { addWidget(addBtn.dataset.addBtn); return; }
    const rm = t.closest('[data-act="remove"]');
    if (rm) { removeWidget(rm.closest('.bw').dataset.id); return; }
    const mode = t.closest('[data-mode]');
    if (mode) { setMode(mode.dataset.mode); return; }
    if (t.closest('#bld-add-all')) {
      Object.keys(COMPONENTS).forEach((id) => addWidget(id));
      return;
    }
    if (t.closest('#bld-clear')) {
      if (!cfg.items.length) return;
      let ok = true;
      try { ok = await App.confirmDialog({ title: 'Gỡ tất cả thành phần?', message: 'Trang sẽ trống. Dashboard không bị ảnh hưởng.', okText: 'Gỡ hết', danger: true }); } catch { /* không có hộp xác nhận */ }
      if (ok) [...cfg.items].forEach((it) => removeWidget(it.id));
      return;
    }
    if (t.closest('#bld-export')) { exportJSON(); return; }
    if (t.closest('#bld-import')) $('#bld-import-file').click();
  });

  document.addEventListener('change', (e) => {
    const sel = e.target.closest('.bw select[data-act]');
    if (sel) {
      const box = sel.closest('.bw');
      const it = cfg.items.find((x) => x.id === box.dataset.id);
      if (!it) return;
      if (sel.dataset.act === 'w') { it.w = Number(sel.value); box.dataset.w = sel.value; }
      if (sel.dataset.act === 'h') {
        if (sel.value) { it.h = sel.value; box.style.setProperty('--wh', `${sel.value}px`); } else { delete it.h; box.style.removeProperty('--wh'); }
      }
      save();
      return;
    }
    if (e.target.id === 'bld-import-file') {
      const f = e.target.files[0];
      if (f) importJSON(f);
      e.target.value = '';
    }
  });
}

// ---------- Khởi động ----------

whenAppReady(() => {
  load();
  buildCanvas();
  renderPalette();
  bindEvents();
  startEngine(); // vẽ các thành phần đã có rồi bắt đầu tải dữ liệu
  setMode(cfg.mode);
});
