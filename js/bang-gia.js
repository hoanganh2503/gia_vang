/**
 * bang-gia.js — Kiểm tra phiên cho trang bảng giá (màn hình hiển thị, không sidebar).
 * Khi phiên hợp lệ, phát sự kiện app:ready để js/gold/bang-gia.js bắt đầu.
 */
(async () => {
  const app = document.getElementById('app');
  const loading = document.getElementById('page-loading');

  const result = await Auth.requireSession();
  if (!result.ok) {
    if (result.code === 'load_failed') loading.textContent = Auth.MESSAGES.load_failed;
    return; // các trường hợp khác đã được chuyển về login.html
  }

  loading.remove();
  app.hidden = false;

  // Nhấp đúp để bật/tắt toàn màn hình (tiện khi chiếu lên TV)
  document.addEventListener('dblclick', (e) => {
    if (e.target.closest('.tv-chart, .q__widget, canvas')) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });

  window.__appReady = true;
  document.dispatchEvent(new Event('app:ready'));

  Auth.startWatch();
  watchDeploy();
})();

/**
 * Tự tải lại trang khi có bản deploy mới (push lên main → GitHub Pages).
 * Màn hình treo cả ngày không ai bấm F5, và GitHub Pages cho trình duyệt giữ file 10 phút,
 * nên cứ mỗi phút tải thẳng từ server các file của trang này rồi so với bản đang chạy.
 * - Bản đang chạy: đọc từ cache trình duyệt (force-cache), chính là bản trang đã nạp.
 * - Bản trên server: cache 'reload' — lấy từ mạng và ghi đè cache, nên lần tải lại dùng file mới.
 */
function watchDeploy() {
  const FILES = [
    'bang-gia.html', 'css/bang-gia.css',
    'js/csv.js', 'js/password.js', 'js/auth.js', 'js/bang-gia.js',
    'js/gold/bang-gia.js', 'js/gold/config.js', 'js/gold/api.js', 'js/gold/format.js',
    'js/gold/ui.js', 'js/gold/world-gold.js', 'js/gold/markets.js', 'js/gold/domestic.js',
  ];
  const CHECK_MS = 60 * 1000;
  const running = new Map();
  const get = (f, cache) => fetch(f, { cache }).then((r) => (r.ok ? r.text() : null)).catch(() => null);

  const baseline = Promise.all(FILES.map(async (f) => running.set(f, await get(f, 'force-cache'))));

  setInterval(async () => {
    if (document.hidden) return;
    await baseline;
    const latest = await Promise.all(FILES.map((f) => get(f, 'reload')));
    // File nào lỗi mạng (null) thì bỏ qua lượt này
    const changed = FILES.filter((f, i) => latest[i] !== null && running.get(f) !== null && latest[i] !== running.get(f));
    if (changed.length) location.reload();
  }, CHECK_MS);
}
