// ============================================================
// Sinh 1 câu hỏi từ vựng cho 1 từ + 1 dạng câu
// ============================================================
import type { VocabItem } from '../../types/content';
import { shuffle, uid } from '../random';
import { pickDistractors } from './distractors';
import { getTypeInfo, type Question, type QuestionType } from './types';

/** Từ này có dùng được cho dạng câu này không */
export function canMake(type: QuestionType, item: VocabItem) {
  const info = getTypeInfo(type);
  if (info.category !== 'vocab') return false;
  if (info.needsImage && !item.image) return false;
  return true;
}

export function makeVocabQuestion(
  type: QuestionType,
  item: VocabItem,
  pool: VocabItem[],
  opts: { hard?: boolean; fallback?: VocabItem[] } = {},
): Question | null {
  if (!canMake(type, item)) return null;
  const info = getTypeInfo(type);
  const key = info.answerLang;
  const distractors = pickDistractors(item, pool, key, 3, opts.hard, opts.fallback);
  if (!distractors) return null;

  const correct = item[key];
  const choices = shuffle([correct, ...distractors]);

  // Phần đề bài theo từng dạng
  let prompt: Question['prompt'];
  switch (type) {
    case 'img-vi':
    case 'img-en':
      prompt = { image: item.image! };
      break;
    case 'listen-vi':
    case 'listen-en':
      prompt = { speak: item.en, audio: item.audio };
      break;
    case 'en-vi':
      prompt = { text: item.en, speak: item.en, audio: item.audio };
      break;
    case 'vi-en':
      prompt = { text: item.vi };
      break;
    default:
      return null;
  }

  const explanation =
    type === 'listen-vi' || type === 'listen-en'
      ? `Từ con vừa nghe là “${item.en}”, nghĩa là “${item.vi}”.`
      : `“${item.en}” nghĩa là “${item.vi}”.`;

  return {
    id: uid('q'),
    type,
    mode: 'choice',
    instruction: info.instruction,
    prompt,
    choices,
    answerIndex: choices.indexOf(correct),
    answerText: correct,
    explanation,
    item: { id: item.id, en: item.en, vi: item.vi, image: item.image, audio: item.audio },
    difficulty: info.difficulty,
  };
}
