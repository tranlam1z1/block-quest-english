// ============================================================
// Viết / đọc "từ đục lỗ" của mẫu câu dưới dạng chữ (dùng trong ô nhập và file Excel)
//   eye; What's(Who's, Is, Yes)
//   → "eye" (game tự chọn đáp án sai) và "What's" với 3 đáp án sai tự ghi
// ============================================================
import type { BlankSpec } from '../types/content';

export function formatBlanks(blanks: BlankSpec[] | undefined) {
  return (blanks ?? []).map((b) => (typeof b === 'string' ? b : `${b.w}(${b.wrong.join(', ')})`)).join('; ');
}

export function parseBlanks(text: string): BlankSpec[] {
  return text
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(.+?)\s*\((.*)\)\s*$/);
      if (!m) return s;
      return { w: m[1].trim(), wrong: m[2].split(',').map((x) => x.trim()).filter(Boolean) };
    });
}
