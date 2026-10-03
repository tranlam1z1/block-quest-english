// ============================================================
// Huy hiệu rank (vẽ SVG khối) + thẻ tiến độ rank
// ============================================================
import { RANKS, rankOf, rankProgress, type RankDef } from '../game/duel';
import { useProgress } from '../stores/progress';

/** Huy hiệu khiên khối; bậc càng cao càng nhiều ngôi sao */
export function RankIcon({ rank, className = 'h-10 w-10' }: { rank: RankDef; className?: string }) {
  const level = RANKS.indexOf(rank);
  return (
    <svg viewBox="0 0 48 48" className={className} aria-label={`Rank ${rank.name}`}>
      <path d="M8 6 H40 V26 L24 44 L8 26 Z" fill={rank.dark} />
      <path d="M11 9 H37 V25 L24 40 L11 25 Z" fill={rank.color} />
      <path d="M11 9 H24 V40 L11 25 Z" fill="#fff" opacity=".22" />
      {Array.from({ length: Math.min(level + 1, 6) }, (_, i) => {
        // Xếp sao thành 2 hàng: 3 trên, 3 dưới
        const row = i < 3 ? 0 : 1;
        const inRow = row === 0 ? Math.min(level + 1, 3) : level + 1 - 3;
        const col = row === 0 ? i : i - 3;
        const x = 24 + (col - (inRow - 1) / 2) * 8;
        const y = row === 0 ? 19 : 28;
        return <rect key={i} x={x - 2.6} y={y - 2.6} width="5.2" height="5.2" transform={`rotate(45 ${x} ${y})`} fill="#fff" stroke={rank.dark} strokeWidth="1" />;
      })}
    </svg>
  );
}

/** Nhãn rank gọn: huy hiệu + tên + điểm */
export function RankBadge({ rp, className = '' }: { rp: number; className?: string }) {
  const rank = rankOf(rp);
  return (
    <div className={`flex items-center gap-1 rounded-xl bg-white/90 border-b-4 px-2 py-1 font-extrabold ${className}`} style={{ borderColor: rank.color, color: rank.dark }} title={`Rank ${rank.name}`}>
      <RankIcon rank={rank} className="h-6 w-6" />
      <span>{rank.name}</span>
      <span className="text-xs opacity-70 tabular-nums">{rp}</span>
    </div>
  );
}

/** Thẻ rank của người chơi: bậc hiện tại + thanh tiến độ tới bậc kế tiếp */
export function RankCard({ rp: rpProp }: { rp?: number }) {
  const stored = useProgress((s) => s.duel.rp);
  const rp = rpProp ?? stored;
  const rank = rankOf(rp);
  const prog = rankProgress(rp);
  return (
    <div className="flex items-center gap-3 rounded-2xl border-2 p-3 bg-white" style={{ borderColor: rank.color }}>
      <RankIcon rank={rank} className="h-14 w-14 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xl font-extrabold" style={{ color: rank.dark }}>
            Rank {rank.name}
          </span>
          <span className="font-extrabold text-slate-500 tabular-nums">{rp} điểm</span>
        </div>
        {prog ? (
          <>
            <div className="mt-1 h-3 rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.round(prog.pct * 100)}%`, background: rank.color }} />
            </div>
            <div className="mt-0.5 text-xs font-bold text-slate-500">
              Còn {prog.need} điểm nữa lên <b style={{ color: prog.next.dark }}>{prog.next.name}</b>
            </div>
          </>
        ) : (
          <div className="text-sm font-bold text-violet-600">Bậc cao nhất! Bạn là Cao Thủ tiếng Anh 🏆</div>
        )}
      </div>
    </div>
  );
}
