// ============================================================
// Bài tập về nhà: giáo viên giao một bộ câu hỏi (sinh sẵn, cả lớp làm giống nhau)
// kèm hạn nộp. Máy học sinh tải danh sách về, lưu lại để làm cả khi mất mạng,
// kết quả gửi về /api/results như các trận khác (mode "homework").
// Lưu ở data/homework.json.
//
// API:
//   GET    /api/homework            → danh sách bài đã giao (mới nhất trước)
//   POST   /api/homework      [PIN] → giao bài { title, note, unitId, unit, questions, timerSec, due } → bài vừa tạo
//   PATCH  /api/homework/:id  [PIN] → sửa { title?, note?, due?, closed? }
//   DELETE /api/homework/:id  [PIN] → xóa bài (kết quả đã nộp vẫn còn trong thống kê)
// ============================================================
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { validQuestions } from './classRoom.ts';

interface Homework {
  id: string;
  title: string;
  note: string;
  unitId: string;
  unit: string;
  questions: unknown[];
  /** Giây mỗi câu, 0 = không giới hạn */
  timerSec: number;
  /** Hạn nộp, dạng YYYY-MM-DD (hết ngày này) */
  due: string;
  createdAt: string;
  /** Đã kết thúc: học sinh không thấy bài này nữa (nếu chưa làm) */
  closed: boolean;
}

export interface HomeworkDeps {
  dataDir: string;
  readBody: (req: IncomingMessage, limit?: number) => Promise<unknown>;
  requirePin: () => boolean;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: <T>(file: string, fallback: T) => T;
  writeAtomic: (file: string, text: string) => void;
}

const MAX_HOMEWORK = 300;

const clean = (s: unknown, max: number) =>
  String(s ?? '')
    .replace(/[\u0000-\u0009\u000b-\u001f<>]/g, '')
    .trim()
    .slice(0, max);
const validDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const validTimer = (n: unknown) => (typeof n === 'number' && [0, 10, 15, 20, 30, 45, 60].includes(n) ? n : 0);

export async function handleHomework(req: IncomingMessage, res: ServerResponse, path: string, deps: HomeworkDeps): Promise<boolean> {
  if (path !== '/api/homework' && !path.startsWith('/api/homework/')) return false;
  const { send } = deps;
  const method = req.method ?? 'GET';
  const file = join(deps.dataDir, 'homework.json');
  const load = (): Homework[] => {
    const d = deps.readJson<{ list?: Homework[] }>(file, { list: [] });
    return Array.isArray(d.list) ? d.list : [];
  };
  const save = (list: Homework[]) => deps.writeAtomic(file, JSON.stringify({ list }, null, 1));

  if (path === '/api/homework') {
    if (method === 'GET') {
      send(res, 200, load());
      return true;
    }
    if (method === 'POST') {
      if (!deps.requirePin()) return true;
      const b = (await deps.readBody(req, 2 * 1024 * 1024)) as Partial<Homework> | null;
      if (!b || typeof b.unitId !== 'string' || !validQuestions(b.questions) || !validDate(b.due)) {
        send(res, 400, { error: 'Bài tập không hợp lệ' });
        return true;
      }
      const hw: Homework = {
        id: 'hw-' + randomBytes(5).toString('hex'),
        title: clean(b.title, 80) || 'Bài tập về nhà',
        note: clean(b.note, 500),
        unitId: b.unitId,
        unit: clean(b.unit ?? b.unitId, 200),
        questions: b.questions,
        timerSec: validTimer(b.timerSec),
        due: b.due,
        createdAt: new Date().toISOString(),
        closed: false,
      };
      save([hw, ...load()].slice(0, MAX_HOMEWORK));
      send(res, 200, hw);
      return true;
    }
  }

  const m = /^\/api\/homework\/([\w-]{1,40})$/.exec(path);
  if (m && (method === 'PATCH' || method === 'DELETE')) {
    if (!deps.requirePin()) return true;
    const list = load();
    const i = list.findIndex((h) => h.id === m[1]);
    if (i < 0) {
      send(res, 404, { error: 'Không có bài tập này' });
      return true;
    }
    if (method === 'DELETE') {
      list.splice(i, 1);
      save(list);
      send(res, 200, { ok: true });
      return true;
    }
    const b = ((await deps.readBody(req, 8192)) ?? {}) as Partial<Homework>;
    const hw = { ...list[i] };
    if (b.title !== undefined) hw.title = clean(b.title, 80) || hw.title;
    if (b.note !== undefined) hw.note = clean(b.note, 500);
    if (b.due !== undefined) {
      if (!validDate(b.due)) {
        send(res, 400, { error: 'Hạn nộp không hợp lệ' });
        return true;
      }
      hw.due = b.due;
    }
    if (b.closed !== undefined) hw.closed = !!b.closed;
    list[i] = hw;
    save(list);
    send(res, 200, hw);
    return true;
  }

  return false;
}
