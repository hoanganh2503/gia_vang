// api.js — fetch có timeout + dự phòng nhiều URL, và bộ nhớ đệm localStorage.

export async function fetchJSON(urls, { timeout = 8000, bust = false } = {}) {
  const list = Array.isArray(urls) ? urls : [urls];
  let lastErr;
  for (const raw of list) {
    const url = bust ? `${raw}${raw.includes('?') ? '&' : '?'}t=${Date.now()}` : raw;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeout), cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Không có URL');
}

const PREFIX = 'gv:';

export function saveCache(key, data) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data }));
  } catch { /* bộ nhớ đầy hoặc bị chặn */ }
}

export function loadCache(key) {
  try {
    const v = JSON.parse(localStorage.getItem(PREFIX + key) || 'null');
    return v && 'data' in v ? v : null;
  } catch {
    return null;
  }
}

// Chạy fn(); thành công thì lưu cache, lỗi thì trả cache cũ (nếu có) kèm cờ cached.
export async function withCache(key, fn) {
  try {
    const data = await fn();
    saveCache(key, data);
    return { data, at: Date.now(), cached: false };
  } catch (error) {
    const c = loadCache(key);
    if (c) return { data: c.data, at: c.at, cached: true, error };
    throw error;
  }
}

// Giới hạn số request song song
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx]); } catch { out[idx] = null; }
    }
  });
  await Promise.all(workers);
  return out;
}
