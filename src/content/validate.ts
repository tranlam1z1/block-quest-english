// ============================================================
// Kiểm tra 1 unit trước khi lưu (giáo viên sửa / nhập Excel).
// Đếm số câu hỏi bằng chính bộ sinh câu hỏi của game → unit qua kiểm tra chắc chắn chơi được.
// ============================================================
import type { SentencePattern, Unit, VocabItem } from '../types/content';
import { getGrade } from './index';
import { canMake, makeVocabQuestion } from '../game/questions/generators';
import { makePatternQuestion, patternVariants } from '../game/questions/patterns';
import { QUESTION_TYPES } from '../game/questions/types';

export const MIN_QUESTIONS = 20;
export const MIN_VOCAB = 4;

export interface Issue {
  level: 'error' | 'warn';
  msg: string;
}

export interface UnitCheck {
  issues: Issue[];
  vocabQuestions: number;
  patternQuestions: number;
  total: number;
  ok: boolean;
}

/** Thử sinh câu hỏi vài lần (đáp án nhiễu chọn ngẫu nhiên) */
function tryMake(make: () => unknown, times = 3) {
  for (let i = 0; i < times; i++) if (make()) return true;
  return false;
}

export function checkUnit(unit: Unit): UnitCheck {
  const issues: Issue[] = [];
  const err = (msg: string) => issues.push({ level: 'error', msg });
  const warn = (msg: string) => issues.push({ level: 'warn', msg });

  if (!unit.title.trim()) err('Chưa có tên unit (tiếng Anh).');
  if (!unit.titleVi.trim()) warn('Chưa có tên unit tiếng Việt.');
  if (!Number.isInteger(unit.number) || unit.number < 1) err('Số unit phải là số nguyên ≥ 1.');

  // Từ vựng
  const seen = new Map<string, number>();
  const imgs = new Map<string, string>();
  unit.vocab.forEach((v, i) => {
    const row = `Từ ${i + 1}`;
    if (!v.en.trim() || !v.vi.trim()) err(`${row}: cần điền đủ tiếng Anh và tiếng Việt.`);
    const key = v.en.trim().toLowerCase();
    if (key && seen.has(key)) err(`${row}: từ "${v.en}" bị trùng với từ ${seen.get(key)! + 1}.`);
    else seen.set(key, i);
    if (v.image) {
      if (imgs.has(v.image)) err(`${row}: hình ${v.image} đã dùng cho từ "${imgs.get(v.image)}" (mỗi từ cần 1 hình riêng).`);
      else imgs.set(v.image, v.en);
    }
  });
  if (unit.vocab.length < MIN_VOCAB) err(`Cần ít nhất ${MIN_VOCAB} từ vựng (để có đủ 3 đáp án sai cho mỗi câu).`);
  const noImg = unit.vocab.filter((v) => !v.image).length;
  if (noImg && unit.vocab.length) warn(`${noImg} từ chưa có hình nên không dùng cho dạng "Nhìn hình".`);

  // Mẫu câu
  unit.patterns.forEach((p, i) => {
    const row = `Mẫu câu ${i + 1}`;
    if (!p.q.trim() || !p.a.trim()) err(`${row}: cần điền đủ câu hỏi và câu trả lời.`);
    if (!p.vi.includes(' – ')) err(`${row}: nghĩa tiếng Việt phải có dạng "nghĩa câu hỏi – nghĩa câu trả lời" (dấu gạch dài – có cách 2 bên).`);
    for (const b of p.blanks ?? []) {
      const w = typeof b === 'string' ? b : b.w;
      const found = [p.q, p.a].some((s) => s.split(/\s+/).some((t) => t.toLowerCase().replace(/[.,?!]/g, '') === w.toLowerCase()));
      if (!found) err(`${row}: không thấy từ "${w}" trong câu để đục lỗ.`);
      if (typeof b !== 'string' && b.wrong.filter((x) => x.trim()).length < 3) err(`${row}: từ đục lỗ "${w}" cần 3 đáp án sai.`);
    }
  });
  if (unit.patterns.length > 0 && unit.patterns.length < 4) warn('Nên có ít nhất 4 mẫu câu để dạng "Chọn câu trả lời phù hợp" có đủ đáp án.');

  // Đếm số câu hỏi sinh được thật
  const others = (getGrade(unit.bookId, unit.gradeId)?.units ?? []).filter((u) => u.id !== unit.id);
  const fbVocab: VocabItem[] = others.flatMap((u) => u.vocab);
  const fbPatterns: SentencePattern[] = others.flatMap((u) => u.patterns);
  let vocabQuestions = 0;
  let patternQuestions = 0;
  for (const t of QUESTION_TYPES) {
    if (t.category === 'vocab') {
      for (const v of unit.vocab) if (v.en.trim() && v.vi.trim() && canMake(t.id, v) && tryMake(() => makeVocabQuestion(t.id, v, unit.vocab, { fallback: fbVocab }))) vocabQuestions++;
    } else {
      for (const p of unit.patterns) for (const variant of patternVariants(p, t.id)) if (tryMake(() => makePatternQuestion(p, variant, unit, fbPatterns))) patternQuestions++;
    }
  }
  const total = vocabQuestions + patternQuestions;
  if (total < MIN_QUESTIONS) err(`Unit mới sinh được ${total} câu hỏi, cần ít nhất ${MIN_QUESTIONS}. Hãy thêm từ vựng hoặc mẫu câu.`);

  return { issues, vocabQuestions, patternQuestions, total, ok: !issues.some((x) => x.level === 'error') };
}

/** Tạo id ngắn từ chữ (VD "Good morning" → "good-morning") */
export function slug(s: string) {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'x'
  );
}

/** Gán id cho từ vựng / mẫu câu: id từ = slug(tiếng Anh), không trùng nhau */
export function assignIds(unit: Unit): Unit {
  const used = new Set<string>();
  const vocab = unit.vocab.map((v) => {
    let id = v.id || slug(v.en);
    for (let k = 2; used.has(id); k++) id = `${slug(v.en)}-${k}`;
    used.add(id);
    return { ...v, id };
  });
  const patterns = unit.patterns.map((p, i) => ({ ...p, id: `p${i + 1}` }));
  return { ...unit, vocab, patterns };
}

/** Đổi "-" thường thành "–" trong nghĩa mẫu câu nếu giáo viên gõ "hỏi - đáp" */
export function fixDash(vi: string) {
  return vi.includes(' – ') ? vi : vi.replace(/\s+[-—]\s+/, ' – ');
}
