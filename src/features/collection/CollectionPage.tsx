// ============================================================
// Bộ sưu tập 7 Ngọc Rồng: xem ngọc đã có, gom đủ 7 viên → triệu hồi phần thưởng
// ============================================================
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GEMS } from '../../game/gems';
import { COSMETICS, TITLE_MASTER } from '../../game/cosmetics';
import { DROP_RATE, DUPLICATE_GEM_GOLD, REPEAT_SET_GOLD } from '../../game/rewards';
import { playSfx } from '../../services/audio';
import { useProgress, type SummonResult } from '../../stores/progress';
import { Button, TopBar } from '../../components/ui';
import { Coin, GemIcon, GoldBadge } from '../../components/icons';

export function CollectionPage() {
  const nav = useNavigate();
  const gems = useProgress((s) => s.gems);
  const completedSets = useProgress((s) => s.completedSets);
  const owned = useProgress((s) => s.owned);
  const titles = useProgress((s) => s.titles);
  const summon = useProgress((s) => s.summon);
  const [result, setResult] = useState<SummonResult | null>(null);
  const full = gems.length >= 7;
  const rewardItems = COSMETICS.filter((x) => x.reward);

  return (
    <div className="min-h-full flex flex-col">
      <TopBar title="💎 Bộ sưu tập Ngọc Rồng" back="/" right={<GoldBadge />} />

      <div className="flex-1 w-full max-w-4xl mx-auto px-4 pb-8 grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* Vòng 7 viên ngọc */}
        <div className="panel p-4 flex flex-col items-center">
          <div className="relative w-[300px] h-[300px] sm:w-[380px] sm:h-[380px]">
            {GEMS.map((g, i) => {
              const angle = (i / GEMS.length) * Math.PI * 2 - Math.PI / 2;
              const has = gems.includes(g.id);
              return (
                <div
                  key={g.id}
                  className="absolute flex flex-col items-center w-24 -ml-12 -mt-12"
                  style={{ left: `${50 + Math.cos(angle) * 38}%`, top: `${50 + Math.sin(angle) * 38}%` }}
                >
                  <div className={has ? 'animate-pop' : ''}>
                    <GemIcon gem={g.id} owned={has} className="h-14 w-14 sm:h-16 sm:w-16" glow={has} />
                  </div>
                  <span className={`text-xs sm:text-sm font-extrabold text-center leading-tight ${has ? '' : 'text-slate-400'}`} style={has ? { color: g.dark } : undefined}>
                    {has ? g.element : '???'}
                  </span>
                </div>
              );
            })}
            {/* Giữa vòng */}
            <div className="absolute inset-[30%] rounded-full bg-gradient-to-br from-amber-100 to-sky-100 border-4 border-white shadow-inner flex flex-col items-center justify-center text-center">
              <div className="text-3xl sm:text-4xl font-extrabold text-sky-900">{gems.length}/7</div>
              <div className="text-xs font-bold text-slate-500">viên ngọc</div>
            </div>
          </div>

          {full ? (
            <Button
              color="purple"
              className="w-full max-w-sm text-xl !py-4 mt-2 animate-pulse"
              onClick={() => {
                const r = summon();
                if (r) setResult(r);
              }}
            >
              ✨ Triệu hồi phần thưởng!
            </Button>
          ) : (
            <p className="mt-2 text-center font-bold text-slate-600">Thắng trận để có cơ hội nhận ngọc. Gom đủ 7 viên để mở phần thưởng đặc biệt!</p>
          )}
          {completedSets > 0 && <p className="mt-2 text-sm font-extrabold text-violet-600">🏆 Đã gom đủ bộ {completedSets} lần</p>}
        </div>

        {/* Thông tin */}
        <div className="space-y-4">
          <div className="panel p-4">
            <h3 className="font-extrabold text-sky-900 mb-2">🎁 Phần thưởng khi đủ 7 viên</h3>
            <ul className="space-y-2">
              {rewardItems.map((it) => (
                <li key={it.id} className="flex items-center gap-2 font-bold">
                  <span className="text-2xl">{it.icon}</span>
                  <span className="flex-1">{it.name}</span>
                  {owned.includes(it.id) && <span className="text-green-600 text-sm">✔ Đã có</span>}
                </li>
              ))}
              <li className="flex items-center gap-2 font-bold">
                <span className="text-2xl">🎓</span>
                <span className="flex-1">Danh hiệu “{TITLE_MASTER}”</span>
                {titles.includes(TITLE_MASTER) && <span className="text-green-600 text-sm">✔ Đã có</span>}
              </li>
            </ul>
            <p className="mt-2 text-xs font-bold text-slate-500">
              Đã có hết phần thưởng thì mỗi lần gom đủ bộ nhận {REPEAT_SET_GOLD} vàng. Sau khi triệu hồi, bộ sưu tập bắt đầu lại từ đầu.
            </p>
          </div>
          <div className="panel p-4">
            <h3 className="font-extrabold text-sky-900 mb-2">🎲 Tỉ lệ rơi ngọc khi thắng</h3>
            <div className="grid grid-cols-3 gap-2 text-center">
              {(
                [
                  ['Quái thường', DROP_RATE.normal],
                  ['Tinh anh', DROP_RATE.elite],
                  ['Boss', DROP_RATE.boss],
                ] as const
              ).map(([label, rate]) => (
                <div key={label} className="rounded-xl bg-sky-50 p-2">
                  <div className="text-2xl font-extrabold text-sky-700">{Math.round(rate * 100)}%</div>
                  <div className="text-xs font-bold text-slate-500">{label}</div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs font-bold text-slate-500 flex items-center gap-1 flex-wrap">
              Ngọc trùng tự đổi thành {DUPLICATE_GEM_GOLD} <Coin className="h-4 w-4" /> vàng.
            </p>
          </div>
        </div>
      </div>

      {result && <SummonOverlay result={result} onClose={() => setResult(null)} onShop={() => nav('/shop')} />}
    </div>
  );
}

/** Hiệu ứng triệu hồi: 7 viên ngọc xoay tròn, hợp lại, rồi hiện phần thưởng */
function SummonOverlay({ result, onClose, onShop }: { result: SummonResult; onClose: () => void; onShop: () => void }) {
  const [stage, setStage] = useState<'spin' | 'reveal'>('spin');
  useEffect(() => {
    playSfx('combo');
    const t1 = setTimeout(() => playSfx('combo'), 900);
    const t2 = setTimeout(() => {
      setStage('reveal');
      playSfx('win');
    }, 2600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
  const unlocked = COSMETICS.filter((x) => result.unlocked.includes(x.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-indigo-950 via-violet-900 to-sky-900 p-4 overflow-hidden">
      {stage === 'spin' ? (
        <div className="relative w-72 h-72 animate-orbit">
          {GEMS.map((g, i) => {
            const a = (i / 7) * Math.PI * 2;
            return (
              <div key={g.id} className="absolute -ml-8 -mt-8 animate-converge" style={{ left: `${50 + Math.cos(a) * 42}%`, top: `${50 + Math.sin(a) * 42}%` }}>
                <GemIcon gem={g.id} className="h-16 w-16" glow />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="panel w-full max-w-md p-5 text-center animate-pop">
          <div className="text-6xl">🐉✨</div>
          <h2 className="mt-2 text-2xl font-extrabold text-violet-700">Rồng Khối Huyền Thoại xuất hiện!</h2>
          <p className="font-bold text-slate-600">Chúc mừng bạn đã gom đủ 7 viên Ngọc Rồng!</p>
          <div className="mt-4 space-y-2 text-left">
            {unlocked.map((it) => (
              <div key={it.id} className="flex items-center gap-3 rounded-2xl bg-amber-50 border-2 border-amber-200 p-2 font-extrabold">
                <span className="text-3xl">{it.icon}</span>
                <span>{it.name}</span>
              </div>
            ))}
            {result.title && (
              <div className="flex items-center gap-3 rounded-2xl bg-violet-50 border-2 border-violet-200 p-2 font-extrabold">
                <span className="text-3xl">🎓</span>
                <span>Danh hiệu “{result.title}”</span>
              </div>
            )}
            {result.gold > 0 && (
              <div className="flex items-center gap-3 rounded-2xl bg-amber-50 border-2 border-amber-200 p-2 font-extrabold text-amber-600">
                <Coin className="h-8 w-8" /> +{result.gold} vàng
              </div>
            )}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button color="white" onClick={onClose}>
              Đóng
            </Button>
            <Button color="green" onClick={onShop}>
              🧒 Mặc thử ngay
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
