// ============================================================
// Máy chủ nhỏ chạy cùng game (npm run dev / vite preview) trên máy của giáo viên.
// Lưu dữ liệu vào thư mục data/ (không bị xóa khi build lại game):
//   data/custom-content.json  nội dung bài học giáo viên đã sửa / thêm
//   data/teacher.json         mã PIN giáo viên (đã băm, không lưu dạng chữ)
//   data/results.jsonl        kết quả từng trận của học sinh (mỗi dòng 1 trận)
//
// API:
//   GET    /api/health            → { ok, pinSet }
//   GET    /api/content           → nội dung tùy chỉnh (học sinh cũng đọc)
//   PUT    /api/content     [PIN] → lưu nội dung tùy chỉnh
//   POST   /api/pin                → đặt PIN lần đầu, hoặc đổi PIN (cần PIN cũ)
//   POST   /api/login              → kiểm tra PIN
//   POST   /api/results            → học sinh gửi kết quả (1 trận hoặc mảng nhiều trận)
//   GET    /api/results     [PIN] → toàn bộ kết quả
//   DELETE /api/results     [PIN] → xóa thống kê
//   GET    /api/results/device/:id → kết quả của 1 máy học sinh (Góc phụ huynh trên máy đó)
//   /api/class/...                  → phòng luyện tập của giáo viên (xem server/classRoom.ts)
//   /api/homework/...               → bài tập về nhà (xem server/homework.ts)
// [PIN] = cần header "x-teacher-pin"
//
// Có file .env.local (Supabase): bài học, bài tập, thống kê của trình duyệt lưu trên Supabase.
// Máy chủ này vẫn chạy phòng luyện tập; kết quả phòng được gửi thêm lên Supabase và
// PIN mở phòng được kiểm tra trên Supabase (xem server/cloudSync.ts).
// Khi build (npm run build, Vercel) plugin không làm gì.
// ============================================================
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadEnv, type Plugin } from 'vite';
import { handleClass } from './classRoom.ts';
import { handleHomework } from './homework.ts';
import { createCloudSync, type CloudSync } from './cloudSync.ts';

type Next = (err?: unknown) => void;

const MAX_BODY = 5 * 1024 * 1024;
const MAX_RESULT = 20 * 1024;

export function teacherApi(): Plugin {
  let dataDir = '';
  let cloud: CloudSync | null = null;
  const handler = (req: IncomingMessage, res: ServerResponse, next: Next) => {
    if (!req.url?.startsWith('/api/')) return next();
    handle(dataDir, cloud, req, res).catch((e) => send(res, 500, { error: String(e) }));
  };
  const start = () => {
    if (!cloud) return;
    mkdirSync(dataDir, { recursive: true });
    cloud.start();
  };
  return {
    name: 'bqe-teacher-api',
    configResolved(config) {
      dataDir = join(config.root, 'data');
      const env = loadEnv(config.mode, config.envDir || config.root, 'VITE_');
      if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) cloud = createCloudSync({ url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_ANON_KEY }, dataDir);
    },
    configureServer(server) {
      server.middlewares.use(handler);
      start();
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
      start();
    },
  };
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage, limit = MAX_BODY): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('Dữ liệu quá lớn'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(size ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null);
      } catch {
        reject(new Error('JSON không hợp lệ'));
      }
    });
    req.on('error', reject);
  });
}

/** Ghi file an toàn: ghi ra file tạm rồi đổi tên (không bị hỏng nếu tắt máy giữa chừng) */
function writeAtomic(file: string, text: string) {
  const tmp = file + '.tmp';
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, file);
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : fallback;
  } catch {
    return fallback;
  }
}

// ---------------- Mã PIN ----------------

interface PinFile {
  salt: string;
  hash: string;
}

const hashPin = (pin: string, salt: string) => scryptSync(pin, salt, 32).toString('hex');
const validPin = (pin: unknown): pin is string => typeof pin === 'string' && /^\d{4,8}$/.test(pin);

// Chống đoán PIN: sai 5 lần liên tiếp thì khóa 30 giây
let failures = 0;
let lockedUntil = 0;

function checkPin(dataDir: string, pin: unknown): 'ok' | 'wrong' | 'locked' | 'unset' {
  const f = readJson<PinFile | null>(join(dataDir, 'teacher.json'), null);
  if (!f) return 'unset';
  if (Date.now() < lockedUntil) return 'locked';
  if (typeof pin === 'string' && pin.length <= 16) {
    const a = Buffer.from(hashPin(pin, f.salt), 'hex');
    const b = Buffer.from(f.hash, 'hex');
    if (a.length === b.length && timingSafeEqual(a, b)) {
      failures = 0;
      return 'ok';
    }
  }
  if (++failures >= 5) {
    failures = 0;
    lockedUntil = Date.now() + 30_000;
  }
  return 'wrong';
}

const PIN_ERRORS = {
  wrong: 'Mã PIN không đúng',
  locked: 'Nhập sai nhiều lần. Đợi 30 giây rồi thử lại.',
  unset: 'Chưa đặt mã PIN giáo viên',
};

// ---------------- Xử lý yêu cầu ----------------

async function handle(dataDir: string, cloud: CloudSync | null, req: IncomingMessage, res: ServerResponse) {
  mkdirSync(dataDir, { recursive: true });
  const url = new URL(req.url!, 'http://x');
  const path = url.pathname;
  const method = req.method ?? 'GET';
  const pinFile = join(dataDir, 'teacher.json');
  const contentFile = join(dataDir, 'custom-content.json');
  const resultsFile = join(dataDir, 'results.jsonl');

  const requirePin = () => {
    const r = checkPin(dataDir, req.headers['x-teacher-pin']);
    if (r === 'ok') return true;
    send(res, r === 'unset' ? 403 : 401, { error: PIN_ERRORS[r] });
    return false;
  };

  const saveResults = (records: unknown[]) => {
    appendFileSync(resultsFile, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    cloud?.queueResults(records);
  };
  /** PIN mở phòng luyện tập: có Supabase thì dùng PIN trên Supabase (giống Khu vực giáo viên) */
  const requireClassPin = async () => {
    const r = cloud ? await cloud.verifyPin(req.headers['x-teacher-pin']) : null;
    if (!r) return requirePin();
    if (!r.ok) send(res, r.status, { error: r.error });
    return r.ok;
  };
  if (await handleClass(req, res, path, url, { readBody, requirePin: requireClassPin, saveResults })) return;
  if (await handleHomework(req, res, path, { dataDir, readBody, requirePin, send, readJson, writeAtomic })) return;

  /** Đọc results.jsonl, bỏ bản ghi trùng (khi máy học sinh gửi lại do mất mạng) */
  const loadResults = () => {
    const text = existsSync(resultsFile) ? readFileSync(resultsFile, 'utf8') : '';
    const seen = new Set<string>();
    const out: { id: string; deviceId?: string }[] = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line) as { id: string; deviceId?: string };
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        out.push(r);
      } catch {
        /* bỏ dòng hỏng */
      }
    }
    return out;
  };

  const dev = /^\/api\/results\/device\/([\w-]{1,40})$/.exec(path);
  if (dev && method === 'GET') return send(res, 200, loadResults().filter((r) => r.deviceId === dev[1]).slice(-500));

  if (path === '/api/health' && method === 'GET') return send(res, 200, { ok: true, pinSet: existsSync(pinFile) });

  if (path === '/api/content') {
    if (method === 'GET') return send(res, 200, readJson(contentFile, null));
    if (method === 'PUT') {
      if (!requirePin()) return;
      const body = await readBody(req);
      if (!body || typeof body !== 'object' || !Array.isArray((body as { units?: unknown }).units)) return send(res, 400, { error: 'Nội dung không hợp lệ' });
      writeAtomic(contentFile, JSON.stringify(body, null, 1));
      return send(res, 200, { ok: true });
    }
  }

  if (path === '/api/pin' && method === 'POST') {
    const body = (await readBody(req, 1024)) as { pin?: unknown; oldPin?: unknown } | null;
    if (!validPin(body?.pin)) return send(res, 400, { error: 'Mã PIN phải gồm 4–8 chữ số' });
    if (existsSync(pinFile)) {
      const r = checkPin(dataDir, body?.oldPin);
      if (r !== 'ok') return send(res, 401, { error: r === 'locked' ? PIN_ERRORS.locked : 'Mã PIN cũ không đúng' });
    }
    const salt = randomBytes(16).toString('hex');
    writeAtomic(pinFile, JSON.stringify({ salt, hash: hashPin(body.pin, salt) }));
    return send(res, 200, { ok: true });
  }

  if (path === '/api/login' && method === 'POST') {
    const body = (await readBody(req, 1024)) as { pin?: unknown } | null;
    const r = checkPin(dataDir, body?.pin);
    return r === 'ok' ? send(res, 200, { ok: true }) : send(res, r === 'unset' ? 403 : 401, { error: PIN_ERRORS[r] });
  }

  if (path === '/api/results') {
    if (method === 'POST') {
      const body = await readBody(req, MAX_RESULT * 200);
      const list = (Array.isArray(body) ? body : [body]).filter((r) => r && typeof r === 'object' && typeof (r as { id?: unknown }).id === 'string');
      const lines = list.map((r) => JSON.stringify(r)).filter((l) => l.length <= MAX_RESULT);
      if (lines.length) appendFileSync(resultsFile, lines.join('\n') + '\n', 'utf8');
      return send(res, 200, { ok: true, saved: lines.length });
    }
    if (method === 'GET') {
      if (!requirePin()) return;
      return send(res, 200, loadResults());
    }
    if (method === 'DELETE') {
      if (!requirePin()) return;
      if (existsSync(resultsFile)) renameSync(resultsFile, join(dataDir, `results-backup-${Date.now()}.jsonl`));
      return send(res, 200, { ok: true });
    }
  }

  send(res, 404, { error: 'Không có API này' });
}
