// ============================================================
// Excel: tải file mẫu, đọc file giáo viên tải lên, xuất unit ra Excel.
//
// File gồm 2 trang (sheet):
//   "Tu vung":  Unit | Tên unit (tiếng Anh) | Tên unit (tiếng Việt) | Từ tiếng Anh | Nghĩa tiếng Việt | Hình (emoji) | Nhóm đồng nghĩa
//   "Mau cau":  Unit | Câu hỏi | Câu trả lời | Nghĩa (hỏi – đáp) | Hình (emoji) | Từ đục lỗ
// Tên unit chỉ cần ghi ở dòng đầu tiên của unit đó.
// ============================================================
import readXlsxFile from 'read-excel-file/browser';
import writeXlsxFile, { type SheetData } from 'write-excel-file/browser';
import type { SentencePattern, Unit, VocabItem } from '../../types/content';
import { formatBlanks, parseBlanks } from '../../content/blanks';
import { fixDash } from '../../content/validate';

const VOCAB_HEADERS = ['Unit', 'Tên unit (tiếng Anh)', 'Tên unit (tiếng Việt)', 'Từ tiếng Anh', 'Nghĩa tiếng Việt', 'Hình (emoji)', 'Nhóm đồng nghĩa'];
const PATTERN_HEADERS = ['Unit', 'Câu hỏi', 'Câu trả lời', 'Nghĩa (hỏi – đáp)', 'Hình (emoji)', 'Từ đục lỗ'];

const head = (titles: string[]) => titles.map((value) => ({ value, fontWeight: 'bold' as const, backgroundColor: '#FDE68A' }));

const GUIDE: string[] = [
  'HƯỚNG DẪN NHẬP BÀI HỌC – Block Quest English',
  '',
  '1. Trang "Tu vung": mỗi dòng là 1 từ. Cột Unit ghi số unit (VD 4).',
  '   Tên unit chỉ cần ghi ở dòng đầu tiên của unit đó.',
  '   Hình: dán 1 emoji (VD 🍎). Để trống nếu từ không vẽ được (VD "fine").',
  '   Nhóm đồng nghĩa: các từ cùng nhóm (VD hello, hi → nhóm "chao") sẽ không làm đáp án sai của nhau.',
  '2. Trang "Mau cau": mỗi dòng là 1 cặp hỏi – đáp.',
  '   Nghĩa: ghi "nghĩa câu hỏi – nghĩa câu trả lời", ngăn cách bằng dấu gạch có cách 2 bên.',
  '   Từ đục lỗ: các từ dùng cho dạng "Điền từ còn thiếu", ngăn cách bằng dấu chấm phẩy.',
  '   Muốn tự ghi 3 đáp án sai thì viết trong ngoặc: What\'s(Who\'s, Is, Yes)',
  '3. Mỗi unit cần ít nhất 4 từ và sinh được ít nhất 20 câu hỏi (game sẽ kiểm tra khi nhập).',
  '4. Lưu file dạng .xlsx rồi vào Khu vực giáo viên → Nhập Excel.',
];

/** Dữ liệu ví dụ trong file mẫu */
const SAMPLE_VOCAB: (string | number)[][] = [
  [4, 'Our bodies', 'Cơ thể của chúng mình', 'eye', 'mắt', '👁️', ''],
  [4, '', '', 'ear', 'tai', '👂', ''],
  [4, '', '', 'nose', 'mũi', '👃', ''],
  [4, '', '', 'mouth', 'miệng', '👄', ''],
  [4, '', '', 'hand', 'bàn tay', '✋', ''],
  [4, '', '', 'face', 'khuôn mặt', '🙂', ''],
];
const SAMPLE_PATTERNS: string[][] = [
  ['4', "What's this?", "It's my eye.", 'Đây là gì? – Đây là mắt của mình.', '👁️', "eye; What's(Who's, Is, Yes)"],
  ['4', 'Touch your nose!', 'OK.', 'Chạm vào mũi của bạn! – Được.', '👃', 'nose'],
];

function sheetsFor(vocabRows: SheetData, patternRows: SheetData, withGuide: boolean) {
  const sheets = [
    { sheet: 'Tu vung', data: [head(VOCAB_HEADERS), ...vocabRows], columns: [{ width: 7 }, { width: 22 }, { width: 26 }, { width: 20 }, { width: 24 }, { width: 12 }, { width: 16 }], stickyRowsCount: 1 },
    { sheet: 'Mau cau', data: [head(PATTERN_HEADERS), ...patternRows], columns: [{ width: 7 }, { width: 30 }, { width: 30 }, { width: 50 }, { width: 12 }, { width: 34 }], stickyRowsCount: 1 },
  ];
  if (withGuide) sheets.unshift({ sheet: 'Huong dan', data: GUIDE.map((t, i) => [i === 0 ? { value: t, fontWeight: 'bold' as const } : t]) as SheetData, columns: [{ width: 110 }], stickyRowsCount: 0 });
  return sheets;
}

export async function downloadTemplate() {
  await writeXlsxFile(sheetsFor(SAMPLE_VOCAB, SAMPLE_PATTERNS, true)).toFile('mau-nhap-bai-hoc.xlsx');
}

/** Xuất các unit (VD cả 1 lớp) ra Excel theo đúng mẫu → sửa xong nhập lại được */
export async function exportUnits(units: Unit[], fileName: string) {
  const vocab: SheetData = [];
  const patterns: SheetData = [];
  for (const u of units) {
    u.vocab.forEach((v, i) => vocab.push([u.number, i === 0 ? u.title : '', i === 0 ? u.titleVi : '', v.en, v.vi, v.image ?? '', v.group ?? '']));
    for (const p of u.patterns) patterns.push([u.number, p.q, p.a, p.vi, p.image ?? '', formatBlanks(p.blanks)]);
  }
  await writeXlsxFile(sheetsFor(vocab, patterns, true)).toFile(fileName);
}

// ---------------- Đọc file ----------------

/** Unit đọc được từ file (chưa gắn bộ sách / lớp / id) */
export interface ParsedUnit {
  number: number;
  title: string;
  titleVi: string;
  vocab: VocabItem[];
  patterns: SentencePattern[];
}

/** Bỏ dấu, chữ thường, bỏ ký tự đặc biệt: "Tên unit (tiếng Anh)" → "tenunittienganh" */
const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const cell = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

type Matcher = (h: string) => boolean;
const VOCAB_COLS: Record<string, Matcher> = {
  unit: (h) => h === 'unit' || h === 'bai' || h === 'sounit',
  title: (h) => h.startsWith('tenunit') && h.includes('anh'),
  titleVi: (h) => h.startsWith('tenunit') && h.includes('viet'),
  en: (h) => h === 'tutienganh' || h === 'english' || h === 'tienganh',
  vi: (h) => h.startsWith('nghia') && h.includes('viet'),
  image: (h) => h.startsWith('hinh') || h === 'emoji',
  group: (h) => h.startsWith('nhom'),
};
const PATTERN_COLS: Record<string, Matcher> = {
  unit: VOCAB_COLS.unit,
  q: (h) => h === 'cauhoi',
  a: (h) => h === 'cautraloi',
  vi: (h) => h.startsWith('nghia'),
  image: (h) => h.startsWith('hinh') || h === 'emoji',
  blanks: (h) => h.includes('duclo'),
};

/** Tìm dòng tiêu đề (dòng có cột "Unit") và vị trí các cột */
function locate(rows: unknown[][], cols: Record<string, Matcher>) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const headers = rows[r].map(norm);
    if (!headers.some(cols.unit)) continue;
    const idx: Record<string, number> = {};
    for (const [k, m] of Object.entries(cols)) idx[k] = headers.findIndex(m);
    return { row: r, idx };
  }
  return null;
}

const unitNumber = (v: unknown) => {
  const m = cell(v).match(/\d+/);
  return m ? Number(m[0]) : NaN;
};

export async function parseWorkbook(file: File): Promise<{ units: ParsedUnit[]; errors: string[] }> {
  const errors: string[] = [];
  let sheets;
  try {
    sheets = await readXlsxFile(file);
  } catch {
    return { units: [], errors: ['Không đọc được file. Hãy lưu file dạng Excel (.xlsx) rồi thử lại.'] };
  }
  const byNumber = new Map<number, ParsedUnit>();
  const getUnit = (n: number) => {
    if (!byNumber.has(n)) byNumber.set(n, { number: n, title: '', titleVi: '', vocab: [], patterns: [] });
    return byNumber.get(n)!;
  };

  let foundVocab = false;
  let foundPatterns = false;
  for (const s of sheets) {
    const rows = s.data as unknown[][];
    const v = locate(rows, VOCAB_COLS);
    if (v && v.idx.en >= 0 && v.idx.vi >= 0) {
      foundVocab = true;
      let current = NaN;
      for (let r = v.row + 1; r < rows.length; r++) {
        const row = rows[r];
        const get = (k: string) => (v.idx[k] >= 0 ? cell(row[v.idx[k]]) : '');
        // Ô Unit để trống → thuộc unit của dòng trên (hay gặp khi gộp ô)
        const n = unitNumber(row[v.idx.unit]);
        if (!Number.isNaN(n)) current = n;
        const en = get('en');
        const vi = get('vi');
        if (!en && !vi && !get('title')) continue;
        if (Number.isNaN(current)) {
          errors.push(`Trang "${s.sheet}", dòng ${r + 1}: chưa ghi số unit.`);
          continue;
        }
        const u = getUnit(current);
        if (get('title')) u.title = get('title');
        if (get('titleVi')) u.titleVi = get('titleVi');
        if (en || vi) u.vocab.push({ id: '', en, vi, image: get('image') || null, ...(get('group') ? { group: get('group') } : {}) });
      }
      continue;
    }
    const p = locate(rows, PATTERN_COLS);
    if (p && p.idx.q >= 0 && p.idx.a >= 0) {
      foundPatterns = true;
      let current = NaN;
      for (let r = p.row + 1; r < rows.length; r++) {
        const row = rows[r];
        const get = (k: string) => (p.idx[k] >= 0 ? cell(row[p.idx[k]]) : '');
        const n = unitNumber(row[p.idx.unit]);
        if (!Number.isNaN(n)) current = n;
        if (!get('q') && !get('a')) continue;
        if (Number.isNaN(current)) {
          errors.push(`Trang "${s.sheet}", dòng ${r + 1}: chưa ghi số unit.`);
          continue;
        }
        const blanks = parseBlanks(get('blanks'));
        getUnit(current).patterns.push({ id: '', q: get('q'), a: get('a'), vi: fixDash(get('vi')), image: get('image') || null, ...(blanks.length ? { blanks } : {}) });
      }
    }
  }
  if (!foundVocab) errors.push('Không tìm thấy trang từ vựng (cần các cột "Unit", "Từ tiếng Anh", "Nghĩa tiếng Việt"). Hãy dùng file mẫu.');
  if (foundVocab && !foundPatterns) errors.push('Không thấy trang mẫu câu: các unit sẽ chỉ có câu hỏi từ vựng.');
  return { units: Array.from(byNumber.values()).sort((a, b) => a.number - b.number), errors };
}
