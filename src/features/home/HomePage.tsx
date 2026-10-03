// ============================================================
// Trang chủ: nút "Chơi tiếp" (lựa chọn gần nhất), chọn chế độ chơi
// ============================================================
import { Suspense, lazy, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { describeSelection, isValidSelection } from '../../content';
import { useProgress } from '../../stores/progress';
import { Button, Modal, SoundToggles } from '../../components/ui';
import { GameSettings } from '../../components/GameSettings';
import { GoldBadge } from '../../components/icons';
import { RankBadge } from '../../components/rank';
import { rankOf } from '../../game/duel';
import { PlayerNameModal } from '../../components/PlayerName';
import { usePendingCount } from '../homework/HomeworkPage';

const PreviewScene = lazy(() => import('../../three/PreviewScene').then((m) => ({ default: m.PreviewScene })));

export function HomePage() {
  const nav = useNavigate();
  const last = useProgress((s) => s.lastSelection);
  const stats = useProgress((s) => s.stats);
  const gemCount = useProgress((s) => s.gems.length);
  const title = useProgress((s) => s.activeTitle);
  const rp = useProgress((s) => s.duel.rp);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const playerName = useProgress((s) => s.playerName);
  const pendingHw = usePendingCount();
  const hasLast = isValidSelection(last);
  const lastDesc = hasLast ? describeSelection(last) : null;

  return (
    <div className="min-h-full flex flex-col">
      <div className="flex justify-end gap-1 p-3">
        <GoldBadge />
        <RankBadge rp={rp} className="mr-auto" />
        <Button color="white" className="!px-2.5 !py-2" onClick={() => setSettingsOpen(true)} aria-label="Cài đặt" title="Cài đặt">
          ⚙️
        </Button>
        <SoundToggles />
      </div>

      <div className="flex-1 w-full max-w-5xl mx-auto px-4 pb-6 grid gap-4 lg:grid-cols-2 lg:items-center">
        {/* Tiêu đề + nhân vật 3D */}
        <div className="flex flex-col items-center">
          <h1 className="text-center leading-none">
            <span className="block text-4xl sm:text-6xl font-extrabold text-white drop-shadow-[0_4px_0_rgba(14,116,144,0.9)]">Block Quest</span>
            <span className="block text-3xl sm:text-5xl font-extrabold text-amber-300 drop-shadow-[0_4px_0_rgba(146,64,14,0.9)]">English</span>
          </h1>
          <p className="mt-2 text-sky-900 font-bold text-center">Đánh quái – Học tiếng Anh – Gom Ngọc Rồng!</p>
          <div className="mt-3 w-full max-w-md h-56 sm:h-72 rounded-3xl overflow-hidden border-4 border-white shadow-xl bg-sky-100">
            <Suspense fallback={<div className="h-full grid place-items-center text-sky-700 font-bold">Đang tải…</div>}>
              <PreviewScene />
            </Suspense>
          </div>
          {title && <div className="-mt-3 relative rounded-full bg-violet-500 border-2 border-white px-3 py-0.5 text-sm font-extrabold text-white shadow">🎓 {title}</div>}
          {/* Tên để thầy cô xem kết quả trong phần Thống kê */}
          <button onClick={() => setNameOpen(true)} className={`mt-2 rounded-xl px-3 py-1 text-sm font-extrabold ${playerName ? 'bg-white/80 text-sky-900' : 'bg-amber-300 text-amber-950 animate-pulse'}`}>
            🧒 {playerName || 'Bấm vào đây để đặt tên của em'} ✏️
          </button>
          {stats.battles > 0 && (
            <div className="mt-3 flex gap-3 text-sm font-bold text-sky-900">
              <span>⚔️ {stats.battles} trận</span>
              <span>🏅 {stats.wins} thắng</span>
              <span>✅ {stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0}% đúng</span>
            </div>
          )}
        </div>

        {/* Menu */}
        <div className="panel p-4 sm:p-6 space-y-3">
          {hasLast && lastDesc && (
            <Button color="green" className="w-full text-xl !py-4 flex-col !gap-0" onClick={() => nav(`/map/${last.unitId}`)}>
              <span>▶ Chơi tiếp</span>
              <span className="text-sm font-bold opacity-90">
                {lastDesc.book} · {lastDesc.grade} · {lastDesc.unit}
              </span>
            </Button>
          )}
          <Button color={hasLast ? 'blue' : 'green'} className="w-full text-xl !py-4" onClick={() => nav('/select')}>
            🗺️ Phiêu lưu – Chọn bài học
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button color={pendingHw ? 'orange' : 'white'} className={`!py-3 flex-col !gap-0 ${pendingHw ? 'animate-pulse' : ''}`} onClick={() => nav('/homework')} data-testid="home-homework">
              <span>📝 Bài tập</span>
              <span className="text-xs font-bold opacity-90">{pendingHw ? `${pendingHw} bài cần làm` : 'Bài thầy cô giao'}</span>
              {pendingHw > 0 && <span className="absolute -top-2 -right-2 grid h-7 min-w-7 place-items-center rounded-full border-2 border-white bg-rose-500 px-1 text-sm font-extrabold text-white">{pendingHw}</span>}
            </Button>
            <Button color="white" className="!py-3 flex-col !gap-0" onClick={() => nav('/parent')}>
              <span>👪 Phụ huynh</span>
              <span className="text-xs font-bold opacity-90">Xem kết quả học</span>
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button color="purple" className="!py-3 flex-col !gap-0" onClick={() => nav('/collection')}>
              <span>💎 Ngọc Rồng</span>
              <span className="text-xs font-bold opacity-90">{gemCount}/7 viên</span>
            </Button>
            <Button color="orange" className="!py-3 flex-col !gap-0" onClick={() => nav('/shop')}>
              <span>🛒 Cửa hàng</span>
              <span className="text-xs font-bold opacity-90">Nhân vật & trang phục</span>
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button color="red" className="!py-3 flex-col !gap-0" onClick={() => nav('/duel')}>
              <span>🤖 Solo máy</span>
              <span className="text-xs font-bold opacity-90">Đấu với máy · 10 câu</span>
            </Button>
            <Button color="blue" className="!py-3 flex-col !gap-0" onClick={() => nav('/pvp')}>
              <span>⚔️ Solo bạn</span>
              <span className="text-xs font-bold opacity-90">Vào phòng bằng mã</span>
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button color="yellow" className="!py-3 flex-col !gap-0" onClick={() => nav('/leaderboard')}>
              <span>🏆 Xếp hạng</span>
              <span className="text-xs font-bold opacity-90">
                Rank {rankOf(rp).name} · {rp} điểm
              </span>
            </Button>
            <Button color="green" className="!py-3 flex-col !gap-0" onClick={() => nav('/class')}>
              <span>🏫 Vào lớp</span>
              <span className="text-xs font-bold opacity-90">Mã phòng của thầy cô</span>
            </Button>
          </div>
          <Button color="white" className="w-full !py-2" onClick={() => nav('/teacher')}>
            🎓 Giáo viên <span className="text-xs font-bold opacity-70">· Bài học · Bài tập · Thống kê · Phòng luyện tập</span>
          </Button>
        </div>
      </div>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="⚙️ Cài đặt">
        <GameSettings />
      </Modal>
      <PlayerNameModal open={nameOpen} onClose={() => setNameOpen(false)} />
    </div>
  );
}
