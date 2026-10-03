// ============================================================
// Phần thưởng sau trận: vàng + cơ hội rơi Ngọc Rồng
// ============================================================
import { GEMS, type GemId } from './gems';
import type { MonsterTier } from './monsters';

/** Tỉ lệ rơi ngọc theo cấp quái */
export const DROP_RATE: Record<MonsterTier, number> = {
  normal: 0.1,
  elite: 0.25,
  boss: 0.6,
};

/** Vàng cơ bản khi thắng, cộng thêm theo số sao */
const GOLD_BY_TIER: Record<MonsterTier, number> = { normal: 10, elite: 20, boss: 40 };
const GOLD_PER_STAR = 5;
/** Ngọc trùng đổi thành bao nhiêu vàng */
export const DUPLICATE_GEM_GOLD = 50;
/** Thưởng vàng khi gom đủ 7 viên lần thứ 2 trở đi */
export const REPEAT_SET_GOLD = 500;

/** Vàng khi luyện tập trên lớp: 3 vàng mỗi câu đúng + thưởng top 3 */
export function classGold(correct: number, place: number) {
  return correct * 3 + (place === 1 ? 20 : place === 2 ? 15 : place === 3 ? 10 : 0);
}

/** Bài tập về nhà đạt từ mức này (thang 10) → tăng tỉ lệ rơi ngọc cho trận thắng kế tiếp */
export const HOMEWORK_BONUS_GRADE = 9;
export const HOMEWORK_DROP_BONUS = 0.2;

/** Vàng khi nộp bài tập về nhà lần đầu: 3 vàng mỗi câu đúng + thưởng điểm cao */
export function homeworkGold(correct: number, grade: number) {
  return correct * 3 + (grade >= 9 ? 20 : grade >= 7 ? 10 : 0);
}

export interface BattleRewards {
  gold: number;
  /** Ngọc rơi ra (null = không rơi) */
  gem: GemId | null;
  /** Ngọc đã có → đổi thành vàng */
  duplicate: boolean;
  /** Tỉ lệ rơi đã áp dụng (để hiển thị) */
  dropChance: number;
}

/**
 * Tung xúc xắc phần thưởng khi THẮNG trận.
 * @param bonus cộng thêm vào tỉ lệ rơi (VD: làm bài tập về nhà đạt ≥ 9 điểm)
 */
export function rollRewards(tier: MonsterTier, stars: number, ownedGems: GemId[], bonus = 0): BattleRewards {
  let gold = GOLD_BY_TIER[tier] + stars * GOLD_PER_STAR;
  const dropChance = Math.min(1, DROP_RATE[tier] + bonus);
  let gem: GemId | null = null;
  let duplicate = false;
  if (Math.random() < dropChance) {
    gem = GEMS[Math.floor(Math.random() * GEMS.length)].id;
    if (ownedGems.includes(gem)) {
      duplicate = true;
      gold += DUPLICATE_GEM_GOLD;
    }
  }
  return { gold, gem, duplicate, dropChance };
}
