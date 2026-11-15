/**
 * login.js — Xử lý form đăng nhập.
 */
(() => {
  const form = document.getElementById('login-form');
  const errorBox = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');

  App.initPasswordToggles();

  function showMessage(text, kind = 'error') {
    errorBox.textContent = text;
    errorBox.className = `form-message form-message--${kind}`;
    errorBox.hidden = !text;
  }

  // Thông báo khi bị chuyển về từ trang khác (hết hạn, bị khóa, đăng xuất...)
  const reason = new URLSearchParams(location.search).get('reason');
  if (reason && Auth.MESSAGES[reason]) {
    showMessage(Auth.MESSAGES[reason], reason === 'logout' ? 'info' : 'error');
    history.replaceState(null, '', 'login.html');
  } else if (Auth.hasSession()) {
    // Đã có phiên → thử vào thẳng dashboard (dashboard sẽ tự kiểm tra lại).
    location.replace('dashboard.html');
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    showMessage('');

    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (!username || !password) {
      showMessage('Vui lòng nhập tên đăng nhập và mật khẩu.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');
    submitBtn.textContent = 'Đang kiểm tra...';

    const result = await Auth.login(username, password);

    if (result.ok) {
      passwordInput.value = '';
      showMessage(Auth.MESSAGES.success, 'success');
      setTimeout(() => location.replace('dashboard.html'), 500);
      return;
    }

    showMessage(Auth.MESSAGES[result.code] || Auth.MESSAGES.invalid);
    passwordInput.value = '';
    passwordInput.focus();
    submitBtn.disabled = false;
    submitBtn.classList.remove('is-loading');
    submitBtn.textContent = 'Đăng nhập';
  });
})();
