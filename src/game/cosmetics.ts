// ============================================================
// Danh mục trang phục / phụ kiện cho nhân vật (mua bằng vàng trong game)
// Món giá 0 là miễn phí, có sẵn. Món "reward" chỉ nhận được khi gom đủ 7 Ngọc Rồng.
// ============================================================

export type Slot = 'skin' | 'hair' | 'hairStyle' | 'shirt' | 'pants' | 'accessory' | 'outfit';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Cosmetic {
  id: string;
  slot: Slot;
  name: string;
  price: number;
  rarity: Rarity;
  /** Màu chính (nếu có) */
  color?: string;
  /** Màu phụ cho họa tiết */
  accent?: string;
  /** Họa tiết áo */
  pattern?: 'plain' | 'stripes' | 'star' | 'heart';
  /** Biểu tượng hiển thị trong cửa hàng */
  icon?: string;
  /** Chỉ nhận được qua phần thưởng 7 Ngọc Rồng */
  reward?: boolean;
}

export const SLOT_LABEL: Record<Slot, { label: string; icon: string }> = {
  skin: { label: 'Màu da', icon: '🧑' },
  hair: { label: 'Màu tóc', icon: '🎨' },
  hairStyle: { label: 'Kiểu tóc', icon: '💇' },
  shirt: { label: 'Áo', icon: '👕' },
  pants: { label: 'Quần', icon: '👖' },
  accessory: { label: 'Phụ kiện', icon: '🎩' },
  outfit: { label: 'Trang phục', icon: '🛡️' },
};

export const RARITY: Record<Rarity, { label: string; cls: string }> = {
  common: { label: 'Thường', cls: 'bg-slate-100 text-slate-500' },
  rare: { label: 'Hiếm', cls: 'bg-sky-100 text-sky-600' },
  epic: { label: 'Sử thi', cls: 'bg-violet-100 text-violet-600' },
  legendary: { label: 'Huyền thoại', cls: 'bg-amber-100 text-amber-600' },
};

const c = (x: Cosmetic) => x;

export const COSMETICS: Cosmetic[] = [
  // Màu da (miễn phí) + nhân vật hiếm
  c({ id: 'skin-1', slot: 'skin', name: 'Da sáng', price: 0, rarity: 'common', color: '#fde0c4' }),
  c({ id: 'skin-2', slot: 'skin', name: 'Da hồng', price: 0, rarity: 'common', color: '#f5c9a0' }),
  c({ id: 'skin-3', slot: 'skin', name: 'Da bánh mật', price: 0, rarity: 'common', color: '#d9a066' }),
  c({ id: 'skin-4', slot: 'skin', name: 'Da nâu', price: 0, rarity: 'common', color: '#a86b3c' }),
  c({ id: 'skin-5', slot: 'skin', name: 'Da nâu đậm', price: 0, rarity: 'common', color: '#6b4226' }),
  c({ id: 'skin-crystal', slot: 'skin', name: 'Hiệp sĩ Pha Lê (nhân vật hiếm)', price: 0, rarity: 'legendary', color: '#bfdbfe', icon: '💎', reward: true }),

  // Màu tóc
  c({ id: 'hair-black', slot: 'hair', name: 'Đen', price: 0, rarity: 'common', color: '#1f1611' }),
  c({ id: 'hair-brown', slot: 'hair', name: 'Nâu', price: 0, rarity: 'common', color: '#5b3415' }),
  c({ id: 'hair-blonde', slot: 'hair', name: 'Vàng', price: 30, rarity: 'common', color: '#eab308' }),
  c({ id: 'hair-red', slot: 'hair', name: 'Cam đỏ', price: 30, rarity: 'common', color: '#c2410c' }),
  c({ id: 'hair-blue', slot: 'hair', name: 'Xanh dương', price: 60, rarity: 'rare', color: '#2563eb' }),
  c({ id: 'hair-pink', slot: 'hair', name: 'Hồng', price: 60, rarity: 'rare', color: '#ec4899' }),
  c({ id: 'hair-green', slot: 'hair', name: 'Xanh lá', price: 60, rarity: 'rare', color: '#16a34a' }),
  c({ id: 'hair-white', slot: 'hair', name: 'Bạch kim', price: 80, rarity: 'rare', color: '#e5e7eb' }),

  // Kiểu tóc
  c({ id: 'style-short', slot: 'hairStyle', name: 'Tóc ngắn', price: 0, rarity: 'common', icon: '👦' }),
  c({ id: 'style-long', slot: 'hairStyle', name: 'Tóc dài', price: 0, rarity: 'common', icon: '👧' }),
  c({ id: 'style-spiky', slot: 'hairStyle', name: 'Tóc dựng', price: 80, rarity: 'rare', icon: '⚡' }),
  c({ id: 'style-bun', slot: 'hairStyle', name: 'Tóc búi', price: 80, rarity: 'rare', icon: '🍡' }),

  // Áo
  c({ id: 'shirt-blue', slot: 'shirt', name: 'Áo xanh', price: 0, rarity: 'common', color: '#3b82f6', pattern: 'plain' }),
  c({ id: 'shirt-red', slot: 'shirt', name: 'Áo đỏ', price: 0, rarity: 'common', color: '#ef4444', pattern: 'plain' }),
  c({ id: 'shirt-green', slot: 'shirt', name: 'Áo xanh lá', price: 30, rarity: 'common', color: '#22c55e', pattern: 'plain' }),
  c({ id: 'shirt-yellow', slot: 'shirt', name: 'Áo vàng', price: 30, rarity: 'common', color: '#facc15', pattern: 'plain' }),
  c({ id: 'shirt-orange', slot: 'shirt', name: 'Áo cam', price: 30, rarity: 'common', color: '#f97316', pattern: 'plain' }),
  c({ id: 'shirt-purple', slot: 'shirt', name: 'Áo tím', price: 40, rarity: 'common', color: '#8b5cf6', pattern: 'plain' }),
  c({ id: 'shirt-pink', slot: 'shirt', name: 'Áo hồng', price: 40, rarity: 'common', color: '#f472b6', pattern: 'plain' }),
  c({ id: 'shirt-black', slot: 'shirt', name: 'Áo đen', price: 60, rarity: 'rare', color: '#1f2937', pattern: 'plain' }),
  c({ id: 'shirt-stripes', slot: 'shirt', name: 'Áo sọc thủy thủ', price: 120, rarity: 'rare', color: '#f8fafc', accent: '#2563eb', pattern: 'stripes' }),
  c({ id: 'shirt-heart', slot: 'shirt', name: 'Áo trái tim', price: 150, rarity: 'epic', color: '#fbcfe8', accent: '#e11d48', pattern: 'heart' }),
  c({ id: 'shirt-star', slot: 'shirt', name: 'Áo siêu anh hùng', price: 200, rarity: 'epic', color: '#dc2626', accent: '#facc15', pattern: 'star' }),

  // Quần
  c({ id: 'pants-navy', slot: 'pants', name: 'Quần xanh đậm', price: 0, rarity: 'common', color: '#1e3a8a' }),
  c({ id: 'pants-black', slot: 'pants', name: 'Quần đen', price: 0, rarity: 'common', color: '#1f2937' }),
  c({ id: 'pants-brown', slot: 'pants', name: 'Quần nâu', price: 20, rarity: 'common', color: '#78350f' }),
  c({ id: 'pants-green', slot: 'pants', name: 'Quần xanh rêu', price: 20, rarity: 'common', color: '#166534' }),
  c({ id: 'pants-white', slot: 'pants', name: 'Quần trắng', price: 40, rarity: 'common', color: '#e5e7eb' }),
  c({ id: 'pants-red', slot: 'pants', name: 'Quần đỏ', price: 40, rarity: 'common', color: '#b91c1c' }),

  // Phụ kiện
  c({ id: 'acc-none', slot: 'accessory', name: 'Không đội', price: 0, rarity: 'common', icon: '🚫' }),
  c({ id: 'acc-cap', slot: 'accessory', name: 'Mũ lưỡi trai', price: 0, rarity: 'common', icon: '🧢' }),
  c({ id: 'acc-headband', slot: 'accessory', name: 'Băng đô', price: 80, rarity: 'common', icon: '🎀' }),
  c({ id: 'acc-glasses', slot: 'accessory', name: 'Kính tròn', price: 100, rarity: 'rare', icon: '👓' }),
  c({ id: 'acc-headphones', slot: 'accessory', name: 'Tai nghe', price: 150, rarity: 'rare', icon: '🎧' }),
  c({ id: 'acc-bunny', slot: 'accessory', name: 'Tai thỏ', price: 180, rarity: 'epic', icon: '🐰' }),
  c({ id: 'acc-wizard', slot: 'accessory', name: 'Mũ phù thủy', price: 250, rarity: 'epic', icon: '🧙' }),
  c({ id: 'acc-crown', slot: 'accessory', name: 'Vương miện', price: 500, rarity: 'legendary', icon: '👑' }),

  // Trang phục đặc biệt
  c({ id: 'outfit-none', slot: 'outfit', name: 'Không mặc', price: 0, rarity: 'common', icon: '🚫' }),
  c({ id: 'outfit-dragon', slot: 'outfit', name: 'Giáp Rồng Huyền Thoại', price: 0, rarity: 'legendary', icon: '🛡️', reward: true }),
];

export type Avatar = Record<Slot, string>;

export const DEFAULT_AVATAR: Avatar = {
  skin: 'skin-2',
  hair: 'hair-black',
  hairStyle: 'style-short',
  shirt: 'shirt-blue',
  pants: 'pants-navy',
  accessory: 'acc-cap',
  outfit: 'outfit-none',
};

/** Các món miễn phí, mặc định đã sở hữu */
export const FREE_ITEMS = COSMETICS.filter((x) => x.price === 0 && !x.reward).map((x) => x.id);

/** Danh hiệu */
export const TITLE_MASTER = 'Bậc thầy tiếng Anh';

export function getCosmetic(id: string) {
  return COSMETICS.find((x) => x.id === id);
}

/** Chuyển avatar (các id) thành thông số để vẽ nhân vật 3D */
export function resolveAvatar(a: Avatar) {
  const pick = (slot: Slot) => {
    const item = getCosmetic(a[slot]);
    return item && item.slot === slot ? item : getCosmetic(DEFAULT_AVATAR[slot])!;
  };
  const shirt = pick('shirt');
  return {
    skin: pick('skin').color!,
    crystal: a.skin === 'skin-crystal',
    hair: pick('hair').color!,
    hairStyle: pick('hairStyle').id as 'style-short' | 'style-long' | 'style-spiky' | 'style-bun',
    shirt: shirt.color!,
    shirtAccent: shirt.accent ?? '#facc15',
    shirtPattern: shirt.pattern ?? 'plain',
    pants: pick('pants').color!,
    accessory: pick('accessory').id,
    outfit: pick('outfit').id,
  };
}

export type ResolvedAvatar = ReturnType<typeof resolveAvatar>;
