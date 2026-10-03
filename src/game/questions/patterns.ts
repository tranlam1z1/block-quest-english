// ============================================================
// Sinh câu hỏi MẪU CÂU: chọn câu trả lời, sắp xếp từ, điền từ còn thiếu
// ============================================================
import type { BlankSpec, SentencePattern, Unit } from '../../types/content';
import { shuffle, uid } from '../random';
import { getTypeInfo, type Question, type QuestionType } from './types';

/** Một "biến thể" cụ thể của câu hỏi mẫu câu */
export type PatternVariant =
  | { type: 'pat-response' }
  | { type: 'pat-order'; which: 'q' | 'a' }
  | { type: 'pat-fill'; blank: BlankSpec };

/** Tách nghĩa tiếng Việt "câu hỏi – câu trả lời" */
export function splitVi(vi: string): [string, string] {
  const [q, ...rest] = vi.split(' – ');
  return [q.trim(), rest.join(' – ').trim()];
}

/** Bỏ dấu câu, chữ thường — dùng để so sánh từ */
const norm = (w: string) => w.toLowerCase().replace(/[.,?!]/g, '');

/** Tách câu thành các mảnh từ; dấu câu cuối (. ? !) để riêng */
export function tokenize(sentence: string) {
  const m = sentence.trim().match(/^(.*?)([.?!]*)$/)!;
  return { tokens: m[1].split(/\s+/).filter(Boolean), end: m[2] };
}

const blankWord = (b: BlankSpec) => (typeof b === 'string' ? b : b.w);

/** Viết hoa chữ cái đầu nếu đáp án đúng viết hoa (từ đứng đầu câu) */
function matchCase(word: string, like: string) {
  if (/^[A-Z]/.test(like)) return word.charAt(0).toUpperCase() + word.slice(1);
  if (/^[a-z]/.test(like) && word !== 'I') return word.charAt(0).toLowerCase() + word.slice(1);
  return word;
}

/** Liệt kê mọi biến thể câu hỏi có thể sinh từ 1 mẫu câu, theo dạng câu */
export function patternVariants(p: SentencePattern, type: QuestionType): PatternVariant[] {
  switch (type) {
    case 'pat-response':
      return [{ type }];
    case 'pat-order':
      return (['q', 'a'] as const).filter((w) => tokenize(p[w]).tokens.length >= 3).map((which) => ({ type, which }));
    case 'pat-fill':
      return (p.blanks ?? []).filter((b) => findBlank(p, blankWord(b))).map((blank) => ({ type, blank }));
    default:
      return [];
  }
}

/** Tìm vị trí từ cần đục lỗ trong câu hỏi hoặc câu trả lời */
function findBlank(p: SentencePattern, word: string) {
  const lines = [p.q, p.a];
  for (let li = 0; li < 2; li++) {
    const tokens = lines[li].split(/\s+/);
    const ti = tokens.findIndex((t) => norm(t) === norm(word));
    if (ti >= 0) return { li, ti, token: tokens[ti], tokens };
  }
  return null;
}

function itemOf(p: SentencePattern, en: string) {
  return { id: p.id, en, vi: p.vi, image: p.image ?? null };
}

export function makePatternQuestion(p: SentencePattern, v: PatternVariant, unit: Unit, fallback: SentencePattern[]): Question | null {
  const info = getTypeInfo(v.type);
  const [qVi, aVi] = splitVi(p.vi);
  const base = { id: uid('q'), type: v.type, instruction: info.instruction, difficulty: info.difficulty };

  // --- Chọn câu trả lời phù hợp ---
  if (v.type === 'pat-response') {
    const others = (list: SentencePattern[]) => shuffle(list.filter((o) => o.id !== p.id && norm(o.q) !== norm(p.q) && norm(o.a) !== norm(p.a)).map((o) => o.a));
    const wrong = Array.from(new Set([...others(unit.patterns), ...others(fallback)])).slice(0, 3);
    if (wrong.length < 3) return null;
    const choices = shuffle([p.a, ...wrong]);
    return {
      ...base,
      mode: 'choice',
      prompt: { lines: [p.q], image: p.image ?? undefined, hint: qVi, speak: p.q },
      choices,
      answerIndex: choices.indexOf(p.a),
      answerText: p.a,
      explanation: `Hỏi “${p.q}” (${qVi}) → đáp “${p.a}” (${aVi}).`,
      item: itemOf(p, `${p.q} ${p.a}`),
    };
  }

  // --- Sắp xếp từ thành câu ---
  if (v.type === 'pat-order') {
    const sentence = p[v.which];
    const { tokens, end } = tokenize(sentence);
    if (tokens.length < 3) return null;
    let mixed = shuffle(tokens);
    for (let i = 0; i < 10 && mixed.join(' ') === tokens.join(' '); i++) mixed = shuffle(tokens);
    // Mảnh cuối giữ dấu câu để học sinh thấy câu hoàn chỉnh
    const answerTokens = tokens.slice();
    return {
      ...base,
      mode: 'order',
      prompt: {
        lines: v.which === 'a' ? [p.q] : undefined,
        // Hình gợi ý thường minh họa câu trả lời → chỉ hiện khi sắp xếp câu trả lời
        image: v.which === 'a' ? (p.image ?? undefined) : undefined,
        hint: v.which === 'q' ? qVi : aVi,
      },
      choices: [],
      answerIndex: -1,
      tokens: mixed,
      answerTokens,
      answerText: tokens.join(' ') + end,
      explanation: `Câu đúng: “${sentence}” – ${v.which === 'q' ? qVi : aVi}`,
      item: itemOf(p, sentence),
    };
  }

  // --- Điền từ còn thiếu ---
  if (v.type === 'pat-fill') {
    const word = blankWord(v.blank);
    const found = findBlank(p, word);
    if (!found) return null;
    const answer = found.token.replace(/[.,?!]+$/, '');
    const lines = [p.q, p.a];
    const shown = found.tokens.slice();
    shown[found.ti] = found.token.replace(answer, '___');
    lines[found.li] = shown.join(' ');

    let wrong: string[];
    if (typeof v.blank !== 'string') {
      wrong = v.blank.wrong.slice(0, 3);
    } else {
      // Tự lấy: các từ đơn trong unit + các từ được đục lỗ ở mẫu câu khác, trừ từ đã có trong câu
      const inLine = new Set(found.tokens.map(norm));
      const pool = [
        ...unit.vocab.map((x) => x.en).filter((w) => !w.includes(' ')),
        ...unit.patterns.flatMap((o) => (o.blanks ?? []).map(blankWord)),
      ].filter((w) => norm(w) !== norm(answer) && !inLine.has(norm(w)));
      wrong = shuffle(Array.from(new Set(pool.map(norm)))).slice(0, 3);
    }
    wrong = wrong.map((w) => matchCase(w, answer));
    if (wrong.length < 3 || new Set([answer, ...wrong].map(norm)).size < 4) return null;
    const choices = shuffle([answer, ...wrong]);
    return {
      ...base,
      mode: 'choice',
      prompt: { lines, image: p.image ?? undefined, hint: p.vi },
      choices,
      answerIndex: choices.indexOf(answer),
      answerText: answer,
      explanation: `Từ còn thiếu là “${answer}”: ${[p.q, p.a][found.li]}`,
      item: itemOf(p, [p.q, p.a][found.li]),
    };
  }
  return null;
}
