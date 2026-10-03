// ============================================================
// Bài tập về nhà
//  - Giáo viên giao bài (bộ câu hỏi sinh sẵn + hạn nộp) → lưu trên máy chủ (data/homework.json).
//    Không có máy chủ → lưu trên trình duyệt này (giáo viên và học sinh dùng chung máy).
//  - Máy học sinh tải danh sách về và lưu lại → làm được cả khi mất mạng.
//    Kết quả gửi về thống kê như các trận khác (mode "homework", hàng đợi offline).
// ============================================================
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Question } from '../game/questions/types';
import { HOMEWORK_BONUS_GRADE, HOMEWORK_DROP_BONUS, homeworkGold } from '../game/rewards';
import { useProgress } from '../stores/progress';
import { api, checkServer } from './api';
import { reportResult } from './results';

export interface Homework {
  id: string;
  title: string;
  /** Lời dặn của thầy cô */
  note: string;
  unitId: string;
  /** Tên đầy đủ của bài, VD "Global Success · Lớp 3 · Unit 1: Hello" */
  unit: string;
  questions: Question[];
  /** Giây mỗi câu, 0 = không giới hạn */
  timerSec: number;
  /** Hạn nộp YYYY-MM-DD (hết ngày này) */
  due: string;
  createdAt: string;
  closed: boolean;
}

/** Kết quả bài tập trên máy này */
export interface HomeworkDone {
  attempts: number;
  /** Điểm lần đầu / cao nhất (thang 10) */
  first: number;
  best: number;
  firstAt: string;
  lastAt: string;
  /** Lần đầu nộp sau hạn */
  late: boolean;
  /** Đã nhận thưởng tỉ lệ rơi ngọc (≥ 9 điểm) */
  bonus: boolean;
}

export interface HomeworkSubmit {
  correct: number;
  total: number;
  maxCombo: number;
  wrong: { question: Question }[];
}

export interface HomeworkOutcome {
  grade: number;
  attempt: number;
  late: boolean;
  gold: number;
  /** Lần này được thưởng tăng tỉ lệ rơi ngọc */
  dropBonus: boolean;
  /** Phá kỷ lục điểm của chính mình (từ lần làm thứ 2) */
  improved: boolean;
}

// ---------------- Ngày & điểm ----------------

const pad = (n: number) => String(n).padStart(2, '0');

/** Ngày theo giờ máy, dạng YYYY-MM-DD */
export const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const addDays = (days: number, d = new Date()) => localDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));

/** "15/10" hoặc "15/10/2026" */
export const fmtDate = (ymd: string, year = false) => {
  const [y, m, d] = ymd.split('-');
  return d && m ? `${d}/${m}${year ? '/' + y : ''}` : ymd;
};

/** Số ngày còn lại tới hạn (0 = hôm nay, âm = đã quá hạn) */
export function daysLeft(due: string, today = localDate()) {
  const toDay = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / 86400_000;
  };
  return Math.round(toDay(due) - toDay(today));
}

export const dueText = (due: string) => {
  const n = daysLeft(due);
  if (n < 0) return `Quá hạn ${-n} ngày`;
  if (n === 0) return 'Hạn hôm nay';
  if (n === 1) return 'Hạn ngày mai';
  return `Hạn ${fmtDate(due)} (còn ${n} ngày)`;
};

/** Điểm thang 10, làm tròn 0,5 */
export const gradeOf = (correct: number, total: number) => (total ? Math.round((correct / total) * 20) / 2 : 0);

/** "9,5" kiểu Việt Nam */
export const fmtGrade = (g: number) => String(g).replace('.', ',');

export const gradeColor = (g: number) => (g >= 8 ? 'text-green-600' : g >= 5 ? 'text-amber-600' : 'text-rose-600');

/** Số sao theo điểm: ≥ 9 → 3, ≥ 7 → 2, ≥ 5 → 1 */
export const gradeStars = (g: number) => (g >= 9 ? 3 : g >= 7 ? 2 : g >= 5 ? 1 : 0);

// ---------------- Lưu khi không có máy chủ ----------------

const LOCAL_KEY = 'bqe-homework-local';

function readLocal(): Homework[] | null {
  try {
    const t = localStorage.getItem(LOCAL_KEY);
    return t ? (JSON.parse(t) as Homework[]) : null;
  } catch {
    return null;
  }
}
function writeLocal(list: Homework[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  } catch {
    /* hết dung lượng */
  }
}

const validList = (x: unknown): x is Homework[] => Array.isArray(x) && x.every((h) => h && typeof (h as Homework).id === 'string' && Array.isArray((h as Homework).questions));

/** Thao tác của giáo viên (máy chủ, hoặc trình duyệt này nếu không có máy chủ) */
export const homeworkAdmin = {
  async list(): Promise<{ ok: boolean; data: Homework[]; error?: string }> {
    const { ok } = await checkServer();
    if (!ok) return { ok: true, data: readLocal() ?? [] };
    const r = await api.listHomework();
    return r.ok && validList(r.data) ? { ok: true, data: r.data } : { ok: false, data: [], error: r.error ?? 'Không tải được danh sách bài tập' };
  },

  async create(pin: string, hw: Omit<Homework, 'id' | 'createdAt' | 'closed'>): Promise<{ ok: boolean; data?: Homework; error?: string }> {
    const { ok } = await checkServer();
    if (!ok) {
      const made: Homework = { ...hw, id: 'hw-' + Math.random().toString(36).slice(2, 12), createdAt: new Date().toISOString(), closed: false };
      writeLocal([made, ...(readLocal() ?? [])]);
      void useHomework.getState().refresh();
      return { ok: true, data: made };
    }
    const r = await api.createHomework(pin, hw);
    void useHomework.getState().refresh();
    return r.ok ? { ok: true, data: r.data as Homework } : { ok: false, error: r.error ?? 'Không giao được bài' };
  },

  async update(pin: string, id: string, patch: Partial<Pick<Homework, 'title' | 'note' | 'due' | 'closed'>>): Promise<{ ok: boolean; error?: string }> {
    const { ok } = await checkServer();
    if (!ok) {
      writeLocal((readLocal() ?? []).map((h) => (h.id === id ? { ...h, ...patch } : h)));
      void useHomework.getState().refresh();
      return { ok: true };
    }
    const r = await api.updateHomework(pin, id, patch);
    void useHomework.getState().refresh();
    return r.ok ? { ok: true } : { ok: false, error: r.error ?? 'Không lưu được' };
  },

  async remove(pin: string, id: string): Promise<{ ok: boolean; error?: string }> {
    const { ok } = await checkServer();
    if (!ok) {
      writeLocal((readLocal() ?? []).filter((h) => h.id !== id));
      void useHomework.getState().refresh();
      return { ok: true };
    }
    const r = await api.deleteHomework(pin, id);
    void useHomework.getState().refresh();
    return r.ok ? { ok: true } : { ok: false, error: r.error ?? 'Không xóa được' };
  },
};

// ---------------- Trên máy học sinh ----------------

interface HomeworkState {
  /** Bài đã tải về (bản sao để làm khi mất mạng) */
  list: Homework[];
  done: Record<string, HomeworkDone>;
  /** Lần cuối tải được danh sách (ISO), '' = chưa bao giờ */
  syncedAt: string;
  /** Tải danh sách mới. Trả về false nếu không kết nối được (giữ bản đã lưu). */
  refresh: () => Promise<boolean>;
  submit: (hw: Homework, r: HomeworkSubmit) => HomeworkOutcome;
}

export const useHomework = create<HomeworkState>()(
  persist(
    (set, get) => ({
      list: [],
      done: {},
      syncedAt: '',

      refresh: async () => {
        const { ok } = await checkServer(true);
        if (ok) {
          const r = await api.listHomework();
          if (!r.ok || !validList(r.data)) return false;
          set({ list: r.data, syncedAt: new Date().toISOString() });
          return true;
        }
        // Không có máy chủ: dùng bài giáo viên giao trên chính trình duyệt này (nếu có)
        const local = readLocal();
        if (local) set({ list: local, syncedAt: new Date().toISOString() });
        return !!local;
      },

      submit: (hw, r) => {
        const grade = gradeOf(r.correct, r.total);
        const now = new Date();
        const prev = get().done[hw.id];
        const attempt = (prev?.attempts ?? 0) + 1;
        const late = daysLeft(hw.due, localDate(now)) < 0;
        const gold = prev ? 0 : homeworkGold(r.correct, grade);
        const dropBonus = !prev?.bonus && grade >= HOMEWORK_BONUS_GRADE;
        const at = now.toISOString();
        set({
          done: {
            ...get().done,
            [hw.id]: {
              attempts: attempt,
              first: prev?.first ?? grade,
              best: Math.max(prev?.best ?? 0, grade),
              firstAt: prev?.firstAt ?? at,
              lastAt: at,
              late: prev?.late ?? late,
              bonus: !!prev?.bonus || dropBonus,
            },
          },
        });
        const wrongItemIds = Array.from(new Set(r.wrong.map((w) => w.question.item.id)));
        useProgress.getState().recordHomework({ unitId: hw.unitId, answered: r.total, correct: r.correct, maxCombo: r.maxCombo, wrongItemIds, gold, dropBonus: dropBonus ? HOMEWORK_DROP_BONUS : 0 });
        reportResult({
          mode: 'homework',
          unitId: hw.unitId,
          opponent: hw.title,
          outcome: grade >= 5 ? 'win' : 'loss',
          score: Math.round(grade * 10),
          answered: r.total,
          correct: r.correct,
          maxCombo: r.maxCombo,
          wrong: r.wrong,
          homeworkId: hw.id,
          grade,
          attempt,
          late,
        });
        return { grade, attempt, late, gold, dropBonus, improved: !!prev && grade > prev.best };
      },
    }),
    { name: 'bqe-homework', version: 1 },
  ),
);

/** Bài cần làm: chưa làm và chưa bị thầy cô kết thúc */
export const pendingHomework = (s: Pick<HomeworkState, 'list' | 'done'>) => s.list.filter((h) => !h.closed && !s.done[h.id]);

// Chỉ khi phát triển: cho script kiểm thử truy cập
if (import.meta.env.DEV) (window as unknown as { __bqeHw: unknown }).__bqeHw = { useHomework, useProgress };
