// ============================================================
// Kiểu dữ liệu nội dung học: Bộ sách → Lớp/Level → Unit → Từ vựng / Mẫu câu
// Muốn thêm bộ sách mới: tạo thư mục trong src/content/ với book.json + các file unit-xx.json
// ============================================================

/** Một từ vựng */
export interface VocabItem {
  id: string;
  /** Từ tiếng Anh */
  en: string;
  /** Nghĩa tiếng Việt */
  vi: string;
  /**
   * Hình ảnh: emoji (VD "🍎") hoặc đường dẫn file (VD "/images/words/eraser.svg").
   * Để null nếu từ không vẽ được thành hình (VD "fine") — khi đó không dùng cho dạng câu "nhìn hình".
   */
  image?: string | null;
  /** File phát âm (mp3). Nếu không có sẽ dùng giọng đọc của trình duyệt (Web Speech API). */
  audio?: string | null;
  /**
   * Nhóm từ đồng nghĩa (VD "hello" và "hi" cùng nhóm "greet").
   * Các từ cùng nhóm không được dùng làm đáp án nhiễu của nhau để tránh có 2 đáp án đúng.
   */
  group?: string;
}

/**
 * Từ được phép đục lỗ trong dạng "Điền từ còn thiếu".
 * - Chuỗi: tự lấy đáp án nhiễu từ các từ khác trong unit.
 * - Object: chỉ định sẵn đáp án nhiễu (dùng khi tự lấy dễ ra 2 đáp án cùng đúng).
 */
export type BlankSpec = string | { w: string; wrong: string[] };

/** Một mẫu câu */
export interface SentencePattern {
  id: string;
  /** Câu hỏi, VD "What's your name?" */
  q: string;
  /** Câu trả lời mẫu, VD "My name is Mai." */
  a: string;
  /** Nghĩa tiếng Việt, dạng "nghĩa câu hỏi – nghĩa câu trả lời" (ngăn cách bằng " – ") */
  vi: string;
  /** Hình gợi ý (VD câu "It's a pencil." kèm hình ✏️) để câu hỏi chỉ có 1 đáp án đúng */
  image?: string | null;
  /** Các từ được đục lỗ ở dạng "Điền từ" */
  blanks?: BlankSpec[];
}

/** Dữ liệu một unit (đọc từ file unit-xx.json) */
export interface Unit {
  id: string;
  bookId: string;
  gradeId: string;
  number: number;
  title: string;
  titleVi: string;
  vocab: VocabItem[];
  patterns: SentencePattern[];
}

/** Lớp / Level trong book.json */
export interface GradeMeta {
  id: string;
  name: string;
}

/** Thông tin bộ sách trong book.json */
export interface BookMeta {
  id: string;
  name: string;
  /** Mô tả ngắn hiển thị trên thẻ chọn sách */
  description: string;
  /** Màu chủ đạo của thẻ (mã hex) */
  color: string;
  emoji: string;
  sort: number;
  grades: GradeMeta[];
}

/** Bộ sách đã gắn đầy đủ unit */
export interface Book extends BookMeta {
  grades: (GradeMeta & { units: Unit[] })[];
}

/** Lựa chọn Bộ sách → Lớp → Unit */
export interface Selection {
  bookId: string;
  gradeId: string;
  unitId: string;
}
