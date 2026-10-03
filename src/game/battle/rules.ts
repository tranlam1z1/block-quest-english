// ============================================================
// Công thức chiến đấu & tính điểm
// ============================================================

export const PLAYER_MAX_HP = 100;
/** Sát thương cơ bản mỗi câu đúng */
export const BASE_DAMAGE = 20;
/** Hệ số chí mạng khi trả lời nhanh */
export const CRIT_MULTIPLIER = 1.5;
/** Trả lời trong 40% thời gian đầu được tính là "nhanh" → chí mạng */
export const FAST_RATIO = 0.4;

/** Hệ số sát thương theo chuỗi đúng liên tiếp (combo 3, 5, 10) */
export function comboMultiplier(combo: number) {
  if (combo >= 10) return 2;
  if (combo >= 5) return 1.5;
  if (combo >= 3) return 1.2;
  return 1;
}

/** Điểm thưởng combo */
export function comboBonus(combo: number) {
  if (combo >= 10) return 50;
  if (combo >= 5) return 30;
  if (combo >= 3) return 15;
  return 0;
}

/** Mốc combo để hiện thông báo lớn */
export const COMBO_MILESTONES = [3, 5, 10];

export interface HitResult {
  damage: number;
  crit: boolean;
  points: { base: number; speed: number; combo: number; total: number };
}

/**
 * Tính sát thương & điểm cho 1 câu trả lời đúng.
 * Điểm = điểm cơ bản (100) + thưởng tốc độ (tối đa 50) + thưởng combo.
 * @param combo số câu đúng liên tiếp, đã tính cả câu này
 */
export function computeHit(timeMs: number, limitMs: number, combo: number): HitResult {
  const ratio = Math.min(Math.max(timeMs / limitMs, 0), 1);
  const crit = ratio <= FAST_RATIO;
  const damage = Math.round(BASE_DAMAGE * comboMultiplier(combo) * (crit ? CRIT_MULTIPLIER : 1));
  const base = 100;
  const speed = Math.round(50 * (1 - ratio));
  const combo_ = comboBonus(combo);
  return { damage, crit, points: { base, speed, combo: combo_, total: base + speed + combo_ } };
}

/** Số sao khi thắng: dựa vào HP còn lại */
export function starsFor(playerHp: number) {
  const r = playerHp / PLAYER_MAX_HP;
  if (r >= 0.7) return 3;
  if (r >= 0.4) return 2;
  return 1;
}
