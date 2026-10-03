// ============================================================
// Solo với bạn: tạo phòng mới hoặc nhập mã 6 số để vào phòng của bạn
// ============================================================
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onlineConfigured } from '../../net/transport';
import { useProgress } from '../../stores/progress';
import { useRoom } from '../../stores/room';
import { Button, TopBar } from '../../components/ui';
import { RankCard } from '../../components/rank';
import { PlayerNameModal } from '../../components/PlayerName';
import { defaultUnitId } from '../../components/UnitPicker';

export const roomKind = (): 'online' | 'local' => (onlineConfigured ? 'online' : 'local');

/** Thông báo khi chưa cấu hình máy chủ Supabase */
export function OfflineNotice() {
  if (onlineConfigured) return null;
  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-800">
      ⚠️ Chưa kết nối máy chủ Internet nên đang ở <b>chế độ thử</b>: chỉ chơi được giữa 2 tab trên cùng một trình duyệt. Thầy cô xem hướng dẫn "Bật chơi qua Internet" trong file README để chơi giữa các máy.
    </div>
  );
}

export function PvpHomePage() {
  const nav = useNavigate();
  const playerName = useProgress((s) => s.playerName);
  const [code, setCode] = useState('');
  const [nameOpen, setNameOpen] = useState(false);
  const [after, setAfter] = useState<null | 'create' | 'join'>(null);
  const valid = /^\d{6}$/.test(code);

  const create = () => {
    const c = useRoom.getState().create(defaultUnitId(), roomKind());
    nav(`/pvp/room/${c}`);
  };
  const join = () => {
    if (!valid) return;
    useRoom.getState().join(code, roomKind());
    nav(`/pvp/room/${code}`);
  };
  // Chưa có tên → hỏi tên trước
  const withName = (action: 'create' | 'join') => {
    if (playerName) return action === 'create' ? create() : join();
    setAfter(action);
    setNameOpen(true);
  };

  return (
    <div className="min-h-full flex flex-col">
      <TopBar title="⚔️ Solo với bạn" back="/" />
      <div className="flex-1 w-full max-w-2xl mx-auto px-4 pb-8 space-y-4">
        <RankCard />
        <button onClick={() => setNameOpen(true)} className="rounded-xl bg-white/80 px-3 py-1.5 text-sm font-extrabold text-sky-900 hover:bg-white">
          🧒 {playerName || 'Đặt tên của bạn'} ✏️
        </button>
        <OfflineNotice />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="panel p-4 flex flex-col">
            <div className="text-4xl">🏠</div>
            <h2 className="mt-1 text-xl font-extrabold text-sky-900">Tạo phòng</h2>
            <p className="flex-1 text-sm font-bold text-slate-500">Game sẽ cho bạn một mã 6 số. Đọc mã cho bạn của em để cùng vào phòng.</p>
            <Button className="w-full mt-3 text-xl" onClick={() => withName('create')}>
              ➕ Tạo phòng mới
            </Button>
          </div>
          <div className="panel p-4 flex flex-col">
            <div className="text-4xl">🔑</div>
            <h2 className="mt-1 text-xl font-extrabold text-sky-900">Vào phòng</h2>
            <p className="text-sm font-bold text-slate-500">Nhập mã phòng bạn của em đọc cho:</p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && withName('join')}
              inputMode="numeric"
              placeholder="______"
              aria-label="Mã phòng"
              className="mt-2 w-full rounded-2xl border-4 border-sky-200 px-3 py-2 text-center text-3xl font-extrabold tracking-[0.4em] text-sky-900 outline-none focus:border-sky-400"
            />
            <Button color="blue" className="w-full mt-3 text-xl" disabled={!valid} onClick={() => withName('join')}>
              🚪 Vào phòng
            </Button>
          </div>
        </div>

        <ul className="text-sm font-bold text-slate-600 space-y-1 bg-white/80 rounded-2xl p-3">
          <li>⚔️ Hai bạn cùng trả lời 10 câu hỏi giống nhau. Đúng và nhanh hơn thì tung đòn!</li>
          <li>🏆 Thắng bạn: +30 điểm rank và 30 vàng. Hòa: +10 rank, 10 vàng.</li>
          <li>🛡️ Thua chỉ bị trừ 5 điểm rank và không rớt xuống bậc thấp hơn.</li>
        </ul>
      </div>

      <PlayerNameModal
        open={nameOpen}
        onClose={() => {
          setNameOpen(false);
          setAfter(null);
        }}
        onSaved={after === 'create' ? create : after === 'join' ? join : undefined}
      />
    </div>
  );
}
