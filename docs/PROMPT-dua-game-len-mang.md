# Nhiệm vụ: đưa Block Quest English lên mạng để học sinh luyện tập ở nhà

## Bối cảnh

Đây là game học tiếng Anh cho học sinh tiểu học (React 19 + Vite 8 + TypeScript + Zustand + three.js, PWA bằng `vite-plugin-pwa`). Đọc `README.md` trước để hiểu toàn bộ tính năng.

Hiện tại mọi dữ liệu dùng chung chỉ nằm trên **máy của giáo viên**:

- `server/teacherApi.ts` là plugin Vite, chỉ chạy khi có `vite dev` / `vite preview` (qua `Chay game.bat`). Nó lưu vào thư mục `data/`:
  - `custom-content.json`: bài học giáo viên sửa / thêm
  - `teacher.json`: PIN giáo viên, băm bằng scrypt
  - `results.jsonl`: kết quả từng trận
  - `homework.json`: bài tập về nhà (code ở `server/homework.ts`)
- `server/classRoom.ts`: phòng luyện tập trên lớp. Phòng giữ trong bộ nhớ, đồng bộ bằng long-poll, máy chủ tự chấm điểm.
- Học sinh vào game qua `http://192.168.x.x:4173` (cùng Wi-Fi, HTTP thường). Vì không phải HTTPS nên service worker không chạy trên điện thoại / máy tính bảng. Về nhà, học sinh **không mở được game** và không nhận hay nộp được bài tập.

Phía trình duyệt đã gom gần hết việc gọi máy chủ vào một chỗ là `src/services/api.ts` (object `api` và `checkServer`). Các chỗ gọi:

- `src/content/index.ts`: `loadContent`, `saveCustomContent`
- `src/stores/teacher.ts`: PIN, có `mode: 'server' | 'local'`
- `src/services/results.ts`: hàng đợi offline, `flushResults`
- `src/services/homework.ts`
- `src/features/parent/ParentPage.tsx`
- `src/features/teacher/StatsPage.tsx`, `homeworkStats.ts`

Supabase đã được dùng cho "Solo với bạn" (Realtime, xem `src/net/transport.ts`). Biến môi trường là `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`, cùng cờ `onlineConfigured`.

## Mục tiêu

1. Game chạy trên một **đường link HTTPS công khai** (Vercel). Học sinh mở bằng điện thoại, máy tính bảng hay máy tính ở nhà, bấm "Thêm vào màn hình chính" để cài thành app, và chơi được offline sau lần mở đầu.
2. **Bài học tùy chỉnh, bài tập về nhà, kết quả và PIN giáo viên** được lưu trên **Supabase** thay cho thư mục `data/`. Kết quả là:
   - Học sinh ở nhà nhận được bài mới và nộp bài.
   - Giáo viên xem thống kê từ bất kỳ máy nào.
   - Góc phụ huynh xem được kết quả của máy con.
3. **Không làm hỏng chế độ hiện tại**:
   - Khi **chưa** cấu hình Supabase (không có `.env.local`), game phải chạy y như bây giờ, dùng máy chủ cục bộ và thư mục `data/`.
   - **Phòng luyện tập trên lớp** (`server/classRoom.ts`) vẫn chạy trên máy giáo viên qua `Chay game.bat` như cũ. **Không** chuyển nó lên Supabase.

## Thiết kế bắt buộc

### 1. Một lớp truy cập dữ liệu, hai cách lưu

- Giữ nguyên "hình dạng" của `api` và `checkServer` trong `src/services/api.ts` (tên hàm, tham số, kiểu `{ ok, status, data, error }`). Mục đích là các chỗ gọi ở trên phải sửa càng ít càng tốt.
- Thêm bản cài đặt bằng Supabase, ví dụ `src/services/cloudApi.ts`, dùng `@supabase/supabase-js` đã có sẵn. Dùng chung một Supabase client với `src/net/transport.ts`: tách ra `src/services/supabase.ts`, đừng tạo 2 client.
- Chọn cách lưu theo `onlineConfigured`: có Supabase thì dùng cloud, không thì dùng máy chủ cục bộ như cũ.
- `checkServer()` ở chế độ cloud trả về `ok` khi gọi được Supabase. Mất mạng thì trả về `ok: false`, và game rơi về dữ liệu lưu trên máy y như hiện nay. Các cơ chế cache và hàng đợi offline đang có trong `content/index.ts`, `results.ts`, `homework.ts` phải tiếp tục hoạt động.
- `classApi.ts` vẫn gọi máy chủ cục bộ `/api/class/...`. Khi game mở từ link Vercel (không có máy chủ cục bộ), trang tạo phòng luyện tập phải báo rõ: "Phòng luyện tập trên lớp chỉ dùng được khi mở game bằng `Chay game.bat` trên máy thầy cô". Không được treo hay lỗi.

### 2. Cơ sở dữ liệu Supabase (`supabase/migrations/0001_init.sql`)

Mỗi dự án Supabase dùng cho **một giáo viên / một lớp**, giống như hiện tại. Không làm nhiều giáo viên.

Các bảng:

- `app_settings`: chỉ có 1 dòng. Gồm hash PIN (pgcrypto `crypt()` + `gen_salt('bf')`), số lần nhập sai, thời điểm hết khóa.
- `custom_content`: chỉ có 1 dòng. Gồm nội dung `jsonb` và `updated_at`.
- `homework`: các cột giống interface `Homework` trong `server/homework.ts`. Giữ đúng các luật kiểm tra hiện có: làm sạch chuỗi, `due` dạng `YYYY-MM-DD`, `timerSec` thuộc `[0,10,15,20,30,45,60]`, tối đa 300 bài.
- `results`: `id text primary key`, `device_id`, `at timestamptz`, `mode`, `homework_id`, cùng toàn bộ bản ghi trong cột `data jsonb`. Khóa chính `id` giúp **bỏ bản ghi trùng** khi máy gửi lại. Dùng `insert ... on conflict do nothing`.

**Bảo mật (quan trọng):**

- **Bật RLS trên mọi bảng** và **không** tạo policy nào cho `anon`. Như vậy trình duyệt không đọc hay ghi bảng trực tiếp được.
- Mọi thao tác đi qua **hàm RPC `security definer`** (đặt `set search_path = public`), cấp quyền `execute` cho `anon`:
  - Công khai:
    - `get_content()`
    - `list_homework()`
    - `post_results(jsonb)`: nhận mảng. Mỗi bản ghi tối đa 20KB, mỗi lần gửi tối đa 200 bản ghi. Kiểm tra `id` là chuỗi.
    - `device_results(device_id text)`: tối đa 500 bản ghi mới nhất.
    - `pin_status()`: trả về đã đặt PIN chưa.
  - Cần PIN (tham số `pin text`):
    - `teacher_login`
    - `save_content`: tối đa khoảng 5MB, bắt buộc có mảng `units`.
    - `get_results`
    - `clear_results`: **không xóa hẳn**. Chuyển sang bảng `results_archive`, giống việc đổi tên file backup hiện nay.
    - `create_homework`, `update_homework`, `delete_homework`
    - `change_pin(old_pin, new_pin)`
- **Chống đoán PIN trên Internet**: game giờ công khai nên khóa 30 giây như bản cục bộ là không đủ. Làm như sau:
  - Sai 5 lần thì khóa, thời gian khóa tăng dần (1 phút, 5 phút, 15 phút, 1 giờ). Bộ đếm lưu trong DB.
  - Ở chế độ cloud, PIN mới phải có **6–8 chữ số**.
- **Không cho đặt PIN lần đầu từ trình duyệt** ở chế độ cloud. Lý do: link công khai, ai mở trước cũng có thể chiếm quyền. PIN ban đầu được đặt bằng script cài đặt (mục 4) chạy trên máy giáo viên với khóa `service_role`. Trong game, nếu chưa có PIN thì hiện hướng dẫn chạy script, không hiện ô "đặt PIN".
- **Chú ý giới hạn 1000 dòng**: PostgREST mặc định trả tối đa 1000 dòng (`max-rows`). Vì vậy `get_results` phải **trả về một giá trị `jsonb` duy nhất** (dùng `jsonb_agg`) hoặc phân trang, để không bị cắt mất dữ liệu khi lớp có nhiều trận.
- Không bao giờ đưa khóa `service_role` vào code chạy trên trình duyệt hay vào biến `VITE_*`.

### 3. PIN giáo viên trong `src/stores/teacher.ts`

- Thêm `mode: 'cloud'`. Hành vi giống `'server'` nhưng gọi RPC. Vẫn giữ PIN của phiên trong `sessionStorage` như hiện tại.
- Giao diện đặt PIN lần đầu ở chế độ cloud: thay bằng thông báo hướng dẫn (xem mục 2).

### 4. Phòng luyện tập trên lớp khi đã có Supabase

Khi giáo viên chạy `Chay game.bat` **và** có `.env.local`, kết quả phòng luyện tập (`deps.saveResults` trong `server/classRoom.ts`, gọi từ `server/teacherApi.ts`) phải được gửi lên Supabase qua RPC `post_results`. Nhờ vậy thống kê không bị tách làm hai nơi.

- Đọc biến môi trường trong plugin bằng `loadEnv` của Vite.
- Mất mạng thì vẫn ghi vào `data/results.jsonl` và gửi lại sau.

### 5. Script cài đặt và chuyển dữ liệu

Viết `scripts/setup-supabase.mjs`, chạy bằng `node`, không thêm thư viện nặng. Script làm các việc sau:

1. Đọc `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` từ `.env.server.local`. Thêm file này vào `.gitignore` và tạo `.env.server.example`.
2. Hỏi PIN giáo viên ban đầu (6–8 chữ số) rồi đặt PIN.
3. Nếu có dữ liệu trong `data/`, **chuyển lên Supabase**: `custom-content.json`, `homework.json`, `results.jsonl` (bỏ dòng hỏng và dòng trùng). Script phải chạy lại nhiều lần được mà không nhân đôi dữ liệu.
4. Không chuyển `teacher.json`, vì hash scrypt không dùng được với pgcrypto. PIN được đặt lại ở bước 2.

Phần tạo bảng: hướng dẫn giáo viên dán `0001_init.sql` vào **SQL Editor** của Supabase. Đừng bắt cài Supabase CLI.

### 6. Đưa lên Vercel

- Thêm `vercel.json`:
  - Rewrite mọi đường dẫn về `index.html` để React Router chạy được khi tải lại trang con, ví dụ `/homework/abc`.
  - **Không** rewrite `/sw.js`, `/manifest.webmanifest`, `/assets/*`, `/icons/*`, `/images/*`.
- `vite.config.ts` đang import `server/teacherApi.ts`. Kiểm tra `npm run build` vẫn chạy được trên Vercel (Node 22) và plugin không làm gì khi build.
- Kiểm tra PWA trên HTTPS:
  - service worker đăng ký được
  - `navigateFallbackDenylist` vẫn đúng
  - cài được thành app
  - mở lại khi tắt mạng vẫn chơi được, và bài tập đã tải về vẫn làm được

### 7. Tài liệu (tiếng Việt, cho giáo viên không biết lập trình)

Cập nhật `README.md`:

- Thêm mục mới **"🏠 Cho học sinh luyện tập ở nhà"**, hướng dẫn từng bước:
  1. Tạo dự án Supabase. Có thể dùng chung dự án đã tạo cho "Solo với bạn".
  2. Chạy SQL.
  3. Chạy `scripts/setup-supabase.mjs`.
  4. Đưa lên Vercel bằng GitHub, khai báo 2 biến `VITE_SUPABASE_*`.
  5. Gửi link cho phụ huynh.
- Kèm **tin nhắn mẫu gửi phụ huynh** qua Zalo, hướng dẫn mở link và "Thêm vào màn hình chính" trên Android (Chrome) và iPhone (Safari → Chia sẻ → Thêm vào MH chính).
- **Sửa lại** đoạn đang ghi "về nhà làm (không cần mạng)" cho đúng với thực tế mới.
- Ghi chú: Supabase gói miễn phí **tạm dừng dự án sau khoảng 1 tuần không có ai dùng**. Hướng dẫn cách bật lại.
- Cập nhật `.env.example` và phần "Cấu trúc thư mục / API" ở cuối README.

## Cách làm việc

1. **Đọc code trước, lập kế hoạch sau.** Trình bày kế hoạch: danh sách file sẽ tạo hoặc sửa, sơ đồ bảng, danh sách RPC. Chờ tôi duyệt rồi mới viết code.
2. Làm theo từng giai đoạn. Sau mỗi giai đoạn chạy `npm run typecheck` và `npm run build`:
   - SQL + script
   - `api` cloud + `teacher.ts`
   - kết quả phòng luyện tập lên Supabase
   - Vercel + PWA
   - README
3. Giữ phong cách code hiện có: bình luận tiếng Việt, đầu mỗi file có khối mô tả `// ====`, thông báo lỗi tiếng Việt dễ hiểu cho trẻ em và giáo viên.
4. Không commit `.env.local`, `.env.server.local` hay thư mục `data/`.
5. Kiểm tra cuối cùng, ghi rõ cái nào đã thử thật và cái nào chưa thử được:
   - Không có `.env.local`: mọi thứ chạy như cũ.
   - Có Supabase:
     - Giáo viên đăng nhập, sửa bài và giao bài trên máy A.
     - Học sinh mở link trên máy B (ngoài mạng lớp), nhận bài, làm khi tắt mạng, bật mạng thì kết quả tự gửi.
     - Giáo viên thấy kết quả trong Thống kê. Góc phụ huynh trên máy B thấy kết quả.
   - Nhập sai PIN nhiều lần thì bị khóa tăng dần.
   - Dùng khóa anon gọi thẳng vào bảng (`select * from results`) phải bị chặn.
