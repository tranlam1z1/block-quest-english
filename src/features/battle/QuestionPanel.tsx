// ============================================================
// Khung câu hỏi: đề bài, đồng hồ, đáp án (chọn 1 trong 4 hoặc sắp xếp từ), phản hồi
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { useBattle } from '../../stores/battle';
import { speak } from '../../services/speech';
import { playSfx } from '../../services/audio';
import { getTypeInfo, type Question } from '../../game/questions/types';
import { Button, WordImage } from '../../components/ui';

/** Thanh đếm ngược thời gian */
function TimerBar() {
  const phase = useBattle((s) => s.phase);
  const paused = useBattle((s) => s.paused);
  const limit = useBattle((s) => s.qLimitMs);
  const qid = useBattle((s) => s.question?.id);
  const [left, setLeft] = useState(limit);
  const lastSec = useRef(99);

  useEffect(() => {
    if (phase !== 'question' || paused) return;
    let raf = 0;
    const loop = () => {
      const s = useBattle.getState();
      const remain = Math.max(0, s.qLimitMs - (performance.now() - s.questionStartedAt));
      setLeft(remain);
      const sec = Math.ceil(remain / 1000);
      if (sec <= 3 && sec > 0 && sec !== lastSec.current) playSfx('tick');
      lastSec.current = sec;
      if (remain <= 0) {
        s.timeout();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, paused, qid]);

  const pct = (left / limit) * 100;
  const color = pct > 50 ? 'bg-green-500' : pct > 25 ? 'bg-amber-400' : 'bg-rose-500';
  return (
    <div className="flex items-center gap-2">
      <span className={`w-10 text-right font-extrabold tabular-nums ${pct <= 25 ? 'text-rose-600 animate-pulse' : 'text-slate-600'}`}>⏱{Math.ceil(left / 1000)}</span>
      <div className="flex-1 h-3 rounded-full bg-slate-200 overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Một dòng hội thoại; "___" được tô thành ô trống */
function DialogLine({ text, side }: { text: string; side: 'left' | 'right' }) {
  const parts = text.split('___');
  return (
    <div className={`flex items-end gap-2 ${side === 'right' ? 'flex-row-reverse' : ''}`}>
      <span className="text-2xl shrink-0">{side === 'left' ? '🧒' : '👧'}</span>
      <div className={`rounded-2xl px-3 py-2 text-xl sm:text-2xl font-extrabold text-slate-800 ${side === 'left' ? 'bg-sky-100 rounded-bl-sm' : 'bg-amber-100 rounded-br-sm'}`}>
        {parts.map((p, i) => (
          <span key={i}>
            {p}
            {i < parts.length - 1 && <span className="inline-block min-w-[3.5rem] mx-1 border-b-4 border-dashed border-rose-400 text-rose-500 text-center">?</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Đề bài */
export function Prompt({ q }: { q: Question }) {
  const info = getTypeInfo(q.type);
  const isListen = q.type === 'listen-vi' || q.type === 'listen-en';
  const replay = () => speak(q.prompt.speak!, q.prompt.audio);

  // Đề dạng hội thoại (mẫu câu)
  if (q.prompt.lines || info.category === 'pattern') {
    return (
      <div className="flex items-center gap-3">
        {q.prompt.image && <WordImage src={q.prompt.image} className="h-16 w-16 sm:h-20 sm:w-20 text-5xl sm:text-6xl shrink-0" />}
        <div className="flex-1 space-y-2">
          {q.prompt.lines?.map((l, i) => <DialogLine key={i} text={l} side={i === 0 ? 'left' : 'right'} />)}
          {q.prompt.hint && <div className="text-sm font-bold text-slate-500">💡 {q.prompt.hint}</div>}
        </div>
        {q.prompt.speak && (
          <Button color="blue" className="!px-3 !py-2 text-2xl shrink-0" onClick={replay} aria-label="Nghe câu hỏi">
            🔊
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-center gap-3 min-h-[88px] sm:min-h-[110px]">
        {q.prompt.image && <WordImage src={q.prompt.image} className="h-24 w-24 sm:h-28 sm:w-28 text-7xl sm:text-8xl drop-shadow" />}
        {q.prompt.text && (
          <span className={`font-extrabold text-center break-words ${q.prompt.text.length > 14 ? 'text-3xl' : 'text-4xl sm:text-5xl'} ${info.answerLang === 'vi' ? 'text-sky-700' : 'text-violet-700'}`}>{q.prompt.text}</span>
        )}
        {isListen && (
          <button onClick={replay} className="h-24 w-24 sm:h-28 sm:w-28 rounded-3xl bg-sky-500 border-b-8 border-sky-700 text-6xl active:translate-y-1 active:border-b-4 transition-all" aria-label="Nghe lại">
            🔊
          </button>
        )}
        {!isListen && q.prompt.speak && (
          <Button color="blue" className="!px-3 !py-2 text-2xl" onClick={replay} aria-label="Nghe phát âm">
            🔊
          </Button>
        )}
      </div>
      {isListen && <div className="text-center text-sm font-bold text-slate-500">Chạm loa để nghe lại</div>}
    </>
  );
}

/** 4 đáp án (dùng chung: trận đấu, phòng luyện tập trên lớp) */
export function ChoiceGrid({ q, disabled, reveal, onPick }: { q: Question; disabled: boolean; reveal: { chosen: number | null } | null; onPick: (i: number) => void }) {
  const long = q.choices.some((c) => c.length > 16);
  return (
    <div className={`grid gap-2 sm:gap-3 ${long ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {q.choices.map((c, i) => {
        let color: 'white' | 'green' | 'red' | 'gray' = 'white';
        if (reveal) {
          if (i === q.answerIndex) color = 'green';
          else if (i === reveal.chosen) color = 'red';
          else color = 'gray';
        }
        return (
          <Button
            key={i}
            color={color}
            disabled={disabled}
            className={`!px-2 ${long ? 'min-h-[52px] text-lg sm:text-xl' : 'min-h-[64px] sm:min-h-[76px] text-lg sm:text-2xl'} leading-tight !normal-case break-words ${reveal && i === q.answerIndex ? 'animate-pop !opacity-100' : ''} ${reveal && i !== q.answerIndex && i !== reveal.chosen ? '!opacity-40' : ''} ${reveal && i === reveal.chosen ? '!opacity-100' : ''}`}
            onClick={() => onPick(i)}
          >
            <span className="hidden sm:inline text-xs opacity-50 absolute top-1 left-2">{i + 1}</span>
            {c}
          </Button>
        );
      })}
    </div>
  );
}

function ChoiceAnswers({ q }: { q: Question }) {
  const phase = useBattle((s) => s.phase);
  const paused = useBattle((s) => s.paused);
  const result = useBattle((s) => s.lastResult);
  const answer = useBattle((s) => s.answer);
  const showFeedback = phase === 'feedback' && result;
  return <ChoiceGrid q={q} disabled={phase !== 'question' || paused} reveal={showFeedback ? { chosen: result.chosenIndex ?? null } : null} onPick={answer} />;
}

function OrderAnswer({ q }: { q: Question }) {
  const phase = useBattle((s) => s.phase);
  const paused = useBattle((s) => s.paused);
  const result = useBattle((s) => s.lastResult);
  const answerOrder = useBattle((s) => s.answerOrder);
  const state = phase === 'feedback' && result ? (result.correct ? 'ok' : 'bad') : null;
  return <OrderPicker q={q} locked={phase !== 'question' || paused} state={state} showActions={phase === 'question'} onSubmit={answerOrder} />;
}

/** Sắp xếp từ: chạm mảnh từ để đưa lên dòng trả lời, chạm lại để gỡ xuống */
export function OrderPicker({ q, locked, state, showActions, onSubmit }: { q: Question; locked: boolean; state: 'ok' | 'bad' | null; showActions: boolean; onSubmit: (tokens: string[]) => void }) {
  const [picked, setPicked] = useState<number[]>([]);
  const tokens = q.tokens ?? [];
  const done = picked.length === tokens.length;

  // Dùng hàm cập nhật (p => …) để không mất lượt chạm khi bé bấm rất nhanh liên tiếp
  const add = (i: number) => {
    if (locked) return;
    playSfx('click');
    setPicked((p) => (p.includes(i) ? p : [...p, i]));
  };
  const remove = (i: number) => {
    if (locked) return;
    playSfx('click');
    setPicked((p) => p.filter((x) => x !== i));
  };

  return (
    <div className="space-y-3">
      {/* Dòng trả lời */}
      <div
        className={`min-h-[64px] rounded-2xl border-4 border-dashed p-2 flex flex-wrap gap-2 items-center ${state === 'ok' ? 'border-green-400 bg-green-50' : state === 'bad' ? 'border-rose-300 bg-rose-50' : 'border-sky-300 bg-sky-50'}`}
      >
        {picked.length === 0 && <span className="text-slate-400 font-bold px-2">Chạm các từ bên dưới theo đúng thứ tự…</span>}
        {picked.map((i) => (
          <button key={i} onClick={() => remove(i)} disabled={locked} className="rounded-xl bg-sky-500 border-b-4 border-sky-700 px-3 py-2 text-lg sm:text-xl font-extrabold text-white active:translate-y-0.5 animate-pop">
            {tokens[i]}
          </button>
        ))}
      </div>
      {/* Các mảnh từ */}
      <div className="flex flex-wrap justify-center gap-2">
        {tokens.map((t, i) => (
          <button
            key={i}
            data-token={i}
            onClick={() => add(i)}
            disabled={locked || picked.includes(i)}
            className={`rounded-xl border-b-4 px-3 py-2 text-lg sm:text-xl font-extrabold transition ${picked.includes(i) ? 'bg-slate-100 border-slate-200 text-slate-300' : 'bg-white border-slate-300 text-slate-700 shadow active:translate-y-0.5'}`}
          >
            {t}
          </button>
        ))}
      </div>
      {showActions && (
        <div className="grid grid-cols-3 gap-2">
          <Button color="white" disabled={picked.length === 0 || locked} onClick={() => setPicked([])}>
            ↺ Xóa
          </Button>
          <Button color="green" className="col-span-2 text-xl" disabled={!done || locked} onClick={() => onSubmit(picked.map((i) => tokens[i]))}>
            ✔ Kiểm tra
          </Button>
        </div>
      )}
    </div>
  );
}

export function QuestionPanel() {
  const q = useBattle((s) => s.question);
  const phase = useBattle((s) => s.phase);
  const result = useBattle((s) => s.lastResult);
  const next = useBattle((s) => s.next);
  const paused = useBattle((s) => s.paused);
  const mode = useBattle((s) => s.mode);
  const remote = useBattle((s) => !!s.duel?.remote);
  const waiting = useBattle((s) => !!s.duel && s.phase === 'feedback' && s.duel.myReady >= s.duel.round);

  // Tự đọc to với dạng câu "Nghe"
  useEffect(() => {
    if (!q || phase !== 'question') return;
    if (q.type === 'listen-vi' || q.type === 'listen-en') {
      const t = setTimeout(() => speak(q.prompt.speak!, q.prompt.audio), 250);
      return () => clearTimeout(t);
    }
  }, [q?.id]); // chỉ đọc 1 lần khi sang câu mới

  // Trả lời đúng → tự sang câu tiếp sau khi xem hiệu ứng.
  // Solo với bạn: trả lời sai cũng tự sang sau vài giây để bạn không phải chờ.
  useEffect(() => {
    if (phase !== 'feedback' || !result || paused) return;
    if (result.correct || remote) {
      const t = setTimeout(() => next(), result.correct ? 1300 : 4000);
      return () => clearTimeout(t);
    }
  }, [phase, result, next, paused, remote]);

  // Phím tắt trên máy tính: 1–4 chọn đáp án, Enter/Space để tiếp tục
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useBattle.getState();
      if (s.paused) return;
      if (s.phase === 'question' && s.question?.mode === 'choice' && ['1', '2', '3', '4'].includes(e.key)) s.answer(Number(e.key) - 1);
      else if (s.phase === 'feedback' && s.lastResult && !s.lastResult.correct && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        s.next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!q) return null;
  const info = getTypeInfo(q.type);
  const showFeedback = phase === 'feedback' && result;

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex justify-center">
        <span className="rounded-full bg-sky-100 text-sky-800 px-3 py-1 text-sm sm:text-base font-extrabold">
          {info.icon} {q.instruction}
        </span>
      </div>

      <Prompt q={q} />
      <TimerBar />
      {q.mode === 'order' ? <OrderAnswer key={q.id} q={q} /> : <ChoiceAnswers q={q} />}

      {/* Phản hồi */}
      {showFeedback && result.correct && (
        <div className="text-center animate-pop">
          <div className="text-2xl font-extrabold text-green-600">{result.crit ? '⚡ CHÍ MẠNG! Siêu nhanh!' : '✅ Chính xác!'}</div>
          <div className="font-bold text-slate-500">{mode === 'duel' ? `+${result.points} điểm` : `+${result.points} điểm · gây ${result.damage} sát thương`}</div>
        </div>
      )}
      {showFeedback && !result.correct && (
        <div className="rounded-2xl bg-rose-50 border-2 border-rose-200 p-3 animate-pop">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="text-xl font-extrabold text-rose-600">{result.timedOut ? '⏰ Hết giờ rồi!' : '❌ Chưa đúng rồi!'}</div>
              <div className="font-bold">
                {q.mode === 'order' ? 'Câu đúng' : 'Đáp án đúng'}: <span className="text-green-700">{q.answerText}</span>
              </div>
              <div className="text-slate-600 font-bold">💡 {q.explanation}</div>
            </div>
            <Button color="blue" className="!px-3 !py-2 text-xl shrink-0" onClick={() => speak(q.item.en, q.item.audio)} aria-label="Nghe đáp án đúng">
              🔊
            </Button>
          </div>
          <Button color="orange" className="w-full mt-3 text-xl" disabled={waiting} onClick={next}>
            {waiting ? '⏳ Chờ bạn…' : 'Tiếp tục ▶'}
          </Button>
        </div>
      )}
      {waiting && result?.correct && <div className="text-center font-bold text-slate-500 animate-pulse">⏳ Đang chờ bạn trả lời xong…</div>}
    </div>
  );
}
