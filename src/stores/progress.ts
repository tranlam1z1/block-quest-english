// ============================================================
// Tiến trình người chơi: lựa chọn gần nhất, sao từng màn, nhân vật, vàng,
// Ngọc Rồng, đồ đã mua, danh hiệu, thống kê.
// (Lưu trên trình duyệt; từ GĐ4 sẽ đồng bộ lên Supabase)
// ============================================================
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Selection } from '../types/content';
import { COSMETICS, DEFAULT_AVATAR, FREE_ITEMS, TITLE_MASTER, getCosmetic, type Avatar, type Slot } from '../game/cosmetics';
import type { GemId } from '../game/gems';
import { REPEAT_SET_GOLD, classGold, type BattleRewards } from '../game/rewards';
import { goldFor, rankIndex, rpChange, type DuelOutcome, type Stakes } from '../game/duel';

export type { Avatar } from '../game/cosmetics';
export { DEFAULT_AVATAR } from '../game/cosmetics';

export interface UnitProgress {
  /** Số sao (0–3) của từng màn; 0 = chưa qua */
  stars: number[];
}

/** Kết quả triệu hồi khi gom đủ 7 ngọc */
export interface SummonResult {
  firstTime: boolean;
  unlocked: string[];
  gold: number;
  title: string | null;
}

/** Thống kê chế độ Solo (với máy + với bạn) */
export interface DuelStats {
  /** Điểm rank */
  rp: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** Riêng các trận solo với bạn */
  pvpPlayed: number;
  pvpWins: number;
  /** Điểm cao nhất mỗi unit */
  best: Record<string, number>;
}

/** Kết quả ghi nhận sau 1 trận solo */
export interface DuelRecord {
  rpBefore: number;
  rpAfter: number;
  gold: number;
  /** Lên bậc rank mới */
  rankUp: boolean;
  /** Phá kỷ lục điểm của unit */
  newBest: boolean;
}

interface ProgressState {
  lastSelection: Selection | null;
  units: Record<string, UnitProgress>;
  avatar: Avatar;
  stats: { battles: number; wins: number; answered: number; correct: number; bestCombo: number };
  /** Từ / mẫu câu hay sai: "unitId/itemId" → số lần sai */
  mistakes: Record<string, number>;
  gold: number;
  /** Ngọc trong bộ sưu tập hiện tại (reset sau khi triệu hồi) */
  gems: GemId[];
  /** Số lần đã gom đủ 7 viên */
  completedSets: number;
  /** Id các món đồ đã sở hữu */
  owned: string[];
  titles: string[];
  activeTitle: string | null;
  /** Cộng thêm tỉ lệ rơi ngọc cho trận thắng kế tiếp (thưởng bài tập về nhà ≥ 9 điểm) */
  dropBonus: number;
  /** Tên hiển thị trên bảng xếp hạng */
  playerName: string;
  duel: DuelStats;

  setLastSelection: (s: Selection) => void;
  setPlayerName: (name: string) => void;
  /** Ghi nhận trận solo với máy: điểm rank, vàng, kỷ lục, thống kê */
  recordDuel: (r: {
    unitId: string;
    stakes: Stakes;
    /** Trận với người thật */
    pvp: boolean;
    outcome: DuelOutcome;
    score: number;
    answered: number;
    correct: number;
    maxCombo: number;
    wrongItemIds: string[];
  }) => DuelRecord;
  recordBattle: (r: {
    unitId: string;
    stageIndex: number;
    won: boolean;
    stars: number;
    answered: number;
    correct: number;
    maxCombo: number;
    wrongItemIds: string[];
  }) => void;
  /** Kết thúc 1 lượt luyện tập trên lớp: cộng vàng + thống kê. Trả về số vàng nhận được. */
  recordClass: (r: { answered: number; correct: number; maxCombo: number; place: number }) => number;
  /** Nộp bài tập về nhà: thống kê, từ hay sai, vàng, thưởng tỉ lệ rơi ngọc */
  recordHomework: (r: { unitId: string; answered: number; correct: number; maxCombo: number; wrongItemIds: string[]; gold: number; dropBonus: number }) => void;
  /** Nhận vàng + ngọc sau trận thắng (đồng thời dùng hết dropBonus) */
  applyRewards: (r: BattleRewards) => void;
  isStageUnlocked: (unitId: string, stageIndex: number) => boolean;
  isOwned: (itemId: string) => boolean;
  /** Mua đồ. Trả về false nếu không đủ vàng / không bán */
  buy: (itemId: string) => boolean;
  equip: (slot: Slot, itemId: string) => void;
  /** Gom đủ 7 viên → nhận thưởng rồi reset bộ sưu tập */
  summon: () => SummonResult | null;
  setActiveTitle: (t: string | null) => void;
}

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      lastSelection: null,
      units: {},
      avatar: DEFAULT_AVATAR,
      stats: { battles: 0, wins: 0, answered: 0, correct: 0, bestCombo: 0 },
      mistakes: {},
      gold: 0,
      gems: [],
      completedSets: 0,
      owned: FREE_ITEMS,
      titles: [],
      activeTitle: null,
      dropBonus: 0,
      playerName: '',
      duel: { rp: 0, played: 0, wins: 0, draws: 0, losses: 0, pvpPlayed: 0, pvpWins: 0, best: {} },

      setLastSelection: (s) => set({ lastSelection: s }),

      setPlayerName: (name) => set({ playerName: name.trim().slice(0, 16) }),

      recordDuel: (r) => {
        const { duel, stats, mistakes, gold } = get();
        const perfect = r.answered > 0 && r.correct === r.answered;
        const rpAfter = Math.max(0, duel.rp + rpChange(duel.rp, r.stakes, r.outcome, perfect));
        const earned = goldFor(r.stakes, r.outcome);
        const prevBest = duel.best[r.unitId] ?? 0;
        const m = { ...mistakes };
        for (const id of r.wrongItemIds) m[`${r.unitId}/${id}`] = (m[`${r.unitId}/${id}`] ?? 0) + 1;
        set({
          duel: {
            rp: rpAfter,
            played: duel.played + 1,
            wins: duel.wins + (r.outcome === 'win' ? 1 : 0),
            draws: duel.draws + (r.outcome === 'draw' ? 1 : 0),
            losses: duel.losses + (r.outcome === 'loss' ? 1 : 0),
            pvpPlayed: duel.pvpPlayed + (r.pvp ? 1 : 0),
            pvpWins: duel.pvpWins + (r.pvp && r.outcome === 'win' ? 1 : 0),
            best: { ...duel.best, [r.unitId]: Math.max(prevBest, r.score) },
          },
          stats: {
            ...stats,
            answered: stats.answered + r.answered,
            correct: stats.correct + r.correct,
            bestCombo: Math.max(stats.bestCombo, r.maxCombo),
          },
          mistakes: m,
          gold: gold + earned,
        });
        return { rpBefore: duel.rp, rpAfter, gold: earned, rankUp: rankIndex(rpAfter) > rankIndex(duel.rp), newBest: r.score > prevBest && prevBest > 0 };
      },

      recordBattle: (r) => {
        const { units, stats, mistakes } = get();
        const stars = (units[r.unitId]?.stars ?? []).slice();
        if (r.won) stars[r.stageIndex] = Math.max(stars[r.stageIndex] ?? 0, r.stars);
        const m = { ...mistakes };
        for (const id of r.wrongItemIds) m[`${r.unitId}/${id}`] = (m[`${r.unitId}/${id}`] ?? 0) + 1;
        set({
          units: { ...units, [r.unitId]: { stars: Array.from({ length: Math.max(stars.length, 5) }, (_, i) => stars[i] ?? 0) } },
          stats: {
            battles: stats.battles + 1,
            wins: stats.wins + (r.won ? 1 : 0),
            answered: stats.answered + r.answered,
            correct: stats.correct + r.correct,
            bestCombo: Math.max(stats.bestCombo, r.maxCombo),
          },
          mistakes: m,
        });
      },

      recordClass: (r) => {
        const { stats, gold } = get();
        const earned = classGold(r.correct, r.place);
        set({
          stats: { ...stats, answered: stats.answered + r.answered, correct: stats.correct + r.correct, bestCombo: Math.max(stats.bestCombo, r.maxCombo) },
          gold: gold + earned,
        });
        return earned;
      },

      recordHomework: (r) => {
        const { stats, gold, mistakes, dropBonus } = get();
        const m = { ...mistakes };
        for (const id of r.wrongItemIds) m[`${r.unitId}/${id}`] = (m[`${r.unitId}/${id}`] ?? 0) + 1;
        set({
          stats: { ...stats, answered: stats.answered + r.answered, correct: stats.correct + r.correct, bestCombo: Math.max(stats.bestCombo, r.maxCombo) },
          mistakes: m,
          gold: gold + r.gold,
          dropBonus: Math.max(dropBonus, r.dropBonus),
        });
      },

      applyRewards: (r) => {
        const { gold, gems } = get();
        set({
          gold: gold + r.gold,
          gems: r.gem && !r.duplicate && !gems.includes(r.gem) ? [...gems, r.gem] : gems,
          dropBonus: 0,
        });
      },

      isStageUnlocked: (unitId, stageIndex) => stageIndex === 0 || (get().units[unitId]?.stars[stageIndex - 1] ?? 0) > 0,

      isOwned: (itemId) => get().owned.includes(itemId),

      buy: (itemId) => {
        const item = getCosmetic(itemId);
        const { gold, owned } = get();
        if (!item || item.reward || owned.includes(itemId) || gold < item.price) return false;
        set({ gold: gold - item.price, owned: [...owned, itemId] });
        return true;
      },

      equip: (slot, itemId) => {
        const item = getCosmetic(itemId);
        if (!item || item.slot !== slot || !get().owned.includes(itemId)) return;
        set({ avatar: { ...get().avatar, [slot]: itemId } });
      },

      summon: () => {
        const { gems, owned, titles, completedSets, gold } = get();
        if (gems.length < 7) return null;
        const rewardItems = COSMETICS.filter((x) => x.reward).map((x) => x.id);
        const newItems = rewardItems.filter((id) => !owned.includes(id));
        const firstTime = newItems.length > 0 || !titles.includes(TITLE_MASTER);
        const bonusGold = firstTime ? 0 : REPEAT_SET_GOLD;
        set({
          gems: [],
          completedSets: completedSets + 1,
          owned: [...owned, ...newItems],
          titles: titles.includes(TITLE_MASTER) ? titles : [...titles, TITLE_MASTER],
          activeTitle: get().activeTitle ?? TITLE_MASTER,
          gold: gold + bonusGold,
        });
        return { firstTime, unlocked: newItems, gold: bonusGold, title: firstTime ? TITLE_MASTER : null };
      },

      setActiveTitle: (t) => set({ activeTitle: t }),
    }),
    {
      name: 'bqe-progress',
      version: 2,
      // Chuyển dữ liệu từ phiên bản cũ (GĐ1 lưu avatar bằng mã màu)
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<ProgressState>;
        if (version < 2) {
          p.avatar = DEFAULT_AVATAR;
          p.owned = FREE_ITEMS;
        }
        return p as ProgressState;
      },
      // Luôn có đủ món miễn phí (kể cả món mới thêm sau này)
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ProgressState>;
        const owned = Array.from(new Set([...(p.owned ?? []), ...FREE_ITEMS]));
        return { ...current, ...p, owned, avatar: { ...DEFAULT_AVATAR, ...(p.avatar ?? {}) }, duel: { ...current.duel, ...(p.duel ?? {}) } };
      },
    },
  ),
);
