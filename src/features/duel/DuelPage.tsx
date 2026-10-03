// ============================================================
// Màn solo với máy: cảnh 3D + bảng điểm 2 bên + câu hỏi + kết quả
// ============================================================
import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { describeSelection, getUnit } from '../../content';
import { rankOf } from '../../game/duel';
import { useBattle, type DuelState } from '../../stores/battle';
import { useProgress } from '../../stores/progress';
import { stopSpeaking } from '../../services/speech';
import { Button, Modal, SoundToggles } from '../../components/ui';
import { RankCard } from '../../components/rank';
import { Coin } from '../../components/icons';
import { QuestionPanel } from '../battle/QuestionPanel';
import { WrongReview } from '../battle/WrongReview';
import { Stat } from '../battle/BattlePage';

export const DuelScene = lazy(() => import('../../three/DuelScene').then((m) => ({ default: m.DuelScene })));

/** Trạng thái của đối thủ trong lúc trả lời: đang nghĩ → đã trả lời (chưa lộ đúng/sai) → kết quả */
function OppStatus({ duel }: { duel: DuelState }) {
  const phase = useBattle((s) => s.phase);
  const [botAnswered, setBotAnswered] = useState(false);

  // Bot: "trả lời" khi tới thời điểm đã định sẵn
  useEffect(() => {
    setBotAnswered(false);
    if (phase !== 'question' || !duel.plan) return;
    const id = setInterval(() => {
      const s = useBattle.getState();
      const now = s.paused ? s.pausedAt : performance.now();
      if (s.duel?.plan && now - s.questionStartedAt >= s.duel.plan.timeMs) setBotAnswered(true);
    }, 100);
    return () => clearInterval(id);
  }, [phase, duel.plan]);
  const answered = duel.remote ? !!duel.oppAnswers[duel.round] : botAnswered;

  let text: string;
  let cls = 'bg-white/90 text-slate-600';
  const r = duel.oppResult;
  if (phase === 'feedback' && r) {
    if (r.correct) {
      text = `✅ Đúng · ${(r.timeMs / 1000).toFixed(1)}s · +${r.points}`;
      cls = 'bg-green-500 text-white';
    } else if (r.timeMs >= useBattle.getState().qLimitMs) {
      text = '⏰ Hết giờ';
      cls = 'bg-slate-500 text-white';
    } else {
      text = '❌ Sai';
      cls = 'bg-rose-500 text-white';
    }
  } else if (phase === 'question' || phase === 'feedback') {
    text = answered ? '✋ Đã trả lời!' : '🤔 Đang nghĩ…';
    if (answered) cls = 'bg-amber-400 text-amber-950';
  } else return null;

  return <div className={`rounded-xl px-2 py-0.5 text-xs sm:text-sm font-extrabold shadow ${cls} ${phase === 'feedback' ? 'animate-pop' : ''}`}>{text}</div>;
}

/** Bảng điểm 2 bên, số câu, lịch sử thắng từng câu */
export function DuelHud({ onPause }: { onPause: () => void }) {
  const duel = useBattle((s) => s.duel);
  const score = useBattle((s) => s.score);
  const combo = useBattle((s) => s.combo);
  const milestone = useBattle((s) => s.comboMilestone);
  const fx = useBattle((s) => s.fx);
  const result = useBattle((s) => s.lastResult);
  const name = useProgress((s) => s.playerName) || 'Bạn';
  if (!duel) return null;
  const leading = score === duel.oppScore ? null : score > duel.oppScore ? 'p' : 'b';

  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="flex items-start gap-2 p-2 sm:p-3">
        <button onClick={onPause} className="pointer-events-auto h-10 w-10 shrink-0 rounded-xl bg-white/90 border-b-4 border-slate-300 text-xl font-extrabold active:translate-y-0.5" aria-label="Tạm dừng">
          ⏸
        </button>
        <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-start gap-2">
          <ScoreBox label={`🧒 ${name}`} score={score} lead={leading === 'p'} color="sky" />
          <div className="rounded-xl bg-slate-800/70 px-2 py-1 text-center text-white font-extrabold text-sm leading-tight">
            Câu
            <div className="text-lg tabular-nums">
              {duel.round}/{duel.rounds}
            </div>
          </div>
          <ScoreBox label={`${duel.opp.emoji} ${duel.opp.name}`} score={duel.oppScore} lead={leading === 'b'} color="rose" align="right" />
        </div>
      </div>

      {/* Lịch sử từng câu */}
      <div className="flex justify-center gap-1 px-3">
        {Array.from({ length: duel.rounds }, (_, i) => {
          const h = duel.history[i];
          const c = h === 'p' ? 'bg-sky-500' : h === 'b' ? 'bg-rose-500' : h === '-' ? 'bg-slate-400' : 'bg-white/60';
          return <span key={i} className={`h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-sm border border-white ${c}`} />;
        })}
      </div>

      <div className="flex justify-between items-start px-3 mt-1">
        <div>{combo >= 2 && <div className="rounded-xl bg-orange-500 px-2 py-0.5 text-sm font-extrabold text-white">🔥 Combo {combo}</div>}</div>
        <OppStatus duel={duel} />
      </div>

      {/* Điểm bay lên */}
      {result?.correct && (
        <div key={fx.id} className="absolute left-[16%] top-[40%] text-2xl sm:text-3xl font-extrabold text-sky-600 animate-floatUp drop-shadow-[0_2px_0_rgba(255,255,255,0.9)]">
          +{result.points}
        </div>
      )}
      {duel.oppResult?.correct && (
        <div key={`b${fx.id}`} className="absolute right-[16%] top-[40%] text-2xl sm:text-3xl font-extrabold text-rose-500 animate-floatUp drop-shadow-[0_2px_0_rgba(255,255,255,0.9)]">
          +{duel.oppResult.points}
        </div>
      )}
      {milestone && (
        <div key={`c${fx.id}`} className="absolute inset-x-0 top-[24%] text-center animate-pop">
          <span className="inline-block rounded-2xl bg-gradient-to-r from-orange-500 to-rose-500 px-4 py-1 text-2xl sm:text-3xl font-extrabold text-white shadow-lg">🔥 COMBO x{milestone}!</span>
        </div>
      )}
    </div>
  );
}

function ScoreBox({ label, score, lead, color, align = 'left' }: { label: string; score: number; lead: boolean; color: 'sky' | 'rose'; align?: 'left' | 'right' }) {
  return (
    <div className={`min-w-0 rounded-xl border-2 px-2 py-1 ${align === 'right' ? 'text-right' : ''} ${lead ? (color === 'sky' ? 'bg-sky-500 border-white text-white' : 'bg-rose-500 border-white text-white') : 'bg-white/90 border-white text-slate-700'}`}>
      <div className="truncate text-xs sm:text-sm font-extrabold">{label}</div>
      <div className="text-xl sm:text-2xl font-extrabold tabular-nums leading-none">
        {lead && align === 'right' && '👑 '}
        {score}
        {lead && align === 'left' && ' 👑'}
      </div>
    </div>
  );
}

export function DuelPage() {
  const { unitId = '', bot = '' } = useParams();
  const nav = useNavigate();
  const [retry, setRetry] = useState(0);
  const [pauseOpen, setPauseOpen] = useState(false);
  const phase = useBattle((s) => s.phase);
  const duel = useBattle((s) => s.duel);
  const ready = useBattle((s) => s.mode === 'duel' && s.unitId === unitId && s.duel?.opp.bot?.level === bot && !!s.deck);
  const typesFallback = useBattle((s) => s.typesFallback);

  useEffect(() => {
    if (!useBattle.getState().setupDuel(unitId, bot)) nav('/duel', { replace: true });
    setPauseOpen(false);
  }, [unitId, bot, retry, nav]);

  useEffect(() => () => stopSpeaking(), []);

  // Tự tạm dừng khi chuyển tab
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && useBattle.getState().phase === 'question') {
        useBattle.getState().pause();
        setPauseOpen(true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const unit = getUnit(unitId);
  if (!unit || !ready || !duel) return null;
  const desc = describeSelection({ bookId: unit.bookId, gradeId: unit.gradeId, unitId: unit.id });

  const openPause = () => {
    useBattle.getState().pause();
    setPauseOpen(true);
  };
  const closePause = () => {
    setPauseOpen(false);
    useBattle.getState().resume();
  };

  return (
    <div className="h-[100dvh] flex flex-col lg:flex-row overflow-hidden bg-sky-200">
      <div className="relative shrink-0 h-[38dvh] min-h-[200px] lg:h-auto lg:flex-1">
        <Suspense fallback={<div className="h-full grid place-items-center font-bold text-sky-700">Đang tải cảnh…</div>}>
          <DuelScene />
        </Suspense>
        <DuelHud onPause={openPause} />
      </div>

      <div className="flex-1 lg:flex-none lg:w-[480px] overflow-y-auto bg-white/95 rounded-t-3xl lg:rounded-none lg:rounded-l-3xl -mt-4 lg:mt-0 relative z-10 p-3 sm:p-5 shadow-[0_-6px_20px_rgba(0,0,0,0.1)]">
        {(phase === 'question' || phase === 'feedback') && <QuestionPanel />}
      </div>

      {phase === 'ready' && (
        <Modal open title={`⚔️ Solo với ${duel.opp.name}`}>
          <div className="text-center">
            <div className="flex items-center justify-center gap-4 text-6xl">
              <span>🧒</span>
              <span className="text-3xl font-extrabold text-rose-500">VS</span>
              <span>{duel.opp.emoji}</span>
            </div>
            <div className="mt-2 font-extrabold text-slate-500">
              {desc.unit} · {duel.rounds} câu · {duel.opp.label}
            </div>
            <p className="mt-2 text-sm font-bold text-slate-600 bg-sky-50 rounded-2xl p-3">Cả hai cùng trả lời một câu hỏi. Đúng và nhanh hơn đối thủ thì bạn tung đòn! Hết {duel.rounds} câu, ai nhiều điểm hơn sẽ thắng.</p>
            {typesFallback && <p className="mt-2 text-sm font-bold text-amber-600">Dạng câu hỏi bạn chọn không dùng được cho unit này nên game sẽ dùng tất cả dạng.</p>}
            <Button className="w-full mt-4 text-2xl !py-4" onClick={() => useBattle.getState().begin()}>
              ⚔️ Bắt đầu!
            </Button>
            <Button color="white" className="w-full mt-2" onClick={() => nav('/duel')}>
              Đổi đối thủ / bài học
            </Button>
          </div>
        </Modal>
      )}

      <Modal open={pauseOpen && (phase === 'question' || phase === 'feedback')} title="⏸ Tạm dừng" onClose={closePause}>
        <div className="space-y-3">
          <Button className="w-full text-xl" onClick={closePause}>
            ▶ Chơi tiếp
          </Button>
          <div className="flex justify-center">
            <SoundToggles />
          </div>
          <p className="text-center text-sm font-bold text-slate-500">Thoát giữa chừng sẽ không tính trận này.</p>
          <Button color="red" className="w-full" onClick={() => nav('/duel')}>
            🚪 Thoát
          </Button>
        </div>
      </Modal>

      {(phase === 'won' || phase === 'lost' || phase === 'draw') && (
        <DuelResult>
          <Button color={duel.outcome === 'win' ? 'green' : 'orange'} className="w-full text-xl" onClick={() => setRetry((r) => r + 1)}>
            🔁 Đấu lại
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button color="white" onClick={() => nav('/duel')}>
              🤖 Đổi đối thủ
            </Button>
            <Button color="purple" onClick={() => nav('/leaderboard')}>
              🏆 Bảng xếp hạng
            </Button>
          </div>
        </DuelResult>
      )}
    </div>
  );
}

/** Kết quả trận solo: điểm 2 bên, điểm rank, vàng, kỷ lục, ôn từ sai. children = các nút bên dưới. */
export function DuelResult({ children }: { children: ReactNode }) {
  const s = useBattle();
  const myName = useProgress((p) => p.playerName) || 'Bạn';
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 1400);
    return () => clearTimeout(t);
  }, []);
  const d = s.duel;
  if (!show || !d || !d.record || !d.outcome) return null;
  const rec = d.record;
  const delta = rec.rpAfter - rec.rpBefore;
  const title = d.outcome === 'win' ? '🏆 Bạn thắng rồi!' : d.outcome === 'draw' ? '🤝 Hòa nhau!' : '😵 Thua mất rồi!';

  return (
    <Modal open title={title}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
        <div className={`rounded-2xl p-2 ${d.outcome === 'win' ? 'bg-sky-100' : 'bg-slate-50'}`}>
          <div className="text-3xl">🧒</div>
          <div className="truncate text-sm font-extrabold text-slate-600">{myName}</div>
          <div className="text-3xl font-extrabold text-sky-700 tabular-nums">{s.score}</div>
          <div className="text-xs font-bold text-slate-500">
            Đúng {s.correct}/{s.answered}
          </div>
        </div>
        <div className="text-xl font-extrabold text-slate-400">VS</div>
        <div className={`rounded-2xl p-2 ${d.outcome === 'loss' ? 'bg-rose-100' : 'bg-slate-50'}`}>
          <div className="text-3xl">{d.opp.emoji}</div>
          <div className="truncate text-sm font-extrabold text-slate-600">{d.opp.name}</div>
          <div className="text-3xl font-extrabold text-rose-600 tabular-nums">{d.oppScore}</div>
          <div className="text-xs font-bold text-slate-500">
            Đúng {d.oppCorrect}/{d.rounds}
          </div>
        </div>
      </div>

      {d.outcome === 'loss' && <p className="mt-2 text-center font-bold text-slate-600">Đừng buồn! Ôn lại từ vựng rồi thử lại nhé 💪</p>}

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="Điểm rank" value={delta > 0 ? `+${delta}` : `${delta}`} />
        <Stat label="Combo" value={`🔥${s.maxCombo}`} />
        <div className="rounded-2xl bg-amber-50 p-2">
          <div className="text-xs font-extrabold text-slate-400">Vàng</div>
          <div className="flex items-center justify-center gap-1 text-xl font-extrabold text-amber-600">
            <Coin className="h-5 w-5" />+{rec.gold}
          </div>
        </div>
      </div>

      {rec.rankUp && (
        <div className="mt-3 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 p-3 text-center text-xl font-extrabold text-white animate-pop">🎉 Lên rank {rankOf(rec.rpAfter).name}!</div>
      )}
      {rec.newBest && <div className="mt-2 text-center font-extrabold text-violet-600 animate-pop">⭐ Kỷ lục mới của bạn ở bài này: {s.score} điểm!</div>}

      <div className="mt-3">
        <RankCard rp={rec.rpAfter} />
      </div>

      <WrongReview wrong={s.wrong} />

      <div className="mt-5 grid gap-2">{children}</div>
    </Modal>
  );
}
