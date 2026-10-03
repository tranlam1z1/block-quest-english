// ============================================================
// Định nghĩa các dạng câu hỏi
// ============================================================

/** Các dạng câu hỏi */
export type QuestionType =
  // A. Từ vựng
  | 'img-vi' // Nhìn hình → chọn nghĩa tiếng Việt
  | 'img-en' // Nhìn hình → chọn từ tiếng Anh
  | 'listen-vi' // Nghe → chọn nghĩa tiếng Việt
  | 'listen-en' // Nghe → chọn từ tiếng Anh
  | 'en-vi' // Nhìn từ tiếng Anh → chọn nghĩa tiếng Việt
  | 'vi-en' // Nhìn từ tiếng Việt → chọn từ tiếng Anh
  // B. Mẫu câu
  | 'pat-response' // Chọn câu trả lời phù hợp
  | 'pat-order' // Sắp xếp từ thành câu đúng
  | 'pat-fill'; // Điền từ còn thiếu

export type QuestionCategory = 'vocab' | 'pattern';

export interface QuestionTypeInfo {
  id: QuestionType;
  category: QuestionCategory;
  /** Tên hiển thị trong phần cài đặt */
  label: string;
  /** Hướng dẫn hiển thị trên câu hỏi */
  instruction: string;
  icon: string;
  /** Độ khó 1 (dễ) → 3 (khó). Quái cấp cao ra nhiều câu khó hơn. */
  difficulty: 1 | 2 | 3;
  /** Cần hình ảnh của từ */
  needsImage: boolean;
  /** Cần phát âm (Web Speech hoặc file mp3) */
  needsAudio: boolean;
  /** Đáp án là tiếng Anh hay tiếng Việt */
  answerLang: 'en' | 'vi';
  /** Hệ số thời gian (câu sắp xếp cần nhiều thời gian hơn) */
  timeFactor: number;
}

export const QUESTION_TYPES: QuestionTypeInfo[] = [
  { id: 'img-vi', category: 'vocab', label: 'Nhìn hình → chọn tiếng Việt', instruction: 'Nhìn hình, chọn nghĩa tiếng Việt', icon: '🖼️', difficulty: 1, needsImage: true, needsAudio: false, answerLang: 'vi', timeFactor: 1 },
  { id: 'img-en', category: 'vocab', label: 'Nhìn hình → chọn tiếng Anh', instruction: 'Nhìn hình, chọn từ tiếng Anh', icon: '🖼️', difficulty: 2, needsImage: true, needsAudio: false, answerLang: 'en', timeFactor: 1 },
  { id: 'listen-vi', category: 'vocab', label: 'Nghe → chọn tiếng Việt', instruction: 'Nghe và chọn nghĩa tiếng Việt', icon: '👂', difficulty: 2, needsImage: false, needsAudio: true, answerLang: 'vi', timeFactor: 1 },
  { id: 'listen-en', category: 'vocab', label: 'Nghe → chọn tiếng Anh', instruction: 'Nghe và chọn từ tiếng Anh', icon: '👂', difficulty: 3, needsImage: false, needsAudio: true, answerLang: 'en', timeFactor: 1 },
  { id: 'en-vi', category: 'vocab', label: 'Từ tiếng Anh → nghĩa tiếng Việt', instruction: 'Chọn nghĩa tiếng Việt của từ', icon: '🔤', difficulty: 1, needsImage: false, needsAudio: false, answerLang: 'vi', timeFactor: 1 },
  { id: 'vi-en', category: 'vocab', label: 'Từ tiếng Việt → từ tiếng Anh', instruction: 'Chọn từ tiếng Anh đúng', icon: '🔤', difficulty: 2, needsImage: false, needsAudio: false, answerLang: 'en', timeFactor: 1 },
  { id: 'pat-response', category: 'pattern', label: 'Chọn câu trả lời phù hợp', instruction: 'Chọn câu trả lời phù hợp', icon: '💬', difficulty: 2, needsImage: false, needsAudio: false, answerLang: 'en', timeFactor: 1.3 },
  { id: 'pat-fill', category: 'pattern', label: 'Điền từ còn thiếu', instruction: 'Chọn từ còn thiếu trong câu', icon: '✏️', difficulty: 2, needsImage: false, needsAudio: false, answerLang: 'en', timeFactor: 1.2 },
  { id: 'pat-order', category: 'pattern', label: 'Sắp xếp từ thành câu', instruction: 'Chạm các từ theo đúng thứ tự', icon: '🧩', difficulty: 3, needsImage: false, needsAudio: false, answerLang: 'en', timeFactor: 2 },
];

export const CATEGORY_LABEL: Record<QuestionCategory, string> = {
  vocab: 'A. Từ vựng',
  pattern: 'B. Mẫu câu',
};

export function getTypeInfo(type: QuestionType): QuestionTypeInfo {
  return QUESTION_TYPES.find((t) => t.id === type)!;
}

/** Một câu hỏi đã sinh, sẵn sàng hiển thị */
export interface Question {
  id: string;
  type: QuestionType;
  /** 'choice' = chọn 1 trong 4 đáp án; 'order' = sắp xếp các mảnh từ */
  mode: 'choice' | 'order';
  instruction: string;
  prompt: {
    /** Hình (emoji hoặc đường dẫn) */
    image?: string;
    /** Chữ hiển thị (từ tiếng Anh hoặc tiếng Việt) */
    text?: string;
    /** Các dòng hội thoại (mẫu câu). "___" là chỗ trống. */
    lines?: string[];
    /** Gợi ý nghĩa tiếng Việt */
    hint?: string;
    /** Chữ tiếng Anh để đọc to (có nút nghe lại) */
    speak?: string;
    /** File âm thanh nếu có */
    audio?: string | null;
  };
  /** 4 đáp án (mode 'choice') */
  choices: string[];
  answerIndex: number;
  /** Các mảnh từ đã xáo trộn (mode 'order') */
  tokens?: string[];
  /** Thứ tự đúng (mode 'order') */
  answerTokens?: string[];
  /** Chữ của đáp án đúng (để hiển thị khi sai) */
  answerText: string;
  /** Giải thích ngắn bằng tiếng Việt khi trả lời sai */
  explanation: string;
  /** Nội dung gốc (để thống kê câu hay sai, ôn tập). Với mẫu câu, en = cả câu. */
  item: { id: string; en: string; vi: string; image?: string | null; audio?: string | null };
  difficulty: number;
}
