// ============================================================
// Phòng luyện tập của giáo viên:
//  - ClassSetupPage: chọn bài, số câu, thời gian, độ khó → mở phòng (mã 4 số)
//  - ClassScreen: màn hình chiếu lên bảng — mã phòng + QR, danh sách học sinh,
//    câu hỏi chữ to, số bạn đã trả lời, đáp án + biểu đồ, bảng xếp hạng, bục vinh quang
// ============================================================
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { describeSelection, getUnit } from '../../content';
import { QuestionDeck } from '../../game/questions/buildQuiz';
import { getTypeInfo, QUESTION_TYPES, type Question, type QuestionType } from '../../game/questions/types';
import type { MonsterTier } from '../../game/monsters';
import { classApi, hostSession, useClassRoom, useServerClock, type HostView } from '../../services/classApi';
import { checkLocalServer } from '../../services/api';
import { unitLabel } from '../../services/results';
import { speak, speechSupported } from '../../services/speech';
import { playSfx } from '../../services/audio';
import { useTeacher } from '../../stores/teacher';
import { Button, Modal, WordImage } from '../../components/ui';
import { QrCode } from '../../components/QrCode';
import { UnitPicker, defaultUnitId } from '../../components/UnitPicker';
import { Prompt } from '../battle/QuestionPanel';
import { ClassTimer, GetReady, MEDALS, placeLabel } from '../class/shared';
import { TeacherLayout } from './TeacherApp';

// ---------------- Thiết lập ----------------

export type Kinds = 'all' | 'vocab' | 'pattern';

export interface ClassOptions {
  unitId: string;
  count: number;
  timerSec: number;
  tier: MonsterTier;
  kinds: Kinds;
  listen: boolean;
}

const OPTIONS_KEY = 'bqe-class-options';

function loadOptions(): ClassOptions {
  const base: ClassOptions = { unitId: defaultUnitId(), count: 10, timerSec: 20, tier: 'normal', kinds: 'all', listen: true };
  try {
    const saved = JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? 'null') as Partial<ClassOptions> | null;
    const o = { ...base, ...(saved ?? {}) };
    if (!getUnit(o.unitId)) o.unitId = base.unitId;
    return o;
  } catch {
    return base;
  }
}

/** Sinh bộ câu hỏi cho cả lớp */
export function makeClassQuestions(o: ClassOptions): Question[] {
  const unit = getUnit(o.unitId);
  if (!unit) return [];
  const types: QuestionType[] = QUESTION_TYPES.filter((t) => (o.kinds === 'all' || t.category === o.kinds) && (o.listen || !t.needsAudio)).map((t) => t.id);
  // Câu nghe phát trên loa của máy chiếu → chỉ cần máy giáo viên đọc được
  const deck = new QuestionDeck(unit, types, o.tier, o.listen && speechSupported());
  return Array.from({ length: o.count }, () => deck.next());
}

export function Choice<T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={String(o.v)}
          onClick={() => onChange(o.v)}
          className={`rounded-xl border-2 px-3 py-1.5 font-extrabold transition ${o.v === value ? 'border-sky-400 bg-sky-500 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-sky-50'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-sm font-extrabold text-slate-500">{label}</div>
      {children}
    </div>
  );
}

export function ClassSetupPage() {
  const nav = useNavigate();
  const pin = useTeacher((s) => s.pin)!;
  const mode = useTeacher((s) => s.mode);
  // Phòng luyện tập luôn chạy trên máy chủ cục bộ (Chay game.bat), kể cả khi bài học lưu trên Supabase
  const [localServer, setLocalServer] = useState<boolean | null>(mode === 'server' ? true : null);
  const [o, setO] = useState(loadOptions);
  const [pickOpen, setPickOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unit = getUnit(o.unitId);
  const desc = unit ? describeSelection({ bookId: unit.bookId, gradeId: unit.gradeId, unitId: unit.id }) : null;
  const set = (patch: Partial<ClassOptions>) => setO((x) => ({ ...x, ...patch }));

  useEffect(() => {
    if (localServer !== null) return;
    let alive = true;
    void checkLocalServer(true).then((r) => alive && setLocalServer(r.ok));
    return () => {
      alive = false;
    };
  }, [localServer]);

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem(OPTIONS_KEY, JSON.stringify(o));
    } catch {
      /* bỏ qua */
    }
    let questions: Question[] = [];
    try {
      questions = makeClassQuestions(o);
    } catch {
      /* unit không đủ câu hỏi */
    }
    if (!questions.length) {
      setBusy(false);
      return setError('Bài này không sinh được câu hỏi. Thầy cô chọn bài khác hoặc bật thêm dạng câu.');
    }
    const r = await classApi.create(pin, { unitId: o.unitId, unit: unitLabel(o.unitId), questions, limitMs: o.timerSec * 1000 });
    setBusy(false);
    if (!r.ok || !r.data) return setError(r.error ?? 'Không mở được phòng');
    hostSession.set(r.data.code, r.data.key);
    nav(`/teacher/class/${r.data.code}`);
  };

  if (localServer === null)
    return (
      <TeacherLayout title="🏫 Phòng luyện tập">
        <div className="panel p-5 text-center font-bold text-sky-800">Đang kiểm tra máy chủ của game…</div>
      </TeacherLayout>
    );

  if (!localServer)
    return (
      <TeacherLayout title="🏫 Phòng luyện tập">
        <div className="panel p-5 space-y-3 font-bold text-slate-600">
          <p>
            Phòng luyện tập trên lớp chỉ dùng được khi mở game bằng <b>Chay game.bat</b> trên máy thầy cô.
          </p>
          <p className="text-sm text-slate-500">
            {mode === 'cloud' || mode === 'local'
              ? 'Các máy học sinh kết nối vào máy tính của thầy cô qua cùng mạng Wi-Fi, nên phòng không mở được từ đường link trên Internet.'
              : 'Máy chủ của game là để các máy học sinh kết nối vào qua cùng mạng Wi-Fi.'}{' '}
            Thầy cô chạy file đó trên máy tính của mình rồi vào lại mục này.
          </p>
          <Button color="white" onClick={() => setLocalServer(null)}>
            🔄 Kiểm tra lại
          </Button>
        </div>
      </TeacherLayout>
    );

  const last = hostSession.last();
  return (
    <TeacherLayout title="🏫 Phòng luyện tập">
      {last && (
        <Button color="blue" className="w-full text-xl" onClick={() => nav(`/teacher/class/${last}`)}>
          📺 Quay lại phòng {last} đang mở
        </Button>
      )}
      <div className="panel p-4 sm:p-5 space-y-4">
        <Field label="Bài học">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-xl font-extrabold text-slate-800 truncate">{desc?.unit ?? 'Chưa chọn bài'}</div>
              <div className="text-sm font-bold text-slate-500 truncate">{desc ? `${desc.book} · ${desc.grade} · ${unit!.titleVi}` : ''}</div>
            </div>
            <Button color="white" onClick={() => setPickOpen(true)}>
              Đổi bài
            </Button>
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Số câu hỏi">
            <Choice value={o.count} onChange={(count) => set({ count })} options={[5, 10, 15, 20].map((v) => ({ v, label: `${v} câu` }))} />
          </Field>
          <Field label="Thời gian mỗi câu">
            <Choice value={o.timerSec} onChange={(timerSec) => set({ timerSec })} options={[10, 15, 20, 30].map((v) => ({ v, label: `${v} giây` }))} />
          </Field>
          <Field label="Độ khó">
            <Choice
              value={o.tier}
              onChange={(tier) => set({ tier })}
              options={[
                { v: 'normal' as MonsterTier, label: '🙂 Dễ' },
                { v: 'elite' as MonsterTier, label: '😎 Vừa' },
                { v: 'boss' as MonsterTier, label: '🔥 Khó' },
              ]}
            />
          </Field>
          <Field label="Dạng câu hỏi">
            <Choice
              value={o.kinds}
              onChange={(kinds) => set({ kinds })}
              options={[
                { v: 'all' as Kinds, label: 'Tất cả' },
                { v: 'vocab' as Kinds, label: 'Từ vựng' },
                { v: 'pattern' as Kinds, label: 'Mẫu câu' },
              ]}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 font-bold text-slate-600">
          <input type="checkbox" className="h-5 w-5 accent-sky-500" checked={o.listen} onChange={(e) => set({ listen: e.target.checked })} />
          Có câu nghe (máy chiếu tự đọc to, học sinh bấm 🔊 trên máy mình để nghe lại)
        </label>
        {error && <div className="rounded-xl bg-rose-50 p-2 text-center font-bold text-rose-600">{error}</div>}
        <Button className="w-full text-2xl !py-4" disabled={busy || !unit} onClick={open}>
          {busy ? '⏳ Đang mở phòng…' : '🚀 Mở phòng'}
        </Button>
      </div>
      <ul className="text-sm font-bold text-slate-600 space-y-1 bg-white/80 rounded-2xl p-3">
        <li>📺 Mở phòng trên máy nối với máy chiếu / TV. Học sinh quét mã QR hoặc vào game → <b>Vào lớp</b> → nhập mã 4 số.</li>
        <li>📶 Máy học sinh cần dùng <b>cùng mạng Wi-Fi</b> với máy này. Không cần Internet.</li>
        <li>⚡ Cả lớp trả lời cùng một câu. Đúng được 100 điểm, càng nhanh càng được thêm (tối đa +50), đúng liên tiếp có thưởng.</li>
        <li>📊 Kết quả từng em tự lưu vào mục Thống kê (chế độ "Lớp học").</li>
      </ul>
      <UnitPicker open={pickOpen} value={o.unitId} onPick={(unitId) => set({ unitId })} onClose={() => setPickOpen(false)} />
    </TeacherLayout>
  );
}

// ---------------- Màn hình chiếu ----------------

/** Màu 4 đáp án trên màn hình chiếu */
const TILE = [
  { bg: 'bg-rose-500', border: 'border-rose-700', bar: 'bg-rose-500', label: 'A' },
  { bg: 'bg-sky-500', border: 'border-sky-700', bar: 'bg-sky-500', label: 'B' },
  { bg: 'bg-amber-400', border: 'border-amber-600', bar: 'bg-amber-400', label: 'C' },
  { bg: 'bg-green-500', border: 'border-green-700', bar: 'bg-green-500', label: 'D' },
];

/** Địa chỉ cho học sinh: mở bằng localhost thì thay bằng địa chỉ mạng LAN của máy này */
function useJoinBase() {
  const local = /^(localhost|127\.|\[::1\])/.test(location.hostname);
  const [ips, setIps] = useState<string[]>([]);
  const [pick, setPick] = useState(0);
  useEffect(() => {
    if (!local) return;
    void classApi.net().then((r) => r.data && setIps(r.data.ips));
  }, [local]);
  const port = location.port ? `:${location.port}` : '';
  const base = local ? (ips[pick] ? `${location.protocol}//${ips[pick]}${port}` : null) : location.origin;
  return { base, ips: local ? ips : [], pick, setPick, local };
}

export function ClassScreen() {
  const { code = '' } = useParams();
  const nav = useNavigate();
  const key = hostSession.get(code);
  const { view, offline, closed, serverNow, refresh } = useClassRoom<HostView>(code, key ? { key } : null);
  const join = useJoinBase();
  const joinUrl = join.base ? `${join.base}${location.pathname}#/class/${code}` : '';
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const now = useServerClock(serverNow, view?.phase === 'question');

  const control = async (body: Parameters<typeof classApi.control>[2]) => {
    if (!key) return;
    setBusy(true);
    setErr(null);
    const r = await classApi.control(code, key, body);
    setBusy(false);
    if (!r.ok) setErr(r.error ?? 'Không thực hiện được');
    refresh();
  };

  const closeRoom = async () => {
    if (key) await classApi.close(code, key);
    hostSession.set(code, null);
    nav('/teacher/class');
  };

  const restart = () => {
    if (!view) return;
    const o = { ...loadOptions(), unitId: view.unitId };
    let questions: Question[] = [];
    try {
      questions = makeClassQuestions(o);
    } catch {
      /* bỏ qua */
    }
    if (questions.length) void control({ action: 'restart', questions });
  };

  // Đọc to câu nghe trên loa máy chiếu khi câu hỏi bắt đầu
  const started = view?.phase === 'question' && now >= view.startsAt;
  const spoken = useRef('');
  useEffect(() => {
    const q = view?.question;
    if (!started || !q || !view) return;
    const k = `${view.round}-${view.qIndex}`;
    if (spoken.current === k) return;
    spoken.current = k;
    playSfx('start');
    if ((q.type === 'listen-vi' || q.type === 'listen-en') && q.prompt.speak) setTimeout(() => speak(q.prompt.speak!, q.prompt.audio), 300);
  }, [started, view]);

  // Âm thanh khi công bố đáp án / kết thúc
  const lastPhase = useRef('');
  useEffect(() => {
    if (!view) return;
    const k = `${view.round}-${view.qIndex}-${view.phase}`;
    if (lastPhase.current === k) return;
    const first = !lastPhase.current;
    lastPhase.current = k;
    if (first) return;
    if (view.phase === 'reveal') playSfx('correct');
    if (view.phase === 'end') playSfx('win');
  }, [view]);

  // Phím tắt: Space / Enter / → = bước tiếp theo
  const nextRef = useRef<() => void>(() => {});
  nextRef.current = () => {
    if (!view || busy) return;
    if (view.phase === 'lobby' && view.players.length) void control({ action: 'start' });
    else if (view.phase === 'question' && now >= view.startsAt) void control({ action: 'reveal' });
    else if (view.phase === 'reveal') void control({ action: 'next' });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        nextRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!key || closed)
    return (
      <TeacherLayout title="🏫 Phòng luyện tập" back="/teacher/class">
        <div className="panel p-5 text-center space-y-3">
          <div className="text-5xl">🏁</div>
          <div className="text-xl font-extrabold text-sky-900">{closed ? 'Phòng đã đóng' : 'Không điều khiển được phòng này'}</div>
          <p className="font-bold text-slate-500">{closed ? 'Máy chủ đã khởi động lại hoặc phòng đã đóng.' : 'Phòng được mở ở trình duyệt khác. Thầy cô mở phòng mới nhé.'}</p>
          <Button onClick={() => nav('/teacher/class')}>🚀 Mở phòng mới</Button>
        </div>
      </TeacherLayout>
    );

  if (!view) return <div className="h-[100dvh] grid place-items-center text-2xl font-extrabold text-sky-800">{offline ? '📶 Đang kết nối lại máy chủ…' : 'Đang mở phòng…'}</div>;

  const online = view.players.filter((p) => p.online).length;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gradient-to-b from-sky-200 to-sky-100">
      {/* Thanh trên */}
      <div className="flex flex-wrap items-center gap-2 px-3 pt-3 sm:px-5">
        <Button color="white" className="!px-3 !py-2" onClick={() => nav('/teacher')} aria-label="Về khu vực giáo viên" title="Về khu vực giáo viên (phòng vẫn mở)">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Button>
        {view.phase !== 'lobby' && (
          <div className="rounded-2xl bg-white px-3 py-1.5 font-extrabold text-sky-900 shadow">
            Mã phòng <span className="text-2xl tracking-widest text-sky-600">{code}</span>
          </div>
        )}
        <div className="flex-1 min-w-0 truncate font-extrabold text-sky-900">{view.unit}</div>
        <div className="rounded-2xl bg-white px-3 py-1.5 font-extrabold text-sky-900 shadow" title="Đang kết nối / đã vào phòng">
          👥 {online}
          {online !== view.players.length && <span className="text-slate-400">/{view.players.length}</span>}
        </div>
        {view.phase !== 'lobby' && view.phase !== 'end' && (
          <div className="rounded-2xl bg-white px-3 py-1.5 font-extrabold text-sky-900 shadow">
            Câu {view.qIndex + 1}/{view.total}
          </div>
        )}
        <Button color="white" className="!px-3 !py-2" onClick={toggleFullscreen} title="Toàn màn hình" aria-label="Toàn màn hình">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
        </Button>
        <Button color="red" className="!px-3 !py-2" onClick={() => setConfirmClose(true)}>
          Đóng phòng
        </Button>
      </div>
      {offline && <div className="mx-3 mt-2 rounded-2xl border-2 border-amber-300 bg-amber-50 p-2 text-center font-bold text-amber-800">📶 Mất kết nối máy chủ, đang thử lại…</div>}
      {err && <div className="mx-3 mt-2 rounded-2xl bg-rose-50 p-2 text-center font-bold text-rose-600">{err}</div>}

      <div className="flex-1 w-full max-w-7xl mx-auto p-3 sm:p-5">
        {view.phase === 'lobby' && <Lobby view={view} code={code} joinUrl={joinUrl} join={join} busy={busy} onStart={() => control({ action: 'start' })} onKick={(pid) => control({ action: 'kick', pid })} />}
        {view.phase === 'question' && view.question && (now < view.startsAt ? <GetReady big now={now} startsAt={view.startsAt} qIndex={view.qIndex} total={view.total} /> : <QuestionScreen view={view} now={now} busy={busy} onReveal={() => control({ action: 'reveal' })} />)}
        {view.phase === 'reveal' && view.question && <RevealScreen view={view} busy={busy} onNext={() => control({ action: 'next' })} onEnd={() => control({ action: 'end' })} />}
        {view.phase === 'end' && <EndScreen view={view} busy={busy} onRestart={restart} onClose={() => setConfirmClose(true)} onStats={() => nav('/teacher/stats')} />}
      </div>

      <Modal open={confirmClose} onClose={() => setConfirmClose(false)} title="Đóng phòng?">
        <p className="font-bold text-slate-600">Học sinh sẽ không vào phòng này được nữa. {view.phase !== 'end' && view.phase !== 'lobby' ? 'Lượt đang chơi dở sẽ được lưu kết quả các câu đã làm.' : ''}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button color="white" onClick={() => setConfirmClose(false)}>
            Ở lại
          </Button>
          <Button
            color="red"
            onClick={async () => {
              // Đang chơi dở → kết thúc để lưu kết quả trước khi đóng
              if (key && (view.phase === 'question' || view.phase === 'reveal')) await classApi.control(code, key, { action: 'end' });
              await closeRoom();
            }}
          >
            Đóng phòng
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}

// ---- Sảnh chờ: mã phòng to + QR + học sinh đã vào ----

function Lobby({ view, code, joinUrl, join, busy, onStart, onKick }: { view: HostView; code: string; joinUrl: string; join: ReturnType<typeof useJoinBase>; busy: boolean; onStart: () => void; onKick: (pid: string) => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="panel p-5 text-center space-y-3">
        <div className="text-xl font-extrabold text-slate-500">Vào game → 🏫 Vào lớp → nhập mã</div>
        <div className="flex justify-center gap-2" data-testid="class-code">
          {code.split('').map((d, i) => (
            <span key={i} className="grid h-24 w-20 sm:h-32 sm:w-24 place-items-center rounded-2xl border-b-8 border-sky-700 bg-sky-500 text-6xl sm:text-8xl font-extrabold text-white">
              {d}
            </span>
          ))}
        </div>
        <div className="text-lg font-extrabold text-slate-500">hoặc quét mã QR</div>
        {joinUrl ? (
          <>
            <QrCode text={joinUrl} className="mx-auto w-full max-w-[300px] rounded-2xl border-4 border-slate-100" />
            <div className="break-all text-lg font-extrabold text-sky-700">{joinUrl.replace(/^https?:\/\//, '')}</div>
            {join.ips.length > 1 && (
              <div className="flex flex-wrap justify-center gap-1 text-xs font-bold text-slate-500">
                Địa chỉ khác (nếu học sinh không vào được):
                {join.ips.map((ip, i) => (
                  <button key={ip} onClick={() => join.setPick(i)} className={`rounded px-1.5 ${i === join.pick ? 'bg-sky-100 text-sky-800' : 'underline'}`}>
                    {ip}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="rounded-2xl bg-amber-50 p-3 font-bold text-amber-800">{join.local ? '⏳ Đang tìm địa chỉ mạng của máy này… (máy cần kết nối Wi-Fi)' : ''}</div>
        )}
      </div>

      <div className="panel p-5 flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-2xl font-extrabold text-sky-900">👥 {view.players.length} bạn đã vào</h2>
          <span className="text-sm font-bold text-slate-400">Bấm ✕ để mời ra (VD tên chưa đúng)</span>
        </div>
        <div className="mt-3 flex-1 min-h-[160px] content-start flex flex-wrap gap-2">
          {view.players.length === 0 && <div className="w-full py-10 text-center text-xl font-bold text-slate-400 animate-pulse">⏳ Đang chờ học sinh vào phòng…</div>}
          {view.players.map((p) => (
            <span key={p.pid} className={`group inline-flex items-center gap-1 rounded-2xl border-b-4 px-3 py-2 text-xl font-extrabold animate-pop ${p.online ? 'bg-sky-100 border-sky-300 text-sky-900' : 'bg-slate-100 border-slate-200 text-slate-400'}`}>
              🧒 {p.name}
              <button onClick={() => onKick(p.pid)} className="ml-1 rounded-full px-1.5 text-base text-slate-400 hover:bg-rose-100 hover:text-rose-600" aria-label={`Mời ${p.name} ra khỏi phòng`}>
                ✕
              </button>
            </span>
          ))}
        </div>
        <Button className="mt-4 w-full text-3xl !py-5" disabled={busy || view.players.length === 0} onClick={onStart}>
          {view.players.length ? `▶ Bắt đầu (${view.total} câu)` : '⏳ Chờ học sinh…'}
        </Button>
        <div className="mt-1 text-center text-sm font-bold text-slate-400">Phím tắt: Space / Enter để sang bước tiếp theo</div>
      </div>
    </div>
  );
}

// ---- Câu hỏi đang mở ----

function QuestionScreen({ view, now, busy, onReveal }: { view: HostView; now: number; busy: boolean; onReveal: () => void }) {
  const q = view.question!;
  const total = view.players.filter((p) => p.online || p.answeredNow).length;
  return (
    <div className="space-y-4">
      <div className="panel p-4 sm:p-6 space-y-4">
        <div className="flex justify-center">
          <span className="rounded-full bg-sky-100 text-sky-800 px-4 py-1.5 text-xl font-extrabold">
            {getTypeInfo(q.type).icon} {q.instruction}
          </span>
        </div>
        <div style={{ zoom: 1.6 }}>
          <Prompt q={q} />
        </div>
        <ClassTimer big now={now} startsAt={view.startsAt} deadline={view.deadline} />
      </div>
      <BigAnswers q={q} />
      <div className="panel p-4 flex flex-wrap items-center gap-3">
        <div className="text-3xl font-extrabold text-sky-900">
          📨 {view.answered}/{total} <span className="text-xl text-slate-500">đã trả lời</span>
        </div>
        <div className="flex-1 flex flex-wrap gap-1">
          {view.players.map((p) => (
            <span key={p.pid} className={`rounded-lg px-2 py-0.5 text-sm font-extrabold ${p.answeredNow ? 'bg-green-100 text-green-800' : p.online ? 'bg-slate-100 text-slate-500' : 'bg-slate-50 text-slate-300'}`}>
              {p.answeredNow ? '✓ ' : ''}
              {p.name}
            </span>
          ))}
        </div>
        <Button color="orange" className="text-xl" disabled={busy} onClick={onReveal}>
          ⏭ Hiện đáp án
        </Button>
      </div>
    </div>
  );
}

/** 4 đáp án chữ to (hoặc các mảnh từ của câu sắp xếp) */
function BigAnswers({ q, counts }: { q: Question; counts?: number[] | null }) {
  if (q.mode === 'order') {
    return (
      <div className="panel p-4 space-y-3">
        <div className="flex flex-wrap justify-center gap-3">
          {(q.tokens ?? []).map((t, i) => (
            <span key={i} className="rounded-2xl border-b-4 border-slate-300 bg-white px-4 py-2 text-3xl font-extrabold text-slate-700 shadow">
              {t}
            </span>
          ))}
        </div>
        {counts && (
          <div className="text-center">
            <div className="text-4xl font-extrabold text-green-700 animate-pop">✅ {q.answerText}</div>
            <div className="mt-2 text-2xl font-extrabold text-slate-600">
              <span className="text-green-600">{counts[0]} bạn đúng</span> · <span className="text-rose-500">{counts[1]} bạn sai</span>
            </div>
          </div>
        )}
      </div>
    );
  }
  const max = Math.max(1, ...(counts ?? [0]));
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {q.choices.map((c, i) => {
        const t = TILE[i % 4];
        const right = i === q.answerIndex;
        const dim = counts && !right;
        return (
          <div key={i} className={`relative flex items-center gap-3 rounded-3xl border-b-8 ${t.border} ${t.bg} px-4 py-4 sm:py-6 text-white shadow-lg transition ${dim ? 'opacity-35' : ''} ${counts && right ? 'ring-8 ring-green-300 animate-pop' : ''}`}>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/25 text-3xl font-extrabold">{counts && right ? '✓' : t.label}</span>
            <span className="flex-1 text-3xl sm:text-4xl font-extrabold leading-tight break-words [text-shadow:0_2px_0_rgba(0,0,0,0.25)]">{c}</span>
            {counts && (
              <span className="flex shrink-0 items-end gap-2">
                <span className="h-16 w-4 rounded-full bg-white/30 flex items-end overflow-hidden">
                  <span className="w-full rounded-full bg-white" style={{ height: `${(counts[i] / max) * 100}%` }} />
                </span>
                <span className="text-3xl font-extrabold tabular-nums">{counts[i]}</span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- Công bố đáp án + bảng xếp hạng ----

function RevealScreen({ view, busy, onNext, onEnd }: { view: HostView; busy: boolean; onNext: () => void; onEnd: () => void }) {
  const q = view.question!;
  const last = view.qIndex + 1 >= view.total;
  const correct = view.players.filter((p) => p.last?.correct).length;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="panel p-4 sm:p-6 space-y-3">
          <div className="flex items-start gap-4">
            {q.item.image && <WordImage src={q.item.image} className="h-24 w-24 text-7xl shrink-0" />}
            <div className="flex-1">
              <div className="text-4xl font-extrabold text-green-700">{q.answerText}</div>
              <div className="text-xl font-bold text-slate-600">💡 {q.explanation}</div>
            </div>
            <Button color="blue" className="!px-4 !py-3 text-3xl shrink-0" onClick={() => speak(q.item.en, q.item.audio)} aria-label="Nghe">
              🔊
            </Button>
          </div>
          <div className="text-2xl font-extrabold text-sky-900">
            ✅ {correct}/{view.players.length} bạn trả lời đúng
          </div>
        </div>
        <BigAnswers q={q} counts={view.counts} />
      </div>
      <div className="panel p-4 sm:p-5 flex flex-col">
        <h2 className="text-2xl font-extrabold text-sky-900">🏆 Bảng xếp hạng</h2>
        <Ranking players={view.players.slice(0, 8)} showGain />
        <div className="mt-auto pt-4 grid gap-2">
          <Button className="w-full text-2xl !py-4" disabled={busy} onClick={onNext}>
            {last ? '🏆 Xem kết quả' : '▶ Câu tiếp theo'}
          </Button>
          {!last && (
            <Button color="white" disabled={busy} onClick={onEnd}>
              ⏹ Dừng tại đây & xem kết quả
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Ranking({ players, showGain }: { players: HostView['players']; showGain?: boolean }) {
  return (
    <div className="mt-2 space-y-1.5">
      {players.map((p) => (
        <div key={p.pid} className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-xl font-extrabold animate-pop ${p.place <= 3 ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-700'}`}>
          <span className="w-10 text-center">{placeLabel(p.place, p.score)}</span>
          <span className="flex-1 truncate">{p.name}</span>
          {showGain && p.last?.correct && <span className="text-base text-green-600">+{p.last.points}</span>}
          <span className="tabular-nums">{p.score}</span>
        </div>
      ))}
    </div>
  );
}

// ---- Kết thúc: bục vinh quang + thống kê nhanh ----

function EndScreen({ view, busy, onRestart, onClose, onStats }: { view: HostView; busy: boolean; onRestart: () => void; onClose: () => void; onStats: () => void }) {
  const podium = view.players.filter((p) => p.place <= 3).slice(0, 3);
  // Thứ tự trên bục: 2 – 1 – 3
  const order = [podium[1], podium[0], podium[2]].filter(Boolean);
  const asked = view.perQuestion ? view.perQuestion.slice(0, view.qIndex + 1) : [];
  const answered = view.players.length * asked.length;
  const correct = view.players.reduce((a, p) => a + p.correct, 0);
  const hardest = asked
    .map((x, i) => ({ ...x, i, pct: x.total ? x.correct / x.total : 1 }))
    .filter((x) => x.pct < 1)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 5);
  return (
    <div className="space-y-4">
      <div className="panel p-5">
        <h2 className="text-center text-4xl font-extrabold text-sky-900">🎉 Chúc mừng cả lớp!</h2>
        <div className="mt-6 flex items-end justify-center gap-3 sm:gap-6">
          {order.map((p) => {
            const h = p.place === 1 ? 'h-48' : p.place === 2 ? 'h-36' : 'h-28';
            return (
              <div key={p.pid} className="flex w-32 sm:w-44 flex-col items-center animate-pop">
                <div className="text-6xl">{MEDALS[p.place - 1]}</div>
                <div className="w-full truncate text-center text-2xl font-extrabold text-slate-800">{p.name}</div>
                <div className="text-xl font-extrabold text-slate-500 tabular-nums">{p.score} điểm</div>
                <div className={`mt-1 w-full ${h} rounded-t-2xl border-b-8 ${p.place === 1 ? 'bg-amber-400 border-amber-600' : p.place === 2 ? 'bg-slate-300 border-slate-500' : 'bg-orange-300 border-orange-500'} grid place-items-center text-6xl font-extrabold text-white`}>
                  {p.place}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-4 sm:p-5">
          <h3 className="text-xl font-extrabold text-sky-900">📋 Cả lớp ({view.players.length} bạn)</h3>
          <div className="max-h-[50vh] overflow-y-auto">
            <table className="mt-2 w-full text-left font-bold">
              <thead className="text-sm text-slate-400">
                <tr>
                  <th className="py-1">Hạng</th>
                  <th>Tên</th>
                  <th className="text-right">Đúng</th>
                  <th className="text-right">Điểm</th>
                </tr>
              </thead>
              <tbody>
                {view.players.map((p) => (
                  <tr key={p.pid} className="border-t border-slate-100">
                    <td className="py-1">{placeLabel(p.place, p.score)}</td>
                    <td className="truncate max-w-[12rem]">{p.name}</td>
                    <td className="text-right tabular-nums">
                      {p.correct}/{asked.length}
                    </td>
                    <td className="text-right tabular-nums">{p.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel p-4 sm:p-5 space-y-3">
          <h3 className="text-xl font-extrabold text-sky-900">📊 Nhanh gọn</h3>
          <div className="text-3xl font-extrabold text-sky-800">✅ {answered ? Math.round((correct / answered) * 100) : 0}% câu trả lời đúng</div>
          {hardest.length > 0 ? (
            <div>
              <div className="font-extrabold text-slate-500">Câu cả lớp hay sai — nên ôn lại:</div>
              <div className="mt-1 space-y-1">
                {hardest.map((h) => (
                  <div key={h.i} className="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-1.5 font-bold">
                    <span className="flex-1 truncate">
                      <b className="text-slate-800">{h.en}</b> <span className="text-slate-500">· {h.vi}</span>
                    </span>
                    <span className="text-rose-600 tabular-nums">
                      {h.correct}/{h.total} đúng
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="font-extrabold text-green-600">🌟 Cả lớp trả lời đúng hết!</div>
          )}
          <div className="grid gap-2 pt-2 sm:grid-cols-3">
            <Button disabled={busy} onClick={onRestart}>
              🔁 Chơi lại
            </Button>
            <Button color="purple" onClick={onStats}>
              📊 Thống kê
            </Button>
            <Button color="red" onClick={onClose}>
              🚪 Đóng phòng
            </Button>
          </div>
          <div className="text-sm font-bold text-slate-400">"Chơi lại" dùng bộ câu hỏi mới, học sinh không cần vào lại phòng.</div>
        </div>
      </div>
    </div>
  );
}
