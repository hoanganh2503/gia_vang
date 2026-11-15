/**
 * auth.js — Đăng nhập, phiên làm việc và kiểm tra lại trạng thái tài khoản.
 *
 * GIỚI HẠN (đọc kỹ):
 *   Toàn bộ kiểm tra ở đây chạy trong trình duyệt. Người dùng có thể sửa JavaScript,
 *   sửa sessionStorage hoặc đọc thẳng file HTML/CSV. Đây là "cổng mềm" để phân luồng
 *   người dùng, KHÔNG phải cơ chế bảo mật. Xem README.md mục "Giới hạn bảo mật".
 *
 * Những gì module này làm để giảm rủi ro trong phạm vi có thể:
 *   - Không bao giờ lưu mật khẩu; chỉ so khớp với hash PBKDF2 trong CSV.
 *   - Không tin role/status lưu trong sessionStorage: mỗi lần mở trang và định kỳ
 *     đều tải lại CSV và đọc role/status mới nhất từ đó.
 *   - Nếu ADMIN đổi status thành disabled hoặc đổi mật khẩu trong CSV, phiên đang mở
 *     sẽ bị đăng xuất ở lần kiểm tra kế tiếp (tối đa RECHECK_MS) — với điều kiện
 *     người dùng không can thiệp vào mã nguồn.
 */
const Auth = (() => {
  const USERS_URL = 'data/users.csv';
  const SESSION_KEY = 'gv_session';
  const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 giờ
  const RECHECK_MS = 60 * 1000;               // kiểm tra lại CSV mỗi 60 giây

  // Hash giả dùng khi username không tồn tại, để thời gian phản hồi tương đương
  // và không tiết lộ username nào có trong hệ thống.
  const DUMMY_HASH = 'pbkdf2_sha256$210000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

  const MESSAGES = {
    invalid: 'Sai tài khoản hoặc mật khẩu.',
    disabled: 'Tài khoản đã bị vô hiệu hóa.',
    forbidden: 'Không có quyền truy cập.',
    expired: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.',
    revoked: 'Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.',
    logout: 'Bạn đã đăng xuất.',
    required: 'Vui lòng đăng nhập để tiếp tục.',
    load_failed: 'Không tải được dữ liệu tài khoản. Vui lòng thử lại sau.',
    success: 'Đăng nhập thành công.',
  };

  async function loadUsers() {
    let res;
    try {
      res = await fetch(`${USERS_URL}?t=${Date.now()}`, { cache: 'no-store' });
    } catch {
      throw new Error('load_failed');
    }
    if (!res.ok) throw new Error('load_failed');
    const { users, errors } = CSV.parseUsers(await res.text());
    if (errors.length) console.warn('[Auth] CSV có dòng bị bỏ qua:\n' + errors.join('\n'));
    return users;
  }

  // Dấu vân tay ngắn của hash: nếu ADMIN đổi mật khẩu, dấu này đổi → phiên cũ bị thu hồi.
  function fingerprint(hash) {
    return hash.slice(-16);
  }

  function readSession() {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (!s || typeof s.username !== 'string' || typeof s.expiresAt !== 'number') return null;
      return s;
    } catch {
      return null;
    }
  }

  function writeSession(user) {
    const now = Date.now();
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      username: user.username,
      fp: fingerprint(user.passwordHash),
      issuedAt: now,
      expiresAt: now + SESSION_TTL_MS,
    }));
  }

  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* bỏ qua */ }
  }

  /**
   * Đăng nhập.
   * @returns {Promise<{ok: true, user} | {ok: false, code: string}>}
   */
  async function login(username, password) {
    const name = String(username || '').trim();
    if (!name || !password) return { ok: false, code: 'invalid' };

    let users;
    try {
      users = await loadUsers();
    } catch {
      return { ok: false, code: 'load_failed' };
    }

    const user = users.get(name.toLowerCase());
    const passOk = await Password.verify(password, user ? user.passwordHash : DUMMY_HASH);

    if (!user || !passOk) return { ok: false, code: 'invalid' };
    // Chỉ báo "bị vô hiệu hóa" khi mật khẩu đúng, để không lộ trạng thái tài khoản cho người lạ.
    if (user.status !== 'active') return { ok: false, code: 'disabled' };

    writeSession(user);
    return { ok: true, user: { username: user.username, role: user.role } };
  }

  /**
   * Kiểm tra phiên hiện tại với dữ liệu CSV mới nhất.
   * @returns {Promise<{ok: true, user} | {ok: false, code: string}>}
   */
  async function check() {
    const s = readSession();
    if (!s) return { ok: false, code: 'required' };
    if (Date.now() > s.expiresAt) return { ok: false, code: 'expired' };

    let users;
    try {
      users = await loadUsers();
    } catch {
      return { ok: false, code: 'load_failed' };
    }

    const user = users.get(s.username.toLowerCase());
    if (!user) return { ok: false, code: 'revoked' };
    if (user.status !== 'active') return { ok: false, code: 'disabled' };
    if (fingerprint(user.passwordHash) !== s.fp) return { ok: false, code: 'revoked' };

    return { ok: true, user: { username: user.username, role: user.role } };
  }

  function redirectToLogin(code) {
    clearSession();
    const q = code ? `?reason=${encodeURIComponent(code)}` : '';
    location.replace(`login.html${q}`);
  }

  /**
   * Dùng ở đầu mỗi trang cần đăng nhập. Nếu không hợp lệ sẽ chuyển về login.html.
   * @param {{role?: 'admin'|'member'}} opts  role yêu cầu (bỏ trống = mọi role)
   */
  async function requireSession(opts = {}) {
    const result = await check();
    if (!result.ok) {
      // Lỗi tải CSV: giữ phiên, chỉ báo lỗi (có thể do mạng chập chờn).
      if (result.code === 'load_failed') return result;
      redirectToLogin(result.code);
      return result;
    }
    if (opts.role && result.user.role !== opts.role) {
      redirectToLogin('forbidden');
      return { ok: false, code: 'forbidden' };
    }
    return result;
  }

  /** Kiểm tra lại định kỳ và khi tab được mở lại. */
  function startWatch() {
    const run = async () => {
      const r = await check();
      if (!r.ok && r.code !== 'load_failed') redirectToLogin(r.code);
    };
    const timer = setInterval(run, RECHECK_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') run();
    });
    return () => clearInterval(timer);
  }

  function logout() {
    redirectToLogin('logout');
  }

  function hasSession() {
    const s = readSession();
    return !!s && Date.now() <= s.expiresAt;
  }

  return { MESSAGES, login, check, requireSession, startWatch, logout, hasSession };
})();
