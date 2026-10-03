// ============================================================
// Cài đặt người chơi (lưu vào trình duyệt)
// ============================================================
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { QUESTION_TYPES, type QuestionType } from '../game/questions/types';

export const TIMER_OPTIONS = [10, 15, 20, 30];

interface SettingsState {
  musicOn: boolean;
  sfxOn: boolean;
  /** Thời gian mỗi câu (giây), mặc định 15 */
  timerSec: number;
  /** Dạng câu hỏi được bật */
  enabledTypes: Record<QuestionType, boolean>;
  toggleMusic: () => void;
  toggleSfx: () => void;
  setTimer: (sec: number) => void;
  /** Bật/tắt 1 dạng câu hỏi (luôn giữ ít nhất 1 dạng bật) */
  toggleType: (t: QuestionType) => void;
  setAllTypes: (on: boolean) => void;
}

const allOn = Object.fromEntries(QUESTION_TYPES.map((t) => [t.id, true])) as Record<QuestionType, boolean>;

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      musicOn: true,
      sfxOn: true,
      timerSec: 15,
      enabledTypes: allOn,
      toggleMusic: () => set({ musicOn: !get().musicOn }),
      toggleSfx: () => set({ sfxOn: !get().sfxOn }),
      setTimer: (sec) => set({ timerSec: sec }),
      toggleType: (t) => {
        const cur = get().enabledTypes;
        const next = { ...cur, [t]: !cur[t] };
        if (Object.values(next).some(Boolean)) set({ enabledTypes: next });
      },
      setAllTypes: (on) =>
        set({
          enabledTypes: on ? allOn : ({ ...Object.fromEntries(QUESTION_TYPES.map((t) => [t.id, false])), 'img-vi': true } as Record<QuestionType, boolean>),
        }),
    }),
    {
      name: 'bqe-settings',
      // Gộp với mặc định để khi thêm dạng câu mới, dạng đó tự bật
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return { ...current, ...p, enabledTypes: { ...allOn, ...(p.enabledTypes ?? {}) } };
      },
    },
  ),
);

export function enabledTypeList(enabled: Record<QuestionType, boolean>): QuestionType[] {
  return QUESTION_TYPES.map((t) => t.id).filter((id) => enabled[id]);
}
