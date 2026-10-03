// ============================================================
// Phát âm từ vựng: ưu tiên file âm thanh, nếu không có thì dùng
// giọng đọc của trình duyệt (Web Speech API, giọng en-US)
// ============================================================

let cachedVoice: SpeechSynthesisVoice | null = null;

export function speechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/** Chọn giọng tiếng Anh Mỹ tốt nhất có trên máy */
function pickVoice(): SpeechSynthesisVoice | null {
  if (!speechSupported()) return null;
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  const enUS = voices.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith('en-us'));
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const prefer = (list: SpeechSynthesisVoice[]) =>
    list.find((v) => /google|natural|aria|jenny|samantha/i.test(v.name)) ?? list[0];
  cachedVoice = prefer(enUS) ?? prefer(en) ?? null;
  return cachedVoice;
}

if (speechSupported()) {
  // Danh sách giọng được nạp không đồng bộ trên Chrome
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null;
    pickVoice();
  };
}

/**
 * Đọc to một từ / câu tiếng Anh.
 * @param text chữ cần đọc
 * @param audioUrl file mp3 (nếu có)
 */
export function speak(text: string, audioUrl?: string | null) {
  if (audioUrl) {
    const a = new Audio(audioUrl);
    a.play().catch(() => speakTts(text));
    return;
  }
  speakTts(text);
}

function speakTts(text: string) {
  if (!speechSupported()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.85; // đọc chậm một chút cho học sinh nhỏ
  u.pitch = 1.05;
  const v = pickVoice();
  if (v) u.voice = v;
  synth.speak(u);
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel();
}
