// ============================================================
// Chọn lần lượt: Bộ sách → Lớp/Level → Unit
// ============================================================
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { books, getBook, getGrade } from '../../content';
import { QuestionDeck } from '../../game/questions/buildQuiz';
import { useProgress } from '../../stores/progress';
import { Button, TopBar } from '../../components/ui';

export function SelectPage() {
  const nav = useNavigate();
  const last = useProgress((s) => s.lastSelection);
  const setLast = useProgress((s) => s.setLastSelection);
  const unitsProgress = useProgress((s) => s.units);
  // Mặc định mở sẵn bộ sách / lớp đã chọn lần trước
  const [bookId, setBookId] = useState<string | null>(last && getBook(last.bookId) ? last.bookId : null);
  const [gradeId, setGradeId] = useState<string | null>(last && bookId && getGrade(bookId, last.gradeId) ? last.gradeId : null);

  const book = bookId ? getBook(bookId) : undefined;
  const grade = book && gradeId ? getGrade(book.id, gradeId) : undefined;
  const step = !book ? 1 : !grade ? 2 : 3;

  const back = () => {
    if (step === 3) setGradeId(null);
    else if (step === 2) setBookId(null);
    else nav('/');
  };

  const title = step === 1 ? 'Chọn bộ sách' : step === 2 ? book!.name : `${book!.name} · ${grade!.name}`;

  return (
    <div className="min-h-full flex flex-col">
      <TopBar title={title} back={back} />
      {/* Thanh bước */}
      <div className="flex justify-center gap-2 px-4 mb-3">
        {['Bộ sách', 'Lớp / Level', 'Unit'].map((label, i) => (
          <div
            key={label}
            className={`rounded-full px-3 py-1 text-xs sm:text-sm font-extrabold ${i + 1 === step ? 'bg-amber-400 text-amber-950' : i + 1 < step ? 'bg-green-500 text-white' : 'bg-white/70 text-slate-500'}`}
          >
            {i + 1}. {label}
          </div>
        ))}
      </div>

      <div className="flex-1 w-full max-w-4xl mx-auto px-4 pb-8">
        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {books.map((b) => (
              <button
                key={b.id}
                onClick={() => setBookId(b.id)}
                className="panel p-5 text-left hover:scale-[1.02] active:scale-[0.98] transition-transform border-b-8"
                style={{ borderBottomColor: b.color }}
              >
                <div className="text-5xl">{b.emoji}</div>
                <div className="mt-2 text-2xl font-extrabold" style={{ color: b.color }}>
                  {b.name}
                </div>
                <div className="text-slate-600 font-bold">{b.description}</div>
              </button>
            ))}
          </div>
        )}

        {step === 2 && book && (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
            {book.grades.map((g) => {
              const has = g.units.length > 0;
              return (
                <Button key={g.id} color={has ? 'blue' : 'gray'} disabled={!has} className="!py-6 text-xl flex-col !gap-0" onClick={() => setGradeId(g.id)}>
                  <span>{g.name}</span>
                  <span className="text-xs font-bold opacity-90">{has ? `${g.units.length} unit` : 'Sắp có nội dung'}</span>
                </Button>
              );
            })}
          </div>
        )}

        {step === 3 && book && grade && (
          <div className="grid gap-3 sm:grid-cols-2">
            {grade.units.map((u) => {
              const stars = unitsProgress[u.id]?.stars ?? [];
              const total = stars.reduce((a, b) => a + (b ?? 0), 0);
              return (
                <button
                  key={u.id}
                  onClick={() => {
                    setLast({ bookId: book.id, gradeId: grade.id, unitId: u.id });
                    nav(`/map/${u.id}`);
                  }}
                  className="panel p-4 text-left flex items-center gap-4 hover:scale-[1.02] active:scale-[0.98] transition-transform"
                >
                  <div className="h-16 w-16 shrink-0 rounded-2xl grid place-items-center text-2xl font-extrabold text-white border-b-4" style={{ background: book.color, borderColor: '#0003' }}>
                    {u.number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xl font-extrabold text-slate-800 truncate">
                      Unit {u.number}: {u.title}
                    </div>
                    <div className="text-slate-500 font-bold truncate">{u.titleVi}</div>
                    <div className="text-xs text-slate-400 font-bold">
                      {u.vocab.length} từ · {QuestionDeck.countPossible(u)} câu hỏi
                    </div>
                  </div>
                  <div className="text-right text-sm font-extrabold text-amber-500 whitespace-nowrap">⭐ {total}/15</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
