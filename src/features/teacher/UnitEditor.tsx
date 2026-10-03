// ============================================================
// Sửa / thêm 1 unit: tên, từ vựng, mẫu câu. Kiểm tra trực tiếp trước khi lưu.
// ============================================================
import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { books, getBook, getUnit, isBuiltinUnit, isEditedBuiltin } from '../../content';
import { formatBlanks, parseBlanks } from '../../content/blanks';
import { assignIds, checkUnit, fixDash } from '../../content/validate';
import { speak } from '../../services/speech';
import type { Unit } from '../../types/content';
import { Button, WordImage } from '../../components/ui';
import { TeacherLayout } from './TeacherApp';
import { Field, IssueList, SaveStatus } from './widgets';
import { newUnitId, removeUnit, restoreUnit, upsertUnit, useSaver } from './contentOps';

interface VocabRow {
  key: number;
  id: string;
  en: string;
  vi: string;
  image: string;
  group: string;
}
interface PatternRow {
  key: number;
  q: string;
  a: string;
  vi: string;
  image: string;
  blanks: string;
}
interface Draft {
  id: string;
  bookId: string;
  gradeId: string;
  number: string;
  title: string;
  titleVi: string;
  vocab: VocabRow[];
  patterns: PatternRow[];
}

let keySeq = 0;
const k = () => ++keySeq;
const emptyVocab = (): VocabRow => ({ key: k(), id: '', en: '', vi: '', image: '', group: '' });
const emptyPattern = (): PatternRow => ({ key: k(), q: '', a: '', vi: '', image: '', blanks: '' });

function toDraft(u: Unit): Draft {
  return {
    id: u.id,
    bookId: u.bookId,
    gradeId: u.gradeId,
    number: String(u.number),
    title: u.title,
    titleVi: u.titleVi,
    vocab: u.vocab.map((v) => ({ key: k(), id: v.id, en: v.en, vi: v.vi, image: v.image ?? '', group: v.group ?? '' })),
    patterns: u.patterns.map((p) => ({ key: k(), q: p.q, a: p.a, vi: p.vi, image: p.image ?? '', blanks: formatBlanks(p.blanks) })),
  };
}

/** Bản nháp → unit (bỏ dòng trống hoàn toàn) */
function toUnit(d: Draft): Unit {
  return assignIds({
    id: d.id,
    bookId: d.bookId,
    gradeId: d.gradeId,
    number: Number(d.number),
    title: d.title.trim(),
    titleVi: d.titleVi.trim(),
    vocab: d.vocab
      .filter((v) => v.en.trim() || v.vi.trim())
      .map((v) => ({ id: v.id, en: v.en.trim(), vi: v.vi.trim(), image: v.image.trim() || null, ...(v.group.trim() ? { group: v.group.trim() } : {}) })),
    patterns: d.patterns
      .filter((p) => p.q.trim() || p.a.trim())
      .map((p) => {
        const blanks = parseBlanks(p.blanks);
        return { id: '', q: p.q.trim(), a: p.a.trim(), vi: fixDash(p.vi.trim()), image: p.image.trim() || null, ...(blanks.length ? { blanks } : {}) };
      }),
  });
}

export function UnitEditor() {
  const { unitId = '' } = useParams();
  const [params] = useSearchParams();
  const isNew = unitId === 'new';
  const existing = isNew ? undefined : getUnit(unitId);
  // Đổi unit trên thanh địa chỉ → dựng lại bản nháp
  return <Editor key={unitId} isNew={isNew} existing={existing} bookId={params.get('book') ?? ''} gradeId={params.get('grade') ?? ''} />;
}

function Editor({ isNew, existing, bookId, gradeId }: { isNew: boolean; existing?: Unit; bookId: string; gradeId: string }) {
  const nav = useNavigate();
  const { save, status } = useSaver();
  const [draft, setDraft] = useState<Draft>(() => {
    if (existing) return toDraft(existing);
    const grade = getBook(bookId)?.grades.find((g) => g.id === gradeId);
    const next = Math.max(0, ...(grade?.units.map((u) => u.number) ?? [])) + 1;
    return { id: '', bookId, gradeId, number: String(next), title: '', titleVi: '', vocab: [emptyVocab(), emptyVocab(), emptyVocab(), emptyVocab()], patterns: [] };
  });
  const [dirty, setDirty] = useState(false);
  const unit = useMemo(() => toUnit(draft), [draft]);
  const check = useMemo(() => checkUnit(unit), [unit]);

  if (!isNew && !existing) {
    return (
      <TeacherLayout title="Không tìm thấy unit" back="/teacher/content">
        <p className="font-bold text-slate-600">Unit này không còn nữa.</p>
      </TeacherLayout>
    );
  }

  const book = getBook(draft.bookId);
  const sameNumber = book?.grades.find((g) => g.id === draft.gradeId)?.units.find((u) => u.number === Number(draft.number) && u.id !== draft.id);
  const builtin = !!existing && isBuiltinUnit(existing.id);
  const edited = !!existing && isEditedBuiltin(existing.id);

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const setVocab = (i: number, patch: Partial<VocabRow>) => update({ vocab: draft.vocab.map((v, j) => (j === i ? { ...v, ...patch } : v)) });
  const setPattern = (i: number, patch: Partial<PatternRow>) => update({ patterns: draft.patterns.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  const onSave = async () => {
    const id = draft.id || newUnitId(draft.bookId, draft.gradeId, Number(draft.number));
    const ok = await save((c) => upsertUnit(c, { ...unit, id }), 'Đã lưu unit');
    if (!ok) return;
    setDirty(false);
    if (!draft.id) nav(`/teacher/content/${id}`, { replace: true });
  };

  const onDelete = async () => {
    const msg = builtin ? 'Ẩn unit có sẵn này? (Có thể hiện lại ở trang Bài học.)' : 'Xóa hẳn unit này?';
    if (!confirm(msg)) return;
    if (await save((c) => removeUnit(c, draft.id), builtin ? 'Đã ẩn unit' : 'Đã xóa unit')) nav('/teacher/content');
  };

  const onRestore = async () => {
    if (!confirm('Bỏ mọi chỉnh sửa và quay về nội dung gốc của unit này?')) return;
    if (await save((c) => restoreUnit(c, draft.id), 'Đã khôi phục bản gốc')) {
      const fresh = getUnit(draft.id);
      if (fresh) setDraft(toDraft(fresh));
      setDirty(false);
    }
  };

  return (
    <TeacherLayout title={isNew ? '➕ Unit mới' : `✏️ Unit ${existing!.number}: ${existing!.title}`} back="/teacher/content">
      {builtin && (
        <div className="rounded-2xl border-2 border-sky-200 bg-sky-50 p-3 text-sm font-bold text-sky-800">
          📘 Đây là unit có sẵn của game. Thầy cô sửa thoải mái — bản gốc vẫn được giữ, có thể bấm "Khôi phục bản gốc" bất cứ lúc nào.
        </div>
      )}

      {/* Thông tin chung */}
      <div className="panel p-4 grid gap-3 sm:grid-cols-2">
        <Field label="Bộ sách">
          <select className="input" value={draft.bookId} onChange={(e) => update({ bookId: e.target.value, gradeId: getBook(e.target.value)?.grades[0]?.id ?? '' })}>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Lớp / Level">
          <select className="input" value={draft.gradeId} onChange={(e) => update({ gradeId: e.target.value })}>
            {(book?.grades ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Số unit" hint={sameNumber ? `⚠️ Lớp này đã có Unit ${sameNumber.number}: ${sameNumber.title}` : undefined}>
          <input className="input" inputMode="numeric" value={draft.number} onChange={(e) => update({ number: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
        </Field>
        <div />
        <Field label="Tên unit (tiếng Anh)">
          <input className="input" value={draft.title} onChange={(e) => update({ title: e.target.value })} placeholder="VD: Our bodies" />
        </Field>
        <Field label="Tên unit (tiếng Việt)">
          <input className="input" value={draft.titleVi} onChange={(e) => update({ titleVi: e.target.value })} placeholder="VD: Cơ thể của chúng mình" />
        </Field>
      </div>

      {/* Từ vựng */}
      <div className="panel p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-extrabold text-sky-900">🔤 Từ vựng ({unit.vocab.length})</h3>
          <span className="hidden sm:block text-xs font-bold text-slate-400">Hình: dán 1 emoji (trên Windows bấm phím ⊞ + dấu chấm để mở bảng emoji)</span>
        </div>
        <div className="mt-2 space-y-2">
          <div className="hidden sm:grid grid-cols-[2rem_1fr_1fr_6rem_6rem_5rem] gap-2 px-1 text-xs font-extrabold text-slate-400">
            <span>#</span>
            <span>Tiếng Anh</span>
            <span>Nghĩa tiếng Việt</span>
            <span>Hình</span>
            <span>Nhóm</span>
            <span />
          </div>
          {draft.vocab.map((v, i) => (
            <div key={v.key} className="grid grid-cols-[2rem_1fr_1fr] sm:grid-cols-[2rem_1fr_1fr_6rem_6rem_5rem] items-center gap-2 rounded-xl bg-slate-50 p-1.5">
              <span className="text-center font-extrabold text-slate-400">{i + 1}</span>
              <input className="input" aria-label={`Từ ${i + 1} tiếng Anh`} value={v.en} onChange={(e) => setVocab(i, { en: e.target.value })} placeholder="eye" />
              <input className="input" aria-label={`Từ ${i + 1} nghĩa`} value={v.vi} onChange={(e) => setVocab(i, { vi: e.target.value })} placeholder="mắt" />
              <div className="col-start-2 sm:col-start-auto flex items-center gap-1">
                <input className="input !px-2 text-center" aria-label={`Từ ${i + 1} hình`} value={v.image} onChange={(e) => setVocab(i, { image: e.target.value })} placeholder="emoji" />
                {v.image.trim() && <WordImage src={v.image.trim()} className="h-7 w-7 text-2xl shrink-0 sm:hidden" />}
              </div>
              <input className="input !px-2" aria-label={`Từ ${i + 1} nhóm`} value={v.group} onChange={(e) => setVocab(i, { group: e.target.value })} placeholder="(nhóm)" title="Các từ cùng nhóm đồng nghĩa sẽ không làm đáp án sai của nhau" />
              <div className="col-start-3 sm:col-start-auto flex justify-end gap-1">
                <button className="h-9 w-9 rounded-lg bg-white text-lg disabled:opacity-30" disabled={!v.en.trim()} onClick={() => speak(v.en)} title="Nghe thử" aria-label="Nghe thử">
                  🔊
                </button>
                <button className="h-9 w-9 rounded-lg bg-white text-lg" onClick={() => update({ vocab: draft.vocab.filter((_, j) => j !== i) })} title="Xóa từ" aria-label={`Xóa từ ${i + 1}`}>
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
        <Button color="white" className="mt-2 !py-2" onClick={() => update({ vocab: [...draft.vocab, emptyVocab()] })}>
          ➕ Thêm từ
        </Button>
      </div>

      {/* Mẫu câu */}
      <div className="panel p-3 sm:p-4">
        <h3 className="text-lg font-extrabold text-sky-900">💬 Mẫu câu ({unit.patterns.length})</h3>
        <div className="mt-2 space-y-3">
          {draft.patterns.map((p, i) => (
            <div key={p.key} className="rounded-2xl bg-slate-50 p-3 grid gap-2 sm:grid-cols-2">
              <Field label={`Câu hỏi ${i + 1}`}>
                <input className="input" value={p.q} onChange={(e) => setPattern(i, { q: e.target.value })} placeholder="What's this?" />
              </Field>
              <Field label="Câu trả lời">
                <input className="input" value={p.a} onChange={(e) => setPattern(i, { a: e.target.value })} placeholder="It's my eye." />
              </Field>
              <Field label="Nghĩa (hỏi – đáp)" className="sm:col-span-2">
                <input className="input" value={p.vi} onChange={(e) => setPattern(i, { vi: e.target.value })} placeholder="Đây là gì? – Đây là mắt của mình." />
              </Field>
              <Field label="Hình gợi ý (không bắt buộc)">
                <input className="input" value={p.image} onChange={(e) => setPattern(i, { image: e.target.value })} placeholder="emoji" />
              </Field>
              <Field label="Từ đục lỗ (cách nhau bằng ;)" hint="Tự ghi 3 đáp án sai: What's(Who's, Is, Yes)">
                <input className="input" value={p.blanks} onChange={(e) => setPattern(i, { blanks: e.target.value })} placeholder="eye; What's(Who's, Is, Yes)" />
              </Field>
              <div className="sm:col-span-2 flex justify-end gap-2">
                <Button color="white" className="!py-1.5 text-sm" disabled={!p.q.trim()} onClick={() => speak(`${p.q} ${p.a}`)}>
                  🔊 Nghe
                </Button>
                <Button color="white" className="!py-1.5 text-sm" onClick={() => update({ patterns: draft.patterns.filter((_, j) => j !== i) })}>
                  🗑 Xóa mẫu câu
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button color="white" className="mt-2 !py-2" onClick={() => update({ patterns: [...draft.patterns, emptyPattern()] })}>
          ➕ Thêm mẫu câu
        </Button>
      </div>

      {/* Kết quả kiểm tra + thao tác khác */}
      {(check.issues.length > 0 || status.kind !== 'idle' || !isNew) && (
        <div className="panel p-4 space-y-3">
          <IssueList issues={check.issues} />
          <SaveStatus status={status} />
          {!isNew && (
            <div className="flex flex-wrap gap-2">
              {edited && (
                <Button color="white" className="!py-1.5 text-sm" onClick={onRestore}>
                  ↺ Khôi phục bản gốc
                </Button>
              )}
              <Button color="white" className="!py-1.5 text-sm !text-rose-600" onClick={onDelete}>
                {builtin ? '🙈 Ẩn unit này' : '🗑 Xóa unit'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Thanh lưu luôn hiện ở cuối màn hình */}
      <div className="panel p-3 sticky bottom-2 z-10">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] font-extrabold text-slate-700">
            {check.ok ? '✅' : '❌'} Sinh được <span className={check.total >= 20 ? 'text-green-600' : 'text-rose-600'}>{check.total}</span> câu hỏi
            <span className="text-sm font-bold text-slate-400">
              {' '}
              ({check.vocabQuestions} từ vựng + {check.patternQuestions} mẫu câu)
            </span>
          </div>
          {!isNew && !dirty && (
            <Button color="purple" onClick={() => nav(`/map/${draft.id}`)}>
              ▶ Chơi thử
            </Button>
          )}
          <Button disabled={!check.ok || !dirty || status.kind === 'saving'} onClick={onSave}>
            💾 Lưu
          </Button>
        </div>
        {!check.ok && <div className="mt-1 text-sm font-bold text-rose-600">Sửa các lỗi ❌ ở trên rồi mới lưu được.</div>}
      </div>
    </TeacherLayout>
  );
}
