// ============================================================
// Tổng hợp kết quả các trận: theo học sinh, theo bài, theo từ hay sai + xuất Excel
// ============================================================
import writeXlsxFile, { type SheetData } from 'write-excel-file/browser';
import type { ResultMode, ResultRecord } from '../../services/results';

export const MODE_LABEL: Record<ResultMode, string> = {
  adventure: 'Phiêu lưu',
  'duel-bot': 'Solo với máy',
  'duel-pvp': 'Solo với bạn',
  class: 'Lớp học',
  homework: 'Bài tập về nhà',
};

export const OUTCOME_LABEL = { win: 'Thắng', loss: 'Thua', draw: 'Hòa' } as const;

/** Kết quả 1 trận; phòng luyện tập trên lớp ghi thứ hạng, bài tập về nhà ghi điểm */
export const outcomeText = (r: ResultRecord) =>
  r.mode === 'homework' && r.grade !== undefined ? `${String(r.grade).replace('.', ',')} điểm${r.late && r.attempt === 1 ? ' (muộn)' : ''}` : r.place ? `Hạng ${r.place}` : OUTCOME_LABEL[r.outcome];

/** Học sinh: theo tên (không phân biệt hoa thường); chưa đặt tên → theo máy */
export function studentKey(r: ResultRecord) {
  const name = r.player.trim();
  return name ? name.toLowerCase() : `#${r.deviceId}`;
}
export function studentName(r: ResultRecord) {
  return r.player.trim() || `(chưa đặt tên · máy ${r.deviceId.slice(0, 4)})`;
}

const pct = (c: number, a: number) => (a ? Math.round((c / a) * 100) : 0);

export interface WordStat {
  key: string;
  en: string;
  vi: string;
  unit: string;
  misses: number;
  students: number;
}

function wordStats(list: ResultRecord[]): WordStat[] {
  const map = new Map<string, WordStat & { who: Set<string> }>();
  for (const r of list)
    for (const w of r.wrong) {
      const key = `${r.unitId}/${w.id}`;
      const s = map.get(key) ?? { key, en: w.en, vi: w.vi, unit: r.unit, misses: 0, students: 0, who: new Set<string>() };
      s.misses++;
      s.who.add(studentKey(r));
      map.set(key, s);
    }
  return Array.from(map.values())
    .map(({ who, ...s }) => ({ ...s, students: who.size }))
    .sort((a, b) => b.misses - a.misses || b.students - a.students);
}

export interface StudentStat {
  key: string;
  name: string;
  games: number;
  wins: number;
  answered: number;
  correct: number;
  pct: number;
  last: string;
  units: { unit: string; games: number; pct: number }[];
  words: WordStat[];
}

export function byStudent(list: ResultRecord[]): StudentStat[] {
  const groups = new Map<string, ResultRecord[]>();
  for (const r of list) groups.set(studentKey(r), [...(groups.get(studentKey(r)) ?? []), r]);
  return Array.from(groups.entries())
    .map(([key, rs]) => {
      const answered = rs.reduce((a, r) => a + r.answered, 0);
      const correct = rs.reduce((a, r) => a + r.correct, 0);
      const units = byUnit(rs).map((u) => ({ unit: u.unit, games: u.games, pct: u.pct }));
      return {
        key,
        name: studentName(rs[rs.length - 1]),
        games: rs.length,
        wins: rs.filter((r) => r.outcome === 'win').length,
        answered,
        correct,
        pct: pct(correct, answered),
        last: rs.reduce((a, r) => (r.at > a ? r.at : a), ''),
        units,
        words: wordStats(rs),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

export interface UnitStat {
  unitId: string;
  unit: string;
  games: number;
  students: number;
  pct: number;
  words: WordStat[];
}

export function byUnit(list: ResultRecord[]): UnitStat[] {
  const groups = new Map<string, ResultRecord[]>();
  for (const r of list) groups.set(r.unitId, [...(groups.get(r.unitId) ?? []), r]);
  return Array.from(groups.entries())
    .map(([unitId, rs]) => ({
      unitId,
      unit: rs[rs.length - 1].unit,
      games: rs.length,
      students: new Set(rs.map(studentKey)).size,
      pct: pct(
        rs.reduce((a, r) => a + r.correct, 0),
        rs.reduce((a, r) => a + r.answered, 0),
      ),
      words: wordStats(rs),
    }))
    .sort((a, b) => a.unit.localeCompare(b.unit, 'vi', { numeric: true }));
}

export const topWords = wordStats;

export function summary(list: ResultRecord[]) {
  const answered = list.reduce((a, r) => a + r.answered, 0);
  const correct = list.reduce((a, r) => a + r.correct, 0);
  return { students: new Set(list.map(studentKey)).size, games: list.length, answered, pct: pct(correct, answered) };
}

export const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const head = (titles: string[]) => titles.map((value) => ({ value, fontWeight: 'bold' as const, backgroundColor: '#DDD6FE' }));

export async function exportStats(list: ResultRecord[], fileName: string) {
  const students: SheetData = [
    head(['Học sinh', 'Số trận', 'Thắng', 'Câu trả lời', 'Câu đúng', '% đúng', 'Từ hay sai', 'Lần chơi gần nhất']),
    ...byStudent(list).map((s) => [s.name, s.games, s.wins, s.answered, s.correct, s.pct, s.words.slice(0, 5).map((w) => w.en).join(', '), fmtTime(s.last)]),
  ];
  const units: SheetData = [head(['Bài học', 'Lượt chơi', 'Số học sinh', '% đúng', 'Từ hay sai']), ...byUnit(list).map((u) => [u.unit, u.games, u.students, u.pct, u.words.slice(0, 5).map((w) => w.en).join(', ')])];
  const words: SheetData = [head(['Từ / mẫu câu', 'Nghĩa', 'Bài học', 'Số lần sai', 'Số học sinh sai']), ...topWords(list).map((w) => [w.en, w.vi, w.unit, w.misses, w.students])];
  const history: SheetData = [
    head(['Thời gian', 'Học sinh', 'Chế độ', 'Bài học', 'Đối thủ', 'Kết quả', 'Đúng', 'Tổng câu', 'Điểm', 'Từ sai']),
    ...[...list].reverse().map((r) => [fmtTime(r.at), studentName(r), MODE_LABEL[r.mode], r.unit, r.opponent, outcomeText(r), r.correct, r.answered, r.score, r.wrong.map((w) => w.en).join(', ')]),
  ];
  await writeXlsxFile([
    { sheet: 'Hoc sinh', data: students, columns: [{ width: 26 }, { width: 9 }, { width: 8 }, { width: 11 }, { width: 10 }, { width: 8 }, { width: 40 }, { width: 18 }], stickyRowsCount: 1 },
    { sheet: 'Theo bai', data: units, columns: [{ width: 50 }, { width: 10 }, { width: 11 }, { width: 8 }, { width: 40 }], stickyRowsCount: 1 },
    { sheet: 'Tu hay sai', data: words, columns: [{ width: 34 }, { width: 40 }, { width: 50 }, { width: 11 }, { width: 14 }], stickyRowsCount: 1 },
    { sheet: 'Lich su', data: history, columns: [{ width: 18 }, { width: 22 }, { width: 14 }, { width: 46 }, { width: 22 }, { width: 9 }, { width: 7 }, { width: 9 }, { width: 8 }, { width: 40 }], stickyRowsCount: 1 },
  ]).toFile(fileName);
}
