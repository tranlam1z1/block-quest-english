// ============================================================
// Học sinh: vào phòng luyện tập của thầy cô (nhập mã 4 số hoặc quét QR),
// trả lời từng câu trên máy của mình, xem điểm & thứ hạng.
// ============================================================
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { classApi, playerSession, useClassRoom, useServerClock, type PlayerView } from '../../services/classApi';
import { deviceId } from '../../services/results';
import { playSfx } from '../../services/audio';
import { speak } from '../../services/speech';
import { useProgress } from '../../stores/progress';
import { getTypeInfo } from '../../game/questions/types';
import { Button, TopBar } from '../../components/ui';
import { ChoiceGrid, OrderPicker, Prompt } from '../battle/QuestionPanel';
import { ClassTimer, GetReady, MEDALS, placeLabel } from './shared';

const validCode = (c: string) => /^\d{4}$/.test(c);

export function ClassPage() {
  const { code = '' } = useParams();
  const [pid, setPid] = useState(() => (validCode(code) ? playerSession.get(code) : null));

  useEffect(() => setPid(validCode(code) ? playerSession.get(code) : null), [code]);

  if (!validCode(code) || !pid)
    return (
      <JoinForm
        initialCode={validCode(code) ? code : ''}
        onJoined={(c, p) => {
          playerSession.set(c, p);
          setPid(p);
        }}
      />
    );
  return (
    <Play
      code={code}
      pid={pid}
      onLeave={() => {
        playerSession.set(code, null);
        setPid(null);
      }}
    />
  );
}

// ---------------- Vào phòng ----------------

function JoinForm({ initialCode, onJoined }: { initialCode: string; onJoined: (code: string, pid: string) => void }) {
  const nav = useNavigate();
  const savedName = useProgress((s) => s.playerName);
  const setPlayerName = useProgress((s) => s.setPlayerName);
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState(savedName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ok = validCode(code) && name.trim().length > 0;

  const join = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setError(null);
    const r = await classApi.join(code, name.trim(), deviceId());
    setBusy(false);
    if (!r.ok || !r.data) return setError(r.error ?? 'Không vào được phòng');
    setPlayerName(name);
    if (code !== initialCode) nav(`/class/${code}`, { replace: true });
    onJoined(code, r.data.pid);
  };

  return (
    <div className="min-h-full flex flex-col">
      <TopBar title="🏫 Vào lớp học" back="/" />
      <div className="w-full max-w-md mx-auto px-4 pb-8 space-y-4">
        <div className="panel p-5 space-y-3">
          <div className="text-center text-5xl">🏫</div>
          <p className="text-center font-bold text-slate-500">Nhập mã phòng thầy cô chiếu trên bảng (hoặc quét mã QR).</p>
          <label className="block">
            <span className="text-sm font-extrabold text-slate-400">MÃ PHÒNG</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={(e) => e.key === 'Enter' && join()}
              inputMode="numeric"
              autoFocus={!initialCode}
              placeholder="____"
              aria-label="Mã phòng"
              className="w-full rounded-2xl border-4 border-sky-200 px-3 py-2 text-center text-4xl font-extrabold tracking-[0.5em] text-sky-900 outline-none focus:border-sky-400"
            />
          </label>
          <label className="block">
            <span className="text-sm font-extrabold text-slate-400">TÊN CỦA EM</span>
            <input
              value={name}
              maxLength={16}
              autoFocus={!!initialCode}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && join()}
              placeholder="VD: Minh Anh"
              aria-label="Tên của em"
              className="w-full rounded-2xl border-4 border-sky-200 px-4 py-3 text-2xl font-extrabold text-sky-900 outline-none focus:border-sky-400"
            />
          </label>
          {error && <div className="rounded-xl bg-rose-50 p-2 text-center font-bold text-rose-600">{error}</div>}
          <Button className="w-full text-2xl !py-4" disabled={!ok || busy} onClick={join}>
            {busy ? '⏳ Đang vào…' : '🚪 Vào lớp'}
          </Button>
        </div>
        <p className="text-center text-sm font-bold text-sky-900/70">Máy của em cần dùng cùng mạng Wi-Fi với máy của thầy cô.</p>
      </div>
    </div>
  );
}

// ---------------- Trong phòng ----------------

function Play({ code, pid, onLeave }: { code: string; pid: string; onLeave: () => void }) {
  const nav = useNavigate();
  const { view, offline, closed, serverNow, refresh } = useClassRoom<PlayerView>(code, { pid });
  const phase = view?.phase;
  const now = useServerClock(serverNow, phase === 'question');

  // Đã chọn đáp án ở câu nào (để khóa ngay khi bấm, không chờ máy chủ)
  const [sent, setSent] = useState<{ q: number; choice: number | null } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const qIndex = view?.qIndex ?? -1;
  useEffect(() => {
    setSent(null);
    setSendError(null);
  }, [qIndex, view?.round]);

  // Âm thanh khi công bố đáp án
  const lastReveal = useRef('');
  useEffect(() => {
    if (!view || view.gone || view.phase !== 'reveal') return;
    const k = `${view.round}-${view.qIndex}`;
    if (lastReveal.current === k) return;
    lastReveal.current = k;
    playSfx(view.me.answer?.correct ? 'correct' : 'wrong');
  }, [view]);

  // Nhận vàng 1 lần mỗi lượt chơi
  const [gold, setGold] = useState<number | null>(null);
  useEffect(() => {
    if (!view || view.gone || view.phase !== 'end') return;
    const k = `bqe-class-reward-${code}-${view.round}-${pid}`;
    try {
      if (sessionStorage.getItem(k)) {
        setGold(Number(sessionStorage.getItem(k)));
        return;
      }
    } catch {
      /* bỏ qua */
    }
    const answered = Math.min(view.total, view.qIndex + 1);
    const earned = useProgress.getState().recordClass({ answered, correct: view.me.correct, maxCombo: view.me.bestStreak, place: view.me.place });
    try {
      sessionStorage.setItem(k, String(earned));
    } catch {
      /* bỏ qua */
    }
    setGold(earned);
    playSfx(view.me.place <= 3 && view.me.score > 0 ? 'win' : 'correct');
  }, [view, code, pid]);

  const submit = async (a: { choice?: number; order?: string[] }) => {
    if (!view || sent?.q === view.qIndex) return;
    setSent({ q: view.qIndex, choice: a.choice ?? null });
    const r = await classApi.answer(code, pid, view.qIndex, a);
    if (!r.ok) {
      if (r.status === 409) setSendError('⏰ Câu hỏi đã đóng.');
      else if (r.status === 404) refresh();
      else {
        // Mất mạng → cho chọn lại
        setSent(null);
        setSendError('📶 Chưa gửi được. Em chọn lại nhé!');
      }
    }
  };

  const leave = () => {
    onLeave();
    nav('/');
  };

  if (closed)
    return (
      <Shell onLeave={leave}>
        <Card icon="🏁" title="Phòng đã đóng">
          <p className="font-bold text-slate-500">{closed}</p>
          <Button className="w-full mt-3 text-xl" onClick={onLeave}>
            🔑 Vào phòng khác
          </Button>
        </Card>
      </Shell>
    );
  if (!view)
    return (
      <Shell onLeave={leave}>
        <Card icon="⏳" title={offline ? 'Đang kết nối lại…' : 'Đang vào lớp…'} />
      </Shell>
    );
  if (view.gone)
    return (
      <Shell onLeave={leave}>
        <Card icon={view.kicked ? '🙈' : '❓'} title={view.kicked ? 'Thầy cô đã mời em ra khỏi phòng' : 'Em chưa ở trong phòng'}>
          <p className="font-bold text-slate-500">{view.kicked ? 'Có thể tên chưa đúng. Em vào lại bằng tên thật của mình nhé!' : 'Em vào lại phòng nhé.'}</p>
          <Button className="w-full mt-3 text-xl" onClick={onLeave}>
            🚪 Vào lại
          </Button>
        </Card>
      </Shell>
    );

  const me = view.me;
  const q = view.question;
  const answered = me.answer ?? (sent?.q === view.qIndex ? { choice: sent.choice } : null);

  return (
    <Shell onLeave={leave} me={me} code={code} offline={offline}>
      {view.phase === 'lobby' && (
        <Card icon="✅" title={`Em đã vào lớp, ${me.name}!`}>
          <p className="font-bold text-slate-500">Nhìn lên bảng và chờ thầy cô bắt đầu nhé.</p>
          <div className="mt-3 rounded-2xl bg-sky-50 p-3 font-extrabold text-sky-800">👥 {view.players} bạn trong phòng</div>
          <div className="mt-2 text-sm font-bold text-slate-400">{view.unit}</div>
          <div className="mt-3 text-4xl animate-bounce">⏳</div>
        </Card>
      )}

      {view.phase === 'question' && q && now < view.startsAt && <GetReady now={now} startsAt={view.startsAt} qIndex={view.qIndex} total={view.total} />}

      {view.phase === 'question' && q && now >= view.startsAt && (
        <div className="panel p-3 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full bg-sky-100 text-sky-800 px-3 py-1 text-sm font-extrabold">
              {getTypeInfo(q.type).icon} {q.instruction}
            </span>
            <span className="font-extrabold text-slate-400">
              {view.qIndex + 1}/{view.total}
            </span>
          </div>
          <Prompt q={q} />
          <ClassTimer now={now} startsAt={view.startsAt} deadline={view.deadline} />
          {answered ? (
            <div className="rounded-2xl bg-sky-50 border-2 border-sky-200 p-4 text-center animate-pop">
              <div className="text-4xl">📨</div>
              <div className="text-xl font-extrabold text-sky-800">Đã gửi câu trả lời!</div>
              <div className="font-bold text-slate-500 animate-pulse">Chờ cả lớp trả lời xong…</div>
            </div>
          ) : now > view.deadline ? (
            <div className="rounded-2xl bg-rose-50 p-4 text-center text-xl font-extrabold text-rose-600">⏰ Hết giờ rồi!</div>
          ) : q.mode === 'order' ? (
            <OrderPicker key={`${view.round}-${view.qIndex}`} q={q} locked={false} state={null} showActions onSubmit={(order) => submit({ order })} />
          ) : (
            <ChoiceGrid q={q} disabled={false} reveal={null} onPick={(choice) => submit({ choice })} />
          )}
          {sendError && <div className="rounded-xl bg-amber-50 p-2 text-center font-bold text-amber-700">{sendError}</div>}
        </div>
      )}

      {view.phase === 'reveal' && q && <Reveal view={view} />}

      {view.phase === 'end' && (
        <Card icon={me.place <= 3 && me.score > 0 ? MEDALS[me.place - 1] : '🎉'} title={me.place <= 3 && me.score > 0 ? `Em đứng thứ ${me.place}!` : 'Hoàn thành!'}>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Hạng" value={`${me.place}/${view.players}`} />
            <Stat label="Điểm" value={me.score} />
            <Stat label="Câu đúng" value={`${me.correct}/${Math.min(view.total, view.qIndex + 1)}`} />
          </div>
          {gold !== null && gold > 0 && <div className="mt-3 rounded-2xl bg-amber-100 p-2 font-extrabold text-amber-800 animate-pop">🪙 +{gold} vàng</div>}
          <TopList top={view.top} me={me.name} />
          <p className="mt-3 text-sm font-bold text-slate-400 animate-pulse">Chờ thầy cô mở lượt mới hoặc về trang chủ.</p>
          <Button color="white" className="w-full mt-2" onClick={leave}>
            🏠 Về trang chủ
          </Button>
        </Card>
      )}
    </Shell>
  );
}

function Reveal({ view }: { view: PlayerView }) {
  const q = view.question!;
  const a = view.me.answer;
  return (
    <div className="panel p-3 sm:p-5 space-y-3">
      <div className={`rounded-2xl p-4 text-center animate-pop ${a?.correct ? 'bg-green-50 border-2 border-green-200' : 'bg-rose-50 border-2 border-rose-200'}`}>
        <div className="text-5xl">{a?.correct ? '🎉' : a ? '😅' : '⏰'}</div>
        <div className={`text-2xl font-extrabold ${a?.correct ? 'text-green-600' : 'text-rose-600'}`}>{a?.correct ? 'Chính xác!' : a ? 'Chưa đúng rồi!' : 'Em chưa trả lời kịp'}</div>
        {a?.correct && <div className="text-xl font-extrabold text-slate-600">+{a.points} điểm</div>}
        {a?.correct && view.me.streak >= 3 && <div className="font-extrabold text-orange-500">🔥 Đúng {view.me.streak} câu liên tiếp!</div>}
      </div>
      {q.mode === 'choice' ? (
        <ChoiceGrid q={q} disabled reveal={{ chosen: a?.choice ?? null }} onPick={() => {}} />
      ) : (
        !a?.correct && (
          <div className="font-bold">
            Câu đúng: <span className="text-green-700">{q.answerText}</span>
          </div>
        )
      )}
      {!a?.correct && (
        <div className="flex items-start gap-2 rounded-2xl bg-slate-50 p-3">
          <div className="flex-1 font-bold text-slate-600">💡 {q.explanation}</div>
          <Button color="blue" className="!px-3 !py-2 text-xl shrink-0" onClick={() => speak(q.item.en, q.item.audio)} aria-label="Nghe đáp án đúng">
            🔊
          </Button>
        </div>
      )}
      <div className="rounded-2xl bg-sky-50 p-3 text-center font-extrabold text-sky-800">
        {placeLabel(view.me.place, view.me.score)} Em đang đứng thứ {view.me.place}/{view.players} · {view.me.score} điểm
      </div>
      <p className="text-center text-sm font-bold text-slate-400 animate-pulse">Chờ thầy cô chuyển câu tiếp…</p>
    </div>
  );
}

function TopList({ top, me }: { top: PlayerView['top']; me: string }) {
  if (!top.length) return null;
  return (
    <div className="mt-3 space-y-1 text-left">
      {top.map((t, i) => (
        <div key={i} className={`flex items-center gap-2 rounded-xl px-3 py-1.5 font-extrabold ${t.name === me ? 'bg-sky-100 text-sky-900' : 'bg-slate-50 text-slate-700'}`}>
          <span className="w-8 text-center">{placeLabel(t.place, t.score)}</span>
          <span className="flex-1 truncate">{t.name}</span>
          <span className="tabular-nums">{t.score}</span>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl bg-sky-50 p-2">
      <div className="text-xs font-extrabold text-slate-400">{label}</div>
      <div className="text-2xl font-extrabold text-sky-900">{value}</div>
    </div>
  );
}

function Card({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="panel p-5 text-center animate-pop">
      <div className="text-6xl">{icon}</div>
      <h2 className="mt-1 text-2xl font-extrabold text-sky-900">{title}</h2>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

function Shell({ children, onLeave, me, code, offline }: { children: ReactNode; onLeave: () => void; me?: PlayerView['me']; code?: string; offline?: boolean }) {
  return (
    <div className="min-h-full flex flex-col">
      <TopBar
        title={code ? `🏫 ${code}` : '🏫 Lớp học'}
        back={onLeave}
        right={
          me && (
            <span className="rounded-xl bg-white/80 px-2 py-1 text-sm font-extrabold text-sky-900 whitespace-nowrap">
              {me.name} · {me.score}
            </span>
          )
        }
      />
      <div className="w-full max-w-2xl mx-auto px-3 sm:px-4 pb-8 space-y-3">
        {offline && <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-2 text-center text-sm font-bold text-amber-800">📶 Mất kết nối với máy thầy cô, đang thử lại…</div>}
        {children}
      </div>
    </div>
  );
}
