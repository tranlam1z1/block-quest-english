// ============================================================
// Các thao tác sửa nội dung tùy chỉnh (trả về bản mới, không sửa bản cũ) + lưu
// ============================================================
import { useState } from 'react';
import { books, builtinBooks, getBook, getCustomContent, isBuiltinUnit, saveCustomContent, type CustomContent } from '../../content';
import { slug } from '../../content/validate';
import type { BookMeta, Unit } from '../../types/content';
import { useTeacher } from '../../stores/teacher';

export function upsertUnit(c: CustomContent, unit: Unit): CustomContent {
  return { ...c, units: [...c.units.filter((u) => u.id !== unit.id), unit], hiddenUnits: c.hiddenUnits.filter((id) => id !== unit.id) };
}

/** Xóa unit: unit tự thêm → xóa hẳn; unit có sẵn → ẩn đi (khôi phục được) */
export function removeUnit(c: CustomContent, unitId: string): CustomContent {
  return {
    ...c,
    units: c.units.filter((u) => u.id !== unitId),
    hiddenUnits: isBuiltinUnit(unitId) && !c.hiddenUnits.includes(unitId) ? [...c.hiddenUnits, unitId] : c.hiddenUnits,
  };
}

/** Bỏ bản sửa của unit có sẵn → về bản gốc */
export function restoreUnit(c: CustomContent, unitId: string): CustomContent {
  return { ...c, units: c.units.filter((u) => u.id !== unitId), hiddenUnits: c.hiddenUnits.filter((id) => id !== unitId) };
}

export function unhideUnit(c: CustomContent, unitId: string): CustomContent {
  return { ...c, hiddenUnits: c.hiddenUnits.filter((id) => id !== unitId) };
}

const uniqueId = (base: string, taken: string[]) => {
  let id = base;
  for (let k = 2; taken.includes(id); k++) id = `${base}-${k}`;
  return id;
};

export function addBook(c: CustomContent, meta: Omit<BookMeta, 'id' | 'sort' | 'grades'>): CustomContent {
  const id = uniqueId(slug(meta.name), books.map((b) => b.id));
  const sort = Math.max(0, ...books.map((b) => b.sort)) + 1;
  return { ...c, books: [...c.books, { ...meta, id, sort, grades: [] }] };
}

export function addGrade(c: CustomContent, bookId: string, name: string): CustomContent {
  const book = getBook(bookId);
  if (!book) return c;
  const meta: BookMeta = { id: book.id, name: book.name, description: book.description, color: book.color, emoji: book.emoji, sort: book.sort, grades: book.grades.map(({ id, name }) => ({ id, name })) };
  const id = uniqueId(slug(name), meta.grades.map((g) => g.id));
  meta.grades.push({ id, name: name.trim() });
  return { ...c, books: [...c.books.filter((b) => b.id !== bookId), meta] };
}

/** Bộ sách tự thêm (không có sẵn) và chưa có unit nào → xóa được */
export function canDeleteBook(bookId: string) {
  const b = getBook(bookId);
  return !!b && !builtinBooks.some((x) => x.id === bookId) && b.grades.every((g) => g.units.length === 0);
}

export function deleteBook(c: CustomContent, bookId: string): CustomContent {
  return { ...c, books: c.books.filter((b) => b.id !== bookId) };
}

/** Id cho unit mới */
export function newUnitId(bookId: string, gradeId: string, number: number) {
  return `${slug(bookId).slice(0, 12)}-${slug(gradeId).slice(0, 10)}-u${number}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Lưu nội dung + trạng thái "đang lưu / đã lưu / lỗi" để hiện cho giáo viên */
export function useSaver() {
  const pin = useTeacher((s) => s.pin);
  const [status, setStatus] = useState<{ kind: 'idle' | 'saving' | 'ok' | 'error'; text?: string }>({ kind: 'idle' });
  const save = async (change: (c: CustomContent) => CustomContent, okText = 'Đã lưu') => {
    setStatus({ kind: 'saving' });
    const r = await saveCustomContent(change(getCustomContent()), pin);
    setStatus(r.ok ? { kind: 'ok', text: r.where === 'server' ? `${okText} — mọi máy học sinh sẽ thấy khi mở lại game.` : `${okText} trên trình duyệt này.` } : { kind: 'error', text: r.error });
    return r.ok;
  };
  return { save, status, clear: () => setStatus({ kind: 'idle' }) };
}
