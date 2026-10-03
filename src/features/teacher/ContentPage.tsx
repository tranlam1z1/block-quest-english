// ============================================================
// Quản lý bài học: bộ sách → lớp → unit. Thêm / sửa / ẩn / khôi phục / xuất Excel.
// ============================================================
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { books, builtinUnits, getCustomContent, isBuiltinUnit, isEditedBuiltin } from '../../content';
import { Button, Modal } from '../../components/ui';
import { TeacherLayout } from './TeacherApp';
import { Field, SaveStatus } from './widgets';
import { addBook, addGrade, canDeleteBook, deleteBook, unhideUnit, useSaver } from './contentOps';
import { downloadTemplate, exportUnits } from './excel';
import { slug } from '../../content/validate';

const BOOK_COLORS = ['#f97316', '#0ea5e9', '#22c55e', '#a855f7', '#ef4444', '#eab308', '#14b8a6', '#ec4899'];
const BOOK_EMOJIS = ['📘', '📗', '📕', '📙', '📓', '📒', '🌟', '🎒'];

export function ContentPage() {
  const nav = useNavigate();
  const { save, status } = useSaver();
  const [bookOpen, setBookOpen] = useState(false);
  const [gradeFor, setGradeFor] = useState<string | null>(null);
  const hidden = getCustomContent().hiddenUnits.map((id) => builtinUnits.find((u) => u.id === id)).filter((u) => !!u);

  return (
    <TeacherLayout title="📚 Bài học">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setBookOpen(true)}>➕ Thêm bộ sách</Button>
        <Button color="blue" onClick={() => nav('/teacher/import')}>
          📥 Nhập từ Excel
        </Button>
        <Button color="white" onClick={() => downloadTemplate()}>
          ⬇ Tải file Excel mẫu
        </Button>
      </div>
      <SaveStatus status={status} />

      {books.map((b) => (
        <div key={b.id} className="panel p-3 sm:p-4" style={{ borderColor: b.color }}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-3xl">{b.emoji}</span>
            <div className="flex-1 min-w-[160px]">
              <div className="text-xl font-extrabold" style={{ color: b.color }}>
                {b.name}
              </div>
              <div className="text-sm font-bold text-slate-500">{b.description}</div>
            </div>
            <Button color="white" className="!py-1.5" onClick={() => setGradeFor(b.id)}>
              ➕ Thêm lớp
            </Button>
            {canDeleteBook(b.id) && (
              <Button color="white" className="!py-1.5" onClick={() => confirm(`Xóa bộ sách "${b.name}"?`) && save((c) => deleteBook(c, b.id), 'Đã xóa bộ sách')}>
                🗑
              </Button>
            )}
          </div>

          <div className="mt-3 space-y-3">
            {b.grades.length === 0 && <div className="text-sm font-bold text-slate-400">Chưa có lớp nào. Bấm "Thêm lớp".</div>}
            {b.grades.map((g) => (
              <div key={g.id} className="rounded-2xl bg-slate-50 p-2 sm:p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex-1 font-extrabold text-slate-700">
                    {g.name} <span className="text-sm text-slate-400">· {g.units.length} unit</span>
                  </div>
                  <Button color="green" className="!py-1.5 !px-3 text-sm" onClick={() => nav(`/teacher/content/new?book=${b.id}&grade=${g.id}`)}>
                    ➕ Unit
                  </Button>
                  <Button color="white" className="!py-1.5 !px-3 text-sm" disabled={!g.units.length} onClick={() => exportUnits(g.units, `${slug(b.name)}-${slug(g.name)}.xlsx`)}>
                    ⬇ Excel
                  </Button>
                </div>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {g.units.map((u) => (
                    <button key={u.id} onClick={() => nav(`/teacher/content/${u.id}`)} className="flex items-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-2 py-1.5 text-left hover:border-sky-300">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg font-extrabold text-white" style={{ background: b.color }}>
                        {u.number}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate font-extrabold text-slate-700">{u.title}</span>
                        <span className="block truncate text-xs font-bold text-slate-400">
                          {u.vocab.length} từ · {u.patterns.length} mẫu câu
                        </span>
                      </span>
                      <UnitBadge id={u.id} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {hidden.length > 0 && (
        <div className="panel p-4">
          <h3 className="font-extrabold text-slate-600">🙈 Unit có sẵn đã ẩn</h3>
          <div className="mt-2 space-y-1.5">
            {hidden.map((u) => (
              <div key={u.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                <span className="flex-1 font-bold text-slate-600">
                  Unit {u.number}: {u.title}
                </span>
                <Button color="white" className="!py-1 text-sm" onClick={() => save((c) => unhideUnit(c, u.id), 'Đã hiện lại unit')}>
                  Hiện lại
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <NewBookModal open={bookOpen} onClose={() => setBookOpen(false)} onSave={(meta) => save((c) => addBook(c, meta), 'Đã thêm bộ sách').then((ok) => ok && setBookOpen(false))} />
      <NewGradeModal bookId={gradeFor} onClose={() => setGradeFor(null)} onSave={(name) => save((c) => addGrade(c, gradeFor!, name), 'Đã thêm lớp').then((ok) => ok && setGradeFor(null))} />
    </TeacherLayout>
  );
}

function UnitBadge({ id }: { id: string }) {
  if (!isBuiltinUnit(id)) return <span className="rounded-full bg-green-100 px-2 text-xs font-extrabold text-green-700">Mới</span>;
  if (isEditedBuiltin(id)) return <span className="rounded-full bg-amber-100 px-2 text-xs font-extrabold text-amber-700">Đã sửa</span>;
  return <span className="rounded-full bg-slate-100 px-2 text-xs font-extrabold text-slate-500">Có sẵn</span>;
}

function NewBookModal({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (m: { name: string; description: string; color: string; emoji: string }) => void }) {
  const [name, setName] = useState('');
  const [description, setDesc] = useState('');
  const [color, setColor] = useState(BOOK_COLORS[1]);
  const [emoji, setEmoji] = useState(BOOK_EMOJIS[1]);
  if (!open) return null;
  return (
    <Modal open onClose={onClose} title="➕ Thêm bộ sách">
      <div className="space-y-3">
        <Field label="Tên bộ sách">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: i-Learn Smart Start" className="input" />
        </Field>
        <Field label="Mô tả ngắn">
          <input value={description} onChange={(e) => setDesc(e.target.value)} placeholder="VD: Tiếng Anh tiểu học – Lớp 1 đến 5" className="input" />
        </Field>
        <Field label="Biểu tượng">
          <div className="flex flex-wrap gap-1">
            {BOOK_EMOJIS.map((e) => (
              <button key={e} onClick={() => setEmoji(e)} className={`h-11 w-11 rounded-xl text-2xl ${emoji === e ? 'bg-sky-100 ring-2 ring-sky-400' : 'bg-slate-50'}`}>
                {e}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Màu">
          <div className="flex flex-wrap gap-1">
            {BOOK_COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} aria-label={c} className={`h-9 w-9 rounded-full ${color === c ? 'ring-4 ring-slate-400' : ''}`} style={{ background: c }} />
            ))}
          </div>
        </Field>
        <Button className="w-full" disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), description: description.trim(), color, emoji })}>
          Lưu bộ sách
        </Button>
      </div>
    </Modal>
  );
}

function NewGradeModal({ bookId, onClose, onSave }: { bookId: string | null; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState('');
  if (!bookId) return null;
  return (
    <Modal open onClose={onClose} title="➕ Thêm lớp / level">
      <Field label="Tên lớp">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && onSave(name)} placeholder="VD: Lớp 4 hoặc Level 2" className="input" />
      </Field>
      <Button className="w-full mt-3" disabled={!name.trim()} onClick={() => onSave(name)}>
        Lưu
      </Button>
    </Modal>
  );
}
