// ============================================================
// Khu vực giáo viên: đăng nhập bằng PIN → Nội dung · Nhập Excel · Thống kê
// ============================================================
import { useEffect, useState, type ReactNode } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { useTeacher, validPin } from '../../stores/teacher';
import { useContentVersion } from '../../content';
import { Button, Modal, TopBar } from '../../components/ui';
import { ContentPage } from './ContentPage';
import { UnitEditor } from './UnitEditor';
import { ImportPage } from './ImportPage';
import { StatsPage } from './StatsPage';
import { ClassScreen, ClassSetupPage } from './ClassRoom';
import { HomeworkDetail, HomeworkListAdmin, HomeworkNew } from './HomeworkAdmin';
import { ParentReport } from './ParentReport';

export function TeacherApp() {
  const mode = useTeacher((s) => s.mode);
  const pin = useTeacher((s) => s.pin);
  // Nội dung vừa lưu → vẽ lại các trang con (đọc danh sách bộ sách mới)
  useContentVersion((s) => s.version);

  useEffect(() => {
    void useTeacher.getState().init();
  }, []);

  if (mode === null) return <div className="p-8 text-center font-bold text-sky-800">Đang kiểm tra máy chủ…</div>;
  if (!pin) return <PinGate />;
  return (
    <Routes>
      <Route index element={<TeacherHome />} />
      <Route path="content" element={<ContentPage />} />
      <Route path="content/:unitId" element={<UnitEditor />} />
      <Route path="import" element={<ImportPage />} />
      <Route path="stats" element={<StatsPage />} />
      <Route path="class" element={<ClassSetupPage />} />
      <Route path="class/:code" element={<ClassScreen />} />
      <Route path="homework" element={<HomeworkListAdmin />} />
      <Route path="homework/new" element={<HomeworkNew />} />
      <Route path="homework/:id" element={<HomeworkDetail />} />
      <Route path="report/:key" element={<ParentReport />} />
    </Routes>
  );
}

/** Khung trang giáo viên: thanh trên + nội dung rộng hơn trang học sinh */
export function TeacherLayout({ title, back = '/teacher', children, right }: { title: ReactNode; back?: string | (() => void); children: ReactNode; right?: ReactNode }) {
  return (
    <div className="min-h-full flex flex-col">
      <TopBar title={title} back={back} right={right} />
      <div className="flex-1 w-full max-w-5xl mx-auto px-3 sm:px-4 pb-10 space-y-4">
        <ModeNotice />
        {children}
      </div>
    </div>
  );
}

/** Cho giáo viên biết dữ liệu được lưu ở đâu */
export function ModeNotice() {
  const mode = useTeacher((s) => s.mode);
  if (mode !== 'local') return null;
  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-800">
      ⚠️ Không thấy máy chủ của game nên mọi thay đổi chỉ lưu trên <b>trình duyệt này</b>, và thống kê chỉ gồm các trận chơi trên máy này. Để học sinh ở mọi máy cùng thấy bài học và gửi kết quả về, hãy mở game bằng file <b>Chay game.bat</b> trên máy tính của thầy cô.
    </div>
  );
}

function PinGate() {
  const nav = useNavigate();
  const { pinSet, mode, login, setupPin } = useTeacher();
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const creating = !pinSet;

  const submit = async () => {
    setError(null);
    if (creating) {
      if (!validPin(pin)) return setError('Mã PIN phải gồm 4–8 chữ số.');
      if (pin !== pin2) return setError('Hai lần nhập không giống nhau.');
    }
    setBusy(true);
    const err = creating ? await setupPin(pin) : await login(pin);
    setBusy(false);
    if (err) setError(err);
  };

  const input = (value: string, set: (v: string) => void, label: string, autoFocus = false) => (
    <input
      type="password"
      inputMode="numeric"
      autoFocus={autoFocus}
      aria-label={label}
      placeholder={label}
      value={value}
      onChange={(e) => set(e.target.value.replace(/\D/g, '').slice(0, 8))}
      onKeyDown={(e) => e.key === 'Enter' && submit()}
      className="w-full rounded-2xl border-4 border-sky-200 px-4 py-3 text-center text-3xl font-extrabold tracking-[0.3em] text-sky-900 outline-none focus:border-sky-400"
    />
  );

  return (
    <div className="min-h-full flex flex-col">
      <TopBar title="🎓 Khu vực giáo viên" back="/" />
      <div className="w-full max-w-md mx-auto px-4 space-y-4">
        <ModeNotice />
        <div className="panel p-5 space-y-3">
          <div className="text-center text-5xl">🔐</div>
          {creating ? (
            <>
              <h2 className="text-center text-xl font-extrabold text-sky-900">Tạo mã PIN giáo viên</h2>
              <p className="text-sm font-bold text-slate-500">
                Lần đầu vào, thầy cô đặt một mã PIN (4–8 chữ số) để học sinh không vào sửa được. {mode === 'server' ? 'Mã này dùng chung cho mọi máy.' : 'Mã này chỉ dùng trên trình duyệt này.'}
              </p>
              {input(pin, setPin, 'Mã PIN mới', true)}
              {input(pin2, setPin2, 'Nhập lại mã PIN')}
            </>
          ) : (
            <>
              <h2 className="text-center text-xl font-extrabold text-sky-900">Nhập mã PIN giáo viên</h2>
              {input(pin, setPin, 'Mã PIN', true)}
            </>
          )}
          {error && <div className="rounded-xl bg-rose-50 p-2 text-center font-bold text-rose-600">{error}</div>}
          <Button className="w-full text-xl" disabled={busy || pin.length < 4} onClick={submit}>
            {creating ? 'Tạo mã PIN' : 'Vào'}
          </Button>
          <Button color="white" className="w-full" onClick={() => nav('/')}>
            Về trang chủ
          </Button>
        </div>
      </div>
    </div>
  );
}

function TeacherHome() {
  const nav = useNavigate();
  const { mode, logout } = useTeacher();
  const [pinOpen, setPinOpen] = useState(false);
  const tiles = [
    { to: 'content', icon: '📚', title: 'Bài học', desc: 'Xem, sửa, thêm bộ sách / lớp / unit, từ vựng và mẫu câu', color: 'border-green-300' },
    { to: 'import', icon: '📥', title: 'Nhập từ Excel', desc: 'Tải file mẫu, điền từ vựng rồi nhập nhiều unit cùng lúc', color: 'border-sky-300' },
    { to: 'stats', icon: '📊', title: 'Thống kê', desc: 'Kết quả từng học sinh, từng bài, từ hay sai nhất', color: 'border-violet-300' },
    { to: 'class', icon: '🏫', title: 'Phòng luyện tập', desc: 'Cả lớp cùng chơi: mã phòng, mã QR, màn hình chiếu', color: 'border-amber-300' },
    { to: 'homework', icon: '📝', title: 'Bài tập về nhà', desc: 'Giao bài có hạn nộp, xem ai đã nộp / chưa làm, tin nhắn gửi phụ huynh', color: 'border-orange-300' },
    { to: 'report/all', icon: '📄', title: 'Phiếu phụ huynh', desc: 'In / lưu PDF phiếu kết quả từng em để gửi về nhà', color: 'border-rose-300' },
  ];
  return (
    <TeacherLayout title="🎓 Khu vực giáo viên" back="/">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <button key={t.to} onClick={() => nav(`/teacher/${t.to}`)} className={`panel p-5 text-left border-b-8 ${t.color} hover:scale-[1.02] active:scale-[0.98] transition-transform`}>
            <div className="text-5xl">{t.icon}</div>
            <div className="mt-2 text-xl font-extrabold text-sky-900">{t.title}</div>
            <div className="text-sm font-bold text-slate-500">{t.desc}</div>
          </button>
        ))}
      </div>
      <div className="panel p-4 flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px] text-sm font-bold text-slate-500">
          {mode === 'server' ? '✅ Đang kết nối máy chủ của game: bài học và thống kê dùng chung cho mọi máy.' : '💻 Đang lưu trên trình duyệt này.'}
        </div>
        <Button color="white" onClick={() => setPinOpen(true)}>
          🔑 Đổi mã PIN
        </Button>
        <Button
          color="white"
          onClick={() => {
            logout();
            nav('/');
          }}
        >
          🚪 Đăng xuất
        </Button>
      </div>
      <ChangePinModal open={pinOpen} onClose={() => setPinOpen(false)} />
    </TeacherLayout>
  );
}

function ChangePinModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const changePin = useTeacher((s) => s.changePin);
  const [oldPin, setOld] = useState('');
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!open) return null;
  const field = (v: string, set: (x: string) => void, label: string) => (
    <label className="block">
      <span className="text-sm font-extrabold text-slate-500">{label}</span>
      <input type="password" inputMode="numeric" value={v} onChange={(e) => set(e.target.value.replace(/\D/g, '').slice(0, 8))} className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-xl font-extrabold tracking-widest outline-none focus:border-sky-400" />
    </label>
  );
  return (
    <Modal open onClose={onClose} title="🔑 Đổi mã PIN">
      <div className="space-y-3">
        {field(oldPin, setOld, 'Mã PIN hiện tại')}
        {field(pin, setPin, 'Mã PIN mới (4–8 chữ số)')}
        {msg && <div className={`rounded-xl p-2 text-center font-bold ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-rose-50 text-rose-600'}`}>{msg.text}</div>}
        <Button
          className="w-full"
          onClick={async () => {
            const err = await changePin(oldPin, pin);
            setMsg(err ? { ok: false, text: err } : { ok: true, text: 'Đã đổi mã PIN.' });
            if (!err) setTimeout(onClose, 900);
          }}
        >
          Lưu
        </Button>
      </div>
    </Modal>
  );
}
