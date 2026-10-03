// ============================================================
// Các thành phần giao diện dùng chung (phong cách khối, nút to dễ chạm)
// ============================================================
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { playSfx, unlockAudio } from '../services/audio';
import { useSettings } from '../stores/settings';

const COLORS = {
  green: 'bg-green-500 border-green-700 hover:bg-green-400',
  blue: 'bg-sky-500 border-sky-700 hover:bg-sky-400',
  orange: 'bg-orange-500 border-orange-700 hover:bg-orange-400',
  purple: 'bg-violet-500 border-violet-700 hover:bg-violet-400',
  red: 'bg-rose-500 border-rose-700 hover:bg-rose-400',
  yellow: 'bg-amber-400 border-amber-600 hover:bg-amber-300 !text-amber-950',
  gray: 'bg-slate-400 border-slate-600 hover:bg-slate-300',
  white: 'bg-white border-slate-300 hover:bg-slate-50 !text-slate-700 [text-shadow:none]',
};

export type BtnColor = keyof typeof COLORS;

export function Button({
  color = 'green',
  className = '',
  onClick,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { color?: BtnColor; children: ReactNode }) {
  return (
    <button
      {...rest}
      className={`btn-block ${COLORS[color]} ${className}`}
      onClick={(e) => {
        unlockAudio();
        playSfx('click');
        onClick?.(e);
      }}
    >
      {children}
    </button>
  );
}

/** Thanh máu */
export function HpBar({ value, max, color = 'green', label, align = 'left' }: { value: number; max: number; color?: 'green' | 'red'; label: string; align?: 'left' | 'right' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fill = pct > 50 ? (color === 'green' ? 'bg-green-500' : 'bg-rose-500') : pct > 25 ? 'bg-amber-400' : 'bg-red-600';
  return (
    <div className={`w-full ${align === 'right' ? 'text-right' : ''}`}>
      <div className={`flex items-center gap-1 text-xs sm:text-sm font-extrabold text-white drop-shadow ${align === 'right' ? 'justify-end' : ''}`}>
        <span className="truncate">{label}</span>
        <span className="opacity-90">
          {Math.ceil(value)}/{max}
        </span>
      </div>
      <div className="h-4 sm:h-5 rounded-lg bg-slate-800/60 border-2 border-white overflow-hidden">
        <div className={`h-full ${fill} transition-all duration-500 ${align === 'right' ? 'ml-auto' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Hiển thị hình từ vựng: emoji hoặc file ảnh */
export function WordImage({ src, className = '' }: { src: string; className?: string }) {
  const isFile = /^(\/|https?:|data:)/.test(src) || /\.(svg|png|jpe?g|webp|gif)$/i.test(src);
  if (isFile) return <img src={src} alt="" className={`object-contain ${className}`} draggable={false} />;
  return (
    <span className={`inline-flex items-center justify-center leading-none ${className}`} style={{ fontFamily: '"Noto Color Emoji","Segoe UI Emoji","Apple Color Emoji",sans-serif' }}>
      {src}
    </span>
  );
}

/** Thanh trên cùng: nút quay lại + tiêu đề + bật/tắt âm thanh */
export function TopBar({ title, back, right }: { title?: ReactNode; back?: string | (() => void); right?: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="flex items-center gap-2 px-3 pt-3 pb-2 sm:px-4">
      {back !== undefined ? (
        <Button color="white" className="!px-3 !py-2" onClick={() => (typeof back === 'function' ? back() : nav(back))} aria-label="Quay lại" title="Quay lại">
          {/* Mũi tên vẽ bằng SVG để hiển thị đúng trên mọi máy */}
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Button>
      ) : (
        <div className="w-12" />
      )}
      <div className="flex-1 text-center text-lg sm:text-2xl font-extrabold text-sky-900 truncate">{title}</div>
      {right}
      <SoundToggles />
    </div>
  );
}

export function SoundToggles() {
  const { musicOn, sfxOn, toggleMusic, toggleSfx } = useSettings();
  return (
    <div className="flex gap-1">
      <Button color={musicOn ? 'white' : 'gray'} className="!px-2.5 !py-2" onClick={toggleMusic} aria-label={musicOn ? 'Tắt nhạc' : 'Bật nhạc'} title={musicOn ? 'Tắt nhạc' : 'Bật nhạc'}>
        {musicOn ? '🎵' : '🔇'}
      </Button>
      <Button color={sfxOn ? 'white' : 'gray'} className="!px-2.5 !py-2" onClick={toggleSfx} aria-label={sfxOn ? 'Tắt hiệu ứng' : 'Bật hiệu ứng'} title={sfxOn ? 'Tắt hiệu ứng âm thanh' : 'Bật hiệu ứng âm thanh'}>
        {sfxOn ? '🔊' : '🔈'}
      </Button>
    </div>
  );
}

/** Hộp thoại nổi */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose?: () => void; title: ReactNode; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3" onClick={onClose}>
      <div className="panel w-full max-w-lg max-h-[90dvh] overflow-y-auto p-4 sm:p-6 animate-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl sm:text-2xl font-extrabold text-sky-900">{title}</h2>
          {onClose && (
            <Button color="white" className="!px-3 !py-1.5" onClick={onClose} aria-label="Đóng">
              ✕
            </Button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stars({ n, size = 'text-2xl' }: { n: number; size?: string }) {
  return (
    <span className={`${size} tracking-tight`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < n ? '' : 'grayscale opacity-30'}>
          ⭐
        </span>
      ))}
    </span>
  );
}
