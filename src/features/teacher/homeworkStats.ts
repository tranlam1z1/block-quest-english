// ============================================================
// Bài tập về nhà phía giáo viên: ai đã nộp / chưa làm, điểm lần đầu & cao nhất,
// câu cả lớp hay sai, tin nhắn gửi phụ huynh, xuất Excel.
// ============================================================
import { useEffect, useState } from 'react';
import writeXlsxFile, { type SheetData } from 'write-excel-file/browser';
import { api } from '../../services/api';
import { localResults, type ResultRecord } from '../../services/results';
import { fmtDate, fmtGrade, homeworkAdmin, type Homework } from '../../services/homework';
import { isShared, useTeacher } from '../../stores/teacher';
import { fmtTime, studentKey, studentName } from './stats';

/**
 * Tải toàn bộ kết quả + danh sách bài tập (máy chủ, hoặc trình duyệt này).
 * autoMs > 0: tự tải lại định kỳ (thầy cô thấy bài nộp mới mà không cần bấm).
 */
export function useTeacherData(autoMs = 0) {
  const { mode, pin } = useTeacher();
  const [results, setResults] = useState<ResultRecord[] | null>(null);
  const [homework, setHomework] = useState<Homework[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(null);
    (async () => {
      const [r, h] = await Promise.all([isShared(mode) && pin ? api.getResults(pin) : Promise.resolve({ ok: true, data: localResults() as unknown[], error: undefined }), homeworkAdmin.list()]);
      if (!alive) return;
      if (r.ok && r.data) setResults((r.data as ResultRecord[]).slice().sort((a, b) => a.at.localeCompare(b.at)));
      else setError(r.error ?? 'Không tải được kết quả');
      if (h.ok) setHomework(h.data);
      else setError(h.error ?? 'Không tải được bài tập');
    })();
    return () => {
      alive = false;
    };
  }, [mode, pin, reload]);
  useEffect(() => {
    if (!autoMs) return;
    const t = setInterval(() => !document.hidden && setReload((x) => x + 1), autoMs);
    return () => clearInterval(t);
  }, [autoMs]);
  return { results, homework, error, refresh: () => setReload((x) => x + 1) };
}

export interface HwRow {
  key: string;
  name: string;
  status: 'ontime' | 'late' | 'missing';
  attempts: number;
  first: number | null;
  best: number | null;
  firstAt: string;
  /** Từ sai ở lần làm đầu tiên */
  wrong: { id: string; en: string; vi: string }[];
}

/**
 * Học sinh đã biết = những em có kết quả trong 60 ngày trước khi giao bài trở về sau
 * (đã đặt tên). Em nào chưa nộp bài → "Chưa làm".
 */
export function homeworkReport(hw: Homework, results: ResultRecord[]) {
  const mine = results.filter((r) => r.mode === 'homework' && r.homeworkId === hw.id);
  const since = new Date(new Date(hw.createdAt).getTime() - 60 * 86400_000).toISOString();
  const known = new Map<string, string>();
  for (const r of results) if (r.at >= since && r.player.trim()) known.set(studentKey(r), studentName(r));

  const groups = new Map<string, ResultRecord[]>();
  for (const r of mine) groups.set(studentKey(r), [...(groups.get(studentKey(r)) ?? []), r]);

  const rows: HwRow[] = [];
  for (const [key, rs] of groups) {
    rs.sort((a, b) => a.at.localeCompare(b.at) || (a.attempt ?? 0) - (b.attempt ?? 0));
    const f = rs[0];
    rows.push({
      key,
      name: studentName(rs[rs.length - 1]),
      status: f.late ? 'late' : 'ontime',
      attempts: rs.length,
      first: f.grade ?? null,
      best: Math.max(...rs.map((r) => r.grade ?? 0)),
      firstAt: f.at,
      wrong: f.wrong,
    });
  }
  for (const [key, name] of known) if (!groups.has(key)) rows.push({ key, name, status: 'missing', attempts: 0, first: null, best: null, firstAt: '', wrong: [] });
  rows.sort((a, b) => (a.status === 'missing' ? 1 : 0) - (b.status === 'missing' ? 1 : 0) || a.name.localeCompare(b.name, 'vi'));

  const submitted = rows.filter((r) => r.status !== 'missing');
  const avg = submitted.length ? Math.round((submitted.reduce((a, r) => a + (r.first ?? 0), 0) / submitted.length) * 10) / 10 : null;

  // Câu hay sai (theo lần làm đầu tiên của mỗi em)
  const total = submitted.length;
  const items = new Map<string, { id: string; en: string; vi: string; wrong: number }>();
  for (const q of hw.questions) if (!items.has(q.item.id)) items.set(q.item.id, { id: q.item.id, en: q.item.en, vi: q.item.vi, wrong: 0 });
  for (const r of submitted)
    for (const w of r.wrong) {
      const it = items.get(w.id);
      if (it) it.wrong++;
    }
  const hardest = [...items.values()].filter((x) => x.wrong > 0).sort((a, b) => b.wrong - a.wrong);

  return { rows, submitted: submitted.length, late: submitted.filter((r) => r.status === 'late').length, missing: rows.length - submitted.length, avg, hardest, total };
}

export const STATUS_TEXT = { ontime: '✅ Đúng hạn', late: '🕒 Nộp muộn', missing: '❌ Chưa làm' } as const;

/** Tin nhắn giao bài (dán vào nhóm Zalo / Messenger của lớp) */
export function assignMessage(hw: Homework) {
  return [
    `📝 BÀI TẬP VỀ NHÀ: ${hw.title}`,
    `📚 ${hw.unit} · ${hw.questions.length} câu`,
    `⏰ Hạn nộp: hết ngày ${fmtDate(hw.due, true)}`,
    hw.note ? `💬 ${hw.note}` : '',
    'Con mở game Block Quest English → bấm "📝 Bài tập" để làm. Bố mẹ xem kết quả ở mục "👪 Phụ huynh".',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Tin nhắn báo kết quả cho cả lớp */
export function resultMessage(hw: Homework, rep: ReturnType<typeof homeworkReport>) {
  const missing = rep.rows.filter((r) => r.status === 'missing').map((r) => r.name);
  const good = rep.rows.filter((r) => (r.first ?? 0) >= 9).map((r) => r.name);
  return [
    `📊 KẾT QUẢ BÀI TẬP: ${hw.title} (hạn ${fmtDate(hw.due, true)})`,
    `Đã nộp: ${rep.submitted}/${rep.rows.length} bạn${rep.avg !== null ? ` · điểm trung bình ${fmtGrade(rep.avg)}` : ''}`,
    good.length ? `🌟 Từ 9 điểm: ${good.join(', ')}` : '',
    missing.length ? `⏳ Chưa làm: ${missing.join(', ')}` : '🎉 Cả lớp đã nộp bài!',
    rep.hardest.length ? `🔁 Cần ôn thêm: ${rep.hardest.slice(0, 5).map((h) => h.en).join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

const head = (titles: string[]) => titles.map((value) => ({ value, fontWeight: 'bold' as const, backgroundColor: '#FDE68A' }));

export async function exportHomework(hw: Homework, rep: ReturnType<typeof homeworkReport>) {
  const students: SheetData = [
    head(['Học sinh', 'Trạng thái', 'Điểm lần đầu', 'Điểm cao nhất', 'Số lần làm', 'Nộp lúc', 'Từ sai (lần đầu)']),
    ...rep.rows.map((r) => [r.name, STATUS_TEXT[r.status].slice(2).trim(), r.first ?? '', r.best ?? '', r.attempts, r.firstAt ? fmtTime(r.firstAt) : '', r.wrong.map((w) => w.en).join(', ')]),
  ];
  const words: SheetData = [head(['Từ / mẫu câu', 'Nghĩa', 'Số bạn sai', 'Số bạn đã nộp']), ...rep.hardest.map((h) => [h.en, h.vi, h.wrong, rep.total])];
  await writeXlsxFile([
    { sheet: 'Hoc sinh', data: students, columns: [{ width: 24 }, { width: 14 }, { width: 13 }, { width: 14 }, { width: 11 }, { width: 18 }, { width: 50 }], stickyRowsCount: 1 },
    { sheet: 'Cau hay sai', data: words, columns: [{ width: 40 }, { width: 40 }, { width: 11 }, { width: 14 }], stickyRowsCount: 1 },
  ]).toFile(`bai-tap-${hw.due}-${hw.title.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 30)}.xlsx`);
}
