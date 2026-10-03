// ============================================================
// Kho nội dung = nội dung có sẵn (file JSON trong thư mục này)
//               + nội dung giáo viên sửa / thêm trong Khu vực giáo viên.
//
// - Nội dung có sẵn: tự động nạp mọi book.json và unit-*.json (thêm file là có, không sửa code).
// - Nội dung tùy chỉnh: lưu trên máy chủ (data/custom-content.json), nạp khi mở game,
//   đồng thời lưu bản sao trong trình duyệt để chơi offline.
//   Unit tùy chỉnh trùng id với unit có sẵn sẽ thay thế unit đó.
// ============================================================
import { create } from 'zustand';
import type { Book, BookMeta, Unit, Selection } from '../types/content';
import { api, checkServer } from '../services/api';

const bookFiles = import.meta.glob<BookMeta>('./*/book.json', { eager: true, import: 'default' });
const unitFiles = import.meta.glob<Unit>('./*/*/unit-*.json', { eager: true, import: 'default' });

export const builtinBooks: BookMeta[] = Object.values(bookFiles);
export const builtinUnits: Unit[] = Object.values(unitFiles);

/** Nội dung giáo viên tùy chỉnh */
export interface CustomContent {
  version: 1;
  /** Bộ sách mới, hoặc bộ sách có sẵn đã thêm lớp (trùng id → thay thế) */
  books: BookMeta[];
  /** Unit mới, hoặc unit có sẵn đã sửa (trùng id → thay thế) */
  units: Unit[];
  /** Id các unit có sẵn bị giáo viên ẩn đi */
  hiddenUnits: string[];
  updatedAt: string;
}

export const emptyCustom = (): CustomContent => ({ version: 1, books: [], units: [], hiddenUnits: [], updatedAt: '' });

let custom: CustomContent = emptyCustom();
let allUnits: Unit[] = [];
/** Danh sách bộ sách, mỗi lớp đã kèm các unit (sắp xếp theo số unit) */
export let books: Book[] = [];

/** Đổi version mỗi khi nội dung thay đổi → giao diện vẽ lại */
export const useContentVersion = create<{ version: number }>(() => ({ version: 0 }));

function rebuild() {
  const unitMap = new Map<string, Unit>();
  for (const u of builtinUnits) if (!custom.hiddenUnits.includes(u.id)) unitMap.set(u.id, u);
  for (const u of custom.units) unitMap.set(u.id, u);
  allUnits = Array.from(unitMap.values());

  const bookMap = new Map<string, BookMeta>();
  for (const b of builtinBooks) bookMap.set(b.id, b);
  for (const b of custom.books) bookMap.set(b.id, b);
  books = Array.from(bookMap.values())
    .sort((a, b) => a.sort - b.sort)
    .map((meta) => ({
      ...meta,
      grades: meta.grades.map((g) => ({
        ...g,
        units: allUnits.filter((u) => u.bookId === meta.id && u.gradeId === g.id).sort((a, b) => a.number - b.number),
      })),
    }));
  useContentVersion.setState((s) => ({ version: s.version + 1 }));
}
rebuild();

function normalize(c: unknown): CustomContent {
  const x = (c && typeof c === 'object' ? c : {}) as Partial<CustomContent>;
  return {
    version: 1,
    books: Array.isArray(x.books) ? x.books : [],
    units: Array.isArray(x.units) ? x.units : [],
    hiddenUnits: Array.isArray(x.hiddenUnits) ? x.hiddenUnits : [],
    updatedAt: typeof x.updatedAt === 'string' ? x.updatedAt : '',
  };
}

const CACHE_KEY = 'bqe-custom-content';

function readCache(): CustomContent | null {
  try {
    const t = localStorage.getItem(CACHE_KEY);
    return t ? normalize(JSON.parse(t)) : null;
  } catch {
    return null;
  }
}

function writeCache(c: CustomContent) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* hết dung lượng: bỏ qua */
  }
}

export function getCustomContent() {
  return custom;
}

export function applyCustomContent(c: CustomContent) {
  custom = normalize(c);
  rebuild();
}

/** Nạp nội dung tùy chỉnh khi mở game: ưu tiên máy chủ, không có thì dùng bản lưu trên máy */
export async function loadContent() {
  const cached = readCache();
  if (cached) applyCustomContent(cached);
  const { ok } = await checkServer();
  if (!ok) return;
  const r = await api.getContent();
  if (!r.ok) return;
  const fresh = r.data ? normalize(r.data) : emptyCustom();
  writeCache(fresh);
  applyCustomContent(fresh);
}

/**
 * Lưu nội dung tùy chỉnh. Có máy chủ → lưu lên máy chủ (mọi máy học sinh đều thấy);
 * không có → chỉ lưu trên trình duyệt này.
 */
export async function saveCustomContent(c: CustomContent, pin: string | null): Promise<{ ok: boolean; where: 'server' | 'local'; error?: string }> {
  const next = { ...normalize(c), updatedAt: new Date().toISOString() };
  const { ok } = await checkServer();
  if (ok) {
    if (!pin) return { ok: false, where: 'server', error: 'Chưa đăng nhập giáo viên' };
    const r = await api.saveContent(pin, next);
    if (!r.ok) return { ok: false, where: 'server', error: r.error ?? 'Không lưu được' };
  }
  writeCache(next);
  applyCustomContent(next);
  return { ok: true, where: ok ? 'server' : 'local' };
}

export function getBook(bookId: string) {
  return books.find((b) => b.id === bookId);
}

export function getGrade(bookId: string, gradeId: string) {
  return getBook(bookId)?.grades.find((g) => g.id === gradeId);
}

export function getUnit(unitId: string): Unit | undefined {
  return allUnits.find((u) => u.id === unitId);
}

export function isBuiltinUnit(unitId: string) {
  return builtinUnits.some((u) => u.id === unitId);
}

/** Unit có sẵn nhưng đã bị giáo viên sửa */
export function isEditedBuiltin(unitId: string) {
  return isBuiltinUnit(unitId) && custom.units.some((u) => u.id === unitId);
}

/** Kiểm tra lựa chọn đã lưu còn hợp lệ không (phòng khi dữ liệu thay đổi) */
export function isValidSelection(sel: Selection | null | undefined): sel is Selection {
  if (!sel) return false;
  const u = getUnit(sel.unitId);
  return !!u && u.bookId === sel.bookId && u.gradeId === sel.gradeId;
}

/** Tên đầy đủ của lựa chọn, VD "Global Success · Lớp 3 · Unit 1: Hello" */
export function describeSelection(sel: Selection) {
  const book = getBook(sel.bookId);
  const grade = getGrade(sel.bookId, sel.gradeId);
  const unit = getUnit(sel.unitId);
  return {
    book: book?.name ?? '',
    grade: grade?.name ?? '',
    unit: unit ? `Unit ${unit.number}: ${unit.title}` : '',
  };
}
