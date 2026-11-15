/**
 * password.js — Băm và kiểm tra mật khẩu bằng Web Crypto API (PBKDF2-SHA256).
 *
 * Định dạng lưu trong CSV:
 *   pbkdf2_sha256$<iterations>$<salt_base64>$<hash_base64>
 *
 * Mỗi tài khoản có salt ngẫu nhiên riêng, số vòng lặp cao để làm chậm việc dò mật khẩu.
 * Lưu ý: vì file CSV được tải về trình duyệt, ai cũng có thể lấy hash và dò offline.
 * PBKDF2 chỉ làm việc dò chậm hơn, KHÔNG ngăn được hoàn toàn → luôn dùng mật khẩu dài, ngẫu nhiên.
 */
const Password = (() => {
  const ITERATIONS = 210000;
  const SALT_BYTES = 16;
  const KEY_BYTES = 32;
  const enc = new TextEncoder();

  function toB64(bytes) {
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }

  function fromB64(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function derive(password, salt, iterations) {
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      key,
      KEY_BYTES * 8
    );
    return new Uint8Array(bits);
  }

  /** So sánh hai mảng byte với thời gian không phụ thuộc vị trí khác nhau. */
  function equalBytes(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }

  /** Tạo chuỗi hash mới để dán vào cột password_hash. */
  async function hash(password) {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const dk = await derive(password, salt, ITERATIONS);
    return `pbkdf2_sha256$${ITERATIONS}$${toB64(salt)}$${toB64(dk)}`;
  }

  /** Kiểm tra mật khẩu với chuỗi hash đã lưu. Trả về true/false. */
  async function verify(password, stored) {
    const m = /^pbkdf2_sha256\$(\d+)\$([^$]+)\$([^$]+)$/.exec(stored || '');
    if (!m) return false;
    try {
      const iterations = parseInt(m[1], 10);
      const salt = fromB64(m[2]);
      const expected = fromB64(m[3]);
      const actual = await derive(password, salt, iterations);
      return equalBytes(actual, expected);
    } catch {
      return false;
    }
  }

  return { ITERATIONS, hash, verify };
})();
