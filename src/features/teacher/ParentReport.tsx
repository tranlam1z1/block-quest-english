// ============================================================
// Phiếu kết quả học tập gửi phụ huynh: 1 em, hoặc cả lớp (mỗi em 1 trang).
// Bấm "In / Lưu PDF" → in ra giấy hoặc lưu PDF gửi qua Zalo.
// ============================================================
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ResultRecord } from '../../services/results';
import { fmtDate, fmtGrade, localDate, type Homework } from '../../services/homework';
import { Button } from '../../components/ui';
import { byStudent, byUnit, studentKey } from './stats';
import { STATUS_TEXT, homeworkReport, useTeacherData } from './homeworkStats';

const RANGES = [
  { days: 7, label: '7 ngày' },
  { days: 30, label: '30 ngày' },
  { days: 90, label: '3 tháng' },
];

export function ParentReport() {
  const { key = 'all' } = useParams();
  const nav = useNavigate();
  const { results, homework, error } = useTeacherData();
  const [days, setDays] = useState(30);
  const since = useMemo(() => new Date(Date.now() - days * 86400_000).toISOString(), [days]);

  const students = useMemo(() => {
    if (!results) return [];
    const inRange = results.filter((r) => r.at >= since);
    const all = byStudent(inRange).filter((s) => !s.key.startsWith('#'));
    return key === 'all' ? all : all.filter((s) => s.key === key);
  }, [results, since, key]);

  return (
    <div className="min-h-full bg-white print:bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b-2 border-slate-100 bg-white/95 p-3 print:hidden">
        <Button color="white" className="!py-2" onClick={() => nav(-1)}>
          ← Quay lại
        </Button>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Button key={r.days} color={days === r.days ? 'purple' : 'white'} className="!py-1.5 !px-3 text-sm" onClick={() => setDays(r.days)}>
              {r.label}
            </Button>
          ))}
        </div>
        <div className="flex-1" />
        <span className="text-sm font-bold text-slate-500">{students.length > 1 ? `${students.length} phiếu · mỗi em 1 trang` : ''}</span>
        <Button color="green" onClick={() => window.print()} disabled={!students.length}>
          🖨️ In / Lưu PDF
        </Button>
      </div>
      {error && <div className="m-4 rounded-2xl bg-rose-50 p-3 font-bold text-rose-700">❌ {error}</div>}
      {!results && !error && <div className="p-8 text-center font-bold text-sky-800">⏳ Đang tải…</div>}
      {results && !students.length && <div className="p-8 text-center font-bold text-slate-500">Không có kết quả nào của {key === 'all' ? 'học sinh' : 'em này'} trong {days} ngày qua.</div>}
      {students.map((s) => (
        <Sheet key={s.key} name={s.name} sKey={s.key} days={days} since={since} results={results!} homework={homework ?? []} />
      ))}
    </div>
  );
}

function Sheet({ name, sKey, days, since, results, homework }: { name: string; sKey: string; days: number; since: string; results: ResultRecord[]; homework: Homework[] }) {
  const list = results.filter((r) => r.at >= since && studentKey(r) === sKey);
  const answered = list.reduce((a, r) => a + r.answered, 0);
  const correct = list.reduce((a, r) => a + r.correct, 0);
  const pct = answered ? Math.round((correct / answered) * 100) : 0;
  const activeDays = new Set(list.map((r) => localDate(new Date(r.at)))).size;
  const units = byUnit(list);
  const words = byStudent(list)[0]?.words ?? [];
  // Bài tập giao trong khoảng thời gian này
  const hws = homework
    .filter((h) => h.createdAt >= since)
    .sort((a, b) => a.due.localeCompare(b.due))
    .map((h) => ({ h, row: homeworkReport(h, results).rows.find((r) => r.key === sKey) }));
  const [comment, setComment] = useState('');

  return (
    <article className="mx-auto max-w-3xl p-6 text-slate-800 break-after-page print:p-0 [print-color-adjust:exact]" data-testid="report-sheet">
      <header className="flex items-end justify-between gap-3 border-b-4 border-sky-500 pb-2">
        <div>
          <div className="text-sm font-extrabold uppercase tracking-wide text-sky-600">Block Quest English · Phiếu kết quả học tập</div>
          <h1 className="text-3xl font-extrabold text-slate-900">🧒 {name}</h1>
        </div>
        <div className="text-right text-sm font-bold text-slate-500">
          {days} ngày gần nhất
          <br />
          In ngày {fmtDate(localDate(), true)}
        </div>
      </header>

      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        <Box label="Ngày có luyện tập" value={`${activeDays}`} />
        <Box label="Lượt luyện tập" value={`${list.length}`} />
        <Box label="Câu đã trả lời" value={`${answered}`} />
        <Box label="Tỉ lệ đúng" value={`${pct}%`} cls={pct >= 80 ? 'text-green-700' : pct >= 50 ? 'text-amber-700' : 'text-rose-700'} />
      </div>

      <h2 className="mt-5 text-lg font-extrabold text-sky-800">📝 Bài tập về nhà</h2>
      {hws.length === 0 ? (
        <p className="font-bold text-slate-500">Không có bài tập nào được giao trong thời gian này.</p>
      ) : (
        <table className="mt-1 w-full text-left text-sm">
          <thead>
            <tr className="border-b-2 border-slate-200 text-xs font-extrabold text-slate-500">
              <th className="py-1">Bài tập</th>
              <th>Hạn nộp</th>
              <th>Trạng thái</th>
              <th className="text-right">Điểm lần đầu</th>
              <th className="text-right">Cao nhất</th>
            </tr>
          </thead>
          <tbody className="font-bold">
            {hws.map(({ h, row }) => (
              <tr key={h.id} className="border-b border-slate-100">
                <td className="py-1">{h.title}</td>
                <td>{fmtDate(h.due)}</td>
                <td className={!row || row.status === 'missing' ? 'text-rose-600' : row.status === 'late' ? 'text-amber-600' : 'text-green-700'}>{STATUS_TEXT[row?.status ?? 'missing']}</td>
                <td className="text-right text-base">{row?.first != null ? fmtGrade(row.first) : '—'}</td>
                <td className="text-right">{row?.best != null ? fmtGrade(row.best) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-5 grid grid-cols-2 gap-5">
        <section>
          <h2 className="text-lg font-extrabold text-sky-800">📚 Theo bài học</h2>
          {units.length === 0 && <p className="font-bold text-slate-500">—</p>}
          {units.map((u) => (
            <div key={u.unitId} className="flex justify-between gap-2 border-b border-slate-100 py-0.5 text-sm font-bold">
              <span className="truncate">{u.unit.split(' · ').pop()}</span>
              <span className={`shrink-0 ${u.pct >= 80 ? 'text-green-700' : u.pct >= 50 ? 'text-amber-700' : 'text-rose-700'}`}>
                {u.pct}% · {u.games} lượt
              </span>
            </div>
          ))}
        </section>
        <section>
          <h2 className="text-lg font-extrabold text-sky-800">🔁 Từ cần ôn thêm</h2>
          {words.length === 0 && <p className="font-bold text-green-700">Không sai từ nào 🎉</p>}
          {words.slice(0, 12).map((w) => (
            <div key={w.key} className="flex justify-between gap-2 border-b border-slate-100 py-0.5 text-sm font-bold">
              <span className="truncate">
                <b className="text-sky-800">{w.en}</b> – {w.vi}
              </span>
              <span className="shrink-0 text-rose-600">sai {w.misses} lần</span>
            </div>
          ))}
        </section>
      </div>

      <h2 className="mt-5 text-lg font-extrabold text-sky-800">✍️ Nhận xét của giáo viên</h2>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Gõ nhận xét (sẽ được in ra), hoặc để trống để viết tay"
        className="mt-1 w-full min-h-[90px] rounded-xl border-2 border-dashed border-slate-300 p-2 font-bold select-text print:border-solid print:placeholder-transparent"
      />
      <div className="mt-4 grid grid-cols-2 gap-6 text-center text-sm font-bold text-slate-500">
        <div>
          Chữ ký phụ huynh
          <div className="h-14" />
        </div>
        <div>
          Giáo viên
          <div className="h-14" />
        </div>
      </div>
      <p className="mt-2 text-xs font-bold text-slate-400">Ở nhà, phụ huynh xem thêm trong game: Trang chủ → 👪 Phụ huynh.</p>
    </article>
  );
}

function Box({ label, value, cls = 'text-sky-800' }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-xl border-2 border-slate-100 p-2">
      <div className="text-xs font-extrabold text-slate-500">{label}</div>
      <div className={`text-2xl font-extrabold ${cls}`}>{value}</div>
    </div>
  );
}
