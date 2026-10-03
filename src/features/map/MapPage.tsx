// ============================================================
// Bản đồ phiêu lưu của 1 unit: 5 màn (3 quái thường → tinh anh → Boss)
// ============================================================
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { describeSelection, getUnit } from '../../content';
import { getStages, TIER_LABEL } from '../../game/monsters';
import { speak } from '../../services/speech';
import { useProgress } from '../../stores/progress';
import { Button, Modal, Stars, TopBar, WordImage } from '../../components/ui';
import { GameSettings } from '../../components/GameSettings';
import { GoldBadge } from '../../components/icons';

export function MapPage() {
  const { unitId = '' } = useParams();
  const nav = useNavigate();
  const unit = getUnit(unitId);
  // Lưu ý: chỉ chọn object có sẵn trong store (không tạo mảng mới trong selector)
  const unitProgress = useProgress((s) => s.units[unitId]);
  const stars = unitProgress?.stars ?? [];
  const [vocabOpen, setVocabOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  if (!unit) return <Navigate to="/select" replace />;

  const stages = getStages(unit.id);
  const desc = describeSelection({ bookId: unit.bookId, gradeId: unit.gradeId, unitId: unit.id });
  const unlocked = (i: number) => i === 0 || (stars[i - 1] ?? 0) > 0;

  return (
    <div className="min-h-full flex flex-col">
      <TopBar title={`Unit ${unit.number}: ${unit.title}`} back="/select" right={<GoldBadge className="hidden sm:flex" />} />
      <div className="text-center -mt-1 mb-3 text-sky-800 font-bold text-sm">
        {desc.book} · {desc.grade} · {unit.titleVi}
      </div>

      <div className="flex justify-center gap-2 px-4 mb-4">
        <Button color="yellow" onClick={() => setVocabOpen(true)}>
          📖 Từ vựng
        </Button>
        <Button color="white" onClick={() => setSettingsOpen(true)}>
          ⚙️ Tùy chỉnh câu hỏi
        </Button>
      </div>

      {/* Đường đi các màn: zigzag */}
      <div className="flex-1 w-full max-w-md mx-auto px-4 pb-10 relative">
        <div className="absolute left-1/2 top-8 bottom-16 w-3 -translate-x-1/2 rounded-full bg-amber-200/80 border-2 border-white" />
        <div className="relative space-y-4">
          {stages.map((st, i) => {
            const open = unlocked(i);
            const m = st.monster;
            const isBoss = m.tier === 'boss';
            return (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                <button
                  disabled={!open}
                  onClick={() => nav(`/battle/${unit.id}/${i}`)}
                  className={`panel w-[78%] p-3 flex items-center gap-3 text-left transition-transform ${open ? 'hover:scale-[1.03] active:scale-[0.97]' : 'opacity-60 grayscale'} ${isBoss ? '!border-rose-300 bg-rose-50' : m.tier === 'elite' ? '!border-violet-300' : ''}`}
                >
                  <div className={`h-16 w-16 shrink-0 rounded-2xl grid place-items-center text-4xl border-b-4 ${isBoss ? 'bg-rose-200 border-rose-400' : m.tier === 'elite' ? 'bg-violet-200 border-violet-400' : 'bg-green-200 border-green-400'}`}>
                    {open ? m.emoji : '🔒'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-extrabold text-slate-400">
                      Màn {i + 1} · <span className={isBoss ? 'text-rose-500' : m.tier === 'elite' ? 'text-violet-500' : ''}>{TIER_LABEL[m.tier]}</span>
                    </div>
                    <div className="text-lg font-extrabold truncate">{m.name}</div>
                    <div className="text-xs font-bold text-slate-500">❤️ {m.maxHp} HP</div>
                  </div>
                  <Stars n={stars[i] ?? 0} size="text-sm" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <Modal open={vocabOpen} onClose={() => setVocabOpen(false)} title="📖 Từ vựng của unit">
        <p className="text-sm text-slate-500 mb-3">Chạm vào từ để nghe phát âm.</p>
        <div className="grid grid-cols-2 gap-2">
          {unit.vocab.map((v) => (
            <button key={v.id} onClick={() => speak(v.en, v.audio)} className="flex items-center gap-2 rounded-2xl border-2 border-slate-200 bg-white p-2 text-left hover:bg-sky-50 active:scale-95 transition">
              <div className="h-12 w-12 shrink-0 grid place-items-center">{v.image ? <WordImage src={v.image} className="h-11 w-11 text-4xl" /> : <span className="text-2xl">🔊</span>}</div>
              <div className="min-w-0">
                <div className="font-extrabold text-sky-700 truncate">{v.en}</div>
                <div className="text-sm text-slate-500 font-bold truncate">{v.vi}</div>
              </div>
            </button>
          ))}
        </div>
        {unit.patterns.length > 0 && (
          <>
            <h3 className="mt-4 mb-2 font-extrabold text-sky-900">💬 Mẫu câu</h3>
            <div className="space-y-2">
              {unit.patterns.map((p) => (
                <button key={p.id} onClick={() => speak(`${p.q} ${p.a}`)} className="w-full rounded-2xl border-2 border-slate-200 bg-white p-2 text-left hover:bg-sky-50">
                  <div className="font-extrabold text-sky-700">
                    {p.q} – {p.a}
                  </div>
                  <div className="text-sm text-slate-500 font-bold">{p.vi}</div>
                </button>
              ))}
            </div>
          </>
        )}
      </Modal>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="⚙️ Tùy chỉnh câu hỏi">
        <GameSettings />
        <Button className="w-full mt-4" onClick={() => setSettingsOpen(false)}>
          Xong
        </Button>
      </Modal>
    </div>
  );
}
