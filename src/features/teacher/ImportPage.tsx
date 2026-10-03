// ============================================================
// Nhập bài học từ Excel: chọn bộ sách + lớp → chọn file → xem trước, kiểm tra → nhập
// ============================================================
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { books, getBook, getUnit } from '../../content';
import { defaultUnitId } from '../../components/UnitPicker';
import { assignIds, checkUnit, type UnitCheck } from '../../content/validate';
import type { Unit } from '../../types/content';
import { Button } from '../../components/ui';
import { TeacherLayout } from './TeacherApp';
import { Field, IssueList, SaveStatus } from './widgets';
import { newUnitId, upsertUnit, useSaver } from './contentOps';
import { downloadTemplate, parseWorkbook, type ParsedUnit } from './excel';

interface Row {
  unit: Unit;
  check: UnitCheck;
  /** Unit cùng số đã có trong lớp (sẽ bị thay thế) */
  replaces: Unit | null;
  selected: boolean;
}

export function ImportPage() {
  const nav = useNavigate();
  // Mặc định: lớp của bài học gần nhất, không có thì lớp đầu tiên
  const recent = getUnit(defaultUnitId());
  const firstBook = books.find((b) => b.grades.length) ?? books[0];
  const [bookId, setBookId] = useState(recent?.bookId ?? firstBook?.id ?? '');
  const [gradeId, setGradeId] = useState(recent?.gradeId ?? firstBook?.grades[0]?.id ?? '');
  const [parsed, setParsed] = useState<{ units: ParsedUnit[]; errors: string[]; file: string } | null>(null);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const { save, status } = useSaver();
  const book = getBook(bookId);
  const grade = book?.grades.find((g) => g.id === gradeId);

  // Gắn bộ sách / lớp, kiểm tra từng unit (đổi lớp → kiểm tra lại)
  const rows: Row[] = useMemo(() => {
    if (!parsed) return [];
    return parsed.units.map((p) => {
      const replaces = grade?.units.find((u) => u.number === p.number) ?? null;
      const unit = assignIds({ ...p, id: replaces?.id ?? newUnitId(bookId, gradeId, p.number), bookId, gradeId });
      const check = checkUnit(unit);
      return { unit, check, replaces, selected: (selected[p.number] ?? true) && check.ok };
    });
  }, [parsed, bookId, gradeId, grade, selected]);

  const chosen = rows.filter((r) => r.selected);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    const r = await parseWorkbook(file);
    setParsed({ ...r, file: file.name });
    setSelected({});
    setBusy(false);
  };

  const onImport = async () => {
    const ok = await save((c) => chosen.reduce((acc, r) => upsertUnit(acc, r.unit), c), `Đã nhập ${chosen.length} unit`);
    if (ok) setParsed(null);
  };

  return (
    <TeacherLayout title="📥 Nhập bài học từ Excel">
      <div className="panel p-4 space-y-2">
        <h3 className="font-extrabold text-sky-900">Bước 1. Chuẩn bị file</h3>
        <p className="text-sm font-bold text-slate-500">
          Tải file mẫu, điền từ vựng vào trang "Tu vung" và mẫu câu vào trang "Mau cau" (mỗi dòng 1 từ / 1 cặp hỏi – đáp). Trong trang Bài học, nút "⬇ Excel" của mỗi lớp xuất các unit đang có ra cùng định dạng: sửa xong nhập lại được.
        </p>
        <Button color="white" onClick={() => downloadTemplate()}>
          ⬇ Tải file Excel mẫu
        </Button>
      </div>

      <div className="panel p-4 space-y-3">
        <h3 className="font-extrabold text-sky-900">Bước 2. Chọn nơi nhập vào</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Bộ sách">
            <select
              className="input"
              value={bookId}
              onChange={(e) => {
                setBookId(e.target.value);
                setGradeId(getBook(e.target.value)?.grades[0]?.id ?? '');
              }}
            >
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Lớp / Level">
            <select className="input" value={gradeId} onChange={(e) => setGradeId(e.target.value)}>
              {(book?.grades ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {book && !book.grades.length && (
          <p className="text-sm font-bold text-amber-700">
            Bộ sách này chưa có lớp nào.{' '}
            <button className="underline" onClick={() => nav('/teacher/content')}>
              Thêm lớp ở trang Bài học
            </button>
            .
          </p>
        )}
      </div>

      <div className="panel p-4 space-y-3">
        <h3 className="font-extrabold text-sky-900">Bước 3. Chọn file Excel (.xlsx)</h3>
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={!grade || busy}
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
          className="block w-full text-sm font-bold text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-sky-500 file:px-4 file:py-2 file:font-extrabold file:text-white"
        />
        {busy && <div className="font-bold text-sky-700">⏳ Đang đọc file…</div>}
        {parsed && (
          <>
            <div className="font-bold text-slate-600">
              📄 {parsed.file}: tìm thấy {parsed.units.length} unit.
            </div>
            <IssueList issues={parsed.errors.map((msg) => ({ level: parsed.units.length ? 'warn' : 'error', msg }))} />
          </>
        )}
      </div>

      {rows.length > 0 && (
        <div className="panel p-4 space-y-3">
          <h3 className="font-extrabold text-sky-900">Bước 4. Kiểm tra và nhập</h3>
          {rows.map((r) => (
            <div key={r.unit.number} className={`rounded-2xl border-2 p-3 ${r.check.ok ? 'border-green-200 bg-green-50/40' : 'border-rose-200 bg-rose-50/40'}`}>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5"
                  disabled={!r.check.ok}
                  checked={r.selected}
                  onChange={(e) => setSelected((s) => ({ ...s, [r.unit.number]: e.target.checked }))}
                  aria-label={`Chọn unit ${r.unit.number}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-slate-800">
                    Unit {r.unit.number}: {r.unit.title || '(chưa có tên)'} <span className="font-bold text-slate-500">· {r.unit.titleVi}</span>
                  </div>
                  <div className="text-sm font-bold text-slate-500">
                    {r.unit.vocab.length} từ · {r.unit.patterns.length} mẫu câu · <span className={r.check.total >= 20 ? 'text-green-600' : 'text-rose-600'}>{r.check.total} câu hỏi</span>
                    {r.replaces && <span className="text-amber-700"> · sẽ thay thế "Unit {r.replaces.number}: {r.replaces.title}" đang có</span>}
                  </div>
                  <div className="mt-1 text-xs font-bold text-slate-400 truncate">{r.unit.vocab.map((v) => `${v.image ?? ''}${v.en}`).join(' · ')}</div>
                </div>
              </label>
              <div className="mt-2">
                <IssueList issues={r.check.issues} />
              </div>
            </div>
          ))}
          <SaveStatus status={status} />
          <div className="flex flex-wrap gap-2">
            <Button disabled={!chosen.length || status.kind === 'saving'} onClick={onImport}>
              📥 Nhập {chosen.length} unit vào {book?.name} · {grade?.name}
            </Button>
            {status.kind === 'ok' && (
              <Button color="white" onClick={() => nav('/teacher/content')}>
                Xem trang Bài học
              </Button>
            )}
          </div>
          {rows.some((r) => !r.check.ok) && <p className="text-sm font-bold text-slate-500">Unit có lỗi (❌) không nhập được. Sửa trong file rồi chọn lại file.</p>}
        </div>
      )}
      {!rows.length && status.kind === 'ok' && <SaveStatus status={status} />}
    </TeacherLayout>
  );
}
