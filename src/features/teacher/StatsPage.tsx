// ============================================================
// Thống kê: học sinh · bài học · từ hay sai · lịch sử. Lọc theo thời gian / chế độ / bài.
// ============================================================
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { clearLocalResults, localResults, type ResultMode, type ResultRecord } from '../../services/results';
import { useTeacher } from '../../stores/teacher';
import { Button } from '../../components/ui';
import { TeacherLayout } from './TeacherApp';
import { pctClass } from './widgets';
import { byStudent, byUnit, exportStats, fmtTime, MODE_LABEL, outcomeText, studentName, summary, topWords, type StudentStat } from './stats';

type Tab = 'students' | 'units' | 'words' | 'history';
const RANGES = [
  { id: '7', label: '7 ngày', days: 7 },
  { id: '30', label: '30 ngày', days: 30 },
  { id: 'all', label: 'Tất cả', days: 0 },
];

export function StatsPage() {
  const { mode, pin } = useTeacher();
  const [all, setAll] = useState<ResultRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState('30');
  const [modeFilter, setModeFilter] = useState<'all' | ResultMode>('all');
  const [unitFilter, setUnitFilter] = useState('all');
  const [tab, setTab] = useState<Tab>('students');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setAll(null);
    setError(null);
    (async () => {
      if (mode === 'server' && pin) {
        const r = await api.getResults(pin);
        if (!alive) return;
        if (r.ok && r.data) setAll(r.data as ResultRecord[]);
        else setError(r.error ?? 'Không tải được thống kê');
      } else setAll(localResults());
    })();
    return () => {
      alive = false;
    };
  }, [mode, pin, reload]);

  const list = useMemo(() => {
    if (!all) return [];
    const days = RANGES.find((r) => r.id === range)?.days ?? 0;
    const since = days ? new Date(Date.now() - days * 86400_000).toISOString() : '';
    return all.filter((r) => r.at >= since && (modeFilter === 'all' || r.mode === modeFilter) && (unitFilter === 'all' || r.unitId === unitFilter)).sort((a, b) => a.at.localeCompare(b.at));
  }, [all, range, modeFilter, unitFilter]);

  const unitOptions = useMemo(() => byUnit(all ?? []).map((u) => ({ id: u.unitId, label: u.unit })), [all]);
  const sum = summary(list);

  const clear = async () => {
    if (!confirm('Xóa toàn bộ thống kê? (Máy chủ vẫn giữ một bản sao lưu trong thư mục data.)')) return;
    if (mode === 'server' && pin) {
      const r = await api.clearResults(pin);
      if (!r.ok) return setError(r.error ?? 'Không xóa được');
    } else clearLocalResults();
    setReload((x) => x + 1);
  };

  return (
    <TeacherLayout title="📊 Thống kê">
      {/* Bộ lọc */}
      <div className="panel p-3 flex flex-wrap items-end gap-2">
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Button key={r.id} color={range === r.id ? 'purple' : 'white'} className="!py-1.5 !px-3 text-sm" onClick={() => setRange(r.id)}>
              {r.label}
            </Button>
          ))}
        </div>
        <select className="input !w-auto" value={modeFilter} onChange={(e) => setModeFilter(e.target.value as 'all' | ResultMode)} aria-label="Chế độ chơi">
          <option value="all">Mọi chế độ</option>
          {(Object.keys(MODE_LABEL) as ResultMode[]).map((m) => (
            <option key={m} value={m}>
              {MODE_LABEL[m]}
            </option>
          ))}
        </select>
        <select className="input !w-auto max-w-full" value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} aria-label="Bài học">
          <option value="all">Mọi bài học</option>
          {unitOptions.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>
        <div className="ml-auto flex gap-1">
          <Button color="white" className="!py-1.5 text-sm" onClick={() => setReload((x) => x + 1)}>
            🔄 Tải lại
          </Button>
          <Button color="green" className="!py-1.5 text-sm" disabled={!list.length} onClick={() => exportStats(list, `thong-ke-${new Date().toISOString().slice(0, 10)}.xlsx`)}>
            ⬇ Xuất Excel
          </Button>
        </div>
      </div>

      {error && <div className="rounded-2xl border-2 border-rose-200 bg-rose-50 p-3 font-bold text-rose-700">❌ {error}</div>}
      {!all && !error && <div className="font-bold text-sky-800">⏳ Đang tải…</div>}

      {all && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Tile label="Học sinh" value={sum.students} />
            <Tile label="Số trận" value={sum.games} />
            <Tile label="Câu đã trả lời" value={sum.answered} />
            <Tile label="Tỉ lệ đúng" value={`${sum.pct}%`} cls={pctClass(sum.pct)} />
          </div>

          {list.length === 0 ? (
            <div className="panel p-6 text-center font-bold text-slate-500">
              Chưa có trận nào trong khoảng thời gian này.
              <br />
              Kết quả được gửi về mỗi khi học sinh chơi xong một trận{mode === 'server' ? ' trên bất kỳ máy nào mở game từ máy tính này' : ''}.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ['students', '🧒 Học sinh'],
                    ['units', '📚 Theo bài'],
                    ['words', '❗ Từ hay sai'],
                    ['history', '🕘 Lịch sử'],
                  ] as const
                ).map(([id, label]) => (
                  <Button key={id} color={tab === id ? 'blue' : 'white'} className="!py-2 text-sm sm:text-base" onClick={() => setTab(id)}>
                    {label}
                  </Button>
                ))}
              </div>
              {tab === 'students' && <Students list={list} />}
              {tab === 'units' && <Units list={list} />}
              {tab === 'words' && <Words list={list} />}
              {tab === 'history' && <History list={list} />}
            </>
          )}

          <div className="text-right">
            <Button color="white" className="!py-1.5 text-sm !text-rose-600" onClick={clear}>
              🗑 Xóa thống kê
            </Button>
          </div>
        </>
      )}
    </TeacherLayout>
  );
}

function Tile({ label, value, cls = 'text-sky-800' }: { label: string; value: string | number; cls?: string }) {
  return (
    <div className="panel p-3 text-center">
      <div className="text-xs font-extrabold text-slate-400">{label}</div>
      <div className={`text-2xl font-extrabold ${cls}`}>{value}</div>
    </div>
  );
}

/** Bảng cuộn ngang trên điện thoại */
function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b-2 border-slate-100 text-xs font-extrabold text-slate-400">
            {head.map((h) => (
              <th key={h} className="px-3 py-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-bold text-slate-700">{children}</tbody>
      </table>
    </div>
  );
}

function Students({ list }: { list: ResultRecord[] }) {
  const rows = useMemo(() => byStudent(list), [list]);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Table head={['Học sinh', 'Số trận', 'Thắng', 'Đúng', 'Từ hay sai', 'Lần gần nhất']}>
      {rows.map((s) => (
        <StudentRow key={s.key} s={s} open={open === s.key} onToggle={() => setOpen(open === s.key ? null : s.key)} />
      ))}
    </Table>
  );
}

function StudentRow({ s, open, onToggle }: { s: StudentStat; open: boolean; onToggle: () => void }) {
  const nav = useNavigate();
  return (
    <>
      <tr className="border-b border-slate-100 cursor-pointer hover:bg-sky-50" onClick={onToggle}>
        <td className="px-3 py-2 font-extrabold text-sky-800">
          {open ? '▾' : '▸'} {s.name}
        </td>
        <td className="px-3 py-2">{s.games}</td>
        <td className="px-3 py-2">{s.wins}</td>
        <td className={`px-3 py-2 ${pctClass(s.pct)}`}>
          {s.pct}% <span className="text-xs text-slate-400">({s.correct}/{s.answered})</span>
        </td>
        <td className="px-3 py-2 text-slate-500">{s.words.slice(0, 3).map((w) => w.en).join(', ') || '—'}</td>
        <td className="px-3 py-2 text-xs text-slate-500">{fmtTime(s.last)}</td>
      </tr>
      {open && (
        <tr className="bg-slate-50">
          <td colSpan={6} className="px-3 py-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-extrabold text-slate-400">THEO BÀI</div>
                {s.units.map((u) => (
                  <div key={u.unit} className="flex justify-between gap-2">
                    <span className="truncate">{u.unit}</span>
                    <span className={`shrink-0 ${pctClass(u.pct)}`}>
                      {u.pct}% · {u.games} trận
                    </span>
                  </div>
                ))}
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between gap-2 text-xs font-extrabold text-slate-400">
                  TỪ / MẪU CÂU CÒN SAI
                  <button className="rounded-lg bg-violet-100 px-2 py-1 text-violet-700 hover:bg-violet-200" onClick={() => nav(`/teacher/report/${encodeURIComponent(s.key)}`)}>
                    📄 Phiếu cho phụ huynh
                  </button>
                </div>
                {s.words.length === 0 && <span className="text-green-600">Không sai từ nào 🎉</span>}
                {s.words.slice(0, 12).map((w) => (
                  <div key={w.key} className="flex justify-between gap-2">
                    <span className="truncate">
                      <b className="text-sky-700">{w.en}</b> – {w.vi}
                    </span>
                    <span className="shrink-0 text-rose-600">×{w.misses}</span>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Units({ list }: { list: ResultRecord[] }) {
  const rows = useMemo(() => byUnit(list), [list]);
  return (
    <Table head={['Bài học', 'Lượt chơi', 'Học sinh', 'Đúng', 'Từ hay sai']}>
      {rows.map((u) => (
        <tr key={u.unitId} className="border-b border-slate-100">
          <td className="px-3 py-2">{u.unit}</td>
          <td className="px-3 py-2">{u.games}</td>
          <td className="px-3 py-2">{u.students}</td>
          <td className={`px-3 py-2 ${pctClass(u.pct)}`}>{u.pct}%</td>
          <td className="px-3 py-2 text-slate-500">{u.words.slice(0, 4).map((w) => w.en).join(', ') || '—'}</td>
        </tr>
      ))}
    </Table>
  );
}

function Words({ list }: { list: ResultRecord[] }) {
  const rows = useMemo(() => topWords(list).slice(0, 60), [list]);
  if (!rows.length) return <div className="panel p-6 text-center font-bold text-green-600">Không có từ nào bị sai 🎉</div>;
  return (
    <Table head={['Từ / mẫu câu', 'Nghĩa', 'Bài học', 'Số lần sai', 'Số học sinh sai']}>
      {rows.map((w) => (
        <tr key={w.key} className="border-b border-slate-100">
          <td className="px-3 py-2 font-extrabold text-sky-700">{w.en}</td>
          <td className="px-3 py-2">{w.vi}</td>
          <td className="px-3 py-2 text-xs text-slate-500">{w.unit}</td>
          <td className="px-3 py-2 text-rose-600">{w.misses}</td>
          <td className="px-3 py-2">{w.students}</td>
        </tr>
      ))}
    </Table>
  );
}

function History({ list }: { list: ResultRecord[] }) {
  const rows = [...list].reverse().slice(0, 200);
  return (
    <Table head={['Thời gian', 'Học sinh', 'Chế độ', 'Bài học', 'Kết quả', 'Đúng']}>
      {rows.map((r) => (
        <tr key={r.id} className="border-b border-slate-100">
          <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{fmtTime(r.at)}</td>
          <td className="px-3 py-2">{studentName(r)}</td>
          <td className="px-3 py-2 text-xs">
            {MODE_LABEL[r.mode]}
            <div className="text-slate-400">{r.opponent}</div>
          </td>
          <td className="px-3 py-2 text-xs">{r.unit}</td>
          <td className={`px-3 py-2 ${r.outcome === 'win' ? 'text-green-600' : r.outcome === 'loss' ? 'text-rose-600' : 'text-slate-500'}`}>{outcomeText(r)}</td>
          <td className="px-3 py-2">
            {r.correct}/{r.answered}
          </td>
        </tr>
      ))}
    </Table>
  );
}
