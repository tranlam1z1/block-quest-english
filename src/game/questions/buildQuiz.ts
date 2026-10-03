// ============================================================
// Bộ đề cho 1 trận: trộn từ vựng / mẫu câu × dạng câu hỏi, độ khó theo cấp quái
// ============================================================
import type { SentencePattern, Unit, VocabItem } from '../../types/content';
import { getGrade } from '../../content';
import type { MonsterTier } from '../monsters';
import { weightedShuffle } from '../random';
import { canMake, makeVocabQuestion } from './generators';
import { makePatternQuestion, patternVariants, type PatternVariant } from './patterns';
import { getTypeInfo, QUESTION_TYPES, type Question, type QuestionType } from './types';

/** Trọng số theo độ khó cho từng cấp quái: quái càng mạnh càng hay ra câu khó */
const TIER_WEIGHTS: Record<MonsterTier, Record<1 | 2 | 3, number>> = {
  normal: { 1: 4, 2: 2, 3: 1 },
  elite: { 1: 2, 2: 3, 3: 3 },
  boss: { 1: 1, 2: 3, 3: 5 },
};

/** Tỉ lệ câu mẫu câu trong trận khi bật cả 2 nhóm */
const PATTERN_SHARE = 0.35;

type Entry =
  | { kind: 'vocab'; key: string; type: QuestionType; item: VocabItem }
  | { kind: 'pattern'; key: string; type: QuestionType; pattern: SentencePattern; variant: PatternVariant };

/** Liệt kê mọi cặp (nội dung, dạng câu) hợp lệ của unit */
function listEntries(unit: Unit, types: QuestionType[]): { vocab: Entry[]; pattern: Entry[] } {
  const vocab: Entry[] = [];
  const pattern: Entry[] = [];
  for (const type of types) {
    if (getTypeInfo(type).category === 'vocab') {
      for (const item of unit.vocab) if (canMake(type, item)) vocab.push({ kind: 'vocab', key: item.id, type, item });
    } else {
      for (const p of unit.patterns) for (const variant of patternVariants(p, type)) pattern.push({ kind: 'pattern', key: 'p:' + p.id, type, pattern: p, variant });
    }
  }
  return { vocab, pattern };
}

export class QuestionDeck {
  private queues: { vocab: Entry[]; pattern: Entry[] } = { vocab: [], pattern: [] };
  private lastKey: string | null = null;
  private readonly fallbackVocab: VocabItem[];
  private readonly fallbackPatterns: SentencePattern[];
  private readonly types: QuestionType[];
  /** true nếu các dạng đã chọn không dùng được với unit này và phải dùng tất cả dạng */
  readonly usedFallbackTypes: boolean;

  constructor(
    private readonly unit: Unit,
    enabledTypes: QuestionType[],
    private readonly tier: MonsterTier,
    audioAvailable: boolean,
  ) {
    // Nội dung các unit khác cùng lớp — dùng khi unit quá ít để làm đáp án nhiễu
    const others = (getGrade(unit.bookId, unit.gradeId)?.units ?? []).filter((u) => u.id !== unit.id);
    this.fallbackVocab = others.flatMap((u) => u.vocab);
    this.fallbackPatterns = others.flatMap((u) => u.patterns);

    const usable = (list: QuestionType[]) => {
      const ok = list.filter((t) => audioAvailable || !getTypeInfo(t).needsAudio);
      return ok.filter((t) => {
        const e = listEntries(unit, [t]);
        return e.vocab.length + e.pattern.length > 0;
      });
    };
    let types = usable(enabledTypes);
    this.usedFallbackTypes = types.length === 0;
    if (types.length === 0) types = usable(QUESTION_TYPES.map((t) => t.id));
    this.types = types;
  }

  /** Trộn lại hàng đợi của 1 nhóm, tránh 2 câu liền nhau hỏi cùng nội dung */
  private refill(kind: 'vocab' | 'pattern') {
    const w = TIER_WEIGHTS[this.tier];
    const ordered = weightedShuffle(listEntries(this.unit, this.types)[kind], (e) => w[getTypeInfo(e.type).difficulty]);
    for (let i = 1; i < ordered.length; i++) {
      if (ordered[i].key === ordered[i - 1].key) {
        const j = ordered.findIndex((e, k) => k > i && e.key !== ordered[i - 1].key);
        if (j > 0) [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
      }
    }
    this.queues[kind] = ordered;
  }

  private hasKind(kind: 'vocab' | 'pattern') {
    return this.types.some((t) => getTypeInfo(t).category === kind);
  }

  /** Lấy câu hỏi tiếp theo (hết thì tự trộn lại) */
  next(): Question {
    for (let attempt = 0; attempt < 300; attempt++) {
      const both = this.hasKind('vocab') && this.hasKind('pattern');
      const kind: 'vocab' | 'pattern' = both ? (Math.random() < PATTERN_SHARE ? 'pattern' : 'vocab') : this.hasKind('pattern') ? 'pattern' : 'vocab';
      if (this.queues[kind].length === 0) this.refill(kind);
      const q = this.queues[kind];
      const e = q.shift();
      if (!e) continue;
      if (e.key === this.lastKey && q.length > 0) {
        q.push(e);
        continue;
      }
      const question =
        e.kind === 'vocab'
          ? makeVocabQuestion(e.type, e.item, this.unit.vocab, { hard: this.tier === 'boss', fallback: this.fallbackVocab })
          : makePatternQuestion(e.pattern, e.variant, this.unit, this.fallbackPatterns);
      if (question) {
        this.lastKey = e.key;
        return question;
      }
    }
    throw new Error('Không sinh được câu hỏi cho unit ' + this.unit.id);
  }

  /** Tổng số câu hỏi khác nhau có thể sinh ra từ unit này */
  static countPossible(unit: Unit, types: QuestionType[] = QUESTION_TYPES.map((t) => t.id)) {
    const e = listEntries(unit, types);
    return e.vocab.length + e.pattern.length;
  }
}
