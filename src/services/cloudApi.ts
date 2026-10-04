// ============================================================
// Lưu dữ liệu trên Supabase (khi có .env.local): cùng "hình dạng" với api trong services/api.ts,
// nhưng gọi các hàm RPC trong supabase/migrations/0001_init.sql thay cho máy chủ cục bộ.
// Mọi RPC trả về { ok, data } hoặc { ok: false, status, error }.
// Mất mạng → ok: false, game dùng dữ liệu lưu trên máy như khi không có máy chủ.
// ============================================================
import { getSupabase } from './supabase';

export type ApiResult<T> = { ok: boolean; status: number; data: T | null; error?: string };

/** Hướng dẫn khi chưa có PIN (PIN lần đầu chỉ đặt bằng script trên máy thầy cô) */
export const CLOUD_PIN_HELP = 'Chưa đặt mã PIN giáo viên. Thầy cô chạy "node scripts/setup-supabase.mjs" trên máy tính của mình để đặt mã (xem README).';

let cloudOk: boolean | null = null;
let pinSet = false;

async function rpc<T>(fn: string, args: Record<string, unknown> = {}, timeoutMs = 8000): Promise<ApiResult<T>> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const sb = await getSupabase();
    const { data, error, status } = await sb.rpc(fn, args).abortSignal(ctrl.signal);
    if (error) {
      // Lỗi mạng: thư viện trả về status 0
      if (!status) return { ok: false, status: 0, data: null, error: /abort/i.test(error.message) ? 'Máy chủ không trả lời' : 'Không kết nối được Internet' };
      if (error.code === 'PGRST202' || status === 404) return { ok: false, status: 404, data: null, error: 'Cơ sở dữ liệu trên Supabase chưa được cài đặt (xem README).' };
      return { ok: false, status, data: null, error: 'Máy chủ Supabase báo lỗi. Thử lại sau.' };
    }
    const r = data as { ok?: unknown; status?: number; data?: T; error?: string } | null;
    if (!r || typeof r.ok !== 'boolean') return { ok: false, status: 500, data: null, error: 'Máy chủ trả về dữ liệu lạ' };
    return r.ok ? { ok: true, status: 200, data: r.data ?? null } : { ok: false, status: r.status ?? 400, data: null, error: r.error };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: (e as Error).name === 'AbortError' ? 'Máy chủ không trả lời' : 'Không kết nối được Internet' };
  } finally {
    clearTimeout(t);
  }
}

/** Kiểm tra gọi được Supabase không (ghi nhớ kết quả) */
export async function checkCloud(force = false) {
  if (cloudOk !== null && !force) return { ok: cloudOk, pinSet };
  const r = await rpc<{ pinSet: boolean }>('pin_status', {}, 6000);
  cloudOk = r.ok;
  pinSet = !!r.data?.pinSet;
  return { ok: cloudOk, pinSet };
}

export const isCloudOk = () => cloudOk === true;

/** Mỗi lần gửi tối đa 200 kết quả (giới hạn của post_results) */
const RESULT_BATCH = 200;

export const cloudApi = {
  getContent: () => rpc<unknown>('get_content', {}, 6000),
  saveContent: (pin: string, content: unknown) => rpc<{ ok: boolean }>('save_content', { p_pin: pin, p_content: content }, 20000),
  setPin: async (pin: string, oldPin?: string): Promise<ApiResult<{ ok: boolean }>> =>
    oldPin === undefined ? { ok: false, status: 403, data: null, error: CLOUD_PIN_HELP } : rpc<{ ok: boolean }>('change_pin', { p_old_pin: oldPin, p_new_pin: pin }),
  login: (pin: string) => rpc<{ ok: boolean }>('teacher_login', { p_pin: pin }),
  postResults: async (list: unknown[]): Promise<ApiResult<{ ok: boolean }>> => {
    for (let i = 0; i < list.length; i += RESULT_BATCH) {
      const r = await rpc<{ ok: boolean }>('post_results', { p_results: list.slice(i, i + RESULT_BATCH) }, 10000);
      if (!r.ok) return r;
    }
    return { ok: true, status: 200, data: { ok: true } };
  },
  getResults: (pin: string) => rpc<unknown[]>('get_results', { p_pin: pin }, 30000),
  clearResults: (pin: string) => rpc<{ ok: boolean }>('clear_results', { p_pin: pin }),
  deviceResults: (deviceId: string) => rpc<unknown[]>('device_results', { p_device_id: deviceId }, 8000),
  listHomework: () => rpc<unknown[]>('list_homework', {}, 8000),
  createHomework: (pin: string, hw: unknown) => rpc<unknown>('create_homework', { p_pin: pin, p_homework: hw }, 15000),
  updateHomework: (pin: string, id: string, patch: unknown) => rpc<unknown>('update_homework', { p_pin: pin, p_id: id, p_patch: patch }),
  deleteHomework: (pin: string, id: string) => rpc<{ ok: boolean }>('delete_homework', { p_pin: pin, p_id: id }),
};
