// ============================================================
// Supabase client dùng chung cho cả game (chỉ tạo 1 client):
//  - net/transport.ts: phòng "Solo với bạn" (Realtime)
//  - services/cloudApi.ts: bài học, bài tập, kết quả, PIN giáo viên (RPC)
// Cấu hình bằng file .env.local (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).
// Thư viện chỉ được nạp khi cần để trang chủ tải nhanh hơn.
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Đã cấu hình máy chủ Supabase (file .env.local) chưa */
export const onlineConfigured = !!(SUPABASE_URL && SUPABASE_KEY);

let client: Promise<SupabaseClient> | null = null;

export function getSupabase(): Promise<SupabaseClient> {
  client ??= import('@supabase/supabase-js')
    .then(({ createClient }) => createClient(SUPABASE_URL!, SUPABASE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }))
    .catch((e: unknown) => {
      // Không nạp được thư viện (VD mất mạng khi chưa lưu offline) → lần sau thử lại
      client = null;
      throw e;
    });
  return client;
}
