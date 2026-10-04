// ============================================================
// Phòng luyện tập của giáo viên: cả lớp cùng trả lời một bộ câu hỏi.
// Phòng nằm trong bộ nhớ của máy chủ (máy giáo viên), học sinh vào bằng mã 4 số
// hoặc quét QR, cùng mạng Wi-Fi. Không cần Internet.
//
// Đồng bộ bằng "long-poll": máy học sinh / màn hình chiếu hỏi trạng thái kèm số
// phiên bản đã có, máy chủ giữ yêu cầu tới khi có thay đổi (tối đa 25 giây).
// Máy chủ tự chấm điểm theo giờ của nó nên mọi máy được tính công bằng.
//
// API (code = mã phòng 4 số, key = khóa của giáo viên trả về khi tạo phòng):
//   GET    /api/class/net                    → các địa chỉ mạng LAN của máy giáo viên (để làm QR)
//   POST   /api/class                  [PIN] → tạo phòng { unitId, unit, questions, limitMs } → { code, key }
//   GET    /api/class/:code/state?since=&key=|pid=  → trạng thái (chờ tới khi có thay đổi)
//   POST   /api/class/:code/join              → học sinh vào phòng { name, deviceId } → { pid }
//   POST   /api/class/:code/answer            → { pid, q, choice? , order? } → { correct, points }
//   POST   /api/class/:code/control    [key]  → { action: start | reveal | next | end | kick | restart, ... }
//   DELETE /api/class/:code            [key]  → đóng phòng
// ============================================================
import { networkInterfaces } from 'node:os';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { comboBonus } from '../src/game/battle/rules.ts';

/** Câu hỏi (rút gọn từ src/game/questions/types.ts) */
interface ClassQuestion {
  id: string;
  type: string;
  mode: 'choice' | 'order';
  instruction: string;
  prompt: Record<string, unknown>;
  choices: string[];
  answerIndex: number;
  tokens?: string[];
  answerTokens?: string[];
  answerText: string;
  explanation: string;
  item: { id: string; en: string; vi: string; image?: string | null; audio?: string | null };
}

interface Answer {
  choice: number | null;
  order: string[] | null;
  correct: boolean;
  points: number;
  ms: number;
}

interface Player {
  pid: string;
  deviceId: string;
  name: string;
  score: number;
  correct: number;
  streak: number;
  bestStreak: number;
  answers: Record<number, Answer>;
  joinedAt: number;
  lastSeen: number;
  online: boolean;
  /** Số yêu cầu long-poll đang mở */
  polls: number;
}

export type ClassPhase = 'lobby' | 'question' | 'reveal' | 'end';

interface Room {
  code: string;
  key: string;
  unitId: string;
  unit: string;
  questions: ClassQuestion[];
  limitMs: number;
  phase: ClassPhase;
  qIndex: number;
  /** Giờ máy chủ: câu hiện tại bắt đầu (sau 3 giây chuẩn bị) / hết giờ */
  startsAt: number;
  deadline: number;
  /** Lượt chơi (tăng khi chơi lại) để kết quả lưu không trùng id */
  round: number;
  players: Map<string, Player>;
  kicked: Set<string>;
  version: number;
  waiters: Set<Waiter>;
  timer: ReturnType<typeof setTimeout> | null;
  touched: number;
  saved: boolean;
}

interface Waiter {
  res: ServerResponse;
  key?: string;
  pid?: string;
  timer: ReturnType<typeof setTimeout>;
}

/** Thời gian chuẩn bị trước mỗi câu */
export const GET_READY_MS = 3000;
const MAX_PLAYERS = 60;
const POLL_MS = 25_000;
/** Mất kết nối quá lâu → coi như rời phòng (vẫn giữ điểm, vào lại được) */
const OFFLINE_MS = 8_000;
const ROOM_TTL_MS = 4 * 60 * 60_000;

const rooms = new Map<string, Room>();

/** Hệ số thời gian theo dạng câu (giống QUESTION_TYPES.timeFactor) */
const TIME_FACTOR: Record<string, number> = { 'pat-response': 1.3, 'pat-fill': 1.2, 'pat-order': 2 };
const limitFor = (r: Room, q: ClassQuestion) => Math.round(r.limitMs * (TIME_FACTOR[q.type] ?? 1));

const send = (res: ServerResponse, status: number, body: unknown) => {
  if (res.writableEnded) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

const newCode = () => {
  for (let i = 0; i < 200; i++) {
    const c = String(1000 + Math.floor(Math.random() * 9000));
    if (!rooms.has(c)) return c;
  }
  throw new Error('Hết mã phòng');
};

const cleanName = (s: unknown) =>
  String(s ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, 16);

// ---------------- Trạng thái gửi đi ----------------

/** Ẩn đáp án khi câu hỏi đang mở */
function hideAnswer(q: ClassQuestion): ClassQuestion {
  return { ...q, answerIndex: -1, answerTokens: undefined, answerText: '', explanation: '' };
}

function ranking(r: Room) {
  return [...r.players.values()].sort((a, b) => b.score - a.score || b.correct - a.correct || a.joinedAt - b.joinedAt);
}

/** Xếp hạng có tính đồng hạng (cùng điểm & cùng số câu đúng → cùng hạng) */
function places(r: Room) {
  const list = ranking(r);
  const out = new Map<string, number>();
  list.forEach((p, i) => {
    const prev = list[i - 1];
    out.set(p.pid, prev && prev.score === p.score && prev.correct === p.correct ? out.get(prev.pid)! : i + 1);
  });
  return { list, place: out };
}

function hostView(r: Room) {
  const q = r.questions[r.qIndex];
  const { list, place } = places(r);
  const counts = q ? (q.mode === 'choice' ? q.choices.map(() => 0) : [0, 0]) : [];
  let answered = 0;
  for (const p of r.players.values()) {
    const a = p.answers[r.qIndex];
    if (!a) continue;
    answered++;
    if (q?.mode === 'choice' && a.choice !== null) counts[a.choice]++;
    else if (q?.mode === 'order') counts[a.correct ? 0 : 1]++;
  }
  return {
    role: 'host' as const,
    code: r.code,
    round: r.round,
    unitId: r.unitId,
    unit: r.unit,
    phase: r.phase,
    qIndex: r.qIndex,
    total: r.questions.length,
    startsAt: r.startsAt,
    deadline: r.deadline,
    question: q ?? null,
    answered,
    // Số người chọn từng đáp án (câu sắp xếp: [đúng, sai]) — chỉ hiện khi công bố đáp án
    counts: r.phase === 'question' ? null : counts,
    players: list.map((p) => ({
      pid: p.pid,
      name: p.name,
      score: p.score,
      correct: p.correct,
      bestStreak: p.bestStreak,
      online: p.online,
      place: place.get(p.pid)!,
      answeredNow: !!p.answers[r.qIndex],
      last: r.phase === 'question' ? null : (p.answers[r.qIndex] ?? null),
    })),
    // Tỉ lệ đúng từng câu (để giáo viên thấy câu nào cả lớp hay sai)
    perQuestion:
      r.phase === 'end'
        ? r.questions.map((qq, i) => {
            const all = [...r.players.values()];
            const ok = all.filter((p) => p.answers[i]?.correct).length;
            return { en: qq.item.en, vi: qq.item.vi, text: qq.answerText, correct: ok, total: all.length };
          })
        : null,
  };
}

function playerView(r: Room, pid: string) {
  const p = r.players.get(pid);
  if (!p) return { role: 'player' as const, code: r.code, gone: true, kicked: r.kicked.has(pid) };
  const q = r.questions[r.qIndex];
  const { list, place } = places(r);
  return {
    role: 'player' as const,
    code: r.code,
    round: r.round,
    unit: r.unit,
    phase: r.phase,
    qIndex: r.qIndex,
    total: r.questions.length,
    startsAt: r.startsAt,
    deadline: r.deadline,
    question: q ? (r.phase === 'question' ? hideAnswer(q) : q) : null,
    players: r.players.size,
    me: {
      pid: p.pid,
      name: p.name,
      score: p.score,
      correct: p.correct,
      streak: p.streak,
      bestStreak: p.bestStreak,
      place: place.get(p.pid)!,
      answer: p.answers[r.qIndex] ?? null,
    },
    top: r.phase === 'end' || r.phase === 'reveal' ? list.slice(0, 5).map((x) => ({ name: x.name, score: x.score, place: place.get(x.pid)! })) : [],
  };
}

function viewFor(r: Room, w: { key?: string; pid?: string }) {
  return { now: Date.now(), version: r.version, ...(w.key === r.key ? hostView(r) : playerView(r, w.pid ?? '')) };
}

/** Có thay đổi → trả lời mọi yêu cầu đang chờ */
function bump(r: Room) {
  r.version++;
  r.touched = Date.now();
  for (const w of r.waiters) {
    clearTimeout(w.timer);
    send(w.res, 200, viewFor(r, w));
  }
  r.waiters.clear();
}

// ---------------- Diễn biến trận ----------------

function clearTimer(r: Room) {
  if (r.timer) clearTimeout(r.timer);
  r.timer = null;
}

function openQuestion(r: Room, index: number) {
  clearTimer(r);
  r.phase = 'question';
  r.qIndex = index;
  r.startsAt = Date.now() + GET_READY_MS;
  r.deadline = r.startsAt + limitFor(r, r.questions[index]);
  // Hết giờ → tự công bố đáp án (thêm 300ms cho độ trễ mạng)
  r.timer = setTimeout(() => reveal(r), r.deadline - Date.now() + 300);
  bump(r);
}

function reveal(r: Room) {
  if (r.phase !== 'question') return;
  clearTimer(r);
  // Ai chưa trả lời → mất chuỗi đúng
  for (const p of r.players.values()) if (!p.answers[r.qIndex]) p.streak = 0;
  r.phase = 'reveal';
  bump(r);
}

function finish(r: Room, onResults: (records: unknown[]) => void) {
  clearTimer(r);
  if (r.phase === 'question') for (const p of r.players.values()) if (!p.answers[r.qIndex]) p.streak = 0;
  r.phase = 'end';
  // Ghi kết quả từng học sinh vào thống kê (chỉ những câu đã mở)
  if (!r.saved) {
    r.saved = true;
    const asked = r.qIndex + 1;
    const { place } = places(r);
    const at = new Date().toISOString();
    const records = [...r.players.values()]
      .filter((p) => Object.keys(p.answers).length > 0)
      .map((p) => {
        const wrong = new Map<string, { id: string; en: string; vi: string }>();
        for (let i = 0; i < asked; i++) {
          if (p.answers[i]?.correct) continue;
          const it = r.questions[i].item;
          wrong.set(it.id, { id: it.id, en: it.en, vi: it.vi });
        }
        const pl = place.get(p.pid)!;
        return {
          id: `class-${r.code}-${r.key.slice(0, 6)}-${r.round}-${p.pid}`,
          at,
          deviceId: p.deviceId,
          player: p.name,
          mode: 'class',
          unitId: r.unitId,
          unit: r.unit,
          opponent: `Lớp học · phòng ${r.code} (${r.players.size} bạn)`,
          outcome: pl <= 3 ? 'win' : 'draw',
          place: pl,
          score: p.score,
          answered: asked,
          correct: p.correct,
          maxCombo: p.bestStreak,
          wrong: [...wrong.values()],
        };
      });
    if (records.length) onResults(records);
  }
  bump(r);
}

function grade(q: ClassQuestion, body: { choice?: unknown; order?: unknown }) {
  if (q.mode === 'order') {
    const order = Array.isArray(body.order) ? body.order.map(String).slice(0, 30) : [];
    const norm = (t: string[]) => t.join(' ').toLowerCase();
    return { choice: null, order, correct: !!q.answerTokens && norm(order) === norm(q.answerTokens) };
  }
  const choice = typeof body.choice === 'number' && body.choice >= 0 && body.choice < q.choices.length ? Math.floor(body.choice) : -1;
  return { choice: choice < 0 ? null : choice, order: null, correct: choice === q.answerIndex };
}

// ---------------- Mạng LAN ----------------

/** Địa chỉ IPv4 trong mạng nội bộ, ưu tiên Wi-Fi gia đình / trường học (192.168.x.x) */
export function lanAddresses() {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  const score = (ip: string) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : ip.startsWith('169.254.') ? 9 : 5);
  return out.sort((a, b) => score(a) - score(b)).filter((ip) => !ip.startsWith('169.254.'));
}

// ---------------- Xử lý yêu cầu ----------------

export interface ClassApiDeps {
  readBody: (req: IncomingMessage, limit?: number) => Promise<unknown>;
  /** Kiểm tra PIN giáo viên (tự trả lỗi nếu sai). Có Supabase thì kiểm tra qua Internet nên có thể chờ. */
  requirePin: () => boolean | Promise<boolean>;
  /** Ghi kết quả vào thống kê */
  saveResults: (records: unknown[]) => void;
}

// Dọn phòng bỏ quên + đánh dấu học sinh mất kết nối
setInterval(() => {
  const now = Date.now();
  for (const r of rooms.values()) {
    if (now - r.touched > ROOM_TTL_MS) {
      closeRoom(r);
      continue;
    }
    let changed = false;
    for (const p of r.players.values()) {
      const online = p.polls > 0 || now - p.lastSeen < OFFLINE_MS;
      if (online !== p.online) {
        p.online = online;
        changed = true;
      }
    }
    if (changed) bump(r);
  }
}, 2000).unref?.();

function closeRoom(r: Room) {
  clearTimer(r);
  rooms.delete(r.code);
  for (const w of r.waiters) {
    clearTimeout(w.timer);
    send(w.res, 404, { error: 'Phòng đã đóng', closed: true });
  }
  r.waiters.clear();
}

export function validQuestions(list: unknown): list is ClassQuestion[] {
  return (
    Array.isArray(list) &&
    list.length > 0 &&
    list.length <= 50 &&
    list.every((q) => {
      const x = q as ClassQuestion;
      return x && typeof x.id === 'string' && (x.mode === 'choice' || x.mode === 'order') && Array.isArray(x.choices) && x.item && typeof x.item.en === 'string';
    })
  );
}

export async function handleClass(req: IncomingMessage, res: ServerResponse, path: string, url: URL, deps: ClassApiDeps): Promise<boolean> {
  if (!path.startsWith('/api/class')) return false;
  const method = req.method ?? 'GET';

  if (path === '/api/class/net' && method === 'GET') {
    const port = req.socket.localPort;
    send(res, 200, { ips: lanAddresses(), port });
    return true;
  }

  if (path === '/api/class' && method === 'POST') {
    if (!(await deps.requirePin())) return true;
    const body = (await deps.readBody(req, 2 * 1024 * 1024)) as { unitId?: unknown; unit?: unknown; questions?: unknown; limitMs?: unknown } | null;
    if (!body || typeof body.unitId !== 'string' || !validQuestions(body.questions)) {
      send(res, 400, { error: 'Bộ câu hỏi không hợp lệ' });
      return true;
    }
    const code = newCode();
    const limitMs = Math.min(120_000, Math.max(5_000, Number(body.limitMs) || 20_000));
    const r: Room = {
      code,
      key: randomBytes(12).toString('hex'),
      unitId: body.unitId,
      unit: String(body.unit ?? body.unitId).slice(0, 200),
      questions: body.questions,
      limitMs,
      phase: 'lobby',
      qIndex: 0,
      startsAt: 0,
      deadline: 0,
      round: 1,
      players: new Map(),
      kicked: new Set(),
      version: 1,
      waiters: new Set(),
      timer: null,
      touched: Date.now(),
      saved: false,
    };
    rooms.set(code, r);
    send(res, 200, { code, key: r.key });
    return true;
  }

  const m = /^\/api\/class\/(\d{4})(?:\/(state|join|answer|control))?$/.exec(path);
  if (!m) return false;
  const r = rooms.get(m[1]);
  if (!r) {
    send(res, 404, { error: 'Không có phòng này. Kiểm tra lại mã phòng nhé!', closed: true });
    return true;
  }
  const action = m[2];
  const isHost = (k: unknown) => typeof k === 'string' && k === r.key;

  if (!action && method === 'DELETE') {
    if (!isHost(req.headers['x-class-key'])) send(res, 403, { error: 'Không phải giáo viên của phòng' });
    else {
      closeRoom(r);
      send(res, 200, { ok: true });
    }
    return true;
  }

  if (action === 'state' && method === 'GET') {
    const key = url.searchParams.get('key') ?? undefined;
    const pid = url.searchParams.get('pid') ?? undefined;
    const since = Number(url.searchParams.get('since') ?? 0);
    const p = pid ? r.players.get(pid) : undefined;
    if (p) {
      p.lastSeen = Date.now();
      if (!p.online) {
        p.online = true;
        bump(r);
      }
    }
    const w = { key, pid };
    if (since !== r.version) {
      send(res, 200, viewFor(r, w));
      return true;
    }
    // Chờ tới khi có thay đổi
    const waiter: Waiter = {
      res,
      key,
      pid,
      timer: setTimeout(() => {
        r.waiters.delete(waiter);
        send(res, 200, viewFor(r, w));
      }, POLL_MS),
    };
    if (p) p.polls++;
    r.waiters.add(waiter);
    res.on('close', () => {
      clearTimeout(waiter.timer);
      r.waiters.delete(waiter);
      if (p) {
        p.polls = Math.max(0, p.polls - 1);
        p.lastSeen = Date.now();
      }
    });
    return true;
  }

  if (action === 'join' && method === 'POST') {
    const body = (await deps.readBody(req, 4096)) as { name?: unknown; deviceId?: unknown } | null;
    const name = cleanName(body?.name);
    const deviceId = String(body?.deviceId ?? '').slice(0, 40);
    if (!name) {
      send(res, 400, { error: 'Em hãy nhập tên nhé!' });
      return true;
    }
    // Cùng máy vào lại (tải lại trang, mất mạng) → giữ nguyên điểm
    const again = deviceId ? [...r.players.values()].find((p) => p.deviceId === deviceId) : undefined;
    if (again) {
      if (r.kicked.has(again.pid)) r.kicked.delete(again.pid);
      again.name = name;
      again.lastSeen = Date.now();
      bump(r);
      send(res, 200, { pid: again.pid });
      return true;
    }
    if (r.players.size >= MAX_PLAYERS) {
      send(res, 409, { error: `Phòng đã đủ ${MAX_PLAYERS} bạn.` });
      return true;
    }
    // Trùng tên → thêm số để thầy cô phân biệt
    let finalName = name;
    const taken = new Set([...r.players.values()].map((p) => p.name.toLowerCase()));
    for (let i = 2; taken.has(finalName.toLowerCase()); i++) finalName = `${name.slice(0, 13)} ${i}`;
    const pid = randomBytes(6).toString('hex');
    r.players.set(pid, { pid, deviceId, name: finalName, score: 0, correct: 0, streak: 0, bestStreak: 0, answers: {}, joinedAt: Date.now(), lastSeen: Date.now(), online: true, polls: 0 });
    bump(r);
    send(res, 200, { pid });
    return true;
  }

  if (action === 'answer' && method === 'POST') {
    const body = (await deps.readBody(req, 8192)) as { pid?: unknown; q?: unknown; choice?: unknown; order?: unknown } | null;
    const p = r.players.get(String(body?.pid ?? ''));
    if (!p) {
      send(res, 404, { error: 'Em chưa vào phòng', gone: true });
      return true;
    }
    const now = Date.now();
    if (r.phase !== 'question' || body?.q !== r.qIndex || now < r.startsAt - 200 || now > r.deadline + 500) {
      send(res, 409, { error: 'Câu hỏi đã đóng' });
      return true;
    }
    if (p.answers[r.qIndex]) {
      send(res, 200, p.answers[r.qIndex]);
      return true;
    }
    const q = r.questions[r.qIndex];
    const g = grade(q, body);
    const limit = limitFor(r, q);
    const ms = Math.min(limit, Math.max(0, now - r.startsAt));
    let points = 0;
    if (g.correct) {
      p.streak++;
      p.bestStreak = Math.max(p.bestStreak, p.streak);
      p.correct++;
      // Giống cách tính điểm của game: 100 + thưởng tốc độ (tối đa 50) + thưởng chuỗi đúng
      points = 100 + Math.round(50 * (1 - ms / limit)) + comboBonus(p.streak);
      p.score += points;
    } else p.streak = 0;
    const a: Answer = { ...g, points, ms };
    p.answers[r.qIndex] = a;
    p.lastSeen = now;
    // Cả lớp (đang kết nối) đã trả lời → công bố đáp án luôn
    const active = [...r.players.values()].filter((x) => x.online);
    if (active.length > 0 && active.every((x) => x.answers[r.qIndex])) reveal(r);
    else bump(r);
    send(res, 200, a);
    return true;
  }

  if (action === 'control' && method === 'POST') {
    if (!isHost(req.headers['x-class-key'])) {
      send(res, 403, { error: 'Không phải giáo viên của phòng' });
      return true;
    }
    const body = (await deps.readBody(req, 2 * 1024 * 1024)) as { action?: unknown; pid?: unknown; questions?: unknown } | null;
    const act = body?.action;
    if (act === 'start' && r.phase === 'lobby') openQuestion(r, 0);
    else if (act === 'reveal') reveal(r);
    else if (act === 'next' && r.phase === 'reveal') {
      if (r.qIndex + 1 < r.questions.length) openQuestion(r, r.qIndex + 1);
      else finish(r, deps.saveResults);
    } else if (act === 'end' && r.phase !== 'end' && r.phase !== 'lobby') finish(r, deps.saveResults);
    else if (act === 'kick' && typeof body?.pid === 'string' && r.players.has(body.pid)) {
      r.players.delete(body.pid);
      r.kicked.add(body.pid);
      bump(r);
    } else if (act === 'restart' && r.phase === 'end') {
      // Chơi lại cùng phòng (bộ câu hỏi mới), giữ học sinh, điểm về 0
      if (!validQuestions(body?.questions)) {
        send(res, 400, { error: 'Bộ câu hỏi không hợp lệ' });
        return true;
      }
      clearTimer(r);
      r.questions = body.questions;
      r.round++;
      r.saved = false;
      r.phase = 'lobby';
      r.qIndex = 0;
      for (const p of r.players.values()) Object.assign(p, { score: 0, correct: 0, streak: 0, bestStreak: 0, answers: {} });
      bump(r);
    } else {
      send(res, 409, { error: 'Không thực hiện được lúc này' });
      return true;
    }
    send(res, 200, { ok: true });
    return true;
  }

  return false;
}
