/**
 * tuy-chinh.js — Kiểm tra phiên cho trang tùy chỉnh (MEMBER và ADMIN đều dùng được).
 * Khi phiên hợp lệ, phát sự kiện app:ready để js/gold/builder.js bắt đầu.
 */
(async () => {
  const app = document.getElementById('app');
  const loading = document.getElementById('page-loading');

  const result = await Auth.requireSession();
  if (!result.ok) {
    if (result.code === 'load_failed') loading.textContent = Auth.MESSAGES.load_failed;
    return; // các trường hợp khác đã được chuyển về login.html
  }

  App.initShell(result.user);
  loading.remove();
  app.hidden = false;

  window.__appReady = true;
  document.dispatchEvent(new Event('app:ready'));

  Auth.startWatch();
})();
