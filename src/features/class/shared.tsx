// ============================================================
// Thành phần dùng chung của phòng luyện tập: đồng hồ, đếm ngược chuẩn bị, bảng điểm
// ============================================================
import { useEffect, useRef } from 'react';
import { playSfx } from '../../services/audio';

/** Thanh thời gian theo giờ máy chủ */
export function ClassTimer({ now, startsAt, deadline, big = false }: { now: number; startsAt: number; deadline: number; big?: boolean }) {
  const total = Math.max(1, deadline - startsAt);
  const left = Math.max(0, Math.min(total, deadline - now));
  const pct = (left / total) * 100;
  const sec = Math.ceil(left / 1000);
  const color = pct > 50 ? 'bg-green-500' : pct > 25 ? 'bg-amber-400' : 'bg-rose-500';
  return (
    <div className="flex items-center gap-2">
      <span className={`text-right font-extrabold tabular-nums ${big ? 'w-24 text-5xl' : 'w-12 text-lg'} ${pct <= 25 ? 'text-rose-600 animate-pulse' : 'text-slate-600'}`}>⏱{sec}</span>
      <div className={`flex-1 rounded-full bg-slate-200 overflow-hidden ${big ? 'h-6' : 'h-3'}`}>
        <div className={`h-full ${color} rounded-full transition-[width] duration-100 ease-linear`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** "Câu 3 / 10 — chuẩn bị… 3, 2, 1" */
export function GetReady({ now, startsAt, qIndex, total, big = false }: { now: number; startsAt: number; qIndex: number; total: number; big?: boolean }) {
  const left = Math.max(1, Math.ceil((startsAt - now) / 1000));
  const last = useRef(0);
  useEffect(() => {
    if (left !== last.current) playSfx('tick');
    last.current = left;
  }, [left]);
  return (
    <div className="grid place-items-center text-center py-8">
      <div>
        <div className={`font-extrabold text-sky-900 ${big ? 'text-5xl' : 'text-2xl'}`}>
          Câu {qIndex + 1} / {total}
        </div>
        <div className={`font-bold text-slate-500 ${big ? 'text-3xl mt-2' : 'text-lg'}`}>Chuẩn bị…</div>
        <div key={left} className={`font-extrabold text-amber-400 drop-shadow-[0_6px_0_rgba(146,64,14,0.9)] animate-pop ${big ? 'text-[12rem] leading-none' : 'text-8xl'}`}>
          {left}
        </div>
      </div>
    </div>
  );
}

export const MEDALS = ['🥇', '🥈', '🥉'];

/** Huy chương cho top 3 (chỉ khi đã có điểm) */
export const placeLabel = (place: number, score = 1) => (place <= 3 && score > 0 ? MEDALS[place - 1] : `#${place}`);
