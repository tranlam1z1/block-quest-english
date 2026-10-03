// ============================================================
// Gọi API của máy chủ giáo viên (server/teacherApi.ts).
// Khi không có máy chủ (VD mở bản cài offline), các hàm trả về null / false
// và game tự dùng dữ liệu lưu trên máy.
// ============================================================

let serverOk: boolean | null = null;
let pinSet = false;

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 4000): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(path, { ...init, signal: ctrl.signal, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
    const type = res.headers.get('content-type') ?? '';
    // Máy chủ tĩnh không có API thường trả về trang HTML → coi như không có
    if (!type.includes('application/json')) return { ok: false, status: res.status, data: null, error: 'Không có máy chủ' };
    const data = (await res.json()) as T & { error?: string };
    return { ok: res.ok, status: res.status, data: res.ok ? data : null, error: res.ok ? undefined : data?.error };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: (e as Error).name === 'AbortError' ? 'Máy chủ không trả lời' : 'Không kết nối được máy chủ' };
  } finally {
    clearTimeout(t);
  }
}

/** Kiểm tra máy chủ giáo viên có chạy không (ghi nhớ kết quả) */
export async function checkServer(force = false) {
  if (serverOk !== null && !force) return { ok: serverOk, pinSet };
  const r = await call<{ ok: boolean; pinSet: boolean }>('/api/health', {}, 2500);
  serverOk = r.ok;
  pinSet = !!r.data?.pinSet;
  return { ok: serverOk, pinSet };
}

export const isServerOk = () => serverOk === true;

const pinHeader = (pin: string) => ({ 'x-teacher-pin': pin });

export const api = {
  getContent: () => call<unknown>('/api/content', {}, 2500),
  saveContent: (pin: string, content: unknown) => call<{ ok: boolean }>('/api/content', { method: 'PUT', headers: pinHeader(pin), body: JSON.stringify(content) }, 15000),
  setPin: (pin: string, oldPin?: string) => call<{ ok: boolean }>('/api/pin', { method: 'POST', body: JSON.stringify({ pin, oldPin }) }),
  login: (pin: string) => call<{ ok: boolean }>('/api/login', { method: 'POST', body: JSON.stringify({ pin }) }),
  postResults: (list: unknown[]) => call<{ ok: boolean }>('/api/results', { method: 'POST', body: JSON.stringify(list) }, 8000),
  getResults: (pin: string) => call<unknown[]>('/api/results', { headers: pinHeader(pin) }, 20000),
  clearResults: (pin: string) => call<{ ok: boolean }>('/api/results', { method: 'DELETE', headers: pinHeader(pin) }),
  deviceResults: (deviceId: string) => call<unknown[]>(`/api/results/device/${encodeURIComponent(deviceId)}`, {}, 8000),
  listHomework: () => call<unknown[]>('/api/homework', {}, 6000),
  createHomework: (pin: string, hw: unknown) => call<unknown>('/api/homework', { method: 'POST', headers: pinHeader(pin), body: JSON.stringify(hw) }, 15000),
  updateHomework: (pin: string, id: string, patch: unknown) => call<unknown>(`/api/homework/${id}`, { method: 'PATCH', headers: pinHeader(pin), body: JSON.stringify(patch) }),
  deleteHomework: (pin: string, id: string) => call<{ ok: boolean }>(`/api/homework/${id}`, { method: 'DELETE', headers: pinHeader(pin) }),
};
