// ============================================================
// Nối máy chủ cục bộ (Chay game.bat) với Supabase khi có file .env.local:
//  - Kết quả phòng luyện tập được gửi lên Supabase (RPC post_results) để thống kê không bị tách 2 nơi.
//    Vẫn ghi vào data/results.jsonl như cũ. Mất mạng → xếp hàng ở data/cloud-outbox.jsonl, gửi lại sau.
//  - Mã PIN mở phòng được kiểm tra trên Supabase (cùng PIN với Khu vực giáo viên).
//    Mất mạng → dùng bản băm của PIN đúng gần nhất (data/cloud-pin-cache.json);
//    chưa có bản băm thì dùng PIN của máy chủ cục bộ (data/teacher.json).
// Chỉ gọi các RPC công khai bằng khóa anon (giống trình duyệt), không cần khóa service_role.
// ============================================================
import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export interface CloudConfig {
  url: string;
  key: string;
}

export type PinCheck = { ok: true } | { ok: false; status: number; error: string };

/** Mỗi lần gửi tối đa 200 kết quả (giới hạn của post_results) */
const BATCH = 200;
const RETRY_MS = 60_000;

const hash = (pin: string, salt: string) => scryptSync(pin, salt, 32).toString('hex');

export function createCloudSync(cfg: CloudConfig, dataDir: string) {
  const outboxFile = join(dataDir, 'cloud-outbox.jsonl');
  const pinCacheFile = join(dataDir, 'cloud-pin-cache.json');
  let flushing = false;
  let again = false;
  let warned = '';
  // Chống đoán PIN khi mất mạng (giống máy chủ cục bộ): sai 5 lần → khóa 30 giây
  let failures = 0;
  let lockedUntil = 0;

  /** Gọi RPC. net = false nghĩa là không kết nối được (mất mạng, Supabase tạm dừng...) */
  async function rpc<T>(fn: string, args: Record<string, unknown>, timeoutMs = 8000): Promise<{ net: boolean; status: number; body: T | null }> {
    const headers: Record<string, string> = { apikey: cfg.key, 'Content-Type': 'application/json' };
    // Khóa kiểu cũ (JWT "eyJ...") phải gửi kèm Authorization; khóa kiểu mới (sb_publishable_...) chỉ cần apikey
    if (cfg.key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + cfg.key;
    try {
      const res = await fetch(`${cfg.url.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args), signal: AbortSignal.timeout(timeoutMs) });
      const text = await res.text();
      let body: T | null = null;
      try {
        body = text ? (JSON.parse(text) as T) : null;
      } catch {
        /* không phải JSON */
      }
      return { net: true, status: res.status, body };
    } catch {
      return { net: false, status: 0, body: null };
    }
  }

  const warnOnce = (msg: string) => {
    if (warned === msg) return;
    warned = msg;
    console.warn('[Supabase] ' + msg);
  };

  // ---------------- Kết quả ----------------

  function readOutbox() {
    if (!existsSync(outboxFile)) return [];
    const seen = new Set<string>();
    const out: { id: string }[] = [];
    for (const line of readFileSync(outboxFile, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line) as { id?: unknown };
        if (typeof r.id !== 'string' || seen.has(r.id)) continue;
        seen.add(r.id);
        out.push(r as { id: string });
      } catch {
        /* bỏ dòng hỏng */
      }
    }
    return out;
  }

  /** Gửi các kết quả đang chờ. Kết quả mới thêm trong lúc gửi được giữ lại cho lần sau. */
  async function flush(): Promise<void> {
    if (flushing) {
      again = true;
      return;
    }
    again = false;
    const list = readOutbox();
    if (!list.length) return;
    flushing = true;
    const sent = new Set<string>();
    try {
      for (let i = 0; i < list.length; i += BATCH) {
        const part = list.slice(i, i + BATCH);
        const r = await rpc<{ ok?: boolean; error?: string }>('post_results', { p_results: part }, 15000);
        if (!r.net) return warnOnce('Không kết nối được, kết quả phòng luyện tập sẽ được gửi lại sau.');
        if (r.status >= 300 || !r.body?.ok) return warnOnce(`Không gửi được kết quả (${r.body?.error ?? 'HTTP ' + r.status}). Kiểm tra đã chạy file SQL trên Supabase chưa.`);
        for (const x of part) sent.add(x.id);
      }
      warned = '';
    } finally {
      if (sent.size) {
        // Đọc lại file: giữ các kết quả mới phát sinh trong lúc đang gửi
        const left = readOutbox().filter((x) => !sent.has(x.id));
        const tmp = outboxFile + '.tmp';
        writeFileSync(tmp, left.map((x) => JSON.stringify(x) + '\n').join(''), 'utf8');
        renameSync(tmp, outboxFile);
      }
      flushing = false;
      if (again) void flush();
    }
  }

  /** Xếp hàng kết quả để gửi lên Supabase (ghi ra file trước, mất điện cũng không mất) */
  function queueResults(records: unknown[]) {
    if (!records.length) return;
    appendFileSync(outboxFile, records.map((r) => JSON.stringify(r) + '\n').join(''), 'utf8');
    void flush();
  }

  let timer: ReturnType<typeof setInterval> | null = null;
  /** Bắt đầu gửi lại định kỳ (chỉ khi máy chủ chạy, không chạy lúc build) */
  function start() {
    if (timer) return;
    timer = setInterval(() => void flush(), RETRY_MS);
    timer.unref?.();
    void flush();
  }

  // ---------------- Mã PIN ----------------

  function readPinCache(): { salt: string; hash: string } | null {
    try {
      return existsSync(pinCacheFile) ? (JSON.parse(readFileSync(pinCacheFile, 'utf8')) as { salt: string; hash: string }) : null;
    } catch {
      return null;
    }
  }

  function writePinCache(pin: string) {
    const cur = readPinCache();
    if (cur && hash(pin, cur.salt) === cur.hash) return;
    const salt = randomBytes(16).toString('hex');
    const tmp = pinCacheFile + '.tmp';
    writeFileSync(tmp, JSON.stringify({ salt, hash: hash(pin, salt) }), 'utf8');
    renameSync(tmp, pinCacheFile);
  }

  /**
   * Kiểm tra PIN trên Supabase. Trả về null nếu không kết nối được và chưa có bản băm dự phòng
   * (khi đó máy chủ dùng PIN cục bộ trong data/teacher.json).
   */
  async function verifyPin(pin: unknown): Promise<PinCheck | null> {
    if (typeof pin !== 'string' || !pin || pin.length > 16) return { ok: false, status: 401, error: 'Mã PIN không đúng' };
    const r = await rpc<{ ok?: boolean; status?: number; error?: string }>('teacher_login', { p_pin: pin });
    if (r.net && r.body && typeof r.body.ok === 'boolean') {
      if (r.body.ok) {
        writePinCache(pin);
        return { ok: true };
      }
      return { ok: false, status: r.body.status ?? 401, error: r.body.error ?? 'Mã PIN không đúng' };
    }
    if (r.net) warnOnce(`Không kiểm tra được PIN trên Supabase (HTTP ${r.status}). Kiểm tra đã chạy file SQL chưa.`);
    // Mất mạng → so với PIN đúng gần nhất
    const cache = readPinCache();
    if (!cache) return null;
    if (Date.now() < lockedUntil) return { ok: false, status: 401, error: 'Nhập sai nhiều lần. Đợi 30 giây rồi thử lại.' };
    const a = Buffer.from(hash(pin, cache.salt), 'hex');
    const b = Buffer.from(cache.hash, 'hex');
    if (a.length === b.length && timingSafeEqual(a, b)) {
      failures = 0;
      return { ok: true };
    }
    if (++failures >= 5) {
      failures = 0;
      lockedUntil = Date.now() + 30_000;
    }
    return { ok: false, status: 401, error: 'Mã PIN không đúng' };
  }

  return { queueResults, flush, start, verifyPin };
}

export type CloudSync = ReturnType<typeof createCloudSync>;
