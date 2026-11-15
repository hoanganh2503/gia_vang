/**
 * app.js — Tiện ích giao diện dùng chung: toast, hộp xác nhận, nút hiện/ẩn mật khẩu,
 * khung trang (sidebar + header) cho các trang sau đăng nhập.
 */
const App = (() => {
  function ensureToastRoot() {
    let root = document.getElementById('toast-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'toast-root';
      root.className = 'toast-root';
      root.setAttribute('aria-live', 'polite');
      document.body.appendChild(root);
    }
    return root;
  }

  /**
   * Hiển thị thông báo.
   * @param {string} message
   * @param {'success'|'error'|'info'} type
   */
  function toast(message, type = 'info', timeout = 3500) {
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.textContent = message;
    ensureToastRoot().appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-visible'));
    setTimeout(() => {
      el.classList.remove('is-visible');
      setTimeout(() => el.remove(), 250);
    }, timeout);
  }

  /**
   * Hộp xác nhận (dùng <dialog>). Trả về Promise<boolean>.
   * @param {{title: string, message: string, okText?: string, danger?: boolean}} opts
   */
  function confirmDialog({ title, message, okText = 'Xác nhận', danger = false }) {
    return new Promise(resolve => {
      const dlg = document.createElement('dialog');
      dlg.className = 'modal';
      dlg.innerHTML = `
        <form method="dialog" class="modal__body">
          <h2 class="modal__title"></h2>
          <p class="modal__text"></p>
          <div class="modal__actions">
            <button value="cancel" class="btn btn--ghost">Hủy</button>
            <button value="ok" class="btn ${danger ? 'btn--danger' : 'btn--primary'}"></button>
          </div>
        </form>`;
      dlg.querySelector('.modal__title').textContent = title;
      dlg.querySelector('.modal__text').textContent = message;
      dlg.querySelector('button[value="ok"]').textContent = okText;
      dlg.addEventListener('close', () => {
        resolve(dlg.returnValue === 'ok');
        dlg.remove();
      });
      document.body.appendChild(dlg);
      dlg.showModal();
      dlg.querySelector('button[value="cancel"]').focus();
    });
  }

  /** Gắn nút hiện/ẩn cho mọi ô mật khẩu có nút [data-toggle-password]. */
  function initPasswordToggles(root = document) {
    root.querySelectorAll('[data-toggle-password]').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      const input = document.getElementById(btn.dataset.togglePassword);
      if (!input) return;
      btn.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-pressed', String(show));
        btn.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
        btn.textContent = show ? 'Ẩn' : 'Hiện';
      });
    });
  }

  /**
   * Khởi tạo sidebar + header cho trang đã đăng nhập.
   * Mục "Quản trị" chỉ được chèn vào khi CSV xác nhận role = admin.
   */
  function initShell(user) {
    const isAdmin = user.role === 'admin';

    document.getElementById('user-name').textContent = user.username;
    document.getElementById('user-avatar').textContent = user.username.charAt(0).toUpperCase();
    const roleEl = document.getElementById('user-role');
    roleEl.textContent = isAdmin ? 'ADMIN' : 'MEMBER';
    roleEl.classList.add(isAdmin ? 'badge--admin' : 'badge--member');

    if (isAdmin) {
      const tpl = document.getElementById('tpl-admin-nav');
      if (tpl) document.getElementById('nav-list').appendChild(tpl.content.cloneNode(true));
    }

    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const menuBtn = document.getElementById('menu-toggle');

    const open = () => {
      sidebar.classList.add('is-open');
      overlay.hidden = false;
      menuBtn.setAttribute('aria-expanded', 'true');
    };
    const close = () => {
      sidebar.classList.remove('is-open');
      overlay.hidden = true;
      menuBtn.setAttribute('aria-expanded', 'false');
    };
    menuBtn.addEventListener('click', () => (sidebar.classList.contains('is-open') ? close() : open()));
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

    document.getElementById('logout-btn').addEventListener('click', () => Auth.logout());

    return { closeSidebar: close };
  }

  return { toast, confirmDialog, initPasswordToggles, initShell };
})();
