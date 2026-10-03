// ============================================================
// Gửi kết quả từng trận về máy chủ giáo viên để thống kê.
// Mất mạng → xếp hàng trong trình duyệt và gửi lại sau.
// Luôn giữ bản sao 500 trận gần nhất trên máy (dùng khi không có máy chủ).
// ============================================================
import { describeSelection, getUnit } from '../content';
import type { Question } from '../game/questions/types';
import { useProgress } from '../stores/progress';
import { api, checkServer, isServerOk } from './api';

export type ResultMode = 'adventure' | 'duel-bot' | 'duel-pvp' | 'class' | 'homework';

export interface ResultRecord {
  id: string;
  /** Thời điểm kết thúc (ISO) */
  at: string;
  deviceId: string;
  player: string;
  mode: ResultMode;
  unitId: string;
  /** Tên đầy đủ của bài, VD "Global Success · Lớp 3 · Unit 1: Hello" */
  unit: string;
  /** Tên quái / bot / bạn */
  opponent: string;
  outcome: 'win' | 'loss' | 'draw';
  score: number;
  answered: number;
  correct: number;
  maxCombo: number;
  /** Thứ hạng trong lớp (phòng luyện tập của giáo viên) */
  place?: number;
  /** Số sao (phiêu lưu) */
  stars?: number;
  /** Bài tập về nhà: id bài, điểm thang 10, lần làm thứ mấy, nộp sau hạn */
  homeworkId?: string;
  grade?: number;
  attempt?: number;
  late?: boolean;
  /** Các từ / mẫu câu trả lời sai (không trùng) */
  wrong: { id: string; en: string; vi: string }[];
}

const QUEUE_KEY = 'bqe-results-queue';
const LOG_KEY = 'bqe-results-log';
const DEVICE_KEY = 'bqe-device-id';

const read = <T>(key: string, fallback: T): T => {
  try {
    const t = localStorage.getItem(key);
    return t ? (JSON.parse(t) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* hết dung lượng */
  }
};

export function deviceId() {
  let id = read<string | null>(DEVICE_KEY, null);
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    write(DEVICE_KEY, id);
  }
  return id;
}

export function unitLabel(unitId: string) {
  const u = getUnit(unitId);
  if (!u) return unitId;
  const d = describeSelection({ bookId: u.bookId, gradeId: u.gradeId, unitId });
  return `${d.book} · ${d.grade} · ${d.unit}`;
}

/** Ghi nhận 1 trận vừa xong */
export function reportResult(r: Omit<ResultRecord, 'id' | 'at' | 'deviceId' | 'player' | 'unit' | 'wrong'> & { wrong: { question: Question }[] }) {
  const wrong = Array.from(new Map(r.wrong.map((w) => [w.question.item.id, { id: w.question.item.id, en: w.question.item.en, vi: w.question.item.vi }])).values());
  const rec: ResultRecord = {
    ...r,
    id: `${deviceId()}-${Date.now().toString(36)}`,
    at: new Date().toISOString(),
    deviceId: deviceId(),
    player: useProgress.getState().playerName,
    unit: unitLabel(r.unitId),
    wrong,
  };
  write(LOG_KEY, [...read<ResultRecord[]>(LOG_KEY, []), rec].slice(-500));
  write(QUEUE_KEY, [...read<ResultRecord[]>(QUEUE_KEY, []), rec].slice(-1000));
  void flushResults();
}

let flushing = false;
/** Có kết quả mới trong lúc đang gửi → gửi tiếp ngay khi xong (không phải chờ 60 giây) */
let again = false;

/** Gửi các kết quả đang chờ lên máy chủ */
export async function flushResults() {
  if (flushing) {
    again = true;
    return;
  }
  again = false;
  const queue = read<ResultRecord[]>(QUEUE_KEY, []);
  if (!queue.length) return;
  flushing = true;
  try {
    // Lần trước không thấy máy chủ → hỏi lại (có thể giáo viên vừa bật)
    const { ok } = await checkServer(!isServerOk());
    if (!ok) return;
    const r = await api.postResults(queue);
    if (r.ok) {
      // Giữ lại các kết quả mới phát sinh trong lúc đang gửi
      const ids = new Set(queue.map((x) => x.id));
      write(QUEUE_KEY, read<ResultRecord[]>(QUEUE_KEY, []).filter((x) => !ids.has(x.id)));
    }
  } finally {
    flushing = false;
    if (again) void flushResults();
  }
}

/** Kết quả lưu trên máy này (dùng khi không có máy chủ) */
export function localResults() {
  return read<ResultRecord[]>(LOG_KEY, []);
}

export function clearLocalResults() {
  write(LOG_KEY, []);
}

/** Gửi lại định kỳ và khi có mạng trở lại */
let started = false;
export function startResultSync() {
  if (started) return;
  started = true;
  void flushResults();
  window.addEventListener('online', () => void flushResults());
  setInterval(() => void flushResults(), 60_000);
}
