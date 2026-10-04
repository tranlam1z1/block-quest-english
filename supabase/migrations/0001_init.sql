-- ============================================================
-- Cơ sở dữ liệu Supabase cho Block Quest English (1 dự án = 1 giáo viên / 1 lớp).
-- Cách chạy: Supabase → SQL Editor → New query → dán toàn bộ file này → Run.
-- Chạy lại nhiều lần được (không mất dữ liệu).
--
-- Bảo mật:
--   - Mọi bảng bật RLS và KHÔNG có policy nào → trình duyệt (khóa anon) không đọc / ghi bảng trực tiếp được.
--   - Trình duyệt chỉ gọi các hàm RPC bên dưới (security definer). Hàm nào cần PIN thì nhận tham số p_pin.
--   - Sai PIN 5 lần → khóa, lâu dần: 1 phút, 5 phút, 15 phút, 1 giờ. Bộ đếm lưu trong bảng app_settings.
--   - PIN lần đầu chỉ đặt được bằng scripts/setup-supabase.mjs (khóa service_role), không đặt từ trình duyệt.
--
-- Mọi RPC trả về 1 giá trị jsonb (không bị giới hạn 1000 dòng của PostgREST):
--   thành công: { "ok": true, "data": ... }
--   lỗi:        { "ok": false, "status": 400 | 401 | 403 | 404 | 423, "error": "thông báo tiếng Việt" }
-- (Không dùng RAISE cho lỗi PIN: RAISE hủy cả giao dịch, bộ đếm sai PIN sẽ không được lưu.)
-- ============================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Hàm dùng nội bộ: để ở schema riêng, PostgREST không mở ra ngoài
create schema if not exists bqe_private;
revoke all on schema bqe_private from public;

-- ---------------- Bảng ----------------

create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  pin_hash text,
  -- Số lần sai liên tiếp (về 0 khi bị khóa hoặc nhập đúng)
  failed int not null default 0,
  -- Đã bị khóa mấy lần liên tiếp → quyết định thời gian khóa lần sau
  lock_level int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1) on conflict do nothing;

create table if not exists public.custom_content (
  id int primary key default 1 check (id = 1),
  content jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.homework (
  id text primary key,
  title text not null,
  note text not null default '',
  unit_id text not null,
  unit text not null,
  questions jsonb not null,
  -- Giây mỗi câu, 0 = không giới hạn
  timer_sec int not null default 0 check (timer_sec in (0, 10, 15, 20, 30, 45, 60)),
  -- Hạn nộp YYYY-MM-DD (hết ngày này)
  due text not null check (due ~ '^\d{4}-\d{2}-\d{2}$'),
  created_at timestamptz not null default now(),
  closed boolean not null default false
);

create table if not exists public.results (
  -- Khóa chính = id của trận → máy gửi lại (do mất mạng) không bị trùng
  id text primary key,
  device_id text not null default '',
  at timestamptz not null,
  mode text not null default '',
  homework_id text,
  -- Toàn bộ bản ghi kết quả như máy học sinh gửi lên
  data jsonb not null,
  received_at timestamptz not null default now()
);
create index if not exists results_device_at_idx on public.results (device_id, at desc);
create index if not exists results_at_idx on public.results (at);

-- Thống kê đã "xóa" (giống file results-backup-*.jsonl của máy chủ cục bộ)
create table if not exists public.results_archive (
  id text primary key,
  device_id text not null default '',
  at timestamptz not null,
  mode text not null default '',
  homework_id text,
  data jsonb not null,
  received_at timestamptz not null,
  archived_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
alter table public.custom_content enable row level security;
alter table public.homework enable row level security;
alter table public.results enable row level security;
alter table public.results_archive enable row level security;

-- Thêm một lớp chặn: anon / authenticated không có quyền gì trên bảng (service_role vẫn giữ)
revoke all on table public.app_settings, public.custom_content, public.homework, public.results, public.results_archive from anon, authenticated;

-- ---------------- Hàm nội bộ ----------------

create or replace function bqe_private.err(p_status int, p_msg text) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object('ok', false, 'status', p_status, 'error', p_msg);
$$;

create or replace function bqe_private.ok(p_data jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object('ok', true, 'data', p_data);
$$;

-- Làm sạch chuỗi giống máy chủ cục bộ: bỏ ký tự điều khiển và < >, cắt khoảng trắng, giới hạn độ dài
create or replace function bqe_private.clean(p text, p_max int) returns text
language sql immutable set search_path = public as $$
  select left(btrim(regexp_replace(coalesce(p, ''), '[\x01-\x09\x0b-\x1f<>]', '', 'g'), E' \n\r'), p_max);
$$;

-- Đổi chuỗi ISO thành thời điểm; chuỗi hỏng → bây giờ
create or replace function bqe_private.ts(p text) returns timestamptz
language plpgsql set search_path = public as $$
begin
  return coalesce(p::timestamptz, now());
exception when others then
  return now();
end;
$$;

create or replace function bqe_private.iso(p timestamptz) returns text
language sql immutable set search_path = public as $$
  select to_char(p at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

-- Bộ câu hỏi hợp lệ (giống validQuestions trong server/classRoom.ts): 1–50 câu
create or replace function bqe_private.valid_questions(q jsonb) returns boolean
language sql immutable set search_path = public as $$
  select case
    when q is null or jsonb_typeof(q) <> 'array' then false
    when jsonb_array_length(q) not between 1 and 50 then false
    else not exists (
      select 1 from jsonb_array_elements(q) x
      where not coalesce(
        jsonb_typeof(x) = 'object'
        and jsonb_typeof(x -> 'id') = 'string'
        and x ->> 'mode' in ('choice', 'order')
        and jsonb_typeof(x -> 'choices') = 'array'
        and jsonb_typeof(x -> 'item') = 'object'
        and jsonb_typeof(x -> 'item' -> 'en') = 'string', false)
    )
  end;
$$;

-- Kết quả 1 trận đúng dạng ResultRecord (src/services/results.ts). Game công khai trên Internet:
-- không nhận bản ghi rác (thiếu trường) để trang Thống kê / Góc phụ huynh không bị lỗi.
create or replace function bqe_private.valid_result(x jsonb) returns boolean
language sql immutable set search_path = public as $$
  select case
    when x is null or jsonb_typeof(x) <> 'object' then false
    when octet_length(x::text) > 20 * 1024 then false
    else coalesce(
      jsonb_typeof(x -> 'id') = 'string' and length(x ->> 'id') between 1 and 120
      and jsonb_typeof(x -> 'at') = 'string'
      and jsonb_typeof(x -> 'deviceId') = 'string'
      and jsonb_typeof(x -> 'player') = 'string'
      and x ->> 'mode' in ('adventure', 'duel-bot', 'duel-pvp', 'class', 'homework')
      and jsonb_typeof(x -> 'unitId') = 'string'
      and jsonb_typeof(x -> 'unit') = 'string'
      and jsonb_typeof(x -> 'opponent') = 'string'
      and x ->> 'outcome' in ('win', 'loss', 'draw')
      and jsonb_typeof(x -> 'score') = 'number'
      and jsonb_typeof(x -> 'answered') = 'number'
      and jsonb_typeof(x -> 'correct') = 'number'
      and jsonb_typeof(x -> 'maxCombo') = 'number'
      and jsonb_typeof(x -> 'wrong') = 'array'
      and not exists (
        select 1 from jsonb_array_elements(case when jsonb_typeof(x -> 'wrong') = 'array' then x -> 'wrong' else '[]'::jsonb end) w
        where not coalesce(jsonb_typeof(w) = 'object' and jsonb_typeof(w -> 'en') = 'string' and jsonb_typeof(w -> 'vi') = 'string', false)
      ), false)
  end;
$$;

-- Bài tập → dạng JSON giống interface Homework (src/services/homework.ts)
create or replace function bqe_private.hw_json(h public.homework) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', h.id, 'title', h.title, 'note', h.note, 'unitId', h.unit_id, 'unit', h.unit,
    'questions', h.questions, 'timerSec', h.timer_sec, 'due', h.due,
    'createdAt', bqe_private.iso(h.created_at), 'closed', h.closed);
$$;

create or replace function bqe_private.locked_error(p_until timestamptz) returns jsonb
language sql stable set search_path = public as $$
  select bqe_private.err(423, 'Nhập sai nhiều lần. Đợi khoảng '
    || greatest(1, ceil(extract(epoch from p_until - now()) / 60))::int
    || ' phút rồi thử lại.');
$$;

/*
 * Kiểm tra PIN. Trả về null nếu đúng, ngược lại trả về lỗi (đã ghi lại lần sai).
 * Sai 5 lần liên tiếp → khóa 1 phút; mỗi lần bị khóa tiếp theo lâu hơn: 5 phút, 15 phút, 1 giờ.
 * Nhập đúng → về lại từ đầu.
 */
create or replace function bqe_private.check_pin(p_pin text) returns jsonb
language plpgsql set search_path = public as $$
declare
  s public.app_settings;
  lvl int;
begin
  -- Khóa dòng: các lần đoán cùng lúc phải xếp hàng, không ai lách được bộ đếm
  select * into s from public.app_settings where id = 1 for update;
  if s.pin_hash is null then
    return bqe_private.err(403, 'Chưa đặt mã PIN giáo viên. Thầy cô chạy script cài đặt (xem hướng dẫn trong README).');
  end if;
  if s.locked_until is not null and s.locked_until > now() then
    return bqe_private.locked_error(s.locked_until);
  end if;
  if p_pin is not null and length(p_pin) <= 16 and extensions.crypt(p_pin, s.pin_hash) = s.pin_hash then
    if s.failed <> 0 or s.lock_level <> 0 or s.locked_until is not null then
      update public.app_settings set failed = 0, lock_level = 0, locked_until = null where id = 1;
    end if;
    return null;
  end if;
  if s.failed + 1 >= 5 then
    lvl := least(s.lock_level + 1, 4);
    update public.app_settings
      set failed = 0, lock_level = lvl,
          locked_until = now() + case lvl when 1 then interval '1 minute' when 2 then interval '5 minutes' when 3 then interval '15 minutes' else interval '1 hour' end
      where id = 1
      returning locked_until into s.locked_until;
    return bqe_private.locked_error(s.locked_until);
  end if;
  update public.app_settings set failed = failed + 1 where id = 1;
  return bqe_private.err(401, 'Mã PIN không đúng');
end;
$$;

revoke all on all functions in schema bqe_private from public;

-- ---------------- RPC công khai ----------------

-- Đã đặt PIN chưa (cũng dùng để kiểm tra kết nối)
create or replace function public.pin_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select bqe_private.ok(jsonb_build_object('pinSet', exists (select 1 from public.app_settings where id = 1 and pin_hash is not null)));
$$;

create or replace function public.get_content() returns jsonb
language sql stable security definer set search_path = public as $$
  select bqe_private.ok((select content from public.custom_content where id = 1));
$$;

-- Danh sách bài tập, mới nhất trước
create or replace function public.list_homework() returns jsonb
language sql stable security definer set search_path = public as $$
  select bqe_private.ok(coalesce((select jsonb_agg(bqe_private.hw_json(h) order by h.created_at desc) from public.homework h), '[]'::jsonb));
$$;

-- Học sinh gửi kết quả: 1 trận hoặc mảng tối đa 200 trận, mỗi trận ≤ 20KB và đúng dạng. Trùng id hoặc sai dạng → bỏ qua.
create or replace function public.post_results(p_results jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  arr jsonb := case jsonb_typeof(p_results) when 'array' then p_results when 'object' then jsonb_build_array(p_results) else '[]'::jsonb end;
  n int;
begin
  if jsonb_array_length(arr) > 200 then
    return bqe_private.err(400, 'Gửi quá nhiều kết quả một lần (tối đa 200)');
  end if;
  insert into public.results (id, device_id, at, mode, homework_id, data)
  select x ->> 'id',
         left(coalesce(x ->> 'deviceId', ''), 40),
         bqe_private.ts(x ->> 'at'),
         left(coalesce(x ->> 'mode', ''), 20),
         left(x ->> 'homeworkId', 40),
         x
  from jsonb_array_elements(arr) x
  where bqe_private.valid_result(x)
    -- Trận đã nằm trong thống kê bị xóa thì không cho "sống lại"
    and not exists (select 1 from public.results_archive a where a.id = x ->> 'id')
  on conflict (id) do nothing;
  get diagnostics n = row_count;
  return bqe_private.ok(jsonb_build_object('ok', true, 'saved', n));
end;
$$;

-- Kết quả của 1 máy học sinh (Góc phụ huynh): 500 trận gần nhất, cũ trước mới sau
create or replace function public.device_results(p_device_id text) returns jsonb
language sql stable security definer set search_path = public as $$
  select bqe_private.ok(coalesce((
    select jsonb_agg(t.data order by t.at, t.id)
    from (select r.data, r.at, r.id from public.results r
          where p_device_id ~ '^[\w-]{1,40}$' and r.device_id = p_device_id
          order by r.at desc, r.id desc limit 500) t
  ), '[]'::jsonb));
$$;

-- ---------------- RPC cần PIN ----------------

create or replace function public.teacher_login(p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e jsonb := bqe_private.check_pin(p_pin);
begin
  if e is not null then return e; end if;
  return bqe_private.ok(jsonb_build_object('ok', true));
end;
$$;

create or replace function public.change_pin(p_old_pin text, p_new_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e jsonb;
begin
  if p_new_pin is null or p_new_pin !~ '^\d{6,8}$' then
    return bqe_private.err(400, 'Mã PIN mới phải gồm 6–8 chữ số');
  end if;
  e := bqe_private.check_pin(p_old_pin);
  if e is not null then
    if (e ->> 'status') = '401' then return bqe_private.err(401, 'Mã PIN cũ không đúng'); end if;
    return e;
  end if;
  update public.app_settings set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 10)), updated_at = now() where id = 1;
  return bqe_private.ok(jsonb_build_object('ok', true));
end;
$$;

create or replace function public.save_content(p_pin text, p_content jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e jsonb := bqe_private.check_pin(p_pin);
begin
  if e is not null then return e; end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object' or jsonb_typeof(p_content -> 'units') is distinct from 'array' then
    return bqe_private.err(400, 'Nội dung không hợp lệ');
  end if;
  if octet_length(p_content::text) > 5 * 1024 * 1024 then
    return bqe_private.err(400, 'Nội dung quá lớn (tối đa khoảng 5MB). Thầy cô thử bớt hình ảnh hoặc bài học.');
  end if;
  insert into public.custom_content (id, content, updated_at) values (1, p_content, now())
    on conflict (id) do update set content = excluded.content, updated_at = excluded.updated_at;
  return bqe_private.ok(jsonb_build_object('ok', true));
end;
$$;

-- Toàn bộ kết quả, cũ trước mới sau (1 giá trị jsonb → không bị cắt ở 1000 dòng)
create or replace function public.get_results(p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e jsonb := bqe_private.check_pin(p_pin);
begin
  if e is not null then return e; end if;
  return bqe_private.ok(coalesce((select jsonb_agg(r.data order by r.at, r.received_at, r.id) from public.results r), '[]'::jsonb));
end;
$$;

-- "Xóa" thống kê: chuyển sang results_archive, không xóa hẳn
create or replace function public.clear_results(p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e jsonb := bqe_private.check_pin(p_pin);
begin
  if e is not null then return e; end if;
  insert into public.results_archive (id, device_id, at, mode, homework_id, data, received_at)
    select id, device_id, at, mode, homework_id, data, received_at from public.results
    on conflict (id) do nothing;
  -- "where true": Supabase chặn lệnh delete không có where
  delete from public.results where true;
  return bqe_private.ok(jsonb_build_object('ok', true));
end;
$$;

-- Giao bài: { title, note, unitId, unit, questions, timerSec, due } → bài vừa tạo
create or replace function public.create_homework(p_pin text, p_homework jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e jsonb := bqe_private.check_pin(p_pin);
  b jsonb := p_homework;
  h public.homework;
begin
  if e is not null then return e; end if;
  if b is null or jsonb_typeof(b) <> 'object' or octet_length(b::text) > 2 * 1024 * 1024
     or jsonb_typeof(b -> 'unitId') is distinct from 'string'
     or not bqe_private.valid_questions(b -> 'questions')
     or coalesce(b ->> 'due', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    return bqe_private.err(400, 'Bài tập không hợp lệ');
  end if;
  insert into public.homework (id, title, note, unit_id, unit, questions, timer_sec, due)
  values (
    'hw-' || encode(extensions.gen_random_bytes(5), 'hex'),
    coalesce(nullif(bqe_private.clean(b ->> 'title', 80), ''), 'Bài tập về nhà'),
    bqe_private.clean(b ->> 'note', 500),
    left(b ->> 'unitId', 100),
    bqe_private.clean(coalesce(b ->> 'unit', b ->> 'unitId'), 200),
    b -> 'questions',
    case when jsonb_typeof(b -> 'timerSec') = 'number' and (b ->> 'timerSec') in ('0', '10', '15', '20', '30', '45', '60') then (b ->> 'timerSec')::int else 0 end,
    b ->> 'due'
  )
  returning * into h;
  -- Giữ tối đa 300 bài mới nhất
  delete from public.homework where id in (select id from public.homework order by created_at desc, id offset 300);
  return bqe_private.ok(bqe_private.hw_json(h));
end;
$$;

-- Sửa bài: { title?, note?, due?, closed? } → bài sau khi sửa
create or replace function public.update_homework(p_pin text, p_id text, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e jsonb := bqe_private.check_pin(p_pin);
  b jsonb := case when jsonb_typeof(p_patch) = 'object' then p_patch else '{}'::jsonb end;
  h public.homework;
begin
  if e is not null then return e; end if;
  select * into h from public.homework where id = p_id for update;
  if not found then return bqe_private.err(404, 'Không có bài tập này'); end if;
  if b ? 'title' then h.title := coalesce(nullif(bqe_private.clean(b ->> 'title', 80), ''), h.title); end if;
  if b ? 'note' then h.note := bqe_private.clean(b ->> 'note', 500); end if;
  if b ? 'due' then
    if coalesce(b ->> 'due', '') !~ '^\d{4}-\d{2}-\d{2}$' then return bqe_private.err(400, 'Hạn nộp không hợp lệ'); end if;
    h.due := b ->> 'due';
  end if;
  if b ? 'closed' then h.closed := coalesce(b ->> 'closed', '') not in ('', 'false', '0'); end if;
  update public.homework set title = h.title, note = h.note, due = h.due, closed = h.closed where id = h.id;
  return bqe_private.ok(bqe_private.hw_json(h));
end;
$$;

-- Xóa bài (kết quả đã nộp vẫn còn trong thống kê)
create or replace function public.delete_homework(p_pin text, p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e jsonb := bqe_private.check_pin(p_pin);
begin
  if e is not null then return e; end if;
  delete from public.homework where id = p_id;
  if not found then return bqe_private.err(404, 'Không có bài tập này'); end if;
  return bqe_private.ok(jsonb_build_object('ok', true));
end;
$$;

-- ---------------- Chỉ dành cho script cài đặt (khóa service_role) ----------------

-- Đặt / đặt lại PIN giáo viên và mở khóa
create or replace function public.admin_set_pin(p_new_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_new_pin is null or p_new_pin !~ '^\d{6,8}$' then
    return bqe_private.err(400, 'Mã PIN phải gồm 6–8 chữ số');
  end if;
  update public.app_settings
    set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 10)), failed = 0, lock_level = 0, locked_until = null, updated_at = now()
    where id = 1;
  return bqe_private.ok(jsonb_build_object('ok', true));
end;
$$;

-- ---------------- Quyền gọi hàm ----------------

do $$
declare
  f text;
  public_fns text[] := array[
    'public.pin_status()', 'public.get_content()', 'public.list_homework()',
    'public.post_results(jsonb)', 'public.device_results(text)',
    'public.teacher_login(text)', 'public.change_pin(text, text)', 'public.save_content(text, jsonb)',
    'public.get_results(text)', 'public.clear_results(text)',
    'public.create_homework(text, jsonb)', 'public.update_homework(text, text, jsonb)', 'public.delete_homework(text, text)'];
begin
  foreach f in array public_fns loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;
  -- Supabase tự cấp quyền cho anon khi tạo hàm → thu hồi rõ ràng
  execute 'revoke all on function public.admin_set_pin(text) from public, anon, authenticated';
  execute 'grant execute on function public.admin_set_pin(text) to service_role';
  execute 'revoke all on all functions in schema bqe_private from anon, authenticated';
end;
$$;
