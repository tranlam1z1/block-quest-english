// ============================================================
// Đăng nhập Khu vực giáo viên bằng mã PIN.
//  - 'cloud':  PIN lưu (đã băm) trên Supabase, dùng chung cho mọi máy có Internet.
//              PIN lần đầu đặt bằng script trên máy thầy cô (không đặt từ trình duyệt).
//  - 'server': PIN lưu (đã băm) trên máy chủ cục bộ, dùng chung cho mọi máy trong lớp.
//  - 'local':  không kết nối được → PIN lưu (đã băm) trong trình duyệt này.
// PIN được giữ trong phiên (sessionStorage) để tải lại trang không phải nhập lại.
// ============================================================
import { create } from 'zustand';
import { api, checkServer, storageKind } from '../services/api';
import { CLOUD_PIN_HELP } from '../services/cloudApi';

const SESSION_KEY = 'bqe-teacher-session';
const LOCAL_PIN_KEY = 'bqe-teacher-pin';

export type TeacherMode = 'cloud' | 'server' | 'local';

/** Game công khai trên Internet nên PIN trên Supabase dài hơn (6–8 chữ số) */
export const pinRule = (mode: TeacherMode | null) => (mode === 'cloud' ? { min: 6, text: '6–8 chữ số' } : { min: 4, text: '4–8 chữ số' });

export const validPin = (pin: string, mode: TeacherMode | null = null) => new RegExp(`^\\d{${pinRule(mode).min},8}$`).test(pin);

/** Dữ liệu dùng chung cho mọi máy (Supabase hoặc máy chủ cục bộ), không chỉ trình duyệt này */
export const isShared = (mode: TeacherMode | null) => mode === 'cloud' || mode === 'server';

/** Băm chuỗi. crypto.subtle chỉ có trên https / localhost → khi mở qua địa chỉ mạng LAN dùng hàm băm đơn giản */
async function sha256(text: string) {
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h1 = 0xdeadbeef ^ text.length;
  let h2 = 0x41c6ce57 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 'c53-' + (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16);
}
const localHash = (pin: string) => sha256('bqe-teacher:' + pin);

const ss = {
  get: () => {
    try {
      return sessionStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  },
  set: (v: string | null) => {
    try {
      if (v) sessionStorage.setItem(SESSION_KEY, v);
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* bỏ qua */
    }
  },
};

interface TeacherState {
  /** 'cloud' = Supabase; 'server' = máy chủ giáo viên; 'local' = chỉ lưu trên trình duyệt này; null = đang kiểm tra */
  mode: TeacherMode | null;
  pinSet: boolean;
  /** PIN của phiên đăng nhập (null = chưa đăng nhập) */
  pin: string | null;
  init: () => Promise<void>;
  /** Trả về thông báo lỗi, hoặc null nếu thành công */
  login: (pin: string) => Promise<string | null>;
  setupPin: (pin: string) => Promise<string | null>;
  changePin: (oldPin: string, pin: string) => Promise<string | null>;
  logout: () => void;
}

export const useTeacher = create<TeacherState>()((set, get) => ({
  mode: null,
  pinSet: false,
  pin: null,

  init: async () => {
    const { ok, pinSet } = await checkServer(true);
    if (ok) {
      const saved = ss.get();
      // PIN trong phiên còn đúng không (có thể giáo viên vừa đổi PIN ở máy khác)
      const still = saved ? (await api.login(saved)).ok : false;
      set({ mode: storageKind, pinSet, pin: still ? saved : null });
      if (!still) ss.set(null);
    } else {
      const hash = localStorage.getItem(LOCAL_PIN_KEY);
      const saved = ss.get();
      set({ mode: 'local', pinSet: !!hash, pin: saved && hash && (await localHash(saved)) === hash ? saved : null });
    }
  },

  login: async (pin) => {
    if (isShared(get().mode)) {
      const r = await api.login(pin);
      if (!r.ok) return r.error ?? 'Không đăng nhập được';
    } else if ((await localHash(pin)) !== localStorage.getItem(LOCAL_PIN_KEY)) return 'Mã PIN không đúng';
    ss.set(pin);
    set({ pin });
    return null;
  },

  setupPin: async (pin) => {
    const mode = get().mode;
    // Game công khai: ai mở link trước cũng có thể chiếm quyền → PIN đầu tiên chỉ đặt bằng script
    if (mode === 'cloud') return CLOUD_PIN_HELP;
    if (!validPin(pin, mode)) return `Mã PIN phải gồm ${pinRule(mode).text}`;
    if (mode === 'server') {
      const r = await api.setPin(pin);
      if (!r.ok) return r.error ?? 'Không đặt được PIN';
    } else localStorage.setItem(LOCAL_PIN_KEY, await localHash(pin));
    ss.set(pin);
    set({ pin, pinSet: true });
    return null;
  },

  changePin: async (oldPin, pin) => {
    const mode = get().mode;
    if (!validPin(pin, mode)) return `Mã PIN mới phải gồm ${pinRule(mode).text}`;
    if (isShared(mode)) {
      const r = await api.setPin(pin, oldPin);
      if (!r.ok) return r.error ?? 'Không đổi được PIN';
    } else {
      if ((await localHash(oldPin)) !== localStorage.getItem(LOCAL_PIN_KEY)) return 'Mã PIN cũ không đúng';
      localStorage.setItem(LOCAL_PIN_KEY, await localHash(pin));
    }
    ss.set(pin);
    set({ pin });
    return null;
  },

  logout: () => {
    ss.set(null);
    set({ pin: null });
  },
}));
