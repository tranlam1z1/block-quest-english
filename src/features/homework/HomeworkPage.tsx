// ============================================================
// Học sinh: danh sách bài tập về nhà + làm bài.
// Làm bài không cần mạng (bài đã tải về máy); kết quả tự gửi cho thầy cô khi có mạng.
// ============================================================
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { daysLeft, dueText, fmtDate, fmtGrade, gradeColor, gradeStars, pendingHomework, useHomework, type Homework, type HomeworkOutcome } from '../../services/homework';
import { getTypeInfo, type Question } from '../../game/questions/types';
import { HOMEWORK_DROP_BONUS } from '../../game/rewards';
import { speak } from '../../services/speech';
import { playSfx } from '../../services/audio';
import { useProgress } from '../../stores/progress';
import { Button, Modal, Stars, TopBar } from '../../components/ui';
import { PlayerNameModal } from '../../components/PlayerName';
import { ChoiceGrid, OrderPicker, Prompt } from '../battle/QuestionPanel';
import { WrongReview } from '../battle/WrongReview';

// ---------------- Danh sách ----------------

export function HomeworkListPage() {
  const nav = useNavigate();
  const list = useHomework((s) => s.list);
  const done = useHomework((s) => s.done);
  const syncedAt = useHomework((s) => s.syncedAt);
  const [sync, setSync] = useState<'idle' | 'busy' | 'ok' | 'fail'>('idle');

  const refresh = async () => {
    setSync('busy');
    setSync((await useHomework.getState().refresh()) ? 'ok' : 'fail');
  };
  useEffect(() => {
    void refresh();
  }, []);

  const pending = pendingHomework({ list, done }).sort((a, b) => a.due.localeCompare(b.due));
  const finished = list.filter((h) => done[h.id]).sort((a, b) => done[b.id].lastAt.localeCompare(done[a.id].lastAt));

  return (
    <div className="min-h-full flex flex-col">
      <TopBar title="📝 Bài tập về nhà" back="/" />
      <div className="w-full max-w-2xl mx-auto px-3 sm:px-4 pb-8 space-y-3">
        {sync === 'fail' && (
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-2 text-center text-sm font-bold text-amber-800">
            📶 Chưa kết nối được máy của thầy cô{syncedAt ? ` · đang dùng danh sách tải lúc ${new Date(syncedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}` : ''}. Em vẫn làm được bài đã có, kết quả sẽ tự gửi khi có mạng.
          </div>
        )}

        <h2 className="text-xl font-extrabold text-sky-900">⏳ Cần làm ({pending.length})</h2>
        {pending.length === 0 && (
          <div className="panel p-5 text-center font-bold text-slate-500">
            {sync === 'busy' ? '⏳ Đang tải bài tập…' : list.length ? '🎉 Em đã làm hết bài tập rồi!' : 'Chưa có bài tập nào. Khi thầy cô giao bài, bài sẽ hiện ở đây.'}
          </div>
        )}
        {pending.map((h) => {
          const n = daysLeft(h.due);
          return (
            <button key={h.id} onClick={() => nav(`/homework/${h.id}`)} className="panel w-full p-4 text-left flex items-center gap-3 hover:scale-[1.01] active:scale-[0.99] transition-transform" data-testid="hw-pending">
              <div className="text-4xl">📝</div>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-extrabold text-sky-900 truncate">{h.title}</div>
                <div className="text-sm font-bold text-slate-500 truncate">{h.unit}</div>
                <div className={`text-sm font-extrabold ${n < 0 ? 'text-rose-600' : n <= 1 ? 'text-orange-600' : 'text-slate-500'}`}>
                  {h.questions.length} câu · {dueText(h.due)}
                </div>
              </div>
              <span className="btn-block bg-green-500 border-green-700 !px-4 !py-2">Làm ▶</span>
            </button>
          );
        })}

        {finished.length > 0 && (
          <>
            <h2 className="pt-2 text-xl font-extrabold text-sky-900">✅ Đã làm ({finished.length})</h2>
            {finished.map((h) => {
              const d = done[h.id];
              return (
                <button key={h.id} onClick={() => nav(`/homework/${h.id}`)} className="panel w-full p-3 text-left flex items-center gap-3" data-testid="hw-done">
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-slate-800 truncate">{h.title}</div>
                    <div className="text-xs font-bold text-slate-500 truncate">
                      {h.unit} · nộp {fmtDate(d.firstAt.slice(0, 10))}
                      {d.late ? ' (muộn)' : ''} · {d.attempts} lần làm
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-extrabold ${gradeColor(d.best)}`}>{fmtGrade(d.best)}</div>
                    <Stars n={gradeStars(d.best)} size="text-sm" />
                  </div>
                </button>
              );
            })}
          </>
        )}
        <p className="text-center text-sm font-bold text-sky-900/70">Bài tập được tải về khi máy dùng chung Wi-Fi với máy của thầy cô.</p>
      </div>
    </div>
  );
}

// ---------------- Làm bài ----------------

interface AnswerLog {
  correct: boolean;
  choice: number | null;
  timedOut: boolean;
}

export function HomeworkPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const hw = useHomework((s) => s.list.find((h) => h.id === id));
  const done = useHomework((s) => s.done[id]);
  const [stage, setStage] = useState<'intro' | 'play' | 'result'>('intro');
  const [result, setResult] = useState<{ outcome: HomeworkOutcome; correct: number; wrong: { question: Question }[] } | null>(null);
  const [run, setRun] = useState(0);

  if (!hw)
    return (
      <div className="min-h-full flex flex-col">
        <TopBar title="📝 Bài tập" back="/homework" />
        <div className="panel mx-4 p-5 text-center font-bold text-slate-500">
          Không tìm thấy bài tập này. Có thể thầy cô đã xóa bài.
          <Button className="w-full mt-3" onClick={() => nav('/homework')}>
            📝 Danh sách bài tập
          </Button>
        </div>
      </div>
    );

  if (stage === 'play')
    return (
      <Quiz
        key={run}
        hw={hw}
        onQuit={() => setStage('intro')}
        onFinish={(r) => {
          const outcome = useHomework.getState().submit(hw, { correct: r.correct, total: hw.questions.length, maxCombo: r.maxCombo, wrong: r.wrong });
          setResult({ outcome, correct: r.correct, wrong: r.wrong });
          setStage('result');
          playSfx(outcome.grade >= 5 ? 'win' : 'correct');
        }}
      />
    );

  if (stage === 'result' && result)
    return (
      <ResultView
        hw={hw}
        result={result}
        onAgain={() => {
          setRun((x) => x + 1);
          setStage('play');
        }}
      />
    );

  return (
    <Intro
      hw={hw}
      done={done ? { best: done.best, attempts: done.attempts } : null}
      onStart={() => {
        setRun((x) => x + 1);
        setStage('play');
      }}
    />
  );
}

function Intro({ hw, done, onStart }: { hw: Homework; done: { best: number; attempts: number } | null; onStart: () => void }) {
  const playerName = useProgress((s) => s.playerName);
  const [nameOpen, setNameOpen] = useState(false);
  const n = daysLeft(hw.due);
  const kinds = Array.from(new Set(hw.questions.map((q) => getTypeInfo(q.type).icon)));
  return (
    <div className="min-h-full flex flex-col">
      <TopBar title="📝 Bài tập về nhà" back="/homework" />
      <div className="w-full max-w-xl mx-auto px-3 sm:px-4 pb-8">
        <div className="panel p-5 space-y-3 text-center">
          <div className="text-6xl">📝</div>
          <h1 className="text-2xl font-extrabold text-sky-900">{hw.title}</h1>
          <div className="font-bold text-slate-500">{hw.unit}</div>
          {hw.note && <div className="rounded-2xl bg-amber-50 border-2 border-amber-200 p-3 text-left font-bold text-amber-900">💬 Thầy cô dặn: {hw.note}</div>}
          <div className="grid grid-cols-3 gap-2">
            <Info label="Số câu" value={hw.questions.length} />
            <Info label="Thời gian" value={hw.timerSec ? `${hw.timerSec}s/câu` : 'Thoải mái'} />
            <Info label="Hạn nộp" value={<span className={n < 0 ? 'text-rose-600' : ''}>{fmtDate(hw.due)}</span>} />
          </div>
          <div className="text-2xl" title="Các dạng câu hỏi">
            {kinds.join(' ')}
          </div>
          {n < 0 && !done && <div className="font-extrabold text-rose-600">⚠️ Đã quá hạn, em vẫn làm được nhưng sẽ ghi là nộp muộn.</div>}
          {done && (
            <div className="rounded-2xl bg-green-50 p-3 font-extrabold text-green-800">
              ✅ Em đã làm {done.attempts} lần · điểm cao nhất <span className={gradeColor(done.best)}>{fmtGrade(done.best)}</span>
              <div className="text-sm font-bold text-slate-500">Làm lại để luyện thêm (thầy cô xem được cả điểm lần đầu và điểm cao nhất).</div>
            </div>
          )}
          {!done && <div className="text-sm font-bold text-slate-500">🏅 Đạt từ 9 điểm: lần thắng quái tới tăng thêm {HOMEWORK_DROP_BONUS * 100}% cơ hội rơi Ngọc Rồng!</div>}
          {playerName ? (
            <div className="text-sm font-bold text-slate-500">
              Người làm: <b className="text-sky-800">{playerName}</b>{' '}
              <button className="underline" onClick={() => setNameOpen(true)}>
                đổi tên
              </button>
            </div>
          ) : (
            <div className="rounded-2xl bg-amber-100 p-2 font-extrabold text-amber-900">Em cần đặt tên để thầy cô biết bài của ai nhé!</div>
          )}
          <Button className="w-full text-2xl !py-4" onClick={() => (playerName ? onStart() : setNameOpen(true))}>
            {done ? '🔁 Làm lại' : '▶ Bắt đầu làm bài'}
          </Button>
        </div>
      </div>
      <PlayerNameModal open={nameOpen} onClose={() => setNameOpen(false)} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl bg-sky-50 p-2">
      <div className="text-xs font-extrabold text-slate-400">{label}</div>
      <div className="text-lg font-extrabold text-sky-900">{value}</div>
    </div>
  );
}

/** Làm lần lượt từng câu, có phản hồi ngay sau mỗi câu */
function Quiz({ hw, onQuit, onFinish }: { hw: Homework; onQuit: () => void; onFinish: (r: { correct: number; maxCombo: number; wrong: { question: Question }[] }) => void }) {
  const total = hw.questions.length;
  const [index, setIndex] = useState(0);
  const [log, setLog] = useState<AnswerLog[]>([]);
  const [quitOpen, setQuitOpen] = useState(false);
  const q = hw.questions[index];
  const answer = log[index] ?? null;
  const limitMs = hw.timerSec ? Math.round(hw.timerSec * 1000 * getTypeInfo(q.type).timeFactor) : 0;
  const startedAt = useRef(performance.now());
  const streak = useRef({ now: 0, best: 0 });
  const finished = useRef(false);

  const record = (a: AnswerLog) => {
    if (log[index]) return;
    if (a.correct) {
      streak.current.now++;
      streak.current.best = Math.max(streak.current.best, streak.current.now);
    } else streak.current.now = 0;
    setLog((l) => {
      const next = l.slice();
      next[index] = a;
      return next;
    });
    playSfx(a.correct ? 'correct' : 'wrong');
  };

  const next = () => {
    if (index + 1 < total) {
      startedAt.current = performance.now();
      setIndex(index + 1);
      return;
    }
    if (finished.current) return;
    finished.current = true;
    const wrong = hw.questions.filter((_, i) => !log[i]?.correct).map((question) => ({ question }));
    onFinish({ correct: total - wrong.length, maxCombo: streak.current.best, wrong });
  };

  // Tự đọc câu nghe
  useEffect(() => {
    if (q.type === 'listen-vi' || q.type === 'listen-en') {
      const t = setTimeout(() => speak(q.prompt.speak!, q.prompt.audio), 300);
      return () => clearTimeout(t);
    }
  }, [index]); // chỉ đọc 1 lần khi sang câu mới

  // Trả lời đúng → tự sang câu sau
  useEffect(() => {
    if (!answer?.correct) return;
    const t = setTimeout(next, 1200);
    return () => clearTimeout(t);
  }, [index, answer]);

  // Phím tắt: 1–4 chọn đáp án, Enter để tiếp tục
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e) => {
    if (quitOpen) return;
    if (!answer && q.mode === 'choice' && ['1', '2', '3', '4'].includes(e.key)) pick(Number(e.key) - 1);
    else if (answer && !answer.correct && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      next();
    }
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const pick = (choice: number) => record({ correct: choice === q.answerIndex, choice, timedOut: false });
  const order = (tokens: string[]) => {
    const norm = (t: string[]) => t.join(' ').toLowerCase();
    record({ correct: !!q.answerTokens && norm(tokens) === norm(q.answerTokens), choice: null, timedOut: false });
  };

  const right = log.filter((a) => a?.correct).length;

  return (
    <div className="min-h-full flex flex-col">
      <TopBar
        title={`📝 Câu ${index + 1}/${total}`}
        back={() => setQuitOpen(true)}
        right={<span className="rounded-xl bg-white/80 px-2 py-1 text-sm font-extrabold text-green-700 whitespace-nowrap">✅ {right}</span>}
      />
      <div className="w-full max-w-2xl mx-auto px-3 sm:px-4 pb-8 space-y-3">
        {/* Tiến độ */}
        <div className="flex gap-1">
          {hw.questions.map((_, i) => (
            <div key={i} className={`h-2.5 flex-1 rounded-full ${log[i] ? (log[i].correct ? 'bg-green-500' : 'bg-rose-400') : i === index ? 'bg-sky-400' : 'bg-white/70'}`} />
          ))}
        </div>
        <div className="panel p-3 sm:p-5 space-y-3" data-testid="hw-question">
          <div className="flex justify-center">
            <span className="rounded-full bg-sky-100 text-sky-800 px-3 py-1 text-sm sm:text-base font-extrabold">
              {getTypeInfo(q.type).icon} {q.instruction}
            </span>
          </div>
          <Prompt q={q} />
          {limitMs > 0 && !answer && <Countdown key={index} limitMs={limitMs} onTimeout={() => record({ correct: false, choice: null, timedOut: true })} />}
          {q.mode === 'order' ? (
            <OrderPicker key={index} q={q} locked={!!answer} state={answer ? (answer.correct ? 'ok' : 'bad') : null} showActions={!answer} onSubmit={order} />
          ) : (
            <ChoiceGrid q={q} disabled={!!answer} reveal={answer ? { chosen: answer.choice } : null} onPick={pick} />
          )}

          {answer?.correct && <div className="text-center text-2xl font-extrabold text-green-600 animate-pop">✅ Chính xác!</div>}
          {answer && !answer.correct && (
            <div className="rounded-2xl bg-rose-50 border-2 border-rose-200 p-3 animate-pop">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="text-xl font-extrabold text-rose-600">{answer.timedOut ? '⏰ Hết giờ rồi!' : '❌ Chưa đúng rồi!'}</div>
                  <div className="font-bold">
                    {q.mode === 'order' ? 'Câu đúng' : 'Đáp án đúng'}: <span className="text-green-700">{q.answerText}</span>
                  </div>
                  <div className="text-slate-600 font-bold">💡 {q.explanation}</div>
                </div>
                <Button color="blue" className="!px-3 !py-2 text-xl shrink-0" onClick={() => speak(q.item.en, q.item.audio)} aria-label="Nghe đáp án đúng">
                  🔊
                </Button>
              </div>
              <Button color="orange" className="w-full mt-3 text-xl" onClick={next}>
                {index + 1 < total ? 'Tiếp tục ▶' : 'Nộp bài ▶'}
              </Button>
            </div>
          )}
        </div>
      </div>
      <Modal open={quitOpen} onClose={() => setQuitOpen(false)} title="Dừng làm bài?">
        <p className="font-bold text-slate-600">Bài đang làm dở sẽ không được lưu. Lần sau em làm lại từ đầu nhé.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button color="white" onClick={() => setQuitOpen(false)}>
            Làm tiếp
          </Button>
          <Button color="red" onClick={onQuit}>
            Dừng
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Countdown({ limitMs, onTimeout }: { limitMs: number; onTimeout: () => void }) {
  const [left, setLeft] = useState(limitMs);
  const cb = useRef(onTimeout);
  cb.current = onTimeout;
  useEffect(() => {
    const start = performance.now();
    let lastSec = 99;
    let raf = 0;
    const loop = () => {
      const remain = Math.max(0, limitMs - (performance.now() - start));
      setLeft(remain);
      const sec = Math.ceil(remain / 1000);
      if (sec <= 3 && sec > 0 && sec !== lastSec) playSfx('tick');
      lastSec = sec;
      if (remain <= 0) return cb.current();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [limitMs]);
  const pct = (left / limitMs) * 100;
  return (
    <div className="flex items-center gap-2">
      <span className={`w-10 text-right font-extrabold tabular-nums ${pct <= 25 ? 'text-rose-600 animate-pulse' : 'text-slate-600'}`}>⏱{Math.ceil(left / 1000)}</span>
      <div className="flex-1 h-3 rounded-full bg-slate-200 overflow-hidden">
        <div className={`h-full rounded-full ${pct > 50 ? 'bg-green-500' : pct > 25 ? 'bg-amber-400' : 'bg-rose-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ResultView({ hw, result, onAgain }: { hw: Homework; result: { outcome: HomeworkOutcome; correct: number; wrong: { question: Question }[] }; onAgain: () => void }) {
  const nav = useNavigate();
  const { outcome } = result;
  const g = outcome.grade;
  const pending = useHomework((s) => pendingHomework(s).length);
  const cheer = g === 10 ? 'Tuyệt vời! Điểm 10!' : g >= 9 ? 'Xuất sắc!' : g >= 7 ? 'Giỏi lắm!' : g >= 5 ? 'Cố lên, em làm khá rồi!' : 'Ôn lại rồi làm lại nhé!';
  return (
    <div className="min-h-full flex flex-col">
      <TopBar title="📝 Kết quả" back="/homework" />
      <div className="w-full max-w-xl mx-auto px-3 sm:px-4 pb-8">
        <div className="panel p-5 text-center animate-pop" data-testid="hw-result">
          <div className="font-bold text-slate-500">{hw.title}</div>
          <div className="mt-1 text-2xl font-extrabold text-sky-900">{cheer}</div>
          <div className={`text-7xl font-extrabold ${gradeColor(g)}`} data-testid="hw-grade">
            {fmtGrade(g)}
            <span className="text-3xl text-slate-400">/10</span>
          </div>
          <Stars n={gradeStars(g)} size="text-4xl" />
          <div className="mt-1 font-extrabold text-slate-600">
            Đúng {result.correct}/{hw.questions.length} câu · lần làm thứ {outcome.attempt}
          </div>
          {outcome.late && outcome.attempt === 1 && <div className="font-bold text-rose-600">Nộp sau hạn {fmtDate(hw.due)}</div>}
          <div className="mt-3 space-y-2">
            {outcome.gold > 0 && <div className="rounded-2xl bg-amber-100 p-2 font-extrabold text-amber-800">🪙 +{outcome.gold} vàng</div>}
            {outcome.dropBonus && <div className="rounded-2xl bg-violet-100 p-2 font-extrabold text-violet-800">💎 Lần thắng quái tới: +{HOMEWORK_DROP_BONUS * 100}% cơ hội rơi Ngọc Rồng!</div>}
            {outcome.improved && <div className="rounded-2xl bg-green-100 p-2 font-extrabold text-green-800">📈 Em đã vượt điểm cũ của mình!</div>}
            {outcome.attempt > 1 && outcome.gold === 0 && <div className="text-sm font-bold text-slate-400">Vàng chỉ thưởng ở lần nộp đầu tiên.</div>}
          </div>
          <div className="text-left">
            <WrongReview wrong={result.wrong} />
          </div>
          <p className="mt-3 text-sm font-bold text-slate-400">Kết quả đã được gửi cho thầy cô (hoặc sẽ tự gửi khi có mạng).</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Button color="blue" onClick={onAgain}>
              🔁 Làm lại
            </Button>
            <Button onClick={() => nav('/homework')}>{pending ? `📝 Bài tiếp (${pending})` : '📝 Danh sách bài'}</Button>
          </div>
          <Button color="white" className="w-full mt-2" onClick={() => nav('/')}>
            🏠 Trang chủ
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Dùng ở trang chủ: số bài cần làm */
export function usePendingCount() {
  return useHomework((s) => pendingHomework(s).length);
}
