/**
 * admin.js — Trang quản trị tài khoản.
 *
 * Website tĩnh không ghi được lên máy chủ, nên luồng làm việc là:
 *   1. Tải data/users.csv từ máy chủ (hoặc nhập một file CSV từ máy).
 *   2. Sửa trong trình duyệt (tạo / khóa / mở khóa / sửa / xóa).
 *   3. Xuất CSV → ADMIN tự tải file lên máy chủ đè vào data/users.csv.
 *
 * Bản nháp (chỉ gồm username, hash, role, status — không có mật khẩu gốc) được giữ trong
 * sessionStorage để không mất khi tải lại trang; đóng tab là mất.
 */
(async () => {
  const USERS_URL = 'data/users.csv';
  const DRAFT_KEY = 'gv_admin_draft';
  const MIN_PASSWORD = 10;

  const $ = id => document.getElementById(id);
  const loading = $('page-loading');

  // ---------- Xác thực: chỉ ADMIN ----------
  const session = await Auth.requireSession({ role: 'admin' });
  if (!session.ok) {
    if (session.code === 'load_failed') loading.textContent = Auth.MESSAGES.load_failed;
    return;
  }
  const me = session.user;
  App.initShell(me);
  App.initPasswordToggles();

  // ---------- Trạng thái ----------
  /** @type {{username: string, passwordHash: string, role: string, status: string}[]} */
  let users = [];
  let dirty = false;

  const key = name => name.toLowerCase();
  const find = name => users.find(u => key(u.username) === key(name));
  const isMe = u => key(u.username) === key(me.username);
  const activeAdmins = list => list.filter(u => u.role === 'admin' && u.status === 'active').length;

  function saveDraft() {
    try {
      if (dirty) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(users));
      else sessionStorage.removeItem(DRAFT_KEY);
    } catch { /* sessionStorage có thể bị chặn — bỏ qua */ }
  }

  function loadDraft() {
    try {
      const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
      return Array.isArray(d) ? d : null;
    } catch {
      return null;
    }
  }

  function setUsers(list, isDirty) {
    users = list.slice().sort((a, b) => a.username.localeCompare(b.username));
    dirty = isDirty;
    saveDraft();
    render();
  }

  function commit(list, message) {
    setUsers(list, true);
    if (message) App.toast(message, 'success');
  }

  // ---------- Nạp dữ liệu ----------
  function showCsvErrors(title, errors) {
    const box = $('csv-errors');
    if (!errors.length) { box.hidden = true; return; }
    $('csv-errors-title').textContent = title;
    const ul = $('csv-errors-list');
    ul.replaceChildren(...errors.map(e => Object.assign(document.createElement('li'), { textContent: e })));
    box.hidden = false;
  }

  async function loadFromServer() {
    const res = await fetch(`${USERS_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { users: map, errors } = CSV.parseUsers(await res.text());
    showCsvErrors(`File trên máy chủ có ${errors.length} lỗi (các dòng lỗi đã bị bỏ qua):`, errors);
    setUsers([...map.values()], false);
  }

  // ---------- Hiển thị ----------
  function badge(text, cls) {
    return Object.assign(document.createElement('span'), { className: `badge ${cls}`, textContent: text });
  }

  function actionBtn(text, cls, onClick, title) {
    const b = Object.assign(document.createElement('button'), {
      type: 'button', className: `btn btn--sm ${cls}`, textContent: text,
    });
    if (title) b.title = title;
    b.addEventListener('click', onClick);
    return b;
  }

  function render() {
    // Thống kê
    $('stat-total').textContent = users.length;
    $('stat-active').textContent = users.filter(u => u.status === 'active').length;
    $('stat-disabled').textContent = users.filter(u => u.status === 'disabled').length;

    $('draft-banner').hidden = !dirty;

    // Lọc
    const q = $('search').value.trim().toLowerCase();
    const st = $('filter-status').value;
    const rows = users.filter(u =>
      (!q || u.username.toLowerCase().includes(q)) && (st === 'all' || u.status === st)
    );

    const tbody = $('user-rows');
    tbody.replaceChildren(...rows.map(u => {
      const tr = document.createElement('tr');

      const tdName = document.createElement('td');
      tdName.append(document.createTextNode(u.username));
      if (isMe(u)) tdName.append(' ', badge('bạn', 'badge--muted'));

      const tdRole = document.createElement('td');
      tdRole.append(badge(u.role.toUpperCase(), u.role === 'admin' ? 'badge--admin' : 'badge--member'));

      const tdStatus = document.createElement('td');
      tdStatus.append(u.status === 'active'
        ? badge('Hoạt động', 'badge--success')
        : badge('Đã khóa', 'badge--danger'));

      const tdActions = document.createElement('td');
      tdActions.className = 'actions-col';
      const wrap = document.createElement('div');
      wrap.className = 'row-actions';
      wrap.append(
        u.status === 'active'
          ? actionBtn('Khóa', 'btn--ghost', () => lockUser(u.username))
          : actionBtn('Mở khóa', 'btn--ghost', () => unlockUser(u.username)),
        actionBtn('Sửa', 'btn--ghost', () => openEdit(u.username)),
        actionBtn('Xóa', 'btn--danger-ghost', () => deleteUser(u.username)),
      );
      tdActions.append(wrap);

      tr.append(tdName, tdRole, tdStatus, tdActions);
      return tr;
    }));

    $('empty-state').hidden = rows.length > 0;
  }

  // ---------- Hành động ----------
  async function lockUser(name) {
    const u = find(name);
    if (!u) return;
    if (isMe(u)) return App.toast('Không thể tự khóa tài khoản đang đăng nhập.', 'error');
    const next = users.map(x => (x === u ? { ...x, status: 'disabled' } : x));
    if (u.role === 'admin' && activeAdmins(next) === 0) {
      return App.toast('Phải còn ít nhất một ADMIN đang hoạt động.', 'error');
    }
    const ok = await App.confirmDialog({
      title: 'Khóa tài khoản?',
      message: `Tài khoản "${u.username}" sẽ không đăng nhập được sau khi bạn xuất CSV và tải lên máy chủ.`,
      okText: 'Khóa',
      danger: true,
    });
    if (ok) commit(next, `Đã khóa ${u.username}.`);
  }

  function unlockUser(name) {
    const u = find(name);
    if (!u) return;
    commit(users.map(x => (x === u ? { ...x, status: 'active' } : x)), `Đã mở khóa ${u.username}.`);
  }

  async function deleteUser(name) {
    const u = find(name);
    if (!u) return;
    if (isMe(u)) return App.toast('Không thể xóa tài khoản đang đăng nhập.', 'error');
    const next = users.filter(x => x !== u);
    if (u.role === 'admin' && activeAdmins(next) === 0) {
      return App.toast('Phải còn ít nhất một ADMIN đang hoạt động.', 'error');
    }
    const ok = await App.confirmDialog({
      title: 'Xóa tài khoản?',
      message: `Xóa vĩnh viễn "${u.username}" khỏi danh sách. Muốn khôi phục phải tạo lại tài khoản.`,
      okText: 'Xóa',
      danger: true,
    });
    if (ok) commit(next, `Đã xóa ${u.username}.`);
  }

  // Tạo tài khoản
  const createDlg = $('create-dialog');
  const editDlg = $('edit-dialog');

  document.querySelectorAll('[data-close]').forEach(b =>
    b.addEventListener('click', () => b.closest('dialog').close())
  );

  function formError(id, msg) {
    $(id).textContent = msg;
    $(id).hidden = !msg;
  }

  function setBusy(btn, busy, idleText) {
    btn.disabled = busy;
    btn.textContent = busy ? 'Đang băm mật khẩu...' : idleText;
  }

  $('create-btn').addEventListener('click', () => {
    $('create-form').reset();
    formError('c-error', '');
    createDlg.showModal();
    $('c-username').focus();
  });

  $('create-form').addEventListener('submit', async e => {
    e.preventDefault();
    const username = $('c-username').value.trim();
    const password = $('c-password').value;

    if (!CSV.USERNAME_RE.test(username)) return formError('c-error', 'Username không hợp lệ (3–32 ký tự: chữ, số, . _ -).');
    if (find(username)) return formError('c-error', `Username "${username}" đã tồn tại.`);
    if (password.length < MIN_PASSWORD) return formError('c-error', `Mật khẩu cần tối thiểu ${MIN_PASSWORD} ký tự.`);
    formError('c-error', '');

    setBusy($('c-submit'), true, 'Tạo');
    const passwordHash = await Password.hash(password);
    setBusy($('c-submit'), false, 'Tạo');
    $('c-password').value = '';

    commit([...users, { username, passwordHash, role: $('c-role').value, status: $('c-status').value }],
      `Đã tạo ${username}.`);
    createDlg.close();
  });

  // Sửa tài khoản (role + mật khẩu)
  let editing = null;

  function openEdit(name) {
    const u = find(name);
    if (!u) return;
    editing = u.username;
    $('edit-form').reset();
    formError('e-error', '');
    $('e-username').textContent = `"${u.username}"`;
    $('e-role').value = u.role;
    editDlg.showModal();
  }

  $('edit-form').addEventListener('submit', async e => {
    e.preventDefault();
    const u = find(editing);
    if (!u) return editDlg.close();

    const role = $('e-role').value;
    const password = $('e-password').value;

    if (isMe(u) && role !== 'admin') return formError('e-error', 'Không thể tự hạ quyền tài khoản đang đăng nhập.');
    if (password && password.length < MIN_PASSWORD) return formError('e-error', `Mật khẩu cần tối thiểu ${MIN_PASSWORD} ký tự.`);

    let updated = { ...u, role };
    const next = () => users.map(x => (x === u ? updated : x));
    if (activeAdmins(next()) === 0) return formError('e-error', 'Phải còn ít nhất một ADMIN đang hoạt động.');
    formError('e-error', '');

    if (role === u.role && !password) return editDlg.close();

    if (password) {
      setBusy($('e-submit'), true, 'Lưu');
      updated = { ...updated, passwordHash: await Password.hash(password) };
      setBusy($('e-submit'), false, 'Lưu');
      $('e-password').value = '';
    }

    commit(next(), `Đã cập nhật ${u.username}.`);
    editDlg.close();
  });

  // ---------- Nhập CSV ----------
  $('import-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 1024 * 1024) return App.toast('File quá lớn (tối đa 1 MB).', 'error');

    let text;
    try {
      text = await file.text();
    } catch {
      return App.toast('Không đọc được file.', 'error');
    }

    const { users: map, errors } = CSV.parseUsers(text);
    const list = [...map.values()];
    showCsvErrors(`File "${file.name}" có ${errors.length} lỗi (các dòng lỗi sẽ bị bỏ qua):`, errors);

    if (!list.length) return App.toast('File không có tài khoản hợp lệ nào. Không nhập.', 'error');
    if (activeAdmins(list) === 0) return App.toast('File không có ADMIN nào đang hoạt động. Không nhập.', 'error');
    const meInFile = list.find(u => key(u.username) === key(me.username));
    if (!meInFile || meInFile.role !== 'admin' || meInFile.status !== 'active') {
      return App.toast(`File phải có "${me.username}" là ADMIN đang hoạt động, nếu không bạn sẽ tự khóa mình.`, 'error', 6000);
    }

    const ok = await App.confirmDialog({
      title: 'Nhập CSV?',
      message: `Thay toàn bộ danh sách hiện tại (${users.length} tài khoản) bằng ${list.length} tài khoản từ "${file.name}"` +
        (errors.length ? `, bỏ qua ${errors.length} lỗi.` : '.'),
      okText: 'Nhập',
      danger: true,
    });
    if (ok) commit(list, `Đã nhập ${list.length} tài khoản.`);
  });

  // ---------- Xuất CSV ----------
  function buildCsv() {
    const lines = [CSV.toRow(CSV.HEADER)];
    users.forEach(u => lines.push(CSV.toRow([u.username, u.passwordHash, u.role, u.status])));
    return lines.join('\n') + '\n';
  }

  async function exportCsv() {
    if (!users.length) return App.toast('Danh sách trống, không có gì để xuất.', 'error');
    if (activeAdmins(users) === 0) return App.toast('Phải có ít nhất một ADMIN đang hoạt động.', 'error');

    const blob = new Blob([buildCsv()], { type: 'text/csv;charset=utf-8' });

    // Chrome/Edge: cho chọn chỗ lưu (có thể lưu đè file users.csv trên máy).
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: 'users.csv',
          types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }],
        });
        const w = await handle.createWritable();
        await w.write(blob);
        await w.close();
        exported();
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // người dùng bấm Hủy
        // lỗi khác → dùng cách tải xuống thông thường
      }
    }

    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: 'users.csv',
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    exported();
  }

  function exported() {
    dirty = false;
    saveDraft();
    render();
    App.toast('Đã xuất users.csv. Hãy tải file này lên máy chủ vào data/users.csv.', 'success', 6000);
  }

  $('export-btn').addEventListener('click', exportCsv);
  $('export-btn-2').addEventListener('click', exportCsv);

  // ---------- Bỏ thay đổi / tải lại ----------
  async function reload(askFirst) {
    if (askFirst && dirty) {
      const ok = await App.confirmDialog({
        title: 'Bỏ thay đổi?',
        message: 'Các thay đổi chưa xuất sẽ mất và danh sách được tải lại từ máy chủ.',
        okText: 'Bỏ thay đổi',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await loadFromServer();
      App.toast('Đã tải lại danh sách từ máy chủ.', 'info');
    } catch {
      App.toast(Auth.MESSAGES.load_failed, 'error');
    }
  }

  $('reload-btn').addEventListener('click', () => reload(true));
  $('discard-btn').addEventListener('click', () => reload(true));

  $('search').addEventListener('input', render);
  $('filter-status').addEventListener('change', render);

  window.addEventListener('beforeunload', e => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  // ---------- Khởi động ----------
  const draft = loadDraft();
  if (draft) {
    // Kiểm tra lại bản nháp như một file CSV, phòng trường hợp sessionStorage bị sửa tay.
    const csvText = [CSV.toRow(CSV.HEADER), ...draft.map(u =>
      CSV.toRow([u.username, u.passwordHash, u.role, u.status]))].join('\n');
    const { users: map } = CSV.parseUsers(csvText);
    setUsers([...map.values()], true);
  } else {
    try {
      await loadFromServer();
    } catch {
      loading.textContent = Auth.MESSAGES.load_failed;
      return;
    }
  }

  loading.remove();
  $('app').hidden = false;
  Auth.startWatch();
})();
