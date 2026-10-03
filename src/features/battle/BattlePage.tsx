// ============================================================
// Màn chiến đấu: cảnh 3D + thanh máu + câu hỏi + kết quả
// ============================================================
import { Suspense, lazy, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getUnit } from '../../content';
import { getStages, TIER_LABEL } from '../../game/monsters';
import { PLAYER_MAX_HP, starsFor, useBattle } from '../../stores/battle';
import { stopSpeaking } from '../../services/speech';
import { useProgress } from '../../stores/progress';
import { Button, HpBar, Modal, SoundToggles, Stars } from '../../components/ui';
import { QuestionPanel } from './QuestionPanel';
import { WrongReview } from './WrongReview';
import { Coin, GemIcon } from '../../components/icons';
import { getGem } from '../../game/gems';
import { DUPLICATE_GEM_GOLD, type BattleRewards } from '../../game/rewards';

const BattleScene = lazy(() => import('../../three/BattleScene').then((m) => ({ default: m.BattleScene })));

/** Thanh máu, điểm, combo nằm đè lên cảnh 3D */
function Hud({ onPause }: { onPause: () => void }) {
  const playerHp = useBattle((s) => s.playerHp);
  const monsterHp = useBattle((s) => s.monsterHp);
  const monster = useBattle((s) => s.monster);
  const combo = useBattle((s) => s.combo);
  const score = useBattle((s) => s.score);
  const fx = useBattle((s) => s.fx);
  const result = useBattle((s) => s.lastResult);
  const milestone = useBattle((s) => s.comboMilestone);
  if (!monster) return null;
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="flex items-start gap-2 p-2 sm:p-3">
        <button onClick={onPause} className="pointer-events-auto h-10 w-10 shrink-0 rounded-xl bg-white/90 border-b-4 border-slate-300 text-xl font-extrabold active:translate-y-0.5" aria-label="Tạm dừng">
          ⏸
        </button>
        <div className="flex-1 grid grid-cols-2 gap-3">
          <HpBar value={playerHp} max={PLAYER_MAX_HP} label="🧒 Bạn" />
          <HpBar value={monsterHp} max={monster.maxHp} color="red" label={`${monster.emoji} ${monster.name}`} align="right" />
        </div>
      </div>
      <div className="flex justify-between px-3">
        <div className="rounded-xl bg-white/85 px-2 py-0.5 text-sm font-extrabold text-amber-600">⭐ {score}</div>
        {combo >= 2 && <div className="rounded-xl bg-orange-500 px-2 py-0.5 text-sm font-extrabold text-white">🔥 Combo {combo}</div>}
        {monster.tier !== 'normal' && <div className="rounded-xl bg-rose-500 px-2 py-0.5 text-sm font-extrabold text-white">{TIER_LABEL[monster.tier]}</div>}
      </div>

      {/* Số sát thương bay lên */}
      {result && fx.kind === 'playerAttack' && (
        <div key={fx.id} className="absolute right-[18%] top-[38%] text-3xl sm:text-4xl font-extrabold text-amber-300 animate-floatUp [animation-delay:400ms] opacity-0 drop-shadow-[0_3px_0_rgba(0,0,0,0.5)]" style={{ animationFillMode: 'both' }}>
          -{result.damage}
          {result.crit && <span className="block text-lg text-orange-400">CHÍ MẠNG!</span>}
        </div>
      )}
      {result && fx.kind === 'monsterAttack' && (
        <div key={fx.id} className="absolute left-[18%] top-[38%] text-3xl sm:text-4xl font-extrabold text-rose-500 animate-floatUp [animation-delay:300ms] opacity-0 drop-shadow-[0_3px_0_rgba(255,255,255,0.8)]" style={{ animationFillMode: 'both' }}>
          -{result.damage}
        </div>
      )}
      {milestone && (
        <div key={`c${fx.id}`} className="absolute inset-x-0 top-[22%] text-center animate-pop">
          <span className="inline-block rounded-2xl bg-gradient-to-r from-orange-500 to-rose-500 px-4 py-1 text-2xl sm:text-3xl font-extrabold text-white shadow-lg">
            🔥 COMBO x{milestone}! Sát thương tăng!
          </span>
        </div>
      )}
    </div>
  );
}

export function BattlePage() {
  const { unitId = '', stage = '0' } = useParams();
  const stageIndex = Number(stage);
  const nav = useNavigate();
  const [retry, setRetry] = useState(0);
  const [pauseOpen, setPauseOpen] = useState(false);
  const phase = useBattle((s) => s.phase);
  const monster = useBattle((s) => s.monster);
  const ready = useBattle((s) => s.mode === 'adventure' && s.unitId === unitId && s.stageIndex === stageIndex && !!s.deck);
  const typesFallback = useBattle((s) => s.typesFallback);

  useEffect(() => {
    // Màn chưa mở khóa → quay về bản đồ
    if (!useProgress.getState().isStageUnlocked(unitId, stageIndex)) {
      nav(`/map/${unitId}`, { replace: true });
      return;
    }
    if (!useBattle.getState().setup(unitId, stageIndex)) nav('/', { replace: true });
    setPauseOpen(false);
  }, [unitId, stageIndex, retry, nav]);

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
  if (!unit || !ready || !monster) return null;

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
      {/* Cảnh 3D */}
      <div className="relative shrink-0 h-[38dvh] min-h-[190px] lg:h-auto lg:flex-1">
        <Suspense fallback={<div className="h-full grid place-items-center font-bold text-sky-700">Đang tải cảnh…</div>}>
          <BattleScene />
        </Suspense>
        <Hud onPause={openPause} />
      </div>

      {/* Câu hỏi */}
      <div className="flex-1 lg:flex-none lg:w-[480px] overflow-y-auto bg-white/95 rounded-t-3xl lg:rounded-none lg:rounded-l-3xl -mt-4 lg:mt-0 relative z-10 p-3 sm:p-5 shadow-[0_-6px_20px_rgba(0,0,0,0.1)]">
        {(phase === 'question' || phase === 'feedback') && <QuestionPanel />}
      </div>

      {/* Màn chuẩn bị */}
      {phase === 'ready' && (
        <Modal open title={`Màn ${stageIndex + 1}: ${monster.name}`}>
          <div className="text-center">
            <div className="text-7xl">{monster.emoji}</div>
            <div className="mt-1 font-extrabold text-slate-500">
              {TIER_LABEL[monster.tier]} · ❤️ {monster.maxHp} HP · 💥 {monster.attack} sát thương
            </div>
            <ul className="mt-3 text-left text-sm font-bold text-slate-600 space-y-1 bg-sky-50 rounded-2xl p-3">
              <li>✅ Trả lời đúng → tấn công quái vật</li>
              <li>⚡ Trả lời thật nhanh → chí mạng x1.5</li>
              <li>🔥 Đúng liên tiếp 3, 5, 10 câu → combo mạnh hơn</li>
              <li>❌ Sai hoặc hết giờ → quái vật tấn công bạn</li>
            </ul>
            {typesFallback && <p className="mt-2 text-sm font-bold text-amber-600">Dạng câu hỏi bạn chọn không dùng được cho unit này nên game sẽ dùng tất cả dạng.</p>}
            <Button className="w-full mt-4 text-2xl !py-4" onClick={() => useBattle.getState().begin()}>
              ⚔️ Bắt đầu!
            </Button>
            <Button color="white" className="w-full mt-2" onClick={() => nav(`/map/${unitId}`)}>
              Quay lại bản đồ
            </Button>
          </div>
        </Modal>
      )}

      {/* Tạm dừng */}
      <Modal open={pauseOpen && (phase === 'question' || phase === 'feedback')} title="⏸ Tạm dừng" onClose={closePause}>
        <div className="space-y-3">
          <Button className="w-full text-xl" onClick={closePause}>
            ▶ Chơi tiếp
          </Button>
          <div className="flex justify-center">
            <SoundToggles />
          </div>
          <Button color="red" className="w-full" onClick={() => nav(`/map/${unitId}`)}>
            🚪 Thoát về bản đồ
          </Button>
        </div>
      </Modal>

      {(phase === 'won' || phase === 'lost') && (
        <ResultModal
          onRetry={() => setRetry((r) => r + 1)}
          onNext={stageIndex < getStages(unitId).length - 1 ? () => nav(`/battle/${unitId}/${stageIndex + 1}`) : undefined}
          onMap={() => nav(`/map/${unitId}`)}
        />
      )}
    </div>
  );
}

/** Kết quả trận: sao, điểm, ôn lại từ sai */
function ResultModal({ onRetry, onNext, onMap }: { onRetry: () => void; onNext?: () => void; onMap: () => void }) {
  const s = useBattle();
  const won = s.phase === 'won';
  const [show, setShow] = useState(false);
  // Đợi hiệu ứng hạ quái / ngã xong (và ngọc rơi xuống nếu có) mới hiện bảng
  const hasGem = !!s.rewards?.gem;
  useEffect(() => {
    const t = setTimeout(() => setShow(true), hasGem ? 2600 : 1400);
    return () => clearTimeout(t);
  }, [hasGem]);
  if (!show) return null;
  const acc = s.answered ? Math.round((s.correct / s.answered) * 100) : 0;

  return (
    <Modal open title={won ? '🎉 Chiến thắng!' : '😵 Thua mất rồi!'}>
      <div className="text-center">
        {won ? <Stars n={starsFor(s.playerHp)} size="text-5xl" /> : <p className="font-bold text-slate-600">Đừng buồn! Ôn lại từ vựng rồi thử lại nhé 💪</p>}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label="Điểm" value={s.score} />
          <Stat label="Đúng" value={`${s.correct}/${s.answered}`} sub={`${acc}%`} />
          <Stat label="Combo" value={`🔥${s.maxCombo}`} />
        </div>
      </div>

      {won && s.rewards && <RewardBox rewards={s.rewards} />}

      <WrongReview wrong={s.wrong} />

      <div className="mt-5 grid gap-2">
        {won && onNext && (
          <Button className="w-full text-xl" onClick={onNext}>
            Màn tiếp theo ▶
          </Button>
        )}
        {won && !onNext && <div className="text-center font-extrabold text-green-600">🏆 Bạn đã hạ Boss của unit này!</div>}
        <div className="grid grid-cols-2 gap-2">
          <Button color={won ? 'white' : 'orange'} onClick={onRetry}>
            🔁 Chơi lại
          </Button>
          <Button color="blue" onClick={onMap}>
            🗺️ Bản đồ
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Phần thưởng: vàng + ngọc rơi ra */
function RewardBox({ rewards }: { rewards: BattleRewards }) {
  const nav = useNavigate();
  const gemCount = useProgress((s) => s.gems.length);
  const gem = rewards.gem ? getGem(rewards.gem) : null;
  return (
    <div className="mt-4 rounded-2xl bg-amber-50 border-2 border-amber-200 p-3">
      <div className="flex items-center justify-center gap-2 text-xl font-extrabold text-amber-600">
        <Coin className="h-7 w-7" /> +{rewards.gold} vàng
      </div>
      {gem ? (
        <div className="mt-2 flex items-center gap-3 rounded-xl bg-white p-2 animate-pop">
          <GemIcon gem={gem.id} className="h-14 w-14 shrink-0" glow />
          <div className="flex-1 text-left">
            <div className="font-extrabold" style={{ color: gem.dark }}>
              {rewards.duplicate ? `${gem.name} (trùng)` : `Nhận được ${gem.name}!`}
            </div>
            <div className="text-sm font-bold text-slate-500">
              {rewards.duplicate ? `Bạn đã có viên này → đổi thành ${DUPLICATE_GEM_GOLD} vàng` : `Bộ sưu tập: ${gemCount}/7 viên`}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-1 text-center text-sm font-bold text-slate-500">Lần này chưa rơi Ngọc Rồng (tỉ lệ {Math.round(rewards.dropChance * 100)}%). Hạ Boss để có cơ hội cao hơn!</div>
      )}
      {gemCount >= 7 && (
        <Button color="purple" className="w-full mt-2" onClick={() => nav('/collection')}>
          ✨ Đủ 7 viên! Đi triệu hồi phần thưởng
        </Button>
      )}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl bg-sky-50 p-2">
      <div className="text-xs font-extrabold text-slate-400">{label}</div>
      <div className="text-xl font-extrabold text-sky-800">{value}</div>
      {sub && <div className="text-xs font-bold text-slate-500">{sub}</div>}
    </div>
  );
}
