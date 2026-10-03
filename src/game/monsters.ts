// ============================================================
// Danh sách quái vật (thiết kế gốc) và các màn chơi trong 1 unit
// ============================================================

export type MonsterKind = 'slime' | 'pumpkin' | 'mushroom' | 'robot' | 'dragon';
export type MonsterTier = 'normal' | 'elite' | 'boss';

export interface MonsterDef {
  kind: MonsterKind;
  name: string;
  emoji: string;
  tier: MonsterTier;
  maxHp: number;
  /** Sát thương quái gây ra khi người chơi trả lời sai */
  attack: number;
  /** Màu chính / màu phụ cho mô hình 3D */
  colors: { main: string; accent: string };
}

export const TIER_LABEL: Record<MonsterTier, string> = {
  normal: 'Quái thường',
  elite: 'Quái tinh anh',
  boss: 'BOSS',
};

// Mẫu quái thường — mỗi unit xoay vòng thứ tự để đỡ nhàm
const NORMALS: Omit<MonsterDef, 'tier' | 'maxHp' | 'attack'>[] = [
  { kind: 'slime', name: 'Slime Khối', emoji: '🟩', colors: { main: '#4ade80', accent: '#16a34a' } },
  { kind: 'pumpkin', name: 'Ma Bí Ngô', emoji: '🎃', colors: { main: '#fb923c', accent: '#15803d' } },
  { kind: 'mushroom', name: 'Nấm Nhún Nhảy', emoji: '🍄', colors: { main: '#ef4444', accent: '#fef3c7' } },
];

const ELITE: Omit<MonsterDef, 'tier' | 'maxHp' | 'attack'> = {
  kind: 'robot',
  name: 'Robot Đá',
  emoji: '🤖',
  colors: { main: '#94a3b8', accent: '#38bdf8' },
};

const BOSS: Omit<MonsterDef, 'tier' | 'maxHp' | 'attack'> = {
  kind: 'dragon',
  name: 'Rồng Gỗ',
  emoji: '🐉',
  colors: { main: '#a16207', accent: '#84cc16' },
};

// Màu biến thể theo unit để mỗi unit trông khác nhau một chút
const SLIME_TINTS = ['#4ade80', '#60a5fa', '#f472b6', '#facc15', '#a78bfa'];

export interface Stage {
  index: number;
  monster: MonsterDef;
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** 5 màn mỗi unit: 3 quái thường → 1 quái tinh anh → 1 Boss. Càng về sau HP càng nhiều. */
export function getStages(unitId: string): Stage[] {
  const h = hash(unitId);
  const rot = h % NORMALS.length;
  const normals = [0, 1, 2].map((i) => NORMALS[(i + rot) % NORMALS.length]);
  const tint = SLIME_TINTS[h % SLIME_TINTS.length];

  const list: MonsterDef[] = [
    ...normals.map((m, i) => ({
      ...m,
      colors: m.kind === 'slime' ? { main: tint, accent: m.colors.accent } : m.colors,
      tier: 'normal' as const,
      // ~5–7 câu đúng để hạ quái thường
      maxHp: 100 + i * 20,
      attack: 12 + i * 2,
    })),
    { ...ELITE, tier: 'elite', maxHp: 180, attack: 18 },
    { ...BOSS, tier: 'boss', maxHp: 250, attack: 22 },
  ];
  return list.map((monster, index) => ({ index, monster }));
}
