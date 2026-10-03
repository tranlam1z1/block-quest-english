// ============================================================
// Solo với máy: đối thủ máy (bot), bậc rank, điểm rank, bảng xếp hạng
// ============================================================
import type { Avatar } from './cosmetics';
import type { MonsterTier } from './monsters';

/** Số câu mỗi trận solo */
export const DUEL_ROUNDS = 10;

export type BotLevel = 'easy' | 'medium' | 'hard';

export interface BotDef {
  level: BotLevel;
  name: string;
  emoji: string;
  label: string;
  /** Tỉ lệ trả lời đúng với câu dễ (câu khó hơn thì giảm dần) */
  accuracy: number;
  /** Thời gian trả lời: tỉ lệ so với thời gian tối đa của câu [nhanh nhất, chậm nhất] */
  speed: [number, number];
  /** Độ khó bộ câu hỏi (dùng lại trọng số theo cấp quái) */
  tier: MonsterTier;
  /** Điểm rank khi thắng / khi thua (số dương = bị trừ) */
  rpWin: number;
  rpLoss: number;
  goldWin: number;
  avatar: Avatar;
}

export const BOTS: BotDef[] = [
  {
    level: 'easy',
    name: 'Bot Gà Con',
    emoji: '🐣',
    label: 'Dễ',
    accuracy: 0.62,
    speed: [0.45, 0.85],
    tier: 'normal',
    rpWin: 15,
    rpLoss: 10,
    goldWin: 15,
    avatar: { skin: 'skin-1', hair: 'hair-blonde', hairStyle: 'style-spiky', shirt: 'shirt-yellow', pants: 'pants-brown', accessory: 'acc-none', outfit: 'outfit-none' },
  },
  {
    level: 'medium',
    name: 'Bot Cáo Lém',
    emoji: '🦊',
    label: 'Vừa',
    accuracy: 0.78,
    speed: [0.3, 0.7],
    tier: 'elite',
    rpWin: 25,
    rpLoss: 6,
    goldWin: 25,
    avatar: { skin: 'skin-3', hair: 'hair-red', hairStyle: 'style-short', shirt: 'shirt-orange', pants: 'pants-white', accessory: 'acc-headphones', outfit: 'outfit-none' },
  },
  {
    level: 'hard',
    name: 'Bot Rồng Thép',
    emoji: '🐲',
    label: 'Khó',
    accuracy: 0.9,
    speed: [0.18, 0.5],
    tier: 'boss',
    rpWin: 35,
    rpLoss: 3,
    goldWin: 40,
    avatar: { skin: 'skin-4', hair: 'hair-white', hairStyle: 'style-spiky', shirt: 'shirt-black', pants: 'pants-red', accessory: 'acc-wizard', outfit: 'outfit-none' },
  },
];

export function getBot(level: string): BotDef | undefined {
  return BOTS.find((b) => b.level === level);
}

/** Mức thưởng / phạt của một trận */
export type Stakes = Pick<BotDef, 'rpWin' | 'rpLoss' | 'goldWin'>;

/** Solo với bạn: thắng người thật được nhiều hơn thắng máy */
export const PVP_STAKES: Stakes = { rpWin: 30, rpLoss: 5, goldWin: 30 };

/** Đối thủ trong trận solo: bot hoặc người chơi khác qua mạng */
export interface Opponent {
  /** Khóa nhận diện (để vẽ lại nhân vật 3D khi đổi đối thủ) */
  key: string;
  name: string;
  emoji: string;
  avatar: Avatar;
  /** Nhãn mức độ (bot) hoặc rank (người) */
  label: string;
  stakes: Stakes;
  /** Có khi đối thủ là máy */
  bot?: BotDef;
}

export function botOpponent(bot: BotDef): Opponent {
  return { key: 'bot-' + bot.level, name: bot.name, emoji: bot.emoji, avatar: bot.avatar, label: `Mức ${bot.label}`, stakes: bot, bot };
}

/** Câu trả lời đã định sẵn của bot cho 1 câu hỏi */
export interface BotAnswer {
  correct: boolean;
  /** Thời điểm bot trả lời (ms kể từ lúc ra câu hỏi) */
  timeMs: number;
}

/** Bot "suy nghĩ": câu càng khó càng dễ sai; khi sai đôi lúc để hết giờ */
export function planBotAnswer(bot: BotDef, difficulty: number, limitMs: number): BotAnswer {
  const acc = Math.max(0.3, bot.accuracy - (difficulty - 1) * 0.06);
  const correct = Math.random() < acc;
  const [lo, hi] = bot.speed;
  let ratio = lo + Math.random() * (hi - lo);
  if (!correct && Math.random() < 0.3) ratio = 1;
  return { correct, timeMs: Math.round(limitMs * ratio) };
}

// ---------------- Bậc rank ----------------

export interface RankDef {
  id: string;
  name: string;
  /** Điểm rank tối thiểu */
  min: number;
  /** Màu nền / chữ của huy hiệu */
  color: string;
  dark: string;
}

export const RANKS: RankDef[] = [
  { id: 'bronze', name: 'Đồng', min: 0, color: '#d97706', dark: '#78350f' },
  { id: 'silver', name: 'Bạc', min: 100, color: '#94a3b8', dark: '#334155' },
  { id: 'gold', name: 'Vàng', min: 250, color: '#facc15', dark: '#854d0e' },
  { id: 'platinum', name: 'Bạch Kim', min: 450, color: '#2dd4bf', dark: '#115e59' },
  { id: 'diamond', name: 'Kim Cương', min: 700, color: '#60a5fa', dark: '#1e3a8a' },
  { id: 'master', name: 'Cao Thủ', min: 1000, color: '#c084fc', dark: '#581c87' },
];

export function rankIndex(rp: number) {
  let i = 0;
  while (i + 1 < RANKS.length && rp >= RANKS[i + 1].min) i++;
  return i;
}

export function rankOf(rp: number) {
  return RANKS[rankIndex(rp)];
}

/** Tiến độ tới bậc kế tiếp (0–1); bậc cao nhất trả về null */
export function rankProgress(rp: number) {
  const i = rankIndex(rp);
  const next = RANKS[i + 1];
  if (!next) return null;
  const cur = RANKS[i];
  return { next, pct: (rp - cur.min) / (next.min - cur.min), need: next.min - rp };
}

export type DuelOutcome = 'win' | 'draw' | 'loss';

/** Thưởng phạt điểm rank sau trận. Thua không bao giờ bị rớt xuống bậc thấp hơn. */
export function rpChange(rp: number, bot: Stakes, outcome: DuelOutcome, perfect: boolean) {
  if (outcome === 'win') return bot.rpWin + (perfect ? 10 : 0);
  if (outcome === 'draw') return Math.round(bot.rpWin / 3);
  const floor = rankOf(rp).min;
  return -Math.min(bot.rpLoss, rp - floor);
}

export function goldFor(bot: Stakes, outcome: DuelOutcome) {
  if (outcome === 'win') return bot.goldWin;
  if (outcome === 'draw') return Math.round(bot.goldWin / 3);
  return 0;
}

// ---------------- Bảng xếp hạng ----------------

export interface Rival {
  name: string;
  emoji: string;
  rp: number;
}

/** Các đối thủ máy trong bảng xếp hạng trên máy này (bạn bè thật sẽ có ở GĐ4) */
export const RIVALS: Rival[] = [
  { name: 'Bot Sâu Róm', emoji: '🐛', rp: 30 },
  { name: 'Bot Gà Con', emoji: '🐣', rp: 75 },
  { name: 'Bot Mèo Mướp', emoji: '🐱', rp: 130 },
  { name: 'Bot Ếch Xanh', emoji: '🐸', rp: 195 },
  { name: 'Bot Cáo Lém', emoji: '🦊', rp: 270 },
  { name: 'Bot Gấu Trúc', emoji: '🐼', rp: 360 },
  { name: 'Bot Cú Mèo', emoji: '🦉', rp: 480 },
  { name: 'Bot Hổ Vằn', emoji: '🐯', rp: 600 },
  { name: 'Bot Kỳ Lân', emoji: '🦄', rp: 740 },
  { name: 'Bot Rồng Thép', emoji: '🐲', rp: 900 },
  { name: 'Bot Siêu Trí Tuệ', emoji: '🧠', rp: 1150 },
];
