// ============================================================
// Tâm trạng nhân vật theo diễn biến trận: biểu cảm khuôn mặt + hành động phụ
//  - Đang trả lời: suy nghĩ → lo lắng khi sắp hết giờ
//  - Vừa trả lời: đúng thì vui, sai thì buồn và gãi đầu
//  - Đạt mốc combo: giơ hai tay hoan hô
// Các hàm đọc được gọi mỗi khung hình, không làm React render lại.
// ============================================================
import { useBattle, type AnswerResult, type RoundAnswer } from '../stores/battle';
import { emoteEvent, useEmotes, type EmoteEvent } from '../stores/emotes';

export type Face = 'neutral' | 'happy' | 'fierce' | 'surprised' | 'sad' | 'cry' | 'think' | 'worried';

export interface Mood {
  face: Face;
  emote: EmoteEvent | null;
}

export const NEUTRAL_MOOD: Mood = { face: 'neutral', emote: null };

/** Đã dùng quá phần này thời gian của câu → lo lắng */
const WORRY_AT = 0.65;
/** Vài trăm ms đầu mới ra câu: mặt bình thường rồi mới suy nghĩ */
const THINK_AFTER_MS = 800;

const newer = (a: EmoteEvent | null, b: EmoteEvent | null) => (!a ? b : !b ? a : a.at >= b.at ? a : b);

function thinkingFace(elapsedMs: number, limitMs: number): Face {
  if (elapsedMs / limitMs > WORRY_AT) return 'worried';
  return elapsedMs > THINK_AFTER_MS ? 'think' : 'neutral';
}

// Hành động tự động sinh ra khi có kết quả mới (so sánh theo đối tượng kết quả)
let seenMine: AnswerResult | null = null;
let autoMine: EmoteEvent | null = null;
let seenOpp: RoundAnswer | null = null;
let autoOpp: EmoteEvent | null = null;

/** Nhân vật của người chơi trong trận (phiêu lưu hoặc solo) */
export function playerMood(): Mood {
  const s = useBattle.getState();
  const r = s.lastResult;
  if (r !== seenMine) {
    seenMine = r;
    // Chờ đòn đánh / trúng đòn diễn xong rồi mới làm hành động
    if (r && !r.correct) autoMine = emoteEvent('oops', 900);
    else if (r && s.comboMilestone) autoMine = emoteEvent('cheer', 750);
  }

  let face: Face = 'neutral';
  if (s.phase === 'question' && !s.paused) face = thinkingFace(performance.now() - s.questionStartedAt, s.qLimitMs);
  else if (s.phase === 'feedback' && r) face = r.correct ? 'happy' : 'sad';
  return { face, emote: newer(autoMine, useEmotes.getState().me) };
}

/** Nhân vật đối thủ khi solo (bot hoặc bạn qua mạng) */
export function oppMood(): Mood {
  const s = useBattle.getState();
  const d = s.duel;
  if (!d) return NEUTRAL_MOOD;
  const r = d.oppResult;
  if (r !== seenOpp) {
    seenOpp = r;
    if (r && !r.correct) autoOpp = emoteEvent('oops', 1000);
  }

  let face: Face = 'neutral';
  if (s.phase === 'question' || (s.phase === 'feedback' && !r)) {
    const now = s.paused ? s.pausedAt : performance.now();
    const elapsed = now - s.questionStartedAt;
    // Đã trả lời xong (chưa lộ đúng / sai) → mặt bình thường chờ kết quả
    const answered = d.remote ? !!d.oppAnswers[d.round] : !!d.plan && elapsed >= d.plan.timeMs;
    if (!answered && !s.paused) face = thinkingFace(elapsed, s.qLimitMs);
  } else if (s.phase === 'feedback' && r) face = r.correct ? 'happy' : 'sad';
  return { face, emote: newer(autoOpp, useEmotes.getState().opp) };
}

/** Ngoài trận (trang chủ, cửa hàng): chỉ có hành động do người chơi bấm */
export function previewMood(): Mood {
  return { face: 'neutral', emote: useEmotes.getState().me };
}
