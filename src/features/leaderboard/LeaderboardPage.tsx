// ============================================================
// Bảng xếp hạng: bạn và các đối thủ máy (theo điểm rank) + kỷ lục cá nhân
// (Điểm rank cộng cả từ trận solo với máy lẫn solo với bạn)
// ============================================================
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { books } from '../../content';
import { RIVALS, rankOf } from '../../game/duel';
import { useProgress } from '../../stores/progress';
import { Button, TopBar } from '../../components/ui';
import { RankCard, RankIcon } from '../../components/rank';
import { PlayerNameModal } from '../../components/PlayerName';

type Tab = 'rank' | 'records';

export function LeaderboardPage() {
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>('rank');
  const [nameOpen, setNameOpen] = useState(false);
  const playerName = useProgress((s) => s.playerName);

  return (
    <div className="min-h-full flex flex-col">
      <TopBar title="🏆 Bảng xếp hạng" back="/" />
      <div className="flex-1 w-full max-w-2xl mx-auto px-4 pb-8 space-y-3">
        <RankCard />
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => setNameOpen(true)} className="rounded-xl bg-white/80 px-3 py-1.5 text-sm font-extrabold text-sky-900 hover:bg-white">
            🧒 {playerName || 'Đặt tên của bạn'} ✏️
          </button>
          <Button color="green" className="!py-2" onClick={() => nav('/duel')}>
            ⚔️ Solo ngay
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['rank', '🏆 Xếp hạng'],
              ['records', '⭐ Kỷ lục của bạn'],
            ] as const
          ).map(([id, label]) => (
            <Button key={id} color={tab === id ? 'blue' : 'white'} onClick={() => setTab(id)}>
              {label}
            </Button>
          ))}
        </div>

        {tab === 'rank' ? <RankTable /> : <Records />}
      </div>
      <PlayerNameModal open={nameOpen} onClose={() => setNameOpen(false)} />
    </div>
  );
}

function RankTable() {
  const rp = useProgress((s) => s.duel.rp);
  const name = useProgress((s) => s.playerName) || 'Bạn';
  // Người chơi đứng trên đối thủ máy khi bằng điểm
  const rows = [...RIVALS.map((r) => ({ ...r, me: false })), { name, emoji: '🧒', rp, me: true }].sort((a, b) => b.rp - a.rp || Number(b.me) - Number(a.me));
  const myPos = rows.findIndex((r) => r.me);

  return (
    <div className="panel p-2 sm:p-3">
      <div className="space-y-1.5">
        {rows.map((r, i) => {
          const rank = rankOf(r.rp);
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
          return (
            <div key={r.name + i} className={`flex items-center gap-2 rounded-2xl px-2 py-1.5 ${r.me ? 'bg-amber-100 border-2 border-amber-400 animate-pop' : 'bg-slate-50'}`}>
              <div className="w-8 text-center font-extrabold text-slate-500 tabular-nums">{medal ?? i + 1}</div>
              <div className="text-2xl">{r.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className={`truncate font-extrabold ${r.me ? 'text-amber-800' : 'text-slate-700'}`}>
                  {r.name}
                  {r.me && ' (bạn)'}
                </div>
                <div className="text-xs font-bold" style={{ color: rank.dark }}>
                  {rank.name}
                </div>
              </div>
              <RankIcon rank={rank} className="h-7 w-7" />
              <div className="w-14 text-right font-extrabold tabular-nums text-slate-700">{r.rp}</div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-center text-sm font-bold text-slate-500">
        {myPos === 0 ? 'Bạn đang đứng đầu bảng! 🎉' : `Thắng thêm để vượt qua ${rows[myPos - 1].name}!`}
        <br />
        Bảng này gồm bạn và các đối thủ máy. Muốn đấu với bạn bè, vào mục ⚔️ Solo bạn.
      </p>
    </div>
  );
}

function Records() {
  const duel = useProgress((s) => s.duel);
  const stats = useProgress((s) => s.stats);
  const units = useProgress((s) => s.units);
  const acc = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0;
  const winRate = duel.played ? Math.round((duel.wins / duel.played) * 100) : 0;
  const unitRows = books.flatMap((b) => b.grades.flatMap((g) => g.units.map((u) => ({ u, book: b, grade: g }))));

  return (
    <div className="space-y-3">
      <div className="panel p-3 grid grid-cols-3 gap-2 text-center">
        <Box label="Thắng / Hòa / Thua" value={`${duel.wins}/${duel.draws}/${duel.losses}`} />
        <Box label="Tỉ lệ thắng" value={`${winRate}%`} />
        <Box label="Thắng bạn bè" value={`${duel.pvpWins}/${duel.pvpPlayed}`} />
        <Box label="Trận phiêu lưu" value={stats.battles} />
        <Box label="Trả lời đúng" value={`${acc}%`} />
        <Box label="Combo dài nhất" value={`🔥${stats.bestCombo}`} />
      </div>

      <div className="panel p-3">
        <h3 className="font-extrabold text-sky-900 mb-2">📚 Theo từng bài</h3>
        <div className="space-y-1.5">
          {unitRows.map(({ u, book, grade }) => {
            const stars = (units[u.id]?.stars ?? []).reduce((a, b) => a + (b ?? 0), 0);
            const best = duel.best[u.id];
            return (
              <div key={u.id} className="flex items-center gap-2 rounded-2xl bg-slate-50 px-2 py-1.5">
                <div className="h-9 w-9 shrink-0 rounded-xl grid place-items-center font-extrabold text-white" style={{ background: book.color }}>
                  {u.number}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-extrabold text-slate-700">{u.title}</div>
                  <div className="truncate text-xs font-bold text-slate-400">
                    {book.name} · {grade.name}
                  </div>
                </div>
                <div className="text-right text-xs font-extrabold leading-tight">
                  <div className="text-amber-500">⭐ {stars}/15</div>
                  <div className={best ? 'text-violet-600' : 'text-slate-300'}>⚔️ {best ? `${best} điểm` : 'chưa solo'}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Box({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-sky-50 p-2">
      <div className="text-[11px] font-extrabold text-slate-400 leading-tight">{label}</div>
      <div className="text-lg sm:text-xl font-extrabold text-sky-800">{value}</div>
    </div>
  );
}
