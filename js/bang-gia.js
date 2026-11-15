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
})();
