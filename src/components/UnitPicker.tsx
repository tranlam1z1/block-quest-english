// ============================================================
// Hộp chọn bài học (mọi bộ sách / lớp) + tiện ích tìm unit mặc định
// ============================================================
import { books, isValidSelection } from '../content';
import { useProgress } from '../stores/progress';
import { Modal } from './ui';

/** Unit mặc định: bài chọn gần nhất, hoặc unit đầu tiên có nội dung */
export function defaultUnitId() {
  const last = useProgress.getState().lastSelection;
  if (isValidSelection(last)) return last.unitId;
  for (const b of books) for (const g of b.grades) if (g.units[0]) return g.units[0].id;
  return '';
}

export function UnitPicker({ open, value, onPick, onClose }: { open: boolean; value: string; onPick: (unitId: string) => void; onClose: () => void }) {
  const setLast = useProgress((s) => s.setLastSelection);
  return (
    <Modal open={open} onClose={onClose} title="📚 Chọn bài học">
      <div className="space-y-4">
        {books.map((b) =>
          b.grades
            .filter((g) => g.units.length > 0)
            .map((g) => (
              <div key={b.id + g.id}>
                <div className="font-extrabold mb-1" style={{ color: b.color }}>
                  {b.emoji} {b.name} · {g.name}
                </div>
                <div className="grid gap-2">
                  {g.units.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        setLast({ bookId: b.id, gradeId: g.id, unitId: u.id });
                        onPick(u.id);
                        onClose();
                      }}
                      className={`rounded-2xl border-2 px-3 py-2 text-left font-extrabold transition ${u.id === value ? 'border-sky-400 bg-sky-50 text-sky-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-sky-50'}`}
                    >
                      Unit {u.number}: {u.title}
                      <span className="block text-xs font-bold text-slate-500">{u.titleVi}</span>
                    </button>
                  ))}
                </div>
              </div>
            )),
        )}
      </div>
    </Modal>
  );
}
