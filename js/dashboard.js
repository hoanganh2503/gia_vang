/**
 * dashboard.js — Trang nội dung sau đăng nhập (MEMBER và ADMIN đều xem được).
 */
(async () => {
  const app = document.getElementById('app');
  const loading = document.getElementById('page-loading');

  const result = await Auth.requireSession();
  if (!result.ok) {
    if (result.code === 'load_failed') loading.textContent = Auth.MESSAGES.load_failed;
    return; // các trường hợp khác đã được chuyển về login.html
  }

  const { user } = result;
  const shell = App.initShell(user);
  document.getElementById('welcome-name').textContent = user.username;

  // Điều hướng giữa các mục trong trang
  const sections = document.querySelectorAll('[data-section]');
  const navLinks = document.querySelectorAll('[data-nav]');

  function show(id) {
    const exists = [...sections].some(s => s.dataset.section === id);
    const target = exists ? id : 'overview';
    sections.forEach(s => { s.hidden = s.dataset.section !== target; });
    navLinks.forEach(a => a.classList.toggle('is-active', a.dataset.nav === target));
    document.getElementById('page-title').textContent =
      document.querySelector(`[data-nav="${target}"] .nav__label`)?.textContent || 'Tổng quan';
    shell.closeSidebar();
  }

  window.addEventListener('hashchange', () => show(location.hash.slice(1)));

  show(location.hash.slice(1));
  loading.remove();
  app.hidden = false;

  Auth.startWatch();
})();
