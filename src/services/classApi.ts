// ============================================================
// Phòng luyện tập của giáo viên — phía trình duyệt (máy chủ: server/classRoom.ts).
// useClassRoom() hỏi trạng thái liên tục bằng long-poll và tính độ lệch đồng hồ
// với máy chủ để đồng hồ đếm ngược trên mọi máy chạy giống nhau.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import type { Question } from '../game/questions/types';

export type ClassPhase = 'lobby' | 'question' | 'reveal' | 'end';

export interface ClassAnswer {
  choice: number | null;
  order: string[] | null;
  correct: boolean;
  points: number;
  ms: number;
}

interface BaseView {
  now: number;
  version: number;
  code: string;
  /** Lượt chơi trong phòng (tăng khi giáo viên bấm Chơi lại) */
  round: number;
}

export interface HostView extends BaseView {
  role: 'host';
  unitId: string;
  unit: string;
  phase: ClassPhase;
  qIndex: number;
  total: number;
  startsAt: number;
  deadline: number;
  question: Question | null;
  answered: number;
  counts: number[] | null;
  players: {
    pid: string;
    name: string;
    score: number;
    correct: number;
    bestStreak: number;
    online: boolean;
    place: number;
    answeredNow: boolean;
    last: ClassAnswer | null;
  }[];
  perQuestion: { en: string; vi: string; text: string; correct: number; total: number }[] | null;
}

export interface PlayerView extends BaseView {
  role: 'player';
  /** Bị giáo viên mời ra / phòng không còn mình */
  gone?: boolean;
  kicked?: boolean;
  unit: string;
  phase: ClassPhase;
  qIndex: number;
  total: number;
  startsAt: number;
  deadline: number;
  question: Question | null;
  players: number;
  me: { pid: string; name: string; score: number; correct: number; streak: number; bestStreak: number; place: number; answer: ClassAnswer | null };
  top: { name: string; score: number; place: number }[];
}

export type ClassView = HostView | PlayerView;

/** Thời gian chuẩn bị trước mỗi câu (giống máy chủ) */
export const GET_READY_MS = 3000;

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 8000): Promise<{ ok: boolean; status: number; data: T | null; error?: string; closed?: boolean }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(path, { ...init, signal: ctrl.signal, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) return { ok: false, status: res.status, data: null, error: 'Không thấy máy chủ của thầy cô' };
    const data = (await res.json()) as T & { error?: string; closed?: boolean };
    return { ok: res.ok, status: res.status, data: res.ok ? data : null, error: res.ok ? undefined : data?.error, closed: !!data?.closed };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: (e as Error).name === 'AbortError' ? 'Máy chủ không trả lời' : 'Không kết nối được máy chủ' };
  } finally {
    clearTimeout(t);
  }
}

const json = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({ method: 'POST', body: JSON.stringify(body), headers });

export const classApi = {
  net: () => call<{ ips: string[]; port: number }>('/api/class/net', {}, 3000),
  create: (pin: string, body: { unitId: string; unit: string; questions: Question[]; limitMs: number }) => call<{ code: string; key: string }>('/api/class', json(body, { 'x-teacher-pin': pin }), 15000),
  join: (code: string, name: string, deviceId: string) => call<{ pid: string }>(`/api/class/${code}/join`, json({ name, deviceId })),
  answer: (code: string, pid: string, q: number, a: { choice?: number; order?: string[] }) => call<ClassAnswer>(`/api/class/${code}/answer`, json({ pid, q, ...a })),
  control: (code: string, key: string, body: { action: 'start' | 'reveal' | 'next' | 'end' | 'kick' | 'restart'; pid?: string; questions?: Question[] }) =>
    call<{ ok: boolean }>(`/api/class/${code}/control`, json(body, { 'x-class-key': key }), 15000),
  close: (code: string, key: string) => call<{ ok: boolean }>(`/api/class/${code}`, { method: 'DELETE', headers: { 'x-class-key': key } }),
};

// ---------------- Phiên lưu trên máy ----------------

/** Giáo viên: khóa của phòng đang mở (tải lại trang vẫn điều khiển được) */
export const hostSession = {
  get: (code: string) => {
    try {
      return sessionStorage.getItem('bqe-class-key-' + code);
    } catch {
      return null;
    }
  },
  set: (code: string, key: string | null) => {
    try {
      if (key) {
        sessionStorage.setItem('bqe-class-key-' + code, key);
        sessionStorage.setItem('bqe-class-last', code);
      } else {
        sessionStorage.removeItem('bqe-class-key-' + code);
        if (sessionStorage.getItem('bqe-class-last') === code) sessionStorage.removeItem('bqe-class-last');
      }
    } catch {
      /* bỏ qua */
    }
  },
  /** Phòng mở gần nhất trong phiên này (để quay lại màn hình chiếu) */
  last: () => {
    try {
      return sessionStorage.getItem('bqe-class-last');
    } catch {
      return null;
    }
  },
};

/** Học sinh: mã người chơi trong phòng (tải lại trang không mất điểm) */
export const playerSession = {
  get: (code: string) => {
    try {
      return sessionStorage.getItem('bqe-class-pid-' + code);
    } catch {
      return null;
    }
  },
  set: (code: string, pid: string | null) => {
    try {
      if (pid) sessionStorage.setItem('bqe-class-pid-' + code, pid);
      else sessionStorage.removeItem('bqe-class-pid-' + code);
    } catch {
      /* bỏ qua */
    }
  },
};

// ---------------- Theo dõi trạng thái phòng ----------------

export interface ClassConn<V> {
  view: V | null;
  /** Mất kết nối tạm thời (đang thử lại) */
  offline: boolean;
  /** Phòng không còn (giáo viên đã đóng / sai mã) */
  closed: string | null;
  /** Giờ máy chủ hiện tại (ms) */
  serverNow: () => number;
  /** Hỏi lại ngay (sau khi gửi lệnh) */
  refresh: () => void;
}

/**
 * Theo dõi phòng. auth = { key } (giáo viên) hoặc { pid } (học sinh); null = chưa theo dõi.
 */
export function useClassRoom<V extends ClassView>(code: string, auth: { key: string } | { pid: string } | null): ClassConn<V> {
  const [view, setView] = useState<V | null>(null);
  const [offline, setOffline] = useState(false);
  const [closed, setClosed] = useState<string | null>(null);
  const offset = useRef(0);
  const kick = useRef<() => void>(() => {});
  const authKey = auth ? ('key' in auth ? 'key=' + auth.key : 'pid=' + auth.pid) : null;

  useEffect(() => {
    if (!authKey) return;
    let stop = false;
    let version = 0;
    let ctrl: AbortController | null = null;
    let fails = 0;
    setClosed(null);

    const loop = async () => {
      while (!stop) {
        ctrl = new AbortController();
        try {
          const res = await fetch(`/api/class/${code}/state?since=${version}&${authKey}`, { signal: ctrl.signal, cache: 'no-store' });
          const data = (await res.json()) as V & { error?: string; closed?: boolean };
          if (stop) return;
          if (!res.ok) {
            if (data?.closed) {
              setClosed(data.error ?? 'Phòng đã đóng');
              return;
            }
            throw new Error(data?.error);
          }
          // Độ lệch đồng hồ: máy chủ ghi giờ lúc trả lời, mạng LAN chỉ trễ vài ms
          offset.current = data.now - Date.now();
          version = data.version;
          fails = 0;
          setOffline(false);
          setView(data);
        } catch (e) {
          if (stop) return;
          if ((e as Error).name === 'AbortError') continue; // refresh() → hỏi lại ngay
          fails++;
          if (fails >= 2) setOffline(true);
          await new Promise((r) => setTimeout(r, Math.min(4000, 500 * fails)));
        }
      }
    };
    kick.current = () => {
      version = -1;
      ctrl?.abort();
    };
    void loop();
    return () => {
      stop = true;
      ctrl?.abort();
    };
  }, [code, authKey]);

  return { view, offline, closed, serverNow: () => Date.now() + offset.current, refresh: () => kick.current() };
}

/** Đồng hồ: vẽ lại liên tục, trả về giờ máy chủ */
export function useServerClock(serverNow: () => number, active: boolean, intervalMs = 100) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return active ? now : serverNow();
}
