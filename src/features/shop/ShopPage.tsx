// ============================================================
// Cửa hàng & Nhân vật: mặc thử, mua bằng vàng, trang bị, chọn danh hiệu
// (Chỉ dùng vàng kiếm được trong game — KHÔNG có nạp tiền thật)
// ============================================================
import { Suspense, lazy, useMemo, useState } from 'react';
import { COSMETICS, RARITY, SLOT_LABEL, type Cosmetic, type Slot } from '../../game/cosmetics';
import { playSfx } from '../../services/audio';
import { useProgress } from '../../stores/progress';
import { Button, Modal, TopBar } from '../../components/ui';
import { Coin, GoldBadge } from '../../components/icons';

const PreviewScene = lazy(() => import('../../three/PreviewScene').then((m) => ({ default: m.PreviewScene })));

const SLOTS: Slot[] = ['shirt', 'pants', 'accessory', 'hair', 'hairStyle', 'skin', 'outfit'];
type Tab = Slot | 'title';

/** Ô hiển thị món đồ: ô màu hoặc biểu tượng */
function Swatch({ item }: { item: Cosmetic }) {
  if (item.icon) return <span className="text-3xl leading-none">{item.icon}</span>;
  return (
    <span className="relative h-10 w-10 rounded-xl border-2 border-black/10 overflow-hidden" style={{ background: item.color }}>
      {item.pattern === 'stripes' && <span className="absolute inset-x-0 top-1/4 h-1.5" style={{ background: item.accent, boxShadow: `0 10px 0 ${item.accent}` }} />}
      {item.pattern === 'star' && <span className="absolute inset-0 grid place-items-center text-lg" style={{ color: item.accent }}>★</span>}
      {item.pattern === 'heart' && <span className="absolute inset-0 grid place-items-center text-lg" style={{ color: item.accent }}>♥</span>}
    </span>
  );
}

export function ShopPage() {
  const avatar = useProgress((s) => s.avatar);
  const owned = useProgress((s) => s.owned);
  const gold = useProgress((s) => s.gold);
  const titles = useProgress((s) => s.titles);
  const activeTitle = useProgress((s) => s.activeTitle);
  const { buy, equip, setActiveTitle } = useProgress.getState();
  const [tab, setTab] = useState<Tab>('shirt');
  // Món đang xem thử (chưa sở hữu)
  const [tryOn, setTryOn] = useState<Cosmetic | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const preview = useMemo(() => (tryOn ? { ...avatar, [tryOn.slot]: tryOn.id } : avatar), [avatar, tryOn]);
  const items = tab === 'title' ? [] : COSMETICS.filter((x) => x.slot === tab);

  const pick = (item: Cosmetic) => {
    if (owned.includes(item.id)) {
      equip(item.slot, item.id);
      setTryOn(null);
      playSfx('click');
    } else {
      setTryOn(item);
    }
  };

  const doBuy = () => {
    if (!tryOn) return;
    if (buy(tryOn.id)) {
      equip(tryOn.slot, tryOn.id);
      playSfx('win');
      setMsg(`🎉 Bạn đã mua “${tryOn.name}”!`);
      setTryOn(null);
    }
  };

  return (
    <div className="min-h-full flex flex-col">
      <TopBar title="🧒 Nhân vật & Cửa hàng" back="/" right={<GoldBadge />} />

      <div className="flex-1 w-full max-w-5xl mx-auto px-3 sm:px-4 pb-6 grid gap-3 lg:grid-cols-[minmax(0,380px)_1fr]">
        {/* Xem trước 3D */}
        <div className="panel overflow-hidden flex flex-col">
          <div className="h-60 sm:h-80 lg:h-[420px] bg-sky-100">
            <Suspense fallback={<div className="h-full grid place-items-center font-bold text-sky-700">Đang tải…</div>}>
              <PreviewScene avatar={preview} closeUp />
            </Suspense>
          </div>
          {activeTitle && <div className="text-center py-1 bg-violet-100 text-violet-700 font-extrabold">🎓 {activeTitle}</div>}
          {tryOn && (
            <div className="p-3 border-t-2 border-slate-100 animate-pop">
              <div className="flex items-center gap-2 font-extrabold">
                <Swatch item={tryOn} />
                <span className="flex-1">{tryOn.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${RARITY[tryOn.rarity].cls}`}>{RARITY[tryOn.rarity].label}</span>
              </div>
              {tryOn.reward ? (
                <p className="mt-2 text-sm font-bold text-violet-600">🔒 Chỉ nhận được khi gom đủ 7 Ngọc Rồng.</p>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button color="white" onClick={() => setTryOn(null)}>
                    Bỏ thử
                  </Button>
                  <Button color={gold >= tryOn.price ? 'green' : 'gray'} disabled={gold < tryOn.price} onClick={doBuy}>
                    Mua <Coin /> {tryOn.price}
                  </Button>
                </div>
              )}
              {!tryOn.reward && gold < tryOn.price && <p className="mt-1 text-xs font-bold text-rose-500 text-center">Chưa đủ vàng — thắng thêm trận để kiếm vàng nhé!</p>}
            </div>
          )}
        </div>

        {/* Danh mục */}
        <div className="panel p-3 sm:p-4 flex flex-col min-w-0">
          <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
            {[...SLOTS, 'title' as const].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setTab(s);
                  setTryOn(null);
                }}
                className={`shrink-0 rounded-xl px-3 py-2 font-extrabold text-sm sm:text-base border-b-4 ${tab === s ? 'bg-sky-500 border-sky-700 text-white' : 'bg-slate-100 border-slate-200 text-slate-600'}`}
              >
                {s === 'title' ? '🎓 Danh hiệu' : `${SLOT_LABEL[s].icon} ${SLOT_LABEL[s].label}`}
              </button>
            ))}
          </div>

          {tab === 'title' ? (
            <div className="space-y-2 mt-2">
              {titles.length === 0 && <p className="font-bold text-slate-500">Chưa có danh hiệu nào. Gom đủ 7 Ngọc Rồng để nhận “Bậc thầy tiếng Anh”!</p>}
              {titles.map((t) => (
                <Button key={t} color={activeTitle === t ? 'purple' : 'white'} className="w-full" onClick={() => setActiveTitle(activeTitle === t ? null : t)}>
                  🎓 {t} {activeTitle === t ? '(đang dùng)' : ''}
                </Button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
              {items.map((item) => {
                const has = owned.includes(item.id);
                const wearing = avatar[item.slot] === item.id;
                const trying = tryOn?.id === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => pick(item)}
                    className={`relative rounded-2xl border-4 p-2 flex flex-col items-center gap-1 text-center transition active:scale-95 ${wearing ? 'border-green-400 bg-green-50' : trying ? 'border-sky-400 bg-sky-50' : 'border-slate-100 bg-white hover:border-sky-200'}`}
                  >
                    <span className={`absolute top-1 right-1 rounded-full px-1.5 text-[10px] font-extrabold ${RARITY[item.rarity].cls}`}>{RARITY[item.rarity].label}</span>
                    <div className="h-12 grid place-items-center mt-2">
                      <Swatch item={item} />
                    </div>
                    <div className="text-sm font-extrabold leading-tight min-h-[2.5em]">{item.name}</div>
                    <div className="text-xs font-extrabold">
                      {wearing ? (
                        <span className="text-green-600">✔ Đang dùng</span>
                      ) : has ? (
                        <span className="text-sky-600">Đã có · Chạm để mặc</span>
                      ) : item.reward ? (
                        <span className="text-violet-600">🔒 7 Ngọc Rồng</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <Coin className="h-4 w-4" /> {item.price}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <p className="mt-3 text-xs font-bold text-slate-400 text-center">Vàng chỉ kiếm được bằng cách chơi game. Không có mua bán bằng tiền thật.</p>
        </div>
      </div>

      <Modal open={!!msg} onClose={() => setMsg(null)} title="Cửa hàng">
        <p className="text-lg font-bold">{msg}</p>
        <Button className="w-full mt-4" onClick={() => setMsg(null)}>
          OK
        </Button>
      </Modal>
    </div>
  );
}
