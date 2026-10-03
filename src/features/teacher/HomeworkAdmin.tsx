// ============================================================
// Bài tập về nhà (giáo viên):
//  - HomeworkListAdmin: các bài đã giao, số em đã nộp, điểm trung bình
//  - HomeworkNew: chọn bài, số câu, độ khó, thời gian, hạn nộp, lời dặn → giao bài
//  - HomeworkDetail: ai đã nộp / chưa làm, điểm lần đầu & cao nhất, câu hay sai,
//    tin nhắn gửi phụ huynh, xuất Excel, gia hạn / kết thúc / xóa
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { describeSelection, getUnit } from '../../content';
import type { MonsterTier } from '../../game/monsters';
import type { Question } from '../../game/questions/types';
import { getTypeInfo } from '../../game/questions/types';
import { addDays, dueText, fmtDate, fmtGrade, gradeColor, homeworkAdmin, type Homework } from '../../services/homework';
import { unitLabel } from '../../services/results';
import { useTeacher } from '../../stores/teacher';
import { Button, Modal } from '../../components/ui';
import { UnitPicker, defaultUnitId } from '../../components/UnitPicker';
import { Choice, Field, makeClassQuestions, type Kinds } from './ClassRoom';
import { TeacherLayout } from './TeacherApp';
import { assignMessage, exportHomework, homeworkReport, resultMessage, STATUS_TEXT, useTeacherData } from './homeworkStats';
import { fmtTime } from './stats';

// ---------------- Danh sách ----------------

export function HomeworkListAdmin() {
  const nav = useNavigate();
  const { results, homework, error, refresh } = useTeacherData(30_000);
  const [showClosed, setShowClosed] = useState(false);
  const list = (homework ?? []).filter((h) => showClosed || !h.closed);
  const closedCount = (homework ?? []).filter((h) => h.closed).length;

  return (
    <TeacherLayout title="📝 Bài tập về nhà">
      <div className="flex flex-wrap gap-2">
        <Button className="flex-1 text-xl" onClick={() => nav('/teacher/homework/new')}>
          ➕ Giao bài mới
        </Button>
        <Button color="white" onClick={refresh}>
          🔄 Tải lại
        </Button>
      </div>
      {error && <div className="rounded-2xl border-2 border-rose-200 bg-rose-50 p-3 font-bold text-rose-700">❌ {error}</div>}
      {!homework && !error && <div className="font-bold text-sky-800">⏳ Đang tải…</div>}
      {homework && list.length === 0 && (
        <div className="panel p-6 text-center font-bold text-slate-500">
          Chưa có bài tập nào{closedCount ? ' đang mở' : ''}. Bấm <b>Giao bài mới</b> để bắt đầu.
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((h) => {
          const rep = results ? homeworkReport(h, results) : null;
          const n = h.closed ? null : dueText(h.due);
          return (
            <button key={h.id} onClick={() => nav(`/teacher/homework/${h.id}`)} className={`panel p-4 text-left border-b-8 ${h.closed ? 'border-slate-200 opacity-70' : 'border-amber-300'} hover:scale-[1.01] transition-transform`} data-testid="admin-hw">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-extrabold text-sky-900 truncate">{h.title}</div>
                  <div className="text-sm font-bold text-slate-500 truncate">{h.unit}</div>
                </div>
                {h.closed ? <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-extrabold text-slate-500">Đã kết thúc</span> : <span className={`rounded-lg px-2 py-0.5 text-xs font-extrabold ${n?.startsWith('Quá') ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}`}>{n}</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 text-sm font-extrabold text-slate-600">
                <span>
                  {h.questions.length} câu · hạn {fmtDate(h.due)}
                </span>
                {rep && (
                  <span className="text-sky-700">
                    📨 {rep.submitted}/{rep.rows.length} đã nộp
                  </span>
                )}
                {rep?.avg != null && <span className={gradeColor(rep.avg)}>TB {fmtGrade(rep.avg)}</span>}
              </div>
            </button>
          );
        })}
      </div>
      {closedCount > 0 && (
        <label className="flex items-center gap-2 font-bold text-slate-600">
          <input type="checkbox" className="h-5 w-5 accent-sky-500" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          Hiện cả bài đã kết thúc ({closedCount})
        </label>
      )}
      <ul className="text-sm font-bold text-slate-600 space-y-1 bg-white/80 rounded-2xl p-3">
        <li>📲 Máy học sinh tự nhận bài khi mở game và dùng chung Wi-Fi với máy này. Bài được lưu trên máy nên các em làm được cả khi không có mạng.</li>
        <li>📨 Làm xong, kết quả tự gửi về đây (mất mạng thì gửi lại sau). Các em được làm lại để luyện thêm: thầy cô xem được điểm lần đầu và điểm cao nhất.</li>
        <li>👪 Phụ huynh xem kết quả ở mục <b>Phụ huynh</b> trên máy của con, hoặc thầy cô in <b>Phiếu kết quả</b> gửi về nhà.</li>
      </ul>
    </TeacherLayout>
  );
}

// ---------------- Giao bài mới ----------------

const NEW_KEY = 'bqe-homework-options';

interface NewOptions {
  unitId: string;
  count: number;
  tier: MonsterTier;
  kinds: Kinds;
  listen: boolean;
  timerSec: number;
  days: number;
}

function loadNew(): NewOptions {
  const base: NewOptions = { unitId: defaultUnitId(), count: 10, tier: 'normal', kinds: 'all', listen: true, timerSec: 0, days: 3 };
  try {
    const o = { ...base, ...(JSON.parse(localStorage.getItem(NEW_KEY) ?? 'null') ?? {}) } as NewOptions;
    if (!getUnit(o.unitId)) o.unitId = base.unitId;
    return o;
  } catch {
    return base;
  }
}

export function HomeworkNew() {
  const nav = useNavigate();
  const pin = useTeacher((s) => s.pin)!;
  const [o, setO] = useState(loadNew);
  const [due, setDue] = useState(() => addDays(loadNew().days));
  const unit = getUnit(o.unitId);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [pickOpen, setPickOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const desc = unit ? describeSelection({ bookId: unit.bookId, gradeId: unit.gradeId, unitId: unit.id }) : null;
  const set = (patch: Partial<NewOptions>) => setO((x) => ({ ...x, ...patch }));
  const autoTitle = unit ? `Ôn Unit ${unit.number}: ${unit.title}` : 'Bài tập về nhà';

  const create = async () => {
    setError(null);
    if (due < addDays(0)) return setError('Hạn nộp phải từ hôm nay trở đi.');
    let questions: Question[] = [];
    try {
      questions = makeClassQuestions({ unitId: o.unitId, count: o.count, timerSec: o.timerSec || 20, tier: o.tier, kinds: o.kinds, listen: o.listen });
    } catch {
      /* unit không đủ câu hỏi */
    }
    if (!questions.length) return setError('Bài này không sinh được câu hỏi. Thầy cô chọn bài khác hoặc bật thêm dạng câu.');
    try {
      localStorage.setItem(NEW_KEY, JSON.stringify(o));
    } catch {
      /* bỏ qua */
    }
    setBusy(true);
    const r = await homeworkAdmin.create(pin, { title: title.trim() || autoTitle, note: note.trim(), unitId: o.unitId, unit: unitLabel(o.unitId), questions, timerSec: o.timerSec, due });
    setBusy(false);
    if (!r.ok || !r.data) return setError(r.error ?? 'Không giao được bài');
    nav(`/teacher/homework/${r.data.id}?new=1`, { replace: true });
  };

  return (
    <TeacherLayout title="➕ Giao bài tập về nhà" back="/teacher/homework">
      <div className="panel p-4 sm:p-5 space-y-4">
        <Field label="Bài học">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-xl font-extrabold text-slate-800 truncate">{desc?.unit ?? 'Chưa chọn bài'}</div>
              <div className="text-sm font-bold text-slate-500 truncate">{desc ? `${desc.book} · ${desc.grade} · ${unit!.titleVi}` : ''}</div>
            </div>
            <Button color="white" onClick={() => setPickOpen(true)}>
              Đổi bài
            </Button>
          </div>
        </Field>
        <Field label="Tên bài tập">
          <input className="input" value={title} maxLength={80} placeholder={autoTitle} onChange={(e) => setTitle(e.target.value)} aria-label="Tên bài tập" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Số câu hỏi">
            <Choice value={o.count} onChange={(count) => set({ count })} options={[5, 10, 15, 20].map((v) => ({ v, label: `${v} câu` }))} />
          </Field>
          <Field label="Thời gian mỗi câu">
            <Choice value={o.timerSec} onChange={(timerSec) => set({ timerSec })} options={[0, 20, 30].map((v) => ({ v, label: v ? `${v} giây` : 'Không giới hạn' }))} />
          </Field>
          <Field label="Độ khó">
            <Choice
              value={o.tier}
              onChange={(tier) => set({ tier })}
              options={[
                { v: 'normal' as MonsterTier, label: '🙂 Dễ' },
                { v: 'elite' as MonsterTier, label: '😎 Vừa' },
                { v: 'boss' as MonsterTier, label: '🔥 Khó' },
              ]}
            />
          </Field>
          <Field label="Dạng câu hỏi">
            <Choice
              value={o.kinds}
              onChange={(kinds) => set({ kinds })}
              options={[
                { v: 'all' as Kinds, label: 'Tất cả' },
                { v: 'vocab' as Kinds, label: 'Từ vựng' },
                { v: 'pattern' as Kinds, label: 'Mẫu câu' },
              ]}
            />
          </Field>
          <Field label="Hạn nộp (hết ngày)">
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" className="input !w-auto" value={due} min={addDays(0)} onChange={(e) => setDue(e.target.value)} aria-label="Hạn nộp" />
              {[1, 3, 7].map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    setDue(addDays(d));
                    set({ days: d });
                  }}
                  className={`rounded-xl border-2 px-2 py-1 text-sm font-extrabold ${due === addDays(d) ? 'border-sky-400 bg-sky-500 text-white' : 'border-slate-200 bg-white text-slate-600'}`}
                >
                  +{d} ngày
                </button>
              ))}
            </div>
          </Field>
          <label className="flex items-center gap-2 self-end font-bold text-slate-600">
            <input type="checkbox" className="h-5 w-5 accent-sky-500" checked={o.listen} onChange={(e) => set({ listen: e.target.checked })} />
            Có câu nghe (máy học sinh tự đọc to)
          </label>
        </div>
        <Field label="Lời dặn (không bắt buộc)">
          <textarea className="input min-h-[70px]" value={note} maxLength={500} placeholder="VD: Các con làm cẩn thận, sai thì nghe lại từ và làm lại nhé!" onChange={(e) => setNote(e.target.value)} aria-label="Lời dặn" />
        </Field>
        {error && <div className="rounded-xl bg-rose-50 p-2 text-center font-bold text-rose-600">{error}</div>}
        <Button className="w-full text-2xl !py-4" disabled={busy || !unit} onClick={create}>
          {busy ? '⏳ Đang giao bài…' : '📤 Giao bài'}
        </Button>
        <div className="text-sm font-bold text-slate-400">Cả lớp làm cùng một bộ câu hỏi (thứ tự đáp án giống nhau) để thầy cô so sánh được.</div>
      </div>
      <UnitPicker open={pickOpen} value={o.unitId} onPick={(unitId) => set({ unitId })} onClose={() => setPickOpen(false)} />
    </TeacherLayout>
  );
}

// ---------------- Chi tiết ----------------

export function HomeworkDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const pin = useTeacher((s) => s.pin)!;
  const { results, homework, error, refresh } = useTeacherData(30_000);
  const hw = homework?.find((h) => h.id === id);
  const rep = useMemo(() => (hw && results ? homeworkReport(hw, results) : null), [hw, results]);
  const [msg, setMsg] = useState<{ title: string; text: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [showQ, setShowQ] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Vừa giao bài → hiện ngay tin nhắn gửi phụ huynh
  const fresh = params.get('new') === '1';
  useEffect(() => {
    if (!fresh || !hw) return;
    setMsg({ title: '✅ Đã giao bài! Gửi tin nhắn cho phụ huynh', text: assignMessage(hw) });
    setParams({}, { replace: true });
  }, [fresh, hw, setParams]);

  if (!homework || !results)
    return (
      <TeacherLayout title="📝 Bài tập" back="/teacher/homework">
        {error ? <div className="rounded-2xl border-2 border-rose-200 bg-rose-50 p-3 font-bold text-rose-700">❌ {error}</div> : <div className="font-bold text-sky-800">⏳ Đang tải…</div>}
      </TeacherLayout>
    );
  if (!hw || !rep)
    return (
      <TeacherLayout title="📝 Bài tập" back="/teacher/homework">
        <div className="panel p-5 font-bold text-slate-500">Không tìm thấy bài tập này (có thể đã bị xóa).</div>
      </TeacherLayout>
    );

  const update = async (patch: Partial<Pick<Homework, 'title' | 'note' | 'due' | 'closed'>>) => {
    setErr(null);
    const r = await homeworkAdmin.update(pin, hw.id, patch);
    if (!r.ok) setErr(r.error ?? 'Không lưu được');
    refresh();
  };

  return (
    <TeacherLayout title="📝 Bài tập về nhà" back="/teacher/homework">
      <div className="panel p-4 sm:p-5 space-y-2">
        <div className="flex flex-wrap items-start gap-2">
          <div className="flex-1 min-w-[200px]">
            <h2 className="text-2xl font-extrabold text-sky-900" data-testid="hw-title">
              {hw.title}
            </h2>
            <div className="font-bold text-slate-500">{hw.unit}</div>
            <div className="text-sm font-bold text-slate-500">
              {hw.questions.length} câu · {hw.timerSec ? `${hw.timerSec} giây/câu` : 'không giới hạn thời gian'} · giao {fmtTime(hw.createdAt)} ·{' '}
              <b className={hw.closed ? 'text-slate-500' : 'text-amber-700'}>{hw.closed ? 'đã kết thúc' : dueText(hw.due)}</b>
            </div>
            {hw.note && <div className="mt-1 text-sm font-bold text-amber-800">💬 {hw.note}</div>}
          </div>
          <div className="flex flex-wrap gap-1">
            <Button color="white" className="!py-1.5 text-sm" onClick={() => setEditOpen(true)}>
              ✏️ Sửa / gia hạn
            </Button>
            <Button color="white" className="!py-1.5 text-sm" onClick={() => update({ closed: !hw.closed })}>
              {hw.closed ? '▶ Mở lại' : '⏹ Kết thúc'}
            </Button>
            <Button color="white" className="!py-1.5 text-sm !text-rose-600" onClick={() => setDelOpen(true)}>
              🗑 Xóa
            </Button>
          </div>
        </div>
        {err && <div className="rounded-xl bg-rose-50 p-2 font-bold text-rose-600">{err}</div>}
        <div className="flex flex-wrap gap-1 pt-1">
          <Button color="blue" className="!py-1.5 text-sm" onClick={() => setMsg({ title: '📋 Tin nhắn giao bài', text: assignMessage(hw) })}>
            📋 Tin nhắn giao bài
          </Button>
          <Button color="purple" className="!py-1.5 text-sm" onClick={() => setMsg({ title: '📊 Tin nhắn kết quả', text: resultMessage(hw, rep) })}>
            📊 Tin nhắn kết quả
          </Button>
          <Button color="green" className="!py-1.5 text-sm" onClick={() => exportHomework(hw, rep)}>
            ⬇ Xuất Excel
          </Button>
          <Button color="white" className="!py-1.5 text-sm" onClick={refresh}>
            🔄 Tải lại
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Tile label="Đã nộp" value={`${rep.submitted}/${rep.rows.length}`} cls="text-sky-800" />
        <Tile label="Nộp muộn" value={rep.late} cls={rep.late ? 'text-amber-600' : 'text-slate-400'} />
        <Tile label="Chưa làm" value={rep.missing} cls={rep.missing ? 'text-rose-600' : 'text-green-600'} />
        <Tile label="Điểm TB (lần đầu)" value={rep.avg === null ? '—' : fmtGrade(rep.avg)} cls={rep.avg === null ? 'text-slate-400' : gradeColor(rep.avg)} />
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead>
            <tr className="border-b-2 border-slate-100 text-xs font-extrabold text-slate-400">
              {['Học sinh', 'Trạng thái', 'Lần đầu', 'Cao nhất', 'Số lần', 'Nộp lúc', ''].map((h) => (
                <th key={h} className="px-3 py-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-bold text-slate-700">
            {rep.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                  Chưa có học sinh nào. Danh sách gồm các em đã đặt tên và từng chơi game.
                </td>
              </tr>
            )}
            {rep.rows.map((r) => (
              <tr key={r.key} className="border-b border-slate-100" data-testid="hw-row">
                <td className="px-3 py-2 font-extrabold text-sky-800">{r.name}</td>
                <td className={`px-3 py-2 ${r.status === 'missing' ? 'text-rose-600' : r.status === 'late' ? 'text-amber-600' : 'text-green-600'}`}>{STATUS_TEXT[r.status]}</td>
                <td className={`px-3 py-2 text-lg ${r.first === null ? '' : gradeColor(r.first)}`}>{r.first === null ? '—' : fmtGrade(r.first)}</td>
                <td className={`px-3 py-2 ${r.best === null ? '' : gradeColor(r.best)}`}>{r.best === null ? '—' : fmtGrade(r.best)}</td>
                <td className="px-3 py-2">{r.attempts || '—'}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{r.firstAt ? fmtTime(r.firstAt) : ''}</td>
                <td className="px-3 py-2 text-right">
                  <button className="rounded-lg px-2 py-1 text-xs font-extrabold text-violet-700 hover:bg-violet-50" onClick={() => nav(`/teacher/report/${encodeURIComponent(r.key)}`)} title="Phiếu kết quả gửi phụ huynh">
                    📄 Phiếu
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs font-bold text-slate-400">"Chưa làm" tính các em đã đặt tên và có chơi game trong 60 ngày gần đây. Em nào đổi tên sẽ hiện thành 2 dòng.</div>

      <div className="panel p-4 space-y-2">
        <h3 className="text-lg font-extrabold text-sky-900">🔁 Câu cả lớp hay sai (lần làm đầu)</h3>
        {rep.hardest.length === 0 ? (
          <div className="font-bold text-slate-500">{rep.submitted ? '🌟 Không có câu nào bị sai!' : 'Chưa có em nào nộp bài.'}</div>
        ) : (
          rep.hardest.slice(0, 10).map((h) => (
            <div key={h.id} className="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-1.5 font-bold">
              <span className="flex-1 truncate">
                <b className="text-slate-800">{h.en}</b> <span className="text-slate-500">· {h.vi}</span>
              </span>
              <span className="text-rose-600 tabular-nums">
                {h.wrong}/{rep.total} bạn sai
              </span>
            </div>
          ))
        )}
      </div>

      <div className="panel p-4">
        <button className="w-full text-left text-lg font-extrabold text-sky-900" onClick={() => setShowQ(!showQ)}>
          {showQ ? '▾' : '▸'} Xem {hw.questions.length} câu hỏi đã giao
        </button>
        {showQ && (
          <ol className="mt-2 list-decimal pl-6 space-y-1 text-sm font-bold text-slate-700">
            {hw.questions.map((q, i) => (
              <li key={i}>
                <span className="text-slate-400">
                  {getTypeInfo(q.type).icon} {q.instruction}:
                </span>{' '}
                {q.prompt.lines?.join(' / ') ?? q.prompt.text ?? (q.prompt.speak ? `🔊 "${q.prompt.speak}"` : q.prompt.image)} → <span className="text-green-700">{q.answerText}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {msg && <CopyModal title={msg.title} text={msg.text} onClose={() => setMsg(null)} />}
      {editOpen && <EditModal hw={hw} onClose={() => setEditOpen(false)} onSave={(p) => update(p).then(() => setEditOpen(false))} />}
      <Modal open={delOpen} onClose={() => setDelOpen(false)} title="Xóa bài tập?">
        <p className="font-bold text-slate-600">Học sinh sẽ không thấy bài này nữa. Kết quả các em đã nộp vẫn còn trong mục Thống kê.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button color="white" onClick={() => setDelOpen(false)}>
            Giữ lại
          </Button>
          <Button
            color="red"
            onClick={async () => {
              const r = await homeworkAdmin.remove(pin, hw.id);
              if (r.ok) nav('/teacher/homework', { replace: true });
              else {
                setDelOpen(false);
                setErr(r.error ?? 'Không xóa được');
              }
            }}
          >
            Xóa
          </Button>
        </div>
      </Modal>
    </TeacherLayout>
  );
}

function Tile({ label, value, cls }: { label: string; value: string | number; cls: string }) {
  return (
    <div className="panel p-3 text-center">
      <div className="text-xs font-extrabold text-slate-400">{label}</div>
      <div className={`text-2xl font-extrabold ${cls}`}>{value}</div>
    </div>
  );
}

function EditModal({ hw, onClose, onSave }: { hw: Homework; onClose: () => void; onSave: (p: Partial<Pick<Homework, 'title' | 'note' | 'due'>>) => void }) {
  const [title, setTitle] = useState(hw.title);
  const [note, setNote] = useState(hw.note);
  const [due, setDue] = useState(hw.due);
  return (
    <Modal open onClose={onClose} title="✏️ Sửa bài tập">
      <div className="space-y-3">
        <Field label="Tên bài tập">
          <input className="input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Hạn nộp (hết ngày)">
          <input type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Lời dặn">
          <textarea className="input min-h-[70px]" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="text-xs font-bold text-slate-400">Câu hỏi không sửa được sau khi giao (để kết quả các em so sánh được). Muốn đổi câu hỏi, thầy cô giao bài mới.</div>
        <Button className="w-full" disabled={!title.trim() || !due} onClick={() => onSave({ title: title.trim(), note: note.trim(), due })}>
          Lưu
        </Button>
      </div>
    </Modal>
  );
}

/** Hộp chép tin nhắn (dán vào Zalo / Messenger của lớp) */
export function CopyModal({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Mở qua địa chỉ mạng LAN (http) thì không có clipboard API → chọn chữ rồi chép kiểu cũ
      area.current?.select();
      document.execCommand('copy');
    }
    setCopied(true);
  };
  return (
    <Modal open onClose={onClose} title={title}>
      <textarea ref={area} readOnly value={text} className="input min-h-[180px] text-sm !font-bold select-text" onFocus={(e) => e.currentTarget.select()} />
      <Button className="w-full mt-3" onClick={copy}>
        {copied ? '✅ Đã chép! Dán vào nhóm Zalo của lớp' : '📋 Chép tin nhắn'}
      </Button>
    </Modal>
  );
}
