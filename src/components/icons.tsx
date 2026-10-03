// ============================================================
// Biểu tượng vẽ bằng SVG (hiển thị giống nhau trên mọi máy, không phụ thuộc emoji)
// ============================================================
import { getGem, type GemId } from '../game/gems';
import { useProgress } from '../stores/progress';

/** Đồng vàng */
export function Coin({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="#f59e0b" />
      <rect x="5" y="5" width="14" height="14" rx="4" fill="#fcd34d" />
      <rect x="10.5" y="7" width="3" height="10" rx="1" fill="#d97706" />
      <rect x="6.5" y="6.5" width="4" height="2" rx="1" fill="#fff" opacity=".7" />
    </svg>
  );
}

/** Hiển thị số vàng hiện có */
export function GoldBadge({ className = '' }: { className?: string }) {
  const gold = useProgress((s) => s.gold);
  return (
    <div className={`flex items-center gap-1 rounded-xl bg-white/90 border-b-4 border-amber-300 px-2.5 py-1.5 font-extrabold text-amber-600 ${className}`} title="Vàng">
      <Coin />
      <span className="tabular-nums">{gold}</span>
    </div>
  );
}

/**
 * Viên Ngọc Rồng dạng khối pha lê (nhìn nghiêng).
 * owned = false → hiện bóng xám dấu "?"
 */
export function GemIcon({ gem, owned = true, className = 'h-14 w-14', glow = false }: { gem: GemId; owned?: boolean; className?: string; glow?: boolean }) {
  const g = getGem(gem);
  if (!owned) {
    return (
      <svg viewBox="0 0 64 64" className={className} aria-label="Chưa có">
        <path d="M32 4 L58 18 L58 46 L32 60 L6 46 L6 18 Z" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="3" />
        <text x="32" y="42" textAnchor="middle" fontSize="26" fontWeight="900" fill="#94a3b8" fontFamily="Arial Black, Arial">?</text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" className={className} aria-label={g.name} style={glow ? { filter: `drop-shadow(0 0 8px ${g.color})` } : undefined}>
      {/* 3 mặt của khối lập phương nhìn chéo */}
      <path d="M32 4 L58 18 L32 32 L6 18 Z" fill={g.light} />
      <path d="M6 18 L32 32 L32 60 L6 46 Z" fill={g.color} />
      <path d="M58 18 L58 46 L32 60 L32 32 Z" fill={g.dark} />
      <path d="M32 4 L58 18 L58 46 L32 60 L6 46 L6 18 Z" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="2" strokeLinejoin="round" />
      <path d="M14 22 L22 26 L22 34" fill="none" stroke="#fff" strokeOpacity=".8" strokeWidth="3" strokeLinecap="round" />
      <ElementMark gem={gem} />
    </svg>
  );
}

/** Ký hiệu nguyên tố nhỏ trên mặt phải viên ngọc */
function ElementMark({ gem }: { gem: GemId }) {
  const common = { fill: '#fff', opacity: 0.9 };
  switch (gem) {
    case 'fire':
      return <path d="M45 50 C38 46 40 38 45 33 C45 38 50 39 50 44 C50 47 48 49 45 50 Z" {...common} />;
    case 'water':
      return <path d="M45 32 C48 38 51 41 51 44 A6 6 0 0 1 39 44 C39 41 42 38 45 32 Z" {...common} />;
    case 'wind':
      return <path d="M38 38 H50 M38 44 H48 M40 50 H46" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity={0.9} />;
    case 'earth':
      return <path d="M37 50 L43 38 L46 43 L48 40 L53 50 Z" {...common} />;
    case 'thunder':
      return <path d="M47 32 L39 44 H45 L42 54 L51 40 H45 Z" {...common} />;
    case 'ice':
      return <path d="M45 33 V53 M37 38 L53 48 M53 38 L37 48" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity={0.9} />;
    case 'light':
      return <path d="M45 33 L47 41 L54 43 L47 45 L45 53 L43 45 L36 43 L43 41 Z" {...common} />;
  }
}
