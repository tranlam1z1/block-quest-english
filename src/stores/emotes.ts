// ============================================================
// Hành động biểu cảm của nhân vật (vẫy tay, cười, khóc…)
//  - 'me': nhân vật của mình (trang chủ, cửa hàng, nút biểu cảm khi solo với bạn)
//  - 'opp': nhân vật đối thủ (nhận qua mạng khi solo với bạn)
// ============================================================
import { create } from 'zustand';

export type EmoteKind = 'wave' | 'laugh' | 'cheer' | 'cry' | 'dance' | 'oops';

export interface EmoteEvent {
  id: number;
  kind: EmoteKind;
  /** Thời điểm bắt đầu (performance.now) — có thể ở tương lai để chờ đòn đánh xong */
  at: number;
}

/** Thời lượng mỗi hành động (giây) */
export const EMOTE_SEC: Record<EmoteKind, number> = {
  wave: 1.6,
  laugh: 1.6,
  cheer: 1.4,
  cry: 2,
  dance: 2.2,
  oops: 1.8,
};

/** Các nút biểu cảm khi solo với bạn */
export const PVP_EMOTES: { kind: EmoteKind; emoji: string; label: string }[] = [
  { kind: 'wave', emoji: '👋', label: 'Chào' },
  { kind: 'laugh', emoji: '😄', label: 'Cười' },
  { kind: 'cheer', emoji: '🎉', label: 'Hoan hô' },
  { kind: 'dance', emoji: '💃', label: 'Nhảy' },
  { kind: 'cry', emoji: '😢', label: 'Khóc' },
];

export const isEmoteKind = (k: unknown): k is EmoteKind => typeof k === 'string' && k in EMOTE_SEC;

let counter = 0;
export const emoteEvent = (kind: EmoteKind, delayMs = 0): EmoteEvent => ({ id: ++counter, kind, at: performance.now() + delayMs });

interface EmoteState {
  me: EmoteEvent | null;
  opp: EmoteEvent | null;
}

export const useEmotes = create<EmoteState>()(() => ({ me: null, opp: null }));

export function playEmote(side: 'me' | 'opp', kind: EmoteKind, delayMs = 0) {
  useEmotes.setState({ [side]: emoteEvent(kind, delayMs) });
}

/** Hành động đang diễn ra (hoặc sắp diễn ra) của event, null nếu đã xong */
export function activeEmote(e: EmoteEvent | null, now = performance.now()): EmoteEvent | null {
  return e && now - e.at < EMOTE_SEC[e.kind] * 1000 ? e : null;
}
