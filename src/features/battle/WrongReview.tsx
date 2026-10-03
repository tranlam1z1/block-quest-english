// ============================================================
// Ôn lại các từ / mẫu câu đã sai trong trận (chạm để nghe)
// ============================================================
import type { Question } from '../../game/questions/types';
import { speak } from '../../services/speech';
import { WordImage } from '../../components/ui';

export function WrongReview({ wrong }: { wrong: { question: Question }[] }) {
  // Gộp các từ sai trùng nhau
  const items = Array.from(new Map(wrong.map((w) => [w.question.item.id, w.question.item])).values());
  if (items.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="font-extrabold text-sky-900 mb-2">📚 Ôn lại từ còn sai</h3>
      <div className="space-y-2">
        {items.map((it) => (
          <button key={it.id} onClick={() => speak(it.en, it.audio)} className="w-full flex items-center gap-3 rounded-2xl border-2 border-rose-100 bg-rose-50 p-2 text-left active:scale-95 transition">
            <div className="h-10 w-10 grid place-items-center shrink-0">{it.image ? <WordImage src={it.image} className="h-9 w-9 text-3xl" /> : '🔊'}</div>
            <div className="flex-1">
              <span className="font-extrabold text-sky-700">{it.en}</span> – <span className="font-bold text-slate-600">{it.vi}</span>
            </div>
            <span className="text-xl">🔊</span>
          </button>
        ))}
      </div>
    </div>
  );
}
