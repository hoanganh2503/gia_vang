/**
 * csv.js — Đọc và kiểm tra file CSV tài khoản.
 *
 * Định dạng bắt buộc (dòng đầu là header, đúng thứ tự):
 *   username,password_hash,role,status
 *
 * Quy tắc kiểm tra:
 *   - username: 3–32 ký tự, chỉ gồm chữ, số, dấu chấm, gạch dưới, gạch ngang.
 *   - password_hash: dạng pbkdf2_sha256$<iterations>$<salt_base64>$<hash_base64>
 *   - role: admin | member
 *   - status: active | disabled
 *   - username trùng lặp (không phân biệt hoa thường): TẤT CẢ các dòng trùng bị loại,
 *     để không vô tình cho phép đăng nhập bằng một dòng cũ/sai.
 */
const CSV = (() => {
  const HEADER = ['username', 'password_hash', 'role', 'status'];
  const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;
  const HASH_RE = /^pbkdf2_sha256\$(\d{5,7})\$([A-Za-z0-9+/]+={0,2})\$([A-Za-z0-9+/]+={0,2})$/;
  const ROLES = ['admin', 'member'];
  const STATUSES = ['active', 'disabled'];

  /** Tách CSV thành mảng các dòng, mỗi dòng là mảng ô. Hỗ trợ ô có dấu ngoặc kép. */
  function parse(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    const s = String(text).replace(/^﻿/, ''); // bỏ BOM

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inQuotes) {
        if (ch === '"') {
          if (s[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field); field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && s[i + 1] === '\n') i++;
        row.push(field); rows.push(row);
        row = []; field = '';
      } else {
        field += ch;
      }
    }
    if (inQuotes) throw new Error('CSV lỗi: thiếu dấu ngoặc kép đóng.');
    if (field !== '' || row.length) { row.push(field); rows.push(row); }

    // bỏ dòng trống hoàn toàn
    return rows.filter(r => !(r.length === 1 && r[0].trim() === ''));
  }

  /**
   * Đọc CSV tài khoản.
   * @returns {{ users: Map<string, {username, passwordHash, role, status}>, errors: string[] }}
   *          key của Map là username viết thường.
   */
  function parseUsers(text) {
    const errors = [];
    const users = new Map();
    let rows;

    try {
      rows = parse(text);
    } catch (e) {
      return { users, errors: [e.message] };
    }
    if (!rows.length) return { users, errors: ['CSV rỗng.'] };

    const header = rows[0].map(h => h.trim().toLowerCase());
    if (header.length !== HEADER.length || HEADER.some((h, i) => header[i] !== h)) {
      return { users, errors: [`Header không hợp lệ. Cần đúng: ${HEADER.join(',')}`] };
    }

    const seen = new Map();   // usernameLower -> số lần xuất hiện
    const valid = [];

    rows.slice(1).forEach((cells, idx) => {
      const line = idx + 2;
      if (cells.length !== HEADER.length) {
        errors.push(`Dòng ${line}: cần ${HEADER.length} cột, có ${cells.length}.`);
        return;
      }
      const [username, passwordHash, role, status] = cells.map(c => c.trim());
      const key = username.toLowerCase();
      seen.set(key, (seen.get(key) || 0) + 1);

      if (!USERNAME_RE.test(username)) { errors.push(`Dòng ${line}: username không hợp lệ.`); return; }
      if (!HASH_RE.test(passwordHash)) { errors.push(`Dòng ${line} (${username}): password_hash sai định dạng.`); return; }
      if (!ROLES.includes(role)) { errors.push(`Dòng ${line} (${username}): role phải là admin hoặc member.`); return; }
      if (!STATUSES.includes(status)) { errors.push(`Dòng ${line} (${username}): status phải là active hoặc disabled.`); return; }

      valid.push({ key, username, passwordHash, role, status });
    });

    for (const u of valid) {
      if (seen.get(u.key) > 1) continue;
      users.set(u.key, { username: u.username, passwordHash: u.passwordHash, role: u.role, status: u.status });
    }
    for (const [key, n] of seen) {
      if (n > 1) errors.push(`Username "${key}" xuất hiện ${n} lần — tất cả các dòng này bị bỏ qua.`);
    }

    return { users, errors };
  }

  /** Thoát một ô để ghi ra CSV. */
  function escapeCell(v) {
    const s = String(v ?? '');
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function toRow(cells) {
    return cells.map(escapeCell).join(',');
  }

  return { HEADER, HASH_RE, USERNAME_RE, parse, parseUsers, toRow };
})();
