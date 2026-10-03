// ============================================================
// Chọn đáp án nhiễu: lấy từ các từ khác trong cùng unit
// ============================================================
import type { VocabItem } from '../../types/content';
import { shuffle } from '../random';

/** Đo độ "giống nhau" giữa 2 từ — dùng để Boss ra đáp án nhiễu khó hơn */
function similarity(a: string, b: string) {
  let score = 0;
  if (a[0]?.toLowerCase() === b[0]?.toLowerCase()) score += 2;
  score -= Math.abs(a.length - b.length) * 0.3;
  if (a.slice(-2) === b.slice(-2)) score += 1;
  return score;
}

/**
 * Chọn `count` đáp án nhiễu cho `item`.
 * - Không trùng chữ với đáp án đúng, không trùng nhau.
 * - Không lấy từ cùng nhóm đồng nghĩa (VD hello / hi).
 * - hard = true: ưu tiên từ na ná đáp án đúng.
 * - Nếu unit không đủ từ, lấy thêm từ `fallback` (các unit khác cùng lớp).
 */
export function pickDistractors(
  item: VocabItem,
  pool: VocabItem[],
  key: 'en' | 'vi',
  count = 3,
  hard = false,
  fallback: VocabItem[] = [],
): string[] | null {
  const target = item[key].trim().toLowerCase();
  const isOk = (o: VocabItem) =>
    o.id !== item.id && !(item.group && o.group === item.group) && o[key].trim().toLowerCase() !== target;

  const pickFrom = (list: VocabItem[], already: string[]) => {
    let candidates = shuffle(list.filter(isOk));
    if (hard) candidates = candidates.sort((a, b) => similarity(b[key], item[key]) - similarity(a[key], item[key]));
    const out: string[] = [];
    for (const c of candidates) {
      const v = c[key];
      const norm = v.trim().toLowerCase();
      if ([...already, ...out].some((x) => x.trim().toLowerCase() === norm)) continue;
      out.push(v);
      if (already.length + out.length >= count) break;
    }
    return out;
  };

  let result = pickFrom(pool, []);
  if (result.length < count && fallback.length) result = result.concat(pickFrom(fallback, result));
  if (result.length < count) return null;
  return result.slice(0, count);
}
