// ============================================================
// Cài đặt Supabase cho "luyện tập ở nhà": chạy `node scripts/setup-supabase.mjs`
// (trên máy của thầy cô, SAU KHI đã dán supabase/migrations/0001_init.sql vào SQL Editor).
//
//  1. Đọc SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY trong file .env.server.local
//  2. Đặt mã PIN giáo viên (6–8 chữ số)
//  3. Chuyển dữ liệu cũ trong thư mục data/ lên Supabase:
//     custom-content.json, homework.json, results.jsonl (bỏ dòng hỏng, dòng trùng)
//     Chạy lại nhiều lần được: không nhân đôi dữ liệu.
//  Không chuyển data/teacher.json (cách băm khác, PIN được đặt lại ở bước 2).
//
// Khóa service_role có toàn quyền: chỉ để trong .env.server.local trên máy thầy cô,
// KHÔNG đưa vào .env.local, không gửi cho ai, không đưa lên GitHub / Vercel.
// ============================================================
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DATA = join(ROOT, 'data');
const ENV_FILE = join(ROOT, '.env.server.local');

const say = (msg = '') => console.log(msg);

/** Dừng script kèm thông báo (để chương trình tự kết thúc, không gọi process.exit khi cửa sổ lệnh đang đóng stdin) */
class Stop extends Error {}
const stop = (msg) => {
  throw new Stop(msg);
};

// ---------------- Hỏi đáp trên cửa sổ dòng lệnh ----------------

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (a) => {
      rl.close();
      resolve(a.trim());
    }),
  );
}

/** Hỏi có / không. Enter = câu trả lời mặc định. */
async function yes(question, def) {
  const a = (await ask(`${question} ${def ? '(C/k)' : '(c/K)'}: `)).toLowerCase();
  return a ? a.startsWith('c') || a.startsWith('y') : def;
}

/** Nhập PIN, hiện dấu * thay cho chữ số */
function askHidden(question) {
  if (!process.stdin.isTTY) return ask(question);
  return new Promise((resolve) => {
    process.stdout.write(question);
    let s = '';
    const { stdin } = process;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          return resolve(s);
        }
        if (c === '\u0003') process.exit(1); // Ctrl+C
        if (c === '\u0008' || c === '\u007f') {
          if (s) {
            s = s.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else if (/\d/.test(c) && s.length < 8) {
          s += c;
          process.stdout.write('*');
        }
      }
    };
    stdin.on('data', onData);
  });
}

// ---------------- Kết nối Supabase ----------------

function readEnv() {
  if (!existsSync(ENV_FILE))
    stop('Chưa có file .env.server.local.\n   Chép file .env.server.example thành .env.server.local, mở bằng Notepad và điền 2 dòng (xem README, mục "Cho học sinh luyện tập ở nhà").');
  const env = {};
  for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([\w.]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  const url = (env.SUPABASE_URL ?? '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!/^https?:\/\/.+/.test(url) || url.includes('xxxxxxxx')) stop('SUPABASE_URL trong .env.server.local chưa đúng (dạng https://xxxx.supabase.co).');
  if (key.length < 20 || key.includes('dan-khoa')) stop('SUPABASE_SERVICE_ROLE_KEY trong .env.server.local chưa đúng.');
  return { url, key };
}

let URL_ = '';
let KEY = '';

/** Gọi REST của Supabase bằng khóa service_role */
async function rest(path, { method = 'GET', body, prefer } = {}) {
  const headers = { apikey: KEY, 'Content-Type': 'application/json' };
  // Khóa kiểu cũ (JWT, bắt đầu bằng "eyJ") phải gửi kèm Authorization; khóa kiểu mới (sb_secret_...) chỉ cần apikey
  if (KEY.startsWith('eyJ')) headers.Authorization = 'Bearer ' + KEY;
  if (prefer) headers.Prefer = prefer;
  let res;
  try {
    res = await fetch(`${URL_}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    stop(`Không kết nối được Supabase (${e.cause?.code ?? e.message}). Kiểm tra Internet và SUPABASE_URL.`);
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* không phải JSON */
  }
  return { ok: res.ok, status: res.status, data, text };
}

/** Gọi hàm RPC, trả về phần data (hoặc dừng nếu lỗi) */
async function rpc(name, args = {}) {
  const r = await rest(`/rest/v1/rpc/${name}`, { method: 'POST', body: args });
  if (r.status === 404 || r.data?.code === 'PGRST202')
    stop('Chưa thấy các bảng / hàm của game trên Supabase.\n   Vào Supabase → SQL Editor, dán toàn bộ file supabase/migrations/0001_init.sql rồi bấm Run, sau đó chạy lại script này.');
  if (r.status === 401 || r.status === 403) stop('Supabase từ chối khóa. Kiểm tra lại SUPABASE_SERVICE_ROLE_KEY (phải là khóa "service_role" / "secret", không phải khóa "anon").');
  if (!r.ok) stop(`Lỗi khi gọi ${name}: ${r.data?.message ?? r.text}`);
  if (r.data && r.data.ok === false) stop(r.data.error);
  return r.data?.data;
}

function readJson(file) {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  } catch {
    say(`⚠️  File ${file} bị hỏng, bỏ qua.`);
    return null;
  }
}

// ---------------- 1. PIN ----------------

async function setupPin() {
  const { pinSet } = await rpc('pin_status');
  if (pinSet && !(await yes('🔑 Đã có mã PIN giáo viên. Đặt lại mã PIN mới?', false))) return;
  if (!pinSet) say('🔑 Đặt mã PIN giáo viên (6–8 chữ số). Thầy cô dùng mã này để vào Khu vực giáo viên trên mọi máy.');
  for (;;) {
    const pin = await askHidden('   Nhập mã PIN: ');
    if (!/^\d{6,8}$/.test(pin)) {
      say('   Mã PIN phải gồm 6–8 chữ số. Thử lại.');
      continue;
    }
    if (/^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) {
      say('   Mã này dễ đoán quá (VD 111111, 123456). Thầy cô chọn mã khác nhé.');
      continue;
    }
    if ((await askHidden('   Nhập lại để chắc chắn: ')) !== pin) {
      say('   Hai lần nhập không giống nhau. Thử lại.');
      continue;
    }
    await rpc('admin_set_pin', { p_new_pin: pin });
    say('   ✅ Đã đặt mã PIN.');
    return;
  }
}

// ---------------- 2. Bài học tùy chỉnh ----------------

async function migrateContent() {
  const content = readJson(join(DATA, 'custom-content.json'));
  if (!content) return;
  if (typeof content !== 'object' || !Array.isArray(content.units)) return say('⚠️  data/custom-content.json không hợp lệ, bỏ qua.');
  const cur = await rest('/rest/v1/custom_content?select=updated_at&id=eq.1');
  if (!cur.ok) stop(`Không đọc được bài học trên Supabase: ${cur.data?.message ?? cur.text}`);
  if (cur.data?.length) {
    const when = new Date(cur.data[0].updated_at).toLocaleString('vi-VN');
    say(`📚 Trên Supabase đã có bài học tùy chỉnh (lưu lúc ${when}).`);
    if (!(await yes('   Ghi đè bằng bài học trong data/custom-content.json của máy này?', false))) return say('   Giữ nguyên bài học trên Supabase.');
  }
  const r = await rest('/rest/v1/custom_content?on_conflict=id', {
    method: 'POST',
    body: { id: 1, content, updated_at: new Date().toISOString() },
    prefer: 'resolution=merge-duplicates,return=minimal',
  });
  if (!r.ok) stop(`Không lưu được bài học: ${r.data?.message ?? r.text}`);
  say(`📚 ✅ Đã chuyển bài học tùy chỉnh (${content.units.length} unit).`);
}

// ---------------- 3. Bài tập về nhà ----------------

const TIMERS = [0, 10, 15, 20, 30, 45, 60];
const clean = (s, max) =>
  String(s ?? '')
    .replace(/[\u0000-\u0009\u000b-\u001f<>]/g, '')
    .trim()
    .slice(0, max);

async function migrateHomework() {
  const file = readJson(join(DATA, 'homework.json'));
  const list = Array.isArray(file?.list) ? file.list : [];
  if (!list.length) return;
  const cur = await rest('/rest/v1/homework?select=id');
  if (!cur.ok) stop(`Không đọc được bài tập trên Supabase: ${cur.data?.message ?? cur.text}`);
  const have = new Set(cur.data.map((h) => h.id));
  const rows = list
    .filter((h) => h && typeof h.id === 'string' && !have.has(h.id) && typeof h.unitId === 'string' && Array.isArray(h.questions) && /^\d{4}-\d{2}-\d{2}$/.test(h.due))
    .map((h) => ({
      id: h.id,
      title: clean(h.title, 80) || 'Bài tập về nhà',
      note: clean(h.note, 500),
      unit_id: h.unitId,
      unit: clean(h.unit ?? h.unitId, 200),
      questions: h.questions,
      timer_sec: TIMERS.includes(h.timerSec) ? h.timerSec : 0,
      due: h.due,
      created_at: Number.isNaN(Date.parse(h.createdAt)) ? new Date().toISOString() : h.createdAt,
      closed: !!h.closed,
    }));
  if (!rows.length) return say('📝 Bài tập về nhà: đã có đủ trên Supabase.');
  if (have.size && !(await yes(`📝 Có ${rows.length} bài tập trong data/homework.json chưa có trên Supabase (có thể là bài thầy cô đã xóa). Chuyển lên?`, true))) return;
  const r = await rest('/rest/v1/homework?on_conflict=id', { method: 'POST', body: rows, prefer: 'resolution=ignore-duplicates,return=minimal' });
  if (!r.ok) stop(`Không lưu được bài tập: ${r.data?.message ?? r.text}`);
  say(`📝 ✅ Đã chuyển ${rows.length} bài tập về nhà.`);
}

// ---------------- 4. Kết quả ----------------

async function migrateResults() {
  const file = join(DATA, 'results.jsonl');
  if (!existsSync(file)) return;
  const seen = new Set();
  const list = [];
  let broken = 0;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (!r || typeof r.id !== 'string' || line.length > 20 * 1024) throw new Error();
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      list.push(r);
    } catch {
      broken++;
    }
  }
  if (!list.length) return;
  say(`📊 Đang gửi ${list.length} kết quả...`);
  let saved = 0;
  // post_results nhận tối đa 200 trận mỗi lần, tự bỏ qua trận đã có
  for (let i = 0; i < list.length; i += 200) saved += (await rpc('post_results', { p_results: list.slice(i, i + 200) })).saved;
  say(`📊 ✅ Thêm mới ${saved} kết quả` + (list.length - saved ? `, ${list.length - saved} kết quả đã có sẵn (hoặc không đúng dạng) nên bỏ qua` : '') + (broken ? `, bỏ ${broken} dòng hỏng` : '') + '.');
}

// ---------------- Chạy ----------------

async function main() {
  ({ url: URL_, key: KEY } = readEnv());
  say('============================================================');
  say(' Cài đặt Supabase cho Block Quest English');
  say(' Dự án: ' + URL_);
  say('============================================================\n');

  await setupPin();
  say();
  if (existsSync(DATA)) {
    await migrateContent();
    await migrateHomework();
    await migrateResults();
  } else say('(Không có thư mục data/ → không có dữ liệu cũ cần chuyển.)');

  say('\n🎉 Xong! Bước tiếp theo: đưa game lên Vercel (xem README, mục "Cho học sinh luyện tập ở nhà").');
}

main()
  .catch((e) => {
    say('\n❌ ' + (e instanceof Stop ? e.message : `Lỗi không mong muốn: ${e?.stack ?? e}`));
    process.exitCode = 1;
  })
  // Đóng bàn phím để chương trình kết thúc hẳn
  .finally(() => process.stdin.destroy());
