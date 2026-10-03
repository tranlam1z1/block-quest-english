// ============================================================
// 7 viên Ngọc Rồng (thiết kế gốc): khối pha lê lập phương, mỗi viên 1 nguyên tố
// ============================================================

export type GemId = 'fire' | 'water' | 'wind' | 'earth' | 'thunder' | 'ice' | 'light';

export interface GemDef {
  id: GemId;
  name: string;
  element: string;
  icon: string;
  /** Màu chính / màu sáng / màu tối của viên ngọc */
  color: string;
  light: string;
  dark: string;
}

export const GEMS: GemDef[] = [
  { id: 'fire', name: 'Ngọc Rồng Lửa', element: 'Lửa', icon: '🔥', color: '#ef4444', light: '#fca5a5', dark: '#991b1b' },
  { id: 'water', name: 'Ngọc Rồng Nước', element: 'Nước', icon: '💧', color: '#3b82f6', light: '#93c5fd', dark: '#1e3a8a' },
  { id: 'wind', name: 'Ngọc Rồng Gió', element: 'Gió', icon: '🍃', color: '#22c55e', light: '#86efac', dark: '#166534' },
  { id: 'earth', name: 'Ngọc Rồng Đất', element: 'Đất', icon: '⛰️', color: '#d97706', light: '#fcd34d', dark: '#78350f' },
  { id: 'thunder', name: 'Ngọc Rồng Sấm', element: 'Sấm', icon: '⚡', color: '#a855f7', light: '#d8b4fe', dark: '#581c87' },
  { id: 'ice', name: 'Ngọc Rồng Băng', element: 'Băng', icon: '❄️', color: '#22d3ee', light: '#cffafe', dark: '#0e7490' },
  { id: 'light', name: 'Ngọc Rồng Ánh Sáng', element: 'Ánh sáng', icon: '✨', color: '#facc15', light: '#fef9c3', dark: '#a16207' },
];

export function getGem(id: GemId) {
  return GEMS.find((g) => g.id === id)!;
}
