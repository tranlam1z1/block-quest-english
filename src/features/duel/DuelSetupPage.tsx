// ============================================================
// Chuẩn bị Solo với máy: chọn bài học + chọn đối thủ
// ============================================================
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { describeSelection, getUnit } from '../../content';
import { BOTS, DUEL_ROUNDS, type BotLevel } from '../../game/duel';
import { useProgress } from '../../stores/progress';
import { Button, TopBar } from '../../components/ui';
import { RankCard } from '../../components/rank';
import { PlayerNameModal } from '../../components/PlayerName';
import { Coin } from '../../components/icons';
import { UnitPicker, defaultUnitId } from '../../components/UnitPicker';

export function DuelSetupPage() {
  const nav = useNavigate();
  const rp = useProgress((s) => s.duel.rp);
  const duel = useProgress((s) => s.duel);
  const playerName = useProgress((s) => s.playerName);
  const [unitId, setUnitId] = useState(defaultUnitId);
  const [level, setLevel] = useState<BotLevel>(rp < 100 ? 'easy' : rp < 450 ? 'medium' : 'hard');
  const [pickOpen, setPickOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [startAfterName, setStartAfterName] = useState(false);
  const unit = getUnit(unitId);
  const desc = unit ? describeSelection({ bookId: unit.bookId, gradeId: unit.gradeId, unitId: unit.id }) : null;

  const start = () => nav(`/duel/${unitId}/${level}`);

  return (
    <div className="min-h-full flex flex-col">
      <TopBar title="🤖 Solo với máy" back="/" />
      <div className="flex-1 w-full max-w-2xl mx-auto px-4 pb-8 space-y-4">
        <RankCard />
        <div className="flex items-center justify-between gap-2 text-sm font-bold text-sky-900">
          <button onClick={() => setNameOpen(true)} className="rounded-xl bg-white/80 px-3 py-1.5 font-extrabold hover:bg-white">
            🧒 {playerName || 'Đặt tên của bạn'} ✏️
          </button>
          {duel.played > 0 && (
            <span>
              {duel.played} trận · {duel.wins} thắng · {duel.draws} hòa
            </span>
          )}
        </div>

        {/* Bài học */}
        <div className="panel p-4">
          <div className="text-sm font-extrabold text-slate-400">1. Bài học</div>
          <div className="mt-1 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-xl font-extrabold text-slate-800 truncate">{desc?.unit ?? 'Chưa chọn bài'}</div>
              <div className="text-sm font-bold text-slate-500 truncate">{desc ? `${desc.book} · ${desc.grade} · ${unit!.titleVi}` : ''}</div>
            </div>
            <Button color="white" onClick={() => setPickOpen(true)}>
              Đổi bài
            </Button>
          </div>
        </div>

        {/* Đối thủ */}
        <div className="panel p-4">
          <div className="text-sm font-extrabold text-slate-400 mb-2">2. Chọn đối thủ</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {BOTS.map((b) => {
              const active = b.level === level;
              return (
                <button
                  key={b.level}
                  onClick={() => setLevel(b.level)}
                  className={`rounded-2xl border-4 p-3 text-left sm:text-center transition flex sm:flex-col items-center gap-3 sm:gap-1 ${active ? 'border-sky-400 bg-sky-50 scale-[1.02]' : 'border-slate-200 bg-white hover:border-sky-200'}`}
                >
                  <span className="text-5xl">{b.emoji}</span>
                  <span className="flex-1">
                    <span className="block text-lg font-extrabold text-slate-800">{b.name}</span>
                    <span className={`inline-block rounded-full px-2 text-xs font-extrabold ${b.level === 'easy' ? 'bg-green-100 text-green-700' : b.level === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{b.label}</span>
                    <span className="block mt-1 text-xs font-bold text-slate-500">
                      Thắng: <b className="text-green-600">+{b.rpWin} rank</b> · <Coin className="inline h-3.5 w-3.5 -mt-0.5" /> {b.goldWin}
                    </span>
                    <span className="block text-xs font-bold text-slate-400">Thua: −{b.rpLoss} rank</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <ul className="text-sm font-bold text-slate-600 space-y-1 bg-white/80 rounded-2xl p-3">
          <li>⚔️ Bạn và máy cùng trả lời {DUEL_ROUNDS} câu hỏi.</li>
          <li>⚡ Đúng càng nhanh càng nhiều điểm, đúng liên tiếp có thêm điểm combo.</li>
          <li>🏆 Ai nhiều điểm hơn thì thắng và được cộng điểm rank.</li>
          <li>💯 Đúng hết {DUEL_ROUNDS} câu và thắng: thưởng thêm 10 điểm rank.</li>
          <li>🛡️ Thua cũng không bị rớt xuống bậc rank thấp hơn.</li>
        </ul>

        <Button
          className="w-full text-2xl !py-4"
          disabled={!unit}
          onClick={() => {
            if (playerName) return start();
            // Chưa có tên → hỏi tên trước rồi vào trận
            setStartAfterName(true);
            setNameOpen(true);
          }}
        >
          ⚔️ Bắt đầu solo!
        </Button>
      </div>

      <PlayerNameModal
        open={nameOpen}
        onClose={() => {
          setNameOpen(false);
          setStartAfterName(false);
        }}
        onSaved={startAfterName ? start : undefined}
      />

      <UnitPicker open={pickOpen} value={unitId} onPick={setUnitId} onClose={() => setPickOpen(false)} />
    </div>
  );
}
